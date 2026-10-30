package characters

import (
	"context"
	"errors"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"vtt-backend/internal/npcs"
)

func TestFullNPCCharactersAreIndependentAndGMManagedIntegration(t *testing.T) {
	databaseURL := os.Getenv("REALTIME_TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("REALTIME_TEST_DATABASE_URL is not configured")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	if err := pool.Ping(ctx); err != nil {
		t.Fatal(err)
	}

	campaignID, otherCampaignID, gmID, playerID := characterTestUUID(t), characterTestUUID(t), characterTestUUID(t), characterTestUUID(t)
	cleanup := func() {
		_, _ = pool.Exec(context.Background(), `delete from campaigns where id in ($1,$2)`, campaignID, otherCampaignID)
		_, _ = pool.Exec(context.Background(), `delete from profiles where id in ($1,$2)`, gmID, playerID)
	}
	defer cleanup()
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(context.Background())
	if _, err := tx.Exec(ctx, `set local session_replication_role=replica`); err != nil {
		t.Skipf("database role cannot create isolated full NPC fixtures: %v", err)
	}
	if _, err := tx.Exec(ctx, `insert into profiles(id,display_name) values($1,'Full NPC GM'),($2,'Full NPC player')`, gmID, playerID); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `insert into campaigns(id,name,owner_id,system_id,system_version) values($1,'Full NPC integration',$2,'dnd2024','1.0.0')`, campaignID, gmID); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `insert into campaigns(id,name,owner_id,system_id,system_version) values($1,'Other full NPC integration',$2,'dnd2024','1.0.0')`, otherCampaignID, gmID); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `insert into campaign_members(campaign_id,user_id,role) values($1,$2,'gm'),($1,$3,'player')`, campaignID, gmID, playerID); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `insert into campaign_members(campaign_id,user_id,role) values($1,$2,'gm')`, otherCampaignID, gmID); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `insert into actors(campaign_id,owner_id,kind,name,sheet) values($1,$2,'character','Player sheet','{}')`, campaignID, playerID); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `insert into actors(campaign_id,kind,name,sheet) values($1,'npc','Simplified NPC','{"hitPointsCurrent":8,"hitPointsMax":8,"armorClass":12,"size":1,"color":3381504}')`, campaignID); err != nil {
		t.Fatal(err)
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}

	characters := NewRepository(pool)
	first, err := characters.CreateNPCCharacterForGM(ctx, campaignID, gmID)
	if err != nil {
		t.Fatalf("create first full NPC: %v", err)
	}
	second, err := characters.CreateNPCCharacterForGM(ctx, campaignID, gmID)
	if err != nil {
		t.Fatalf("create second full NPC in the same campaign: %v", err)
	}
	if first.ID == second.ID || first.OwnerID != "" || second.OwnerID != "" {
		t.Fatalf("full NPC identity/ownership = (%q, %q), (%q, %q); want distinct ownerless sheets", first.ID, first.OwnerID, second.ID, second.OwnerID)
	}
	var fullNPCCount int
	if err := pool.QueryRow(ctx, `select count(*) from actors where campaign_id=$1 and kind='character' and full_npc`, campaignID).Scan(&fullNPCCount); err != nil || fullNPCCount != 2 {
		t.Fatalf("stored full NPC count = %d, err=%v; want 2", fullNPCCount, err)
	}

	listed, err := characters.ListNPCCharactersForGM(ctx, campaignID, gmID)
	if err != nil || len(listed) != 2 {
		t.Fatalf("GM list returned %d NPC summaries, err=%v; want 2", len(listed), err)
	}
	participants, err := characters.ListForGM(ctx, campaignID, gmID)
	if err != nil || len(participants) != 2 {
		t.Fatalf("participant roster mixed NPC sheets with participant sheets: %#v, err=%v", participants, err)
	}
	playerSheetListed := false
	for _, participant := range participants {
		if participant.UserID == playerID && participant.Character != nil && participant.Character.ID != first.ID && participant.Character.ID != second.ID {
			playerSheetListed = true
		}
	}
	if !playerSheetListed {
		t.Fatalf("participant roster did not preserve the player's own sheet: %#v", participants)
	}
	if _, err := characters.ListNPCCharactersForGM(ctx, campaignID, playerID); !errors.Is(err, ErrForbidden) {
		t.Fatalf("player full NPC list error = %v, want forbidden", err)
	}
	if _, err := characters.CreateNPCCharacterForGM(ctx, campaignID, playerID); !errors.Is(err, ErrForbidden) {
		t.Fatalf("player full NPC create error = %v, want forbidden", err)
	}
	if _, err := characters.GetForGM(ctx, campaignID, first.ID, playerID); !errors.Is(err, ErrForbidden) {
		t.Fatalf("player full NPC open error = %v, want forbidden", err)
	}
	if _, err := characters.SaveForGM(ctx, campaignID, first.ID, playerID, first.Sheet); !errors.Is(err, ErrForbidden) {
		t.Fatalf("player full NPC edit error = %v, want forbidden", err)
	}
	if err := characters.DeleteForGM(ctx, campaignID, first.ID, playerID); !errors.Is(err, ErrForbidden) {
		t.Fatalf("player full NPC delete error = %v, want forbidden", err)
	}

	opened, err := characters.GetForGM(ctx, campaignID, first.ID, gmID)
	if err != nil || opened.ID != first.ID {
		t.Fatalf("GM open = (%q, %v), want %q", opened.ID, err, first.ID)
	}
	opened.Sheet.Name = "Edited NPC"
	opened.Sheet.Class = "fighter"
	opened.Sheet.Level = 3
	opened.Sheet.Features = "Updated campaign NPC features"
	updated, err := characters.SaveForGM(ctx, campaignID, first.ID, gmID, opened.Sheet)
	if err != nil || updated.Sheet.Name != "Edited NPC" || updated.Sheet.Features != opened.Sheet.Features {
		t.Fatalf("GM save = (%q, %q, %v), want edited full sheet", updated.Sheet.Name, updated.Sheet.Features, err)
	}
	listed, err = characters.ListNPCCharactersForGM(ctx, campaignID, gmID)
	if err != nil || len(listed) != 2 {
		t.Fatalf("NPC summary list after edit returned %d items, err=%v", len(listed), err)
	}
	foundEditedSummary := false
	for _, summary := range listed {
		if summary.ID == first.ID && summary.Name == "Edited NPC" && summary.Class == "fighter" && summary.Level == 3 {
			foundEditedSummary = true
		}
	}
	if !foundEditedSummary {
		t.Fatalf("metadata list did not reflect edited NPC: %#v", listed)
	}

	foreignNPC, err := characters.CreateNPCCharacterForGM(ctx, otherCampaignID, gmID)
	if err != nil {
		t.Fatalf("create NPC in second campaign: %v", err)
	}
	var foreignSceneID string
	if err := pool.QueryRow(ctx, `insert into scenes(campaign_id,name) values($1,'Foreign full NPC scene') returning id::text`, otherCampaignID).Scan(&foreignSceneID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `insert into scene_tokens(scene_id,actor_id,name) values($1,$2,$3)`, foreignSceneID, foreignNPC.ID, foreignNPC.Sheet.Name); err != nil {
		t.Fatal(err)
	}
	if err := characters.DeleteForGM(ctx, campaignID, foreignNPC.ID, gmID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("cross-campaign NPC delete error = %v, want not found", err)
	}
	var foreignTokenCount int
	if err := pool.QueryRow(ctx, `select count(*) from scene_tokens where actor_id=$1`, foreignNPC.ID).Scan(&foreignTokenCount); err != nil || foreignTokenCount != 1 {
		t.Fatalf("cross-campaign delete changed foreign scene tokens: count=%d, err=%v", foreignTokenCount, err)
	}

	mySheet, err := characters.GetMine(ctx, campaignID, playerID)
	if err != nil || mySheet.OwnerID != playerID || mySheet.ID == first.ID || mySheet.ID == second.ID {
		t.Fatalf("participant sheet after NPC creation = (%q, %q, %v)", mySheet.ID, mySheet.OwnerID, err)
	}
	if _, err := pool.Exec(ctx, `insert into actors(campaign_id,owner_id,kind,name,sheet) values($1,$2,'character','Duplicate player sheet','{}')`, campaignID, playerID); err == nil {
		t.Fatal("participant could create a second character in the same campaign; unique player-sheet rule was weakened")
	} else {
		var pgErr *pgconn.PgError
		if !errors.As(err, &pgErr) || pgErr.Code != "23505" {
			t.Fatalf("duplicate participant sheet error = %v, want unique violation", err)
		}
	}

	simplifiedNPCs, err := npcs.NewRepository(pool).List(ctx, campaignID, gmID)
	if err != nil || len(simplifiedNPCs) != 1 || simplifiedNPCs[0].Name != "Simplified NPC" {
		t.Fatalf("simplified NPC list = (%#v, %v), want the unchanged simplified NPC", simplifiedNPCs, err)
	}
	if err := characters.DeleteForGM(ctx, campaignID, first.ID, gmID); err != nil {
		t.Fatalf("GM delete full NPC: %v", err)
	}
	if _, err := characters.GetForGM(ctx, campaignID, first.ID, gmID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("deleted NPC lookup error = %v, want not found", err)
	}
	remaining, err := characters.ListNPCCharactersForGM(ctx, campaignID, gmID)
	if err != nil || len(remaining) != 1 || remaining[0].ID != second.ID {
		t.Fatalf("NPC list after delete = (%#v, %v), want only second NPC", remaining, err)
	}
}
