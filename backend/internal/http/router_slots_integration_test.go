package apphttp

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"vtt-backend/internal/characters"
	"vtt-backend/internal/config"
	"vtt-backend/internal/overlayaccess"
)

func TestSpellSlotsRouteUsesAuthenticationMiddlewareIntegration(t *testing.T) {
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
	if err := pool.Ping(ctx); err != nil {
		t.Fatal(err)
	}

	campaignID, gmID, playerID := routerSlotTestUUID(t), routerSlotTestUUID(t), routerSlotTestUUID(t)
	var characterID string
	cleanup := func() {
		_, _ = pool.Exec(context.Background(), `delete from actors where campaign_id=$1`, campaignID)
		_, _ = pool.Exec(context.Background(), `delete from campaign_members where campaign_id=$1`, campaignID)
		_, _ = pool.Exec(context.Background(), `delete from campaigns where id=$1`, campaignID)
		_, _ = pool.Exec(context.Background(), `delete from profiles where id in ($1,$2)`, gmID, playerID)
	}
	defer cleanup()

	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(context.Background())
	if _, err := tx.Exec(ctx, `set local session_replication_role=replica`); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `insert into profiles(id,display_name) values($1,'Synthetic route GM'),($2,'Synthetic route player')`, gmID, playerID); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `insert into campaigns(id,name,owner_id,system_id,system_version) values($1,'Synthetic spell slot route',$2,'dnd2024','1.0.0')`, campaignID, gmID); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `insert into campaign_members(campaign_id,user_id,role) values($1,$2,'gm'),($1,$3,'player')`, campaignID, gmID, playerID); err != nil {
		t.Fatal(err)
	}
	sheet, err := json.Marshal(characters.Sheet{
		Name: "Synthetic route character", Class: "wizard", Level: 5,
		SpellSlots: []characters.SpellSlot{{Level: 2, Current: 1, Max: 3}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := tx.QueryRow(ctx, `insert into actors(campaign_id,owner_id,kind,name,sheet) values($1,$2,'character','Synthetic route character',$3::jsonb) returning id::text`, campaignID, playerID, sheet).Scan(&characterID); err != nil {
		t.Fatal(err)
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}

	const secret = "synthetic-route-test-secret-not-a-user-credential"
	const supabaseURL = "http://supabase.test"
	cfg := config.Config{SupabaseURL: supabaseURL, SupabaseJWTSecret: secret}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	characterHandler := characters.NewHandler(characters.NewRepository(pool))
	router := NewRouter(
		cfg, logger,
		nil, nil, nil, characterHandler, nil, nil, nil, nil, nil,
		http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}),
		overlayaccess.NewHandler(pool, cfg),
	)
	endpoint := "/api/v1/campaigns/" + campaignID + "/characters/" + characterID + "/spell-slots"
	request := func(userID string, current int) *httptest.ResponseRecorder {
		t.Helper()
		token := routerSlotTestToken(t, secret, supabaseURL, userID)
		body := strings.NewReader(`{"level":2,"current":` + jsonNumber(current) + `}`)
		req := httptest.NewRequest(http.MethodPatch, endpoint, body)
		req.Header.Set("Authorization", "Bearer "+token)
		response := httptest.NewRecorder()
		router.ServeHTTP(response, req)
		return response
	}

	decreased := request(gmID, 0)
	if decreased.Code != http.StatusOK {
		t.Fatalf("GM PATCH decrement status=%d body=%s", decreased.Code, decreased.Body.String())
	}
	assertPersistedSlotCount(t, ctx, pool, campaignID, characterID, gmID, 0, 3)

	increased := request(gmID, 1)
	if increased.Code != http.StatusOK {
		t.Fatalf("GM PATCH increment status=%d body=%s", increased.Code, increased.Body.String())
	}
	assertPersistedSlotCount(t, ctx, pool, campaignID, characterID, gmID, 1, 3)

	denied := request(playerID, 2)
	if denied.Code != http.StatusForbidden {
		t.Fatalf("player PATCH status=%d body=%s, want forbidden", denied.Code, denied.Body.String())
	}
	assertPersistedSlotCount(t, ctx, pool, campaignID, characterID, gmID, 1, 3)
}

func assertPersistedSlotCount(t *testing.T, ctx context.Context, pool *pgxpool.Pool, campaignID, characterID, gmID string, wantCurrent, wantMax int) {
	t.Helper()
	character, err := characters.NewRepository(pool).GetForGM(ctx, campaignID, characterID, gmID)
	if err != nil {
		t.Fatal(err)
	}
	for _, slot := range character.Sheet.SpellSlots {
		if slot.Level == 2 {
			if slot.Current != wantCurrent || slot.Max != wantMax {
				t.Fatalf("persisted level 2 slot = %+v, want current=%d max=%d", slot, wantCurrent, wantMax)
			}
			return
		}
	}
	t.Fatal("persisted level 2 spell slot not found")
}

func routerSlotTestToken(t *testing.T, secret, supabaseURL, userID string) string {
	t.Helper()
	now := time.Now()
	claims := jwt.MapClaims{
		"sub": userID,
		"iss": supabaseURL + "/auth/v1",
		"aud": "authenticated",
		"iat": now.Unix(),
		"exp": now.Add(5 * time.Minute).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte(secret))
	if err != nil {
		t.Fatal(err)
	}
	return signed
}

func routerSlotTestUUID(t *testing.T) string {
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

func jsonNumber(value int) string {
	return strconv.Itoa(value)
}
