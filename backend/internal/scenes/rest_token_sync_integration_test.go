package scenes

import (
	"context"
	"encoding/json"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"vtt-backend/internal/characters"
)

// A map token snapshot captured before a rest can be submitted afterwards to
// update an unrelated field. Its old HP must not overwrite the rest result.
func TestStaleCharacterTokenSyncCannotUndoShortRestIntegration(t *testing.T) {
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

	campaignID, gmID, playerID, sceneID, actorID := sceneTestUUID(t), sceneTestUUID(t), sceneTestUUID(t), sceneTestUUID(t), sceneTestUUID(t)
	defer func() {
		_, _ = pool.Exec(context.Background(), `delete from campaigns where id=$1`, campaignID)
		_, _ = pool.Exec(context.Background(), `delete from profiles where id in ($1,$2)`, gmID, playerID)
	}()
	sheet := characters.Sheet{
		Name: "Rest synchronization hero", Class: "fighter", Level: 2, HitDice: "1d8",
		HitPointsCurrent: 4, HitPointsMax: 16,
		AbilityScores: characters.AbilityScores{Strength: 10, Dexterity: 10, Constitution: 10, Intelligence: 10, Wisdom: 10, Charisma: 10},
		Resources:     []characters.Resource{}, SpellSlots: []characters.SpellSlot{},
	}
	rawSheet, err := json.Marshal(sheet)
	if err != nil {
		t.Fatal(err)
	}
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(context.Background())
	if _, err := tx.Exec(ctx, `set local session_replication_role=replica`); err != nil {
		t.Skipf("database role cannot create isolated rest fixtures: %v", err)
	}
	for _, profile := range []struct{ id, name string }{{gmID, "Rest sync GM"}, {playerID, "Rest sync player"}} {
		if _, err := tx.Exec(ctx, `insert into profiles(id,display_name) values($1,$2)`, profile.id, profile.name); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := tx.Exec(ctx, `insert into campaigns(id,name,owner_id,system_id,system_version) values($1,'Rest sync test',$2,'dnd2024','1.0.0')`, campaignID, gmID); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `insert into campaign_members(campaign_id,user_id,role) values($1,$2,'gm'),($1,$3,'player')`, campaignID, gmID, playerID); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `insert into actors(id,campaign_id,owner_id,name,sheet,token,kind) values($1,$2,$3,$4,$5,'{}'::jsonb,'character')`, actorID, campaignID, playerID, sheet.Name, rawSheet); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `insert into scenes(id,campaign_id,name,player_access) values($1,$2,'Rest sync scene','available')`, sceneID, campaignID); err != nil {
		t.Fatal(err)
	}
	var tokenID string
	if err := tx.QueryRow(ctx, `insert into scene_tokens(scene_id,actor_id,owner_id,name,hp_current,hp_max,movement_limit) values($1,$2,$3,$4,$5,$6,6) returning id::text`, sceneID, actorID, playerID, sheet.Name, sheet.HitPointsCurrent, sheet.HitPointsMax).Scan(&tokenID); err != nil {
		t.Fatal(err)
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}

	count := 1
	rest, err := characters.NewRepository(pool).RestCharacterWithHitDiceCount(ctx, campaignID, playerID, actorID, "short", &count)
	if err != nil {
		t.Fatal(err)
	}
	if rest.Sheet.HitPointsCurrent <= sheet.HitPointsCurrent || rest.Sheet.HitDiceSpent != 1 || rest.EventID == 0 {
		t.Fatalf("rest did not heal, spend a die, and create its event: %+v", rest)
	}

	staleSnapshot := Token{
		ID: tokenID, ActorID: &actorID, OwnerID: &playerID, Name: "Updated map label",
		X: 70, Y: 70, Size: 1, HPCurrent: sheet.HitPointsCurrent, HPMax: sheet.HitPointsMax,
		Statuses: []string{}, Visibility: Visibility{}, MovementLimit: 6,
	}
	if _, err := NewRepository(pool).UpdateToken(ctx, sceneID, tokenID, gmID, staleSnapshot); err != nil {
		t.Fatal(err)
	}
	var actorRaw []byte
	if err := pool.QueryRow(ctx, `select sheet from actors where id=$1`, actorID).Scan(&actorRaw); err != nil {
		t.Fatal(err)
	}
	var savedSheet characters.Sheet
	if err := json.Unmarshal(actorRaw, &savedSheet); err != nil {
		t.Fatal(err)
	}
	var tokenCurrent, tokenMax int
	if err := pool.QueryRow(ctx, `select hp_current,hp_max from scene_tokens where id=$1`, tokenID).Scan(&tokenCurrent, &tokenMax); err != nil {
		t.Fatal(err)
	}
	if savedSheet.HitPointsCurrent != rest.Sheet.HitPointsCurrent || tokenCurrent != rest.Sheet.HitPointsCurrent || tokenMax != rest.Sheet.HitPointsMax {
		t.Fatalf("stale token sync changed HP: actor=%d token=%d/%d rest=%d/%d", savedSheet.HitPointsCurrent, tokenCurrent, tokenMax, rest.Sheet.HitPointsCurrent, rest.Sheet.HitPointsMax)
	}
}
