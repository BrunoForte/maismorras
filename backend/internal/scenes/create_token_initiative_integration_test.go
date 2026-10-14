package scenes

import (
	"context"
	"errors"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func TestCreateTokenFromCharacterUsesPersistedCampaignInitiativeRulesIntegration(t *testing.T) {
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
	actorID := sceneTestUUID(t)
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
		t.Skipf("database role cannot create isolated token initiative fixtures: %v", err)
	}
	for _, profile := range []struct{ id, name string }{{gmID, "Token initiative GM"}, {playerID, "Token initiative player"}} {
		if _, err := tx.Exec(ctx, `insert into profiles(id,display_name) values($1,$2)`, profile.id, profile.name); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := tx.Exec(ctx, `insert into campaigns(id,name,owner_id,system_id,system_version) values($1,'Token initiative rules test',$2,'dnd2024','1.0.0')`, campaignID, gmID); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `insert into campaign_members(campaign_id,user_id,role) values($1,$2,'gm'),($1,$3,'player')`, campaignID, gmID, playerID); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `insert into scenes(id,campaign_id,name,player_access) values($1,$2,'Token initiative reference test','available')`, sceneID, campaignID); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `insert into actors(id,campaign_id,owner_id,name,sheet,token,kind) values($1,$2,$3,'Token hero','{"name":"Token hero","abilityScores":{"dexterity":16},"speed":30,"hitPointsCurrent":8,"hitPointsMax":8,"armorClass":15}'::jsonb,'{}'::jsonb,'character')`, actorID, campaignID, playerID); err != nil {
		t.Fatal(err)
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}

	repo := NewRepository(pool)
	var initialEvents int
	if err := pool.QueryRow(ctx, `select count(*) from game_events where campaign_id=$1`, campaignID).Scan(&initialEvents); err != nil {
		t.Fatal(err)
	}

	// Authorization must precede ruleset resolution, even when the stored
	// campaign reference cannot be served by this binary.
	if _, err := pool.Exec(ctx, `update campaigns set system_id='dnd35' where id=$1`, campaignID); err != nil {
		t.Fatal(err)
	}
	if _, err := repo.CreateTokenFromCharacter(ctx, sceneID, actorID, playerID); !errors.Is(err, ErrForbidden) {
		t.Fatalf("unauthorized player with unsupported system error = %v, want forbidden", err)
	}
	assertTokenInitiativeNoPartialState(t, ctx, pool, campaignID, sceneID, actorID, 0, initialEvents)

	for _, ref := range []struct{ name, id, version string }{
		{name: "unregistered system", id: "dnd35", version: "1.0.0"},
		{name: "unregistered version", id: "dnd2024", version: "9.9.9"},
	} {
		t.Run(ref.name, func(t *testing.T) {
			if _, err := pool.Exec(ctx, `update campaigns set system_id=$1,system_version=$2 where id=$3`, ref.id, ref.version, campaignID); err != nil {
				t.Fatal(err)
			}
			if _, err := repo.CreateTokenFromCharacter(ctx, sceneID, actorID, gmID); !errors.Is(err, ErrUnsupportedCampaignSystem) {
				t.Fatalf("reference %s@%s error = %v, want unsupported campaign system", ref.id, ref.version, err)
			}
			assertTokenInitiativeNoPartialState(t, ctx, pool, campaignID, sceneID, actorID, 0, initialEvents)
		})
	}

	if _, err := pool.Exec(ctx, `update campaigns set system_id='dnd2024',system_version='1.0.0' where id=$1`, campaignID); err != nil {
		t.Fatal(err)
	}
	var systemID, systemVersion string
	if err := pool.QueryRow(ctx, `select system_id,system_version from campaigns where id=$1`, campaignID).Scan(&systemID, &systemVersion); err != nil {
		t.Fatal(err)
	}
	if systemID != "dnd2024" || systemVersion != "1.0.0" {
		t.Fatalf("fixture campaign reference = %s@%s, want dnd2024@1.0.0", systemID, systemVersion)
	}
	token, err := repo.CreateTokenFromCharacter(ctx, sceneID, actorID, gmID)
	if err != nil {
		t.Fatalf("create character token with persisted D&D 2024 reference: %v", err)
	}
	if token.InitiativeBonus != 3 || token.Initiative != 0 {
		t.Fatalf("created token initiative fields = bonus %d, initiative %d; want DEX modifier +3 and unchanged rolled initiative 0", token.InitiativeBonus, token.Initiative)
	}
	var persistedBonus, persistedInitiative int
	if err := pool.QueryRow(ctx, `select initiative_bonus,initiative from scene_tokens where id=$1`, token.ID).Scan(&persistedBonus, &persistedInitiative); err != nil {
		t.Fatal(err)
	}
	if persistedBonus != 3 || persistedInitiative != 0 {
		t.Fatalf("persisted initiative fields = bonus %d, initiative %d; want +3 and 0", persistedBonus, persistedInitiative)
	}
	var tokenCount int
	if err := pool.QueryRow(ctx, `select count(*) from scene_tokens where scene_id=$1 and actor_id=$2`, sceneID, actorID).Scan(&tokenCount); err != nil {
		t.Fatal(err)
	}
	if tokenCount != 1 {
		t.Fatalf("successful creation persisted %d linked tokens, want exactly one", tokenCount)
	}
}

func assertTokenInitiativeNoPartialState(t *testing.T, ctx context.Context, pool *pgxpool.Pool, campaignID, sceneID, actorID string, wantTokens, wantEvents int) {
	t.Helper()
	var tokens, events int
	if err := pool.QueryRow(ctx, `select count(*) from scene_tokens where scene_id=$1 and actor_id=$2`, sceneID, actorID).Scan(&tokens); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `select count(*) from game_events where campaign_id=$1`, campaignID).Scan(&events); err != nil {
		t.Fatal(err)
	}
	if tokens != wantTokens || events != wantEvents {
		t.Fatalf("failed create left partial state: linked tokens=%d (want %d), events=%d (want %d)", tokens, wantTokens, events, wantEvents)
	}
}
