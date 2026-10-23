package characters

import (
	"context"
	"errors"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"vtt-backend/internal/compendium"
)

func TestSpeciesSpellGrantConfigurationCastRecoveryAndAuthorizationIntegration(t *testing.T) {
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
		_, _ = pool.Exec(context.Background(), `delete from actors where campaign_id in ($1,$2)`, campaignID, otherCampaignID)
		_, _ = pool.Exec(context.Background(), `delete from campaign_members where campaign_id in ($1,$2)`, campaignID, otherCampaignID)
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
		t.Skipf("database role cannot create isolated spell-grant fixtures: %v", err)
	}
	if _, err := tx.Exec(ctx, `insert into profiles(id,display_name) values($1,'Spell grant test GM'),($2,'Spell grant test player')`, gmID, playerID); err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{campaignID, otherCampaignID} {
		if _, err := tx.Exec(ctx, `insert into campaigns(id,name,owner_id,system_id,system_version) values($1,'Spell grant integration',$2,'dnd2024','1.0.0')`, id, gmID); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := tx.Exec(ctx, `insert into campaign_members(campaign_id,user_id,role) values($1,$2,'gm'),($1,$3,'player'),($4,$2,'gm')`, campaignID, gmID, playerID, otherCampaignID); err != nil {
		t.Fatal(err)
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}

	// Compendium.List seeds the embedded, versioned SRD into this campaign and
	// binds the campaign to that exact catalog source before deriving grants.
	if _, _, err := compendium.NewRepository(pool).List(ctx, campaignID, gmID); err != nil {
		t.Fatal(err)
	}
	repo := NewRepository(pool)
	sheet := Sheet{
		Name: "High elf spell grant integration", Class: "wizard", Level: 5,
		Species: "Elf", SpeciesLineage: "High Elf", SpeciesSpellcastingAbility: "intelligence",
		HitPointsCurrent: 10, HitPointsMax: 20, HitDice: "5d6",
		AbilityScores: AbilityScores{Strength: 10, Dexterity: 14, Constitution: 12, Intelligence: 16, Wisdom: 12, Charisma: 10},
	}
	created, err := repo.SaveMine(ctx, campaignID, playerID, sheet)
	if err != nil {
		t.Fatal(err)
	}
	if len(created.Sheet.SpeciesSpellGrants) != 2 {
		t.Fatalf("high elf level 5 derived %d species spells, want two", len(created.Sheet.SpeciesSpellGrants))
	}
	detectMagicID := spellEntryID(t, ctx, pool, campaignID, "detect-magic")
	var grant SpeciesSpellGrant
	foundDetectMagic := false
	for _, candidate := range created.Sheet.SpeciesSpellGrants {
		if candidate.SpellEntryID == "" || candidate.ID == "" {
			t.Fatalf("server returned an incomplete grant: %+v", candidate)
		}
		if candidate.FreeCastsRemaining != 1 {
			t.Fatalf("independent grant did not start with one use: %+v", candidate)
		}
		if candidate.SpellEntryID == detectMagicID {
			grant = candidate
			foundDetectMagic = true
		}
	}
	if !foundDetectMagic {
		t.Fatalf("derived species grants omitted Detect Magic: %+v", created.Sheet.SpeciesSpellGrants)
	}

	configured, err := repo.SetSpellGrantUseConfigForGM(ctx, campaignID, created.ID, gmID, grant.ID, grant.SpellEntryID, 2, 2, "short")
	if err != nil {
		t.Fatal(err)
	}
	configuredGrant := findSpeciesGrant(configured.Sheet.SpeciesSpellGrants, grant.ID)
	if configuredGrant == nil || configuredGrant.FreeCastsRemaining != 2 || configuredGrant.FreeCastsMax != 2 || configuredGrant.FreeCastsRecovery != "short" {
		t.Fatalf("GM configuration was not persisted: %+v", configured.Sheet.SpeciesSpellGrants)
	}
	if _, err := repo.SetSpellGrantUseConfigForGM(ctx, campaignID, created.ID, playerID, grant.ID, grant.SpellEntryID, 3, 3, "long"); !errors.Is(err, ErrForbidden) {
		t.Fatalf("player configuration error = %v, want forbidden", err)
	}
	if _, err := repo.SetSpellGrantUseConfigForGM(ctx, otherCampaignID, created.ID, gmID, grant.ID, grant.SpellEntryID, 3, 3, "long"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("cross-campaign grant configuration error = %v, want not found", err)
	}
	if _, err := repo.SetSpellGrantUseConfigForGM(ctx, campaignID, created.ID, gmID, grant.ID, grant.SpellEntryID, 2, 3, "short"); !errors.Is(err, ErrInvalidSpellGrant) {
		t.Fatalf("out-of-range current uses error = %v, want invalid grant", err)
	}
	unchanged, err := repo.GetForGM(ctx, campaignID, created.ID, gmID)
	unchangedGrant := findSpeciesGrant(unchanged.Sheet.SpeciesSpellGrants, grant.ID)
	if err != nil || unchangedGrant == nil || unchangedGrant.FreeCastsRemaining != 2 {
		t.Fatalf("rejected configuration changed the grant: %+v, %v", unchanged.Sheet.SpeciesSpellGrants, err)
	}

	var sceneID string
	if err := pool.QueryRow(ctx, `insert into scenes(campaign_id,name) values($1,'Spell grant scene') returning id::text`, campaignID).Scan(&sceneID); err != nil {
		t.Fatal(err)
	}
	// A grant-selected cast has no sheet spell index; CastSpell rejects every
	// non-negative index when GrantID is present.
	freeCast := SpellCastInput{SpellIndex: -1, GrantID: grant.ID, EntryID: grant.SpellEntryID, FreeCast: true, PresentationSceneID: sceneID}
	cast, err := repo.CastSpell(ctx, campaignID, playerID, freeCast)
	if err != nil {
		t.Fatal(err)
	}
	if findSpeciesGrant(cast.Sheet.SpeciesSpellGrants, grant.ID).FreeCastsRemaining != 1 || !cast.PresentationUpdated || cast.EventID == 0 {
		t.Fatalf("authorized free cast did not atomically consume and present: %+v", cast)
	}
	var successfulEventCount int
	if err := pool.QueryRow(ctx, `select count(*) from game_events where campaign_id=$1 and id=$2 and payload->>'spellCast'='true'`, campaignID, cast.EventID).Scan(&successfulEventCount); err != nil || successfulEventCount != 1 {
		t.Fatalf("successful cast event missing: count=%d err=%v", successfulEventCount, err)
	}
	var presentedTitle string
	if err := pool.QueryRow(ctx, `select title from scene_presentations where scene_id=$1 and visible`, sceneID).Scan(&presentedTitle); err != nil || presentedTitle != cast.SpellName {
		t.Fatalf("spell presentation title=%q err=%v, want %q", presentedTitle, err, cast.SpellName)
	}
	if _, err := repo.CastSpell(ctx, campaignID, playerID, freeCast); err != nil {
		t.Fatal(err)
	}
	beforeRejected, err := repo.GetMine(ctx, campaignID, playerID)
	if err != nil {
		t.Fatal(err)
	}
	var eventsBefore int
	if err := pool.QueryRow(ctx, `select count(*) from game_events where campaign_id=$1`, campaignID).Scan(&eventsBefore); err != nil {
		t.Fatal(err)
	}
	var presentationBefore struct {
		title, description string
	}
	if err := pool.QueryRow(ctx, `select title,description from scene_presentations where scene_id=$1`, sceneID).Scan(&presentationBefore.title, &presentationBefore.description); err != nil {
		t.Fatal(err)
	}
	if _, err := repo.CastSpell(ctx, campaignID, playerID, freeCast); err == nil {
		t.Fatal("free cast at zero uses unexpectedly succeeded")
	}
	afterRejected, err := repo.GetMine(ctx, campaignID, playerID)
	if err != nil {
		t.Fatal(err)
	}
	var eventsAfter int
	if err := pool.QueryRow(ctx, `select count(*) from game_events where campaign_id=$1`, campaignID).Scan(&eventsAfter); err != nil {
		t.Fatal(err)
	}
	if eventsAfter != eventsBefore || !sameSpellGrantState(beforeRejected.Sheet.SpeciesSpellGrants, afterRejected.Sheet.SpeciesSpellGrants) {
		t.Fatal("rejected exhausted free cast changed a grant or created an event")
	}
	var presentationAfter struct {
		title, description string
	}
	if err := pool.QueryRow(ctx, `select title,description from scene_presentations where scene_id=$1`, sceneID).Scan(&presentationAfter.title, &presentationAfter.description); err != nil {
		t.Fatal(err)
	}
	if presentationAfter != presentationBefore {
		t.Fatal("rejected exhausted free cast changed the previous scene presentation")
	}

	// Exhausted free uses do not silently become free, but the same grant may
	// explicitly be cast with a normal compatible spell slot.
	grantCast := freeCast
	grantCast.FreeCast = false
	grantCast.SlotLevel = 1
	grantCast.PresentationSceneID = ""
	withSlot, err := repo.CastSpell(ctx, campaignID, playerID, grantCast)
	if err != nil {
		t.Fatal(err)
	}
	if findSpeciesGrant(withSlot.Sheet.SpeciesSpellGrants, grant.ID).FreeCastsRemaining != 0 || withSlot.Sheet.SpellSlots[0].Current != created.Sheet.SpellSlots[0].Current-1 {
		t.Fatalf("normal slot cast did not preserve exhausted free uses or consume one slot: %+v", withSlot.Sheet)
	}

	zero := 0
	rest, err := repo.RestCharacterWithHitDiceCount(ctx, campaignID, playerID, created.ID, "short", &zero)
	if err != nil {
		t.Fatal(err)
	}
	restored := findSpeciesGrant(rest.Sheet.SpeciesSpellGrants, grant.ID)
	if restored == nil || restored.FreeCastsRemaining != 2 {
		t.Fatalf("short rest did not restore the configured grant to its maximum: %+v", rest.Sheet.SpeciesSpellGrants)
	}
	reloaded, err := repo.GetMine(ctx, campaignID, playerID)
	reloadedGrant := findSpeciesGrant(reloaded.Sheet.SpeciesSpellGrants, grant.ID)
	if err != nil || reloadedGrant == nil || reloadedGrant.FreeCastsRemaining != 2 {
		t.Fatalf("short rest recovery did not persist: %+v, %v", reloaded.Sheet.SpeciesSpellGrants, err)
	}

	// Also exercise a curated feat grant. The submitted client identity/counters
	// are selectors only; the server creates the stable identity and initializes
	// mechanics from the reviewed D&D 2024 rule.
	featSheet := reloaded.Sheet
	featSheet.Feats = "Magic Initiate"
	cantripOne := spellEntryID(t, ctx, pool, campaignID, "fire-bolt")
	cantripTwo := spellEntryID(t, ctx, pool, campaignID, "light")
	leveledSpell := spellEntryID(t, ctx, pool, campaignID, "mage-armor")
	featSheet.FeatSpellGrants = []FeatSpellGrant{{
		ID: "client-id-is-not-canonical", FeatID: "magic-initiate", SpellList: "wizard", Ability: "intelligence",
		CantripEntryIDs: []string{cantripOne, cantripTwo}, FirstLevelSpellEntryID: leveledSpell,
		FreeCastsRemaining: 99, FreeCastsMaxOverride: ptrInt(99), FreeCastsRecovery: "none",
	}}
	withFeat, err := repo.SaveMine(ctx, campaignID, playerID, featSheet)
	if err != nil || len(withFeat.Sheet.FeatSpellGrants) != 1 {
		t.Fatalf("save curated feat grant: grants=%+v err=%v", withFeat.Sheet.FeatSpellGrants, err)
	}
	featGrant := withFeat.Sheet.FeatSpellGrants[0]
	if featGrant.ID != "dnd2024:feat:magic-initiate:wizard" || featGrant.FreeCastsRemaining != 1 || featGrant.FreeCastsMaxOverride != nil || featGrant.FreeCastsRecovery != "" {
		t.Fatalf("client-forged identity or counters were accepted: %+v", featGrant)
	}
	configuredFeat, err := repo.SetSpellGrantUseConfigForGM(ctx, campaignID, created.ID, gmID, featGrant.ID, leveledSpell, 2, 2, "long")
	if err != nil {
		t.Fatal(err)
	}
	// Magic Initiate recovers on a long rest by default, so the long setting is
	// represented by the absence of a recovery override in the saved sheet.
	if configuredFeat.Sheet.FeatSpellGrants[0].FreeCastsRemaining != 2 || configuredFeat.Sheet.FeatSpellGrants[0].FreeCastsMaxOverride == nil || *configuredFeat.Sheet.FeatSpellGrants[0].FreeCastsMaxOverride != 2 {
		t.Fatalf("narrator could not configure feat uses: %+v", configuredFeat.Sheet.FeatSpellGrants)
	}
	featFreeCast := SpellCastInput{SpellIndex: -1, GrantID: featGrant.ID, EntryID: leveledSpell, FreeCast: true}
	if _, err := repo.CastSpell(ctx, campaignID, playerID, featFreeCast); err != nil {
		t.Fatal(err)
	}
	if _, err := repo.CastSpell(ctx, campaignID, playerID, featFreeCast); err != nil {
		t.Fatal(err)
	}
	featAfterCast, err := repo.GetMine(ctx, campaignID, playerID)
	if err != nil || featAfterCast.Sheet.FeatSpellGrants[0].FreeCastsRemaining != 0 {
		t.Fatalf("feat free casts did not persist both uses consumed: %+v, %v", featAfterCast.Sheet.FeatSpellGrants, err)
	}

	// Exhaust the short-rest species grant too. A short rest restores that
	// source but leaves the long-rest feat grant spent; a long rest then restores
	// both and a fresh read confirms the counters were persisted within bounds.
	for range 2 {
		if _, err := repo.CastSpell(ctx, campaignID, playerID, freeCast); err != nil {
			t.Fatal(err)
		}
	}
	spent, err := repo.GetMine(ctx, campaignID, playerID)
	if err != nil {
		t.Fatal(err)
	}
	if findSpeciesGrant(spent.Sheet.SpeciesSpellGrants, grant.ID).FreeCastsRemaining != 0 || spent.Sheet.FeatSpellGrants[0].FreeCastsRemaining != 0 {
		t.Fatalf("spell grants were not both exhausted before rest: species=%+v feat=%+v", spent.Sheet.SpeciesSpellGrants, spent.Sheet.FeatSpellGrants)
	}
	if _, err := repo.RestCharacterWithHitDiceCount(ctx, campaignID, playerID, created.ID, "short", &zero); err != nil {
		t.Fatal(err)
	}
	afterShort, err := repo.GetMine(ctx, campaignID, playerID)
	if err != nil {
		t.Fatal(err)
	}
	shortFeat := afterShort.Sheet.FeatSpellGrants[0]
	if findSpeciesGrant(afterShort.Sheet.SpeciesSpellGrants, grant.ID).FreeCastsRemaining != 2 || shortFeat.FreeCastsRemaining != 0 || shortFeat.FreeCastsMaxOverride == nil || shortFeat.FreeCastsRemaining > *shortFeat.FreeCastsMaxOverride {
		t.Fatalf("short rest recovered the wrong grant sources: species=%+v feat=%+v", afterShort.Sheet.SpeciesSpellGrants, afterShort.Sheet.FeatSpellGrants)
	}
	if _, err := repo.RestCharacterWithHitDiceCount(ctx, campaignID, playerID, created.ID, "long", &zero); err != nil {
		t.Fatal(err)
	}
	afterLong, err := repo.GetMine(ctx, campaignID, playerID)
	if err != nil {
		t.Fatal(err)
	}
	if species := findSpeciesGrant(afterLong.Sheet.SpeciesSpellGrants, grant.ID); species == nil || species.FreeCastsRemaining != 2 || species.FreeCastsRemaining > species.FreeCastsMax {
		t.Fatalf("long rest did not preserve bounded species grant recovery: %+v", afterLong.Sheet.SpeciesSpellGrants)
	}
	if feat := afterLong.Sheet.FeatSpellGrants[0]; feat.FreeCastsRemaining != 2 || feat.FreeCastsMaxOverride == nil || feat.FreeCastsRemaining > *feat.FreeCastsMaxOverride {
		t.Fatalf("long rest did not persist bounded feat grant recovery: %+v", afterLong.Sheet.FeatSpellGrants)
	}
}

func spellEntryID(t *testing.T, ctx context.Context, pool *pgxpool.Pool, campaignID, ruleID string) string {
	t.Helper()
	var id string
	err := pool.QueryRow(ctx, `select e.id::text from srd_catalog_entries e join srd_catalog_sources s on s.id=e.source_id join campaign_srd_catalog_sources cs on cs.source_id=e.source_id and cs.campaign_id=$1 where s.slug='dnd-srd' and e.entry_type='spell' and e.is_published and e.rules->>'id'=$2`, campaignID, ruleID).Scan(&id)
	if err != nil {
		t.Fatalf("load SRD spell %s for integration fixture: %v", ruleID, err)
	}
	return id
}

func findSpeciesGrant(grants []SpeciesSpellGrant, id string) *SpeciesSpellGrant {
	for index := range grants {
		if grants[index].ID == id {
			return &grants[index]
		}
	}
	return nil
}

func sameSpellGrantState(left, right []SpeciesSpellGrant) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if left[index].ID != right[index].ID || left[index].FreeCastsRemaining != right[index].FreeCastsRemaining || left[index].FreeCastsMax != right[index].FreeCastsMax || left[index].FreeCastsRecovery != right[index].FreeCastsRecovery {
			return false
		}
	}
	return true
}
