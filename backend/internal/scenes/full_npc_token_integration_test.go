package scenes

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"vtt-backend/internal/characters"
)

func TestFullNPCCharacterCanBePlacedWithoutPlayerOwnershipIntegration(t *testing.T) {
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
		Name: "Full NPC guard", PortraitPath: "campaigns/test/npc.webp", TokenPortraitPath: "campaigns/test/token.webp",
		Class: "fighter", Level: 3, Speed: 9, HitPointsCurrent: 17, HitPointsMax: 20, ArmorClass: 15,
		AbilityScores: characters.AbilityScores{Strength: 14, Dexterity: 12, Constitution: 13, Intelligence: 10, Wisdom: 11, Charisma: 8},
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
		t.Skipf("database role cannot create isolated full NPC token fixtures: %v", err)
	}
	if _, err := tx.Exec(ctx, `insert into profiles(id,display_name) values($1,'Full NPC token GM'),($2,'Full NPC token player')`, gmID, playerID); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `insert into campaigns(id,name,owner_id,system_id,system_version) values($1,'Full NPC token integration',$2,'dnd2024','1.0.0')`, campaignID, gmID); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `insert into campaign_members(campaign_id,user_id,role) values($1,$2,'gm'),($1,$3,'player')`, campaignID, gmID, playerID); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `insert into actors(id,campaign_id,kind,full_npc,name,sheet) values($1,$2,'character',true,$3,$4)`, actorID, campaignID, sheet.Name, rawSheet); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `insert into scenes(id,campaign_id,name) values($1,$2,'Full NPC token scene')`, sceneID, campaignID); err != nil {
		t.Fatal(err)
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}

	repo := NewRepository(pool)
	if _, err := repo.CreateTokenFromCharacter(ctx, sceneID, actorID, playerID); !errors.Is(err, ErrForbidden) {
		t.Fatalf("player token creation error = %v, want forbidden", err)
	}
	token, err := repo.CreateTokenFromCharacter(ctx, sceneID, actorID, gmID)
	if err != nil {
		t.Fatalf("GM create token from full NPC: %v", err)
	}
	if token.ActorID == nil || *token.ActorID != actorID || token.OwnerID != nil || token.Name != sheet.Name || token.HPMax != sheet.HitPointsMax || token.ArmorClass != sheet.ArmorClass {
		t.Fatalf("created full NPC token does not preserve its unowned character identity: %+v", token)
	}
	currentHP := 7
	if _, err := repo.UpdateTokenHitPoints(ctx, sceneID, token.ID, playerID, hitPointsUpdate{HPCurrent: &currentHP}); !errors.Is(err, ErrForbidden) {
		t.Fatalf("player full NPC token HP update error = %v, want forbidden", err)
	}
}
