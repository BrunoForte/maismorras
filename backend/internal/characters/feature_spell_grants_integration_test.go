package characters

import (
	"context"
	"encoding/json"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func TestClassFeatureSpellGrantCastingIntegration(t *testing.T) {
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

	campaignID, gmID, playerID := characterTestUUID(t), characterTestUUID(t), characterTestUUID(t)
	sourceID, classEntryID, subclassEntryID, otherSubclassID, spellEntryID :=
		characterTestUUID(t), characterTestUUID(t), characterTestUUID(t), characterTestUUID(t), characterTestUUID(t)
	cleanup := func() {
		_, _ = pool.Exec(context.Background(), `delete from game_events where campaign_id=$1`, campaignID)
		_, _ = pool.Exec(context.Background(), `delete from scene_presentations where scene_id in (select id from scenes where campaign_id=$1)`, campaignID)
		_, _ = pool.Exec(context.Background(), `delete from scenes where campaign_id=$1`, campaignID)
		_, _ = pool.Exec(context.Background(), `delete from actors where campaign_id=$1`, campaignID)
		_, _ = pool.Exec(context.Background(), `delete from compendium_entries where campaign_id=$1`, campaignID)
		_, _ = pool.Exec(context.Background(), `delete from compendium_sources where campaign_id=$1`, campaignID)
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
		t.Skipf("database role cannot create isolated feature spell fixtures: %v", err)
	}
	if _, err := tx.Exec(ctx, `insert into profiles(id,display_name) values($1,'Feature spell GM'),($2,'Feature spell player')`, gmID, playerID); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `insert into campaigns(id,name,owner_id,system_id,system_version) values($1,'Feature spell integration',$2,'dnd2024','1.0.0')`, campaignID, gmID); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `insert into campaign_members(campaign_id,user_id,role) values($1,$2,'gm'),($1,$3,'player')`, campaignID, gmID, playerID); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `insert into compendium_sources(id,campaign_id,slug,title,kind) values($1,$2,'feature-spell-test','Feature spell test','srd')`, sourceID, campaignID); err != nil {
		t.Fatal(err)
	}
	classRules := json.RawMessage(`{"id":"paladin","features":[]}`)
	subclassRules := json.RawMessage(`{"classId":"paladin","features":[{"id":"crown-spells","level":3,"name":"Crown Spells","grants":[{"type":"spell","spellEntryId":"PLACEHOLDER"}]}]}`)
	otherSubclassRules := json.RawMessage(`{"classId":"paladin","features":[{"id":"devotion-spells","level":3,"name":"Devotion Spells","grants":[{"type":"spell","spellEntryId":"PLACEHOLDER"}]}]}`)
	spellRules := json.RawMessage(`{"level":1,"classes":[],"description":"A synthetic spell granted by a feature."}`)
	if _, err := tx.Exec(ctx, `
		insert into compendium_entries(id,campaign_id,source_id,entry_type,name,summary,rules,translations,is_published,created_by)
		values
		($1,$2,$3,'class','Paladin','Synthetic class',$4,'{}',true,$5),
		($6,$2,$3,'subclass','Oath of the Crown','Synthetic subclass',$7,'{"pt-BR":"Juramento da Coroa"}',true,$5),
		($8,$2,$3,'subclass','Oath of Devotion','Synthetic subclass',$9,'{}',true,$5),
		($10,$2,$3,'spell','Crown Aid','Synthetic spell',$11,'{}',true,$5)
	`, classEntryID, campaignID, sourceID, classRules, gmID, subclassEntryID, subclassRules, otherSubclassID, otherSubclassRules, spellEntryID, spellRules); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `update compendium_entries set rules=jsonb_set(rules,'{features,0,grants,0,spellEntryId}',to_jsonb($1::text)) where id in ($2,$3)`, spellEntryID, subclassEntryID, otherSubclassID); err != nil {
		t.Fatal(err)
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}

	var sceneID string
	if err := pool.QueryRow(ctx, `insert into scenes(campaign_id,name) values($1,'Feature spell scene') returning id::text`, campaignID).Scan(&sceneID); err != nil {
		t.Fatal(err)
	}
	repo := NewRepository(pool)
	created, err := repo.SaveMine(ctx, campaignID, playerID, Sheet{
		Name: "Feature spell character", Class: "Paladin", Subclass: "Juramento da Coroa", Level: 3,
		HitPointsCurrent: 20, HitPointsMax: 20, HitDice: "3d10",
		AbilityScores: AbilityScores{Strength: 16, Dexterity: 10, Constitution: 14, Intelligence: 10, Wisdom: 12, Charisma: 14},
		SpellSlots:    []SpellSlot{{Level: 1, Current: 1, Max: 2}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(created.Sheet.Spells) != 0 {
		t.Fatalf("fixture unexpectedly has a manual copy of the granted spell: %+v", created.Sheet.Spells)
	}

	castInput := SpellCastInput{
		SpellIndex: -1, SlotLevel: 1, EntryID: spellEntryID,
		FeatureEntryID: subclassEntryID, FeatureID: "crown-spells", PresentationSceneID: sceneID,
	}
	cast, err := repo.CastSpell(ctx, campaignID, playerID, castInput)
	if err != nil {
		t.Fatalf("cast authorized class feature spell without a manual sheet entry: %v", err)
	}
	if cast.SpellName != "Crown Aid" || cast.BaseLevel != 1 || cast.SlotLevel != 1 || cast.Sheet.SpellSlots[0].Current != 0 || !cast.PresentationUpdated || cast.EventID == 0 {
		t.Fatalf("feature spell did not consume a compatible slot and present: %+v", cast)
	}
	var eventCount int
	if err := pool.QueryRow(ctx, `select count(*) from game_events where campaign_id=$1 and id=$2 and payload->>'spellCast'='true' and payload->>'spellName'='Crown Aid'`, campaignID, cast.EventID).Scan(&eventCount); err != nil || eventCount != 1 {
		t.Fatalf("feature spell chat event count=%d err=%v", eventCount, err)
	}
	var presentationTitle string
	if err := pool.QueryRow(ctx, `select title from scene_presentations where scene_id=$1 and visible`, sceneID).Scan(&presentationTitle); err != nil || presentationTitle != "Crown Aid" {
		t.Fatalf("feature spell presentation title=%q err=%v", presentationTitle, err)
	}
	if _, err := repo.CastSpell(ctx, campaignID, playerID, SpellCastInput{
		SpellIndex: -1, SlotLevel: 0, EntryID: spellEntryID,
		FeatureEntryID: subclassEntryID, FeatureID: "crown-spells", FreeCast: true,
	}); err == nil {
		t.Fatal("feature-prepared spell gained a free use without an explicit free-use grant")
	}

	if _, err := repo.CastSpell(ctx, campaignID, playerID, SpellCastInput{
		SpellIndex: -1, SlotLevel: 1, EntryID: spellEntryID,
		FeatureEntryID: otherSubclassID, FeatureID: "devotion-spells",
	}); err == nil {
		t.Fatal("spell grant from an unselected subclass was accepted")
	}
	afterInvalid, err := repo.GetMine(ctx, campaignID, playerID)
	if err != nil || afterInvalid.Sheet.SpellSlots[0].Current != 0 {
		t.Fatalf("rejected invalid subclass grant changed the sheet: %+v err=%v", afterInvalid.Sheet, err)
	}

	lowerLevel := cast.Sheet
	lowerLevel.Level = 2
	lowerLevel.SpellSlots[0].Current = 1
	if _, err := repo.SaveMine(ctx, campaignID, playerID, lowerLevel); err != nil {
		t.Fatal(err)
	}
	if _, err := repo.CastSpell(ctx, campaignID, playerID, castInput); err == nil {
		t.Fatal("spell grant above the current character level was accepted")
	}
	afterLowLevel, err := repo.GetMine(ctx, campaignID, playerID)
	if err != nil || afterLowLevel.Sheet.SpellSlots[0].Current != 1 {
		t.Fatalf("rejected insufficient-level grant consumed a slot: %+v err=%v", afterLowLevel.Sheet, err)
	}
}
