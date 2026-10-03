package scenes

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"vtt-backend/internal/apperror"
	"vtt-backend/internal/auth"
)

func TestInitiativeUsesPersistedCampaignSystemReferenceIntegration(t *testing.T) {
	databaseURL := os.Getenv("REALTIME_TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("REALTIME_TEST_DATABASE_URL is not configured")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()

	campaignID, gmID, playerID, sceneID := sceneTestUUID(t), sceneTestUUID(t), sceneTestUUID(t), sceneTestUUID(t)
	actorID, playerTokenID, npcTokenID := sceneTestUUID(t), sceneTestUUID(t), sceneTestUUID(t)
	defer func() {
		_, _ = pool.Exec(context.Background(), `delete from campaigns where id=$1`, campaignID)
		_, _ = pool.Exec(context.Background(), `delete from profiles where id in ($1,$2)`, gmID, playerID)
	}()

	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(context.Background())
	if _, err := tx.Exec(ctx, `set local session_replication_role=replica`); err != nil {
		t.Skipf("database role cannot create isolated initiative fixtures: %v", err)
	}
	for _, profile := range []struct{ id, name string }{{gmID, "Initiative GM"}, {playerID, "Initiative player"}} {
		if _, err := tx.Exec(ctx, `insert into profiles(id,display_name) values($1,$2)`, profile.id, profile.name); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := tx.Exec(ctx, `insert into campaigns(id,name,owner_id,system_id,system_version) values($1,'Initiative rules test',$2,'dnd2024','1.0.0')`, campaignID, gmID); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `insert into campaign_members(campaign_id,user_id,role) values($1,$2,'gm'),($1,$3,'player')`, campaignID, gmID, playerID); err != nil {
		t.Fatal(err)
	}
	if err := tx.QueryRow(ctx, `insert into scenes(campaign_id,name,player_access) values($1,'Initiative reference test','available') returning id::text`, campaignID).Scan(&sceneID); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `insert into actors(id,campaign_id,owner_id,name,sheet,token,kind) values($1,$2,$3,'Initiative hero','{"initiativeAdvantage":true}'::jsonb,'{}'::jsonb,'character')`, actorID, campaignID, playerID); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `insert into scene_tokens(id,scene_id,actor_id,owner_id,name,initiative_bonus) values($1,$2,$3,$4,'Owned hero',2),($5,$2,null,null,'Unowned NPC',0)`, playerTokenID, sceneID, actorID, playerID, npcTokenID); err != nil {
		t.Fatal(err)
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}

	repo := NewRepository(pool)
	if _, err := repo.RollInitiative(ctx, sceneID, playerID); !errors.Is(err, ErrForbidden) {
		t.Fatalf("player batch initiative error = %v, want forbidden", err)
	}
	// The current endpoint accepts no ruleset input. Extra forged JSON is ignored;
	// the repository resolves the persisted campaign reference through the scene.
	request := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"systemId":"forged","systemVersion":"99.0.0"}`))
	request.SetPathValue("sceneID", sceneID)
	request = request.WithContext(auth.WithPrincipal(request.Context(), auth.Principal{UserID: gmID}))
	response := httptest.NewRecorder()
	if err := NewHandler(repo).RollInitiative(response, request); err != nil {
		apperror.Write(response, err)
	}
	if response.Code != http.StatusOK {
		t.Fatalf("GM batch initiative with forged body status = %d, body=%s; want 200 using persisted D&D reference", response.Code, response.Body.String())
	}
	var consumedAdvantage bool
	if err := pool.QueryRow(ctx, `select (sheet->>'initiativeAdvantage')::boolean from actors where id=$1`, actorID).Scan(&consumedAdvantage); err != nil {
		t.Fatal(err)
	}
	if consumedAdvantage {
		t.Fatal("batch initiative did not consume the actor's one-use advantage")
	}
	var eventsAfterBatch int
	if err := pool.QueryRow(ctx, `select count(*) from game_events where campaign_id=$1 and event_type='combat.log'`, campaignID).Scan(&eventsAfterBatch); err != nil {
		t.Fatal(err)
	}
	if eventsAfterBatch != 1 {
		t.Fatalf("batch initiative persisted %d combat logs, want 1", eventsAfterBatch)
	}
	var npcInitiative int
	if err := pool.QueryRow(ctx, `select initiative from scene_tokens where id=$1`, npcTokenID).Scan(&npcInitiative); err != nil {
		t.Fatal(err)
	}
	if npcInitiative < 1 || npcInitiative > 20 {
		t.Fatalf("GM batch initiative result = %d, want an authoritative d20 result", npcInitiative)
	}

	playerResult, err := repo.RollTokenInitiative(ctx, sceneID, playerTokenID, playerID)
	if err != nil {
		t.Fatalf("player own-token initiative: %v", err)
	}
	if playerResult.TokenID != playerTokenID || len(playerResult.Rolls) != 1 || playerResult.Roll < 1 || playerResult.Roll > 20 || playerResult.Initiative != playerResult.Roll+2 {
		t.Fatalf("player initiative result = %+v, not a normal authoritative d20 plus persisted bonus", playerResult)
	}
	if _, err := repo.RollTokenInitiative(ctx, sceneID, npcTokenID, playerID); !errors.Is(err, ErrForbidden) {
		t.Fatalf("player rolling an unowned token error = %v, want forbidden", err)
	}
	var eventsAfterPlayer int
	if err := pool.QueryRow(ctx, `select count(*) from game_events where campaign_id=$1 and event_type='combat.log'`, campaignID).Scan(&eventsAfterPlayer); err != nil {
		t.Fatal(err)
	}
	if eventsAfterPlayer != 2 {
		t.Fatalf("authorized player roll should persist one additional combat log: got %d, want 2", eventsAfterPlayer)
	}

	var before int
	if err := pool.QueryRow(ctx, `select initiative from scene_tokens where id=$1`, playerTokenID).Scan(&before); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `update campaigns set system_version='9.9.9' where id=$1`, campaignID); err != nil {
		t.Fatal(err)
	}
	if _, err := repo.RollInitiative(ctx, sceneID, gmID); !errors.Is(err, ErrUnsupportedCampaignSystem) {
		t.Fatalf("unsupported persisted reference for batch initiative = %v, want explicit unsupported-system error", err)
	}
	if _, err := repo.RollTokenInitiative(ctx, sceneID, playerTokenID, playerID); !errors.Is(err, ErrUnsupportedCampaignSystem) {
		t.Fatalf("unsupported persisted reference error = %v, want explicit unsupported-system error", err)
	}
	var after, eventsAfterUnsupported int
	if err := pool.QueryRow(ctx, `select initiative from scene_tokens where id=$1`, playerTokenID).Scan(&after); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `select count(*) from game_events where campaign_id=$1 and event_type='combat.log'`, campaignID).Scan(&eventsAfterUnsupported); err != nil {
		t.Fatal(err)
	}
	if after != before || eventsAfterUnsupported != eventsAfterPlayer {
		t.Fatalf("unsupported ruleset changed state (initiative %d->%d, events %d->%d)", before, after, eventsAfterPlayer, eventsAfterUnsupported)
	}

	unknownRequest := httptest.NewRequest(http.MethodPost, "/", nil)
	unknownRequest.SetPathValue("sceneID", sceneID)
	unknownRequest.SetPathValue("tokenID", playerTokenID)
	unknownRequest = unknownRequest.WithContext(auth.WithPrincipal(unknownRequest.Context(), auth.Principal{UserID: playerID}))
	unknownResponse := httptest.NewRecorder()
	if err := NewHandler(repo).RollTokenInitiative(unknownResponse, unknownRequest); err != nil {
		apperror.Write(unknownResponse, err)
	}
	if unknownResponse.Code != http.StatusConflict || !strings.Contains(unknownResponse.Body.String(), "UNSUPPORTED_CAMPAIGN_SYSTEM") {
		t.Fatalf("unsupported campaign response = %d %s, want safe 409", unknownResponse.Code, unknownResponse.Body.String())
	}
}
