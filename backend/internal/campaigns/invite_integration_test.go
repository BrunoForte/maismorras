package campaigns

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"vtt-backend/internal/apperror"
	"vtt-backend/internal/auth"
	"vtt-backend/internal/systems"
)

func TestCreateCampaignPersistsRegisteredSystemReferenceIntegration(t *testing.T) {
	databaseURL := os.Getenv("REALTIME_TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("REALTIME_TEST_DATABASE_URL is not configured")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	if err := pool.Ping(ctx); err != nil {
		t.Fatal(err)
	}

	userID, playerID := randomTestUUID(t), randomTestUUID(t)
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `set local session_replication_role = replica`); err != nil {
		_ = tx.Rollback(context.Background())
		t.Skipf("database role cannot create isolated auth test profiles: %v", err)
	}
	if _, err := tx.Exec(ctx, `insert into profiles(id,display_name) values($1,'System reference GM'),($2,'System reference player')`, userID, playerID); err != nil {
		_ = tx.Rollback(context.Background())
		t.Fatal(err)
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	defer func() {
		_, _ = pool.Exec(context.Background(), `delete from campaigns where owner_id=$1`, userID)
		_, _ = pool.Exec(context.Background(), `delete from profiles where id in ($1,$2)`, userID, playerID)
	}()

	campaign, err := NewRepository(pool).Create(ctx, userID, "Pinned D&D campaign", systems.DefaultRef())
	if err != nil {
		t.Fatal(err)
	}
	if campaign.SystemID != string(systems.Dnd2024) || campaign.SystemVersion != string(systems.Dnd2024V1) {
		t.Fatalf("created campaign reference = %s@%s, want %s@%s", campaign.SystemID, campaign.SystemVersion, systems.Dnd2024, systems.Dnd2024V1)
	}
	if _, err := pool.Exec(ctx, `insert into campaign_members(campaign_id,user_id,role) values($1,$2,'player')`, campaign.ID, playerID); err != nil {
		t.Fatal(err)
	}

	handler := NewHandler(NewRepository(pool))
	gmRequest := httptest.NewRequest("PATCH", "/", strings.NewReader(`{"name":"Renamed campaign","systemId":"melted-lands","systemVersion":"999.0.0"}`))
	gmRequest.SetPathValue("campaignID", campaign.ID)
	gmRequest = gmRequest.WithContext(auth.WithPrincipal(gmRequest.Context(), auth.Principal{UserID: userID}))
	gmResponse := httptest.NewRecorder()
	if err := handler.Rename(gmResponse, gmRequest); err != nil || gmResponse.Code != 200 {
		t.Fatalf("GM rename = status %d, err %v, body %s", gmResponse.Code, err, gmResponse.Body.String())
	}
	var renamed Campaign
	if err := json.Unmarshal(gmResponse.Body.Bytes(), &renamed); err != nil {
		t.Fatal(err)
	}
	if renamed.SystemID != string(systems.Dnd2024) || renamed.SystemVersion != string(systems.Dnd2024V1) {
		t.Fatalf("GM rename changed system reference: %+v", renamed)
	}
	playerRequest := httptest.NewRequest("PATCH", "/", bytes.NewBufferString(`{"name":"Player rename","systemId":"melted-lands"}`))
	playerRequest.SetPathValue("campaignID", campaign.ID)
	playerRequest = playerRequest.WithContext(auth.WithPrincipal(playerRequest.Context(), auth.Principal{UserID: playerID}))
	playerErr := handler.Rename(httptest.NewRecorder(), playerRequest)
	var playerAppError *apperror.Error
	if !errors.As(playerErr, &playerAppError) || playerAppError.Status != 403 {
		t.Fatalf("player rename error = %v, want 403 forbidden", playerErr)
	}

	items, err := NewRepository(pool).List(ctx, userID, false)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 || items[0].SystemID != string(systems.Dnd2024) || items[0].SystemVersion != string(systems.Dnd2024V1) {
		t.Fatalf("listed campaign reference = %#v, want persisted %s@%s", items, systems.Dnd2024, systems.Dnd2024V1)
	}
}

func TestAcceptInviteMembershipAndExpiryIntegration(t *testing.T) {
	databaseURL := os.Getenv("REALTIME_TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("REALTIME_TEST_DATABASE_URL is not configured")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	if err := pool.Ping(ctx); err != nil {
		t.Fatal(err)
	}

	ids := make([]string, 6)
	for i := range ids {
		ids[i] = randomTestUUID(t)
	}
	campaignID, ownerID, memberID, strangerID := ids[0], ids[1], ids[2], ids[3]
	expiredCode, revokedCode, validCode := ids[4], ids[5], randomTestUUID(t)
	// Local test users need not be provisioned through Auth: test with direct
	// campaign_members records while retaining the real repository SQL path.
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	cleanup := func() {
		_, _ = pool.Exec(context.Background(), `delete from campaigns where id=$1`, campaignID)
		_, _ = pool.Exec(context.Background(), `delete from profiles where id in ($1,$2,$3)`, ownerID, memberID, strangerID)
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback(context.Background())
			cleanup()
		}
	}()
	if _, err := tx.Exec(ctx, `set local session_replication_role = replica`); err != nil {
		t.Skipf("database role cannot create isolated auth test profiles: %v", err)
	}
	for _, user := range []struct{ id, name string }{{ownerID, "Test GM"}, {memberID, "Test member"}, {strangerID, "Test stranger"}} {
		if _, err = tx.Exec(ctx, `insert into profiles(id,display_name) values($1,$2)`, user.id, user.name); err != nil {
			t.Fatal(err)
		}
	}
	if _, err = tx.Exec(ctx, `insert into campaigns(id,name,owner_id,system_id) values($1,'Invite integration test',$2,'dnd2024')`, campaignID, ownerID); err != nil {
		t.Fatal(err)
	}
	var legacySystemVersion string
	if err = tx.QueryRow(ctx, `select system_version from campaigns where id=$1`, campaignID).Scan(&legacySystemVersion); err != nil {
		t.Fatal(err)
	}
	if legacySystemVersion != string(systems.Dnd2024V1) {
		t.Fatalf("legacy campaign without system_version resolved to %q, want %q", legacySystemVersion, systems.Dnd2024V1)
	}
	if _, err = tx.Exec(ctx, `insert into campaign_members(campaign_id,user_id,role) values($1,$2,'gm'),($1,$3,'player')`, campaignID, ownerID, memberID); err != nil {
		t.Fatal(err)
	}
	if _, err = tx.Exec(ctx, `insert into campaign_invites(code,campaign_id,created_by,expires_at) values
		($1,$4,$5,now()-interval '1 minute'),($2,$4,$5,now()+interval '1 day'),($3,$4,$5,now()+interval '1 day')`, expiredCode, revokedCode, validCode, campaignID, ownerID); err != nil {
		t.Fatal(err)
	}
	if _, err = tx.Exec(ctx, `update campaign_invites set revoked_at=now() where code=$1`, revokedCode); err != nil {
		t.Fatal(err)
	}
	if err = tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	committed = true
	defer cleanup()

	repository := NewRepository(pool)
	for _, test := range []struct {
		name, code, user string
		wantRole         string
		wantError        error
	}{
		{name: "existing member with expired invite", code: expiredCode, user: memberID, wantRole: "player"},
		{name: "existing member with revoked invite", code: revokedCode, user: memberID, wantRole: "player"},
		{name: "nonmember with expired invite", code: expiredCode, user: strangerID, wantError: ErrInviteInvalid},
		{name: "nonmember with revoked invite", code: revokedCode, user: strangerID, wantError: ErrInviteInvalid},
		{name: "new member with valid invite", code: validCode, user: strangerID, wantRole: "player"},
	} {
		t.Run(test.name, func(t *testing.T) {
			campaign, acceptErr := repository.AcceptInvite(ctx, test.code, test.user)
			if test.wantError != nil {
				if !errors.Is(acceptErr, test.wantError) {
					t.Fatalf("AcceptInvite error = %v, want %v", acceptErr, test.wantError)
				}
				return
			}
			if acceptErr != nil || campaign.ID != campaignID || campaign.Role != test.wantRole || campaign.SystemID != string(systems.Dnd2024) || campaign.SystemVersion != string(systems.Dnd2024V1) {
				t.Fatalf("AcceptInvite = %#v, %v", campaign, acceptErr)
			}
		})
	}
	var accepted bool
	if err := pool.QueryRow(ctx, `select accepted_at is not null from campaign_invites where code=$1`, expiredCode).Scan(&accepted); err != nil {
		t.Fatal(err)
	}
	if accepted {
		t.Fatal("expired invite metadata was mutated for an existing member")
	}
}

func randomTestUUID(t *testing.T) string {
	t.Helper()
	var raw [16]byte
	if _, err := rand.Read(raw[:]); err != nil {
		t.Fatal(err)
	}
	raw[6] = raw[6]&0x0f | 0x40
	raw[8] = raw[8]&0x3f | 0x80
	encoded := hex.EncodeToString(raw[:])
	return encoded[:8] + "-" + encoded[8:12] + "-" + encoded[12:16] + "-" + encoded[16:20] + "-" + encoded[20:]
}
