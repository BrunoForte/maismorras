package compendium

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"reflect"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func TestSharedSRDCatalogAndOwnerTranslationIntegration(t *testing.T) {
	databaseURL := os.Getenv("REALTIME_TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("REALTIME_TEST_DATABASE_URL is not configured")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	ids := make([]string, 12)
	for i := range ids {
		ids[i] = compendiumTestUUID(t)
	}
	campaignA, campaignB, owner, gmB, player, sourceA, sourceB, legacyFireballA, legacyFireballB, legacyFeatA, legacyFeatB, legacyShieldA := ids[0], ids[1], ids[2], ids[3], ids[4], ids[5], ids[6], ids[7], ids[8], ids[9], ids[10], ids[11]
	legacyShieldB := compendiumTestUUID(t)
	cleanup := func() {
		_, _ = pool.Exec(context.Background(), `delete from campaigns where id in($1,$2)`, campaignA, campaignB)
		_, _ = pool.Exec(context.Background(), `delete from profiles where id in($1,$2,$3)`, owner, gmB, player)
	}
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = tx.Rollback(context.Background()) }()
	if _, err = tx.Exec(ctx, `set local session_replication_role=replica`); err != nil {
		t.Skipf("database role cannot create isolated profiles: %v", err)
	}
	for _, user := range []struct{ id, name string }{{owner, "Shared catalog owner"}, {gmB, "Campaign GM"}, {player, "Campaign player"}} {
		if _, err = tx.Exec(ctx, `insert into profiles(id,display_name) values($1,$2)`, user.id, user.name); err != nil {
			t.Fatal(err)
		}
	}
	for _, campaign := range []struct{ id, owner string }{{campaignA, owner}, {campaignB, gmB}} {
		if _, err = tx.Exec(ctx, `insert into campaigns(id,name,owner_id,system_id) values($1,'Shared catalog test',$2,'dnd2024')`, campaign.id, campaign.owner); err != nil {
			t.Fatal(err)
		}
	}
	if _, err = tx.Exec(ctx, `insert into campaign_members(campaign_id,user_id,role) values($1,$2,'gm'),($1,$3,'player'),($1,$5,'gm'),($4,$2,'player'),($4,$5,'gm')`, campaignA, owner, player, campaignB, gmB); err != nil {
		t.Fatal(err)
	}
	for _, source := range []struct{ id, campaign string }{{sourceA, campaignA}, {sourceB, campaignB}} {
		if _, err = tx.Exec(ctx, `insert into compendium_sources(id,campaign_id,slug,title,kind,is_read_only) values($1,$2,'dnd-srd-5-2-1','Legacy SRD','srd',true)`, source.id, source.campaign); err != nil {
			t.Fatal(err)
		}
	}
	for _, entry := range []struct {
		id, campaign, source, kind, name string
		rules                            json.RawMessage
		translations                     json.RawMessage
	}{{legacyFireballA, campaignA, sourceA, "spell", "Fireball", json.RawMessage(`{"level":3,"classes":["wizard"]}`), json.RawMessage(`{}`)}, {legacyFireballB, campaignB, sourceB, "spell", "Fireball", json.RawMessage(`{"level":3,"classes":["wizard"]}`), json.RawMessage(`{}`)}, {legacyShieldA, campaignA, sourceA, "spell", "Shield", json.RawMessage(`{"level":1,"classes":["wizard"]}`), json.RawMessage(`{"pt-BR":"Proteção legada da campanha A","pt-BR.source":"manual"}`)}, {legacyShieldB, campaignB, sourceB, "spell", "Shield", json.RawMessage(`{"level":1,"classes":["wizard"]}`), json.RawMessage(`{}`)}, {legacyFeatA, campaignA, sourceA, "feat", "Magic Initiate", json.RawMessage(`{"campaignOverrides":{"featSpellGrant":{"enabled":true,"spells":[]}}}`), json.RawMessage(`{}`)}, {legacyFeatB, campaignB, sourceB, "feat", "Magic Initiate", json.RawMessage(`{}`), json.RawMessage(`{}`)}} {
		if _, err = tx.Exec(ctx, `insert into compendium_entries(id,campaign_id,source_id,entry_type,name,summary,rules,translations,is_published,created_by) values($1,$2,$3,$4,$5,'legacy summary',$6,$7,true,$8)`, entry.id, entry.campaign, entry.source, entry.kind, entry.name, entry.rules, entry.translations, owner); err != nil {
			t.Fatal(err)
		}
	}
	if err = tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	defer cleanup()
	repo := NewRepository(pool, owner)
	sourcesA, entriesA, err := repo.List(ctx, campaignA, owner)
	if err != nil {
		t.Fatal(err)
	}
	sourcesB, entriesB, err := repo.List(ctx, campaignB, gmB)
	if err != nil {
		t.Fatal(err)
	}
	sharedA := findEntryByName(entriesA, "spell", "Fireball")
	sharedB := findEntryByName(entriesB, "spell", "Fireball")
	if sharedA.ID == "" || sharedA.ID != sharedB.ID || sharedA.SourceID != sharedB.SourceID {
		t.Fatalf("campaigns did not read the same canonical SRD entry: A=%+v B=%+v", sharedA, sharedB)
	}
	if sharedA.ID == legacyFireballA || sharedB.ID == legacyFireballB {
		t.Fatal("campaign-specific legacy IDs should resolve as aliases, not remain canonical")
	}
	if decodeTranslations(sharedA.Translations)["pt-BR"] != decodeTranslations(sharedB.Translations)["pt-BR"] {
		t.Fatal("canonical Fireball translation differs between campaigns")
	}
	for _, item := range []struct{ kind, name, translation string }{
		{"species", "Dragonborn", "Draconato"},
		{"species", "Dwarf", "Anão"},
		{"background", "Acolyte", "Acólito"},
		{"background", "Farmer", "Fazendeiro"},
	} {
		entryA := findEntryByName(entriesA, item.kind, item.name)
		entryB := findEntryByName(entriesB, item.kind, item.name)
		translationsA, translationsB := decodeTranslations(entryA.Translations), decodeTranslations(entryB.Translations)
		if entryA.ID == "" || entryA.ID != entryB.ID || translationsA["pt-BR"] != item.translation || translationsB["pt-BR"] != item.translation {
			t.Fatalf("campaigns did not receive the same reviewed %s translation for %s: A=%v B=%v", item.kind, item.name, translationsA, translationsB)
		}
		if translationsA["pt-BR.source"] != "reviewed" || translationsB["pt-BR.source"] != "reviewed" {
			t.Fatalf("%s %s translation provenance not preserved: A=%v B=%v", item.kind, item.name, translationsA, translationsB)
		}
	}
	shieldA := findEntryByName(entriesA, "spell", "Shield")
	shieldB := findEntryByName(entriesB, "spell", "Shield")
	if decodeTranslations(shieldA.Translations)["pt-BR"] != "Proteção legada da campanha A" || decodeTranslations(shieldB.Translations)["pt-BR"] == "Proteção legada da campanha A" {
		t.Fatalf("legacy manual translation was not preserved only in its campaign projection: A=%v B=%v", decodeTranslations(shieldA.Translations), decodeTranslations(shieldB.Translations))
	}
	var canonicalShieldTranslations json.RawMessage
	if err = pool.QueryRow(ctx, `select translations from srd_catalog_entries where id=$1`, shieldA.ID).Scan(&canonicalShieldTranslations); err != nil {
		t.Fatal(err)
	}
	if decodeTranslations(canonicalShieldTranslations)["pt-BR"] == "Proteção legada da campanha A" {
		t.Fatal("legacy campaign translation was promoted to the shared catalog")
	}
	if findSourceBySlug(sourcesA, "campaign-private").ID == findSourceBySlug(sourcesB, "campaign-private").ID {
		t.Fatal("private sources are not campaign isolated")
	}
	featA := findEntryByName(entriesA, "feat", "Magic Initiate")
	featB := findEntryByName(entriesB, "feat", "Magic Initiate")
	var featRulesA, featRulesB map[string]any
	_ = json.Unmarshal(featA.Rules, &featRulesA)
	_ = json.Unmarshal(featB.Rules, &featRulesB)
	if featRulesA["campaignOverrides"] == nil || featRulesB["campaignOverrides"] != nil {
		t.Fatalf("campaign override leaked or was lost: A=%v B=%v", featRulesA["campaignOverrides"], featRulesB["campaignOverrides"])
	}
	legacy, err := repo.Entry(ctx, campaignA, legacyFireballA, owner)
	if err != nil || legacy.ID != sharedA.ID {
		t.Fatalf("legacy UUID alias not resolved: item=%+v err=%v", legacy, err)
	}

	if _, err = repo.TranslationFields(ctx, campaignA, sharedA.ID, gmB); !errors.Is(err, ErrForbidden) {
		t.Fatalf("non-member GM translation authorization error=%v", err)
	}
	if _, err = repo.TranslationFields(ctx, campaignA, sharedA.ID, player); !errors.Is(err, ErrForbidden) {
		t.Fatalf("player translation authorization error=%v", err)
	}
	noOwner := NewRepository(pool)
	if _, err = noOwner.TranslationFields(ctx, campaignA, sharedA.ID, owner); !errors.Is(err, ErrForbidden) {
		t.Fatalf("unconfigured owner should be denied, error=%v", err)
	}
	if _, err = repo.TranslationFields(ctx, campaignA, sharedA.ID, gmB); !errors.Is(err, ErrForbidden) {
		t.Fatalf("configured identity cannot be forged by a non-owner, error=%v", err)
	}
	if _, err = repo.SaveAITranslations(ctx, campaignA, sharedA.ID, gmB, map[string]string{"pt-BR": "Fireball"}, map[string]string{"pt-BR": "Bola"}); !errors.Is(err, ErrForbidden) {
		t.Fatalf("non-owner direct persistence error=%v", err)
	}
	if _, err = pool.Exec(ctx, `update srd_catalog_entries set translations=jsonb_set(jsonb_set(translations,'{pt-BR.summary}','"Resumo oficial"'::jsonb,true),'{pt-BR.summary.source}','"official"'::jsonb,true) where id=$1`, sharedA.ID); err != nil {
		t.Fatal(err)
	}
	// Use a test-only canonical entry for the provider-concurrency scenario.
	// Fireball is fully reviewed in the embedded pack and must remain canonical.
	var pendingSharedID string
	if err = pool.QueryRow(ctx, `insert into srd_catalog_entries(source_id,entry_type,name,summary,rules,translations,is_published) values($1,'spell','Integration Pending Spell','Pending fixture summary','{}'::jsonb,jsonb_build_object('pt-BR.summary','Resumo oficial','pt-BR.summary.source','official'),true) returning id::text`, sharedA.SourceID).Scan(&pendingSharedID); err != nil {
		t.Fatal(err)
	}
	started, release := make(chan struct{}), make(chan struct{})
	var providerCalls atomic.Int32
	translate := func(_ context.Context, fields map[string]string) (map[string]string, error) {
		providerCalls.Add(1)
		if fields["pt-BR"] != "Integration Pending Spell" {
			close(started)
			return nil, errors.New("pending canonical name was not sent to the provider")
		}
		close(started)
		<-release
		out := map[string]string{}
		for key, value := range fields {
			out[key] = "PT: " + value
		}
		return out, nil
	}
	first := make(chan error, 1)
	go func() {
		item, callErr := repo.TranslateShared(ctx, campaignA, pendingSharedID, owner, translate)
		if callErr == nil && decodeTranslations(item.Translations)["pt-BR.summary"] != "Resumo oficial" {
			callErr = errors.New("official translation was overwritten")
		}
		first <- callErr
	}()
	select {
	case <-started:
	case <-ctx.Done():
		t.Fatal("shared translation provider was not started")
	}
	second := make(chan error, 1)
	go func() {
		_, callErr := repo.TranslateShared(ctx, campaignB, pendingSharedID, owner, func(context.Context, map[string]string) (map[string]string, error) {
			providerCalls.Add(1)
			return map[string]string{}, nil
		})
		second <- callErr
	}()
	close(release)
	if err = <-first; err != nil {
		t.Fatal(err)
	}
	if err = <-second; err != nil {
		t.Fatal(err)
	}
	if providerCalls.Load() != 1 {
		t.Fatalf("concurrent campaigns called provider %d times; want one", providerCalls.Load())
	}
	_, entriesB, err = repo.List(ctx, campaignB, gmB)
	if err != nil {
		t.Fatal(err)
	}
	translatedB := findEntryByName(entriesB, "spell", "Integration Pending Spell")
	if translatedB.ID != pendingSharedID || decodeTranslations(translatedB.Translations)["pt-BR.summary"] != "Resumo oficial" || decodeTranslations(translatedB.Translations)["pt-BR"] != "PT: Integration Pending Spell" {
		t.Fatalf("campaign B did not see safe shared translation: %#v", decodeTranslations(translatedB.Translations))
	}
	_, err = repo.TranslateShared(ctx, campaignB, pendingSharedID, owner, func(context.Context, map[string]string) (map[string]string, error) {
		providerCalls.Add(1)
		return nil, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if providerCalls.Load() != 1 {
		t.Fatal("completed shared translation was requested again")
	}
	sharedSourceID := sharedA.SourceID

	// Exercise the current creature pack through the same persisted catalog
	// path used when campaigns load the compendium after an application deploy.
	hippogriff := findEntryByName(entriesA, "other", "Hippogriff")
	if hippogriff.ID == "" {
		t.Fatal("Hippogriff is missing from the shared creature catalog")
	}
	var hippogriffPackEntry srdEntry
	pack, err := loadSRDPack()
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range uniqueEntries(pack.Entries) {
		if entry.EntryType == "other" && entry.Name == "Hippogriff" {
			hippogriffPackEntry = entry
			break
		}
	}
	approvedHippogriffTranslations := decodeTranslations(hippogriffPackEntry.Translations)
	approvedHippogriffSummary := approvedHippogriffTranslations["pt-BR.summary"]
	if approvedHippogriffSummary == "" || approvedHippogriffTranslations["pt-BR.summary.source"] != "reviewed" {
		t.Fatalf("Hippogriff summary is not reviewed in the package: %v", approvedHippogriffTranslations)
	}
	var originalHippogriffTranslations json.RawMessage
	if err = pool.QueryRow(ctx, `select translations from srd_catalog_entries where id=$1`, hippogriff.ID).Scan(&originalHippogriffTranslations); err != nil {
		t.Fatal(err)
	}
	defer func() {
		_, _ = pool.Exec(context.Background(), `update srd_catalog_entries set translations=$1 where id=$2`, originalHippogriffTranslations, hippogriff.ID)
	}()
	if _, err = pool.Exec(ctx, `update srd_catalog_entries set translations=jsonb_build_object('pt-BR','Hippogriff IA antigo','pt-BR.source','ai','pt-BR.summary','Resumo antigo de IA','pt-BR.summary.source','ai') where id=$1`, hippogriff.ID); err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, `insert into campaign_srd_entry_overrides(campaign_id,catalog_entry_id,translations,updated_by) values($1,$2,$3,$5),($4,$2,$6,$5) on conflict(campaign_id,catalog_entry_id) do update set translations=excluded.translations`, campaignA, hippogriff.ID, json.RawMessage(`{"pt-BR.summary":"Resumo IA antigo","pt-BR.summary.source":"ai"}`), campaignB, owner, json.RawMessage(`{"pt-BR.summary":"Resumo manual da campanha B","pt-BR.summary.source":"manual"}`)); err != nil {
		t.Fatal(err)
	}
	_, creatureEntriesA, err := repo.List(ctx, campaignA, owner)
	if err != nil {
		t.Fatal(err)
	}
	_, creatureEntriesB, err := repo.List(ctx, campaignB, gmB)
	if err != nil {
		t.Fatal(err)
	}
	if got := decodeTranslations(findEntryByName(creatureEntriesA, "other", "Hippogriff").Translations)["pt-BR.summary"]; got != approvedHippogriffSummary {
		t.Fatalf("AI campaign override hid reviewed Hippogriff summary: got %q, want %q", got, approvedHippogriffSummary)
	}
	if got := decodeTranslations(findEntryByName(creatureEntriesB, "other", "Hippogriff").Translations)["pt-BR.summary"]; got != "Resumo manual da campanha B" {
		t.Fatalf("protected campaign override was not preserved: got %q", got)
	}
	var persistedHippogriff json.RawMessage
	if err = pool.QueryRow(ctx, `select translations from srd_catalog_entries where id=$1`, hippogriff.ID).Scan(&persistedHippogriff); err != nil {
		t.Fatal(err)
	}
	if translations := decodeTranslations(persistedHippogriff); translations["pt-BR.summary"] != approvedHippogriffSummary || translations["pt-BR.summary.source"] != "reviewed" {
		t.Fatalf("reviewed Hippogriff summary was not persisted canonically: %v", translations)
	}
	creatureSyncReport, err := repo.syncReviewedTranslations(ctx, sharedSourceID, []srdEntry{hippogriffPackEntry})
	if err != nil {
		t.Fatal(err)
	}
	if len(creatureSyncReport.Updated) != 0 || len(creatureSyncReport.Unresolved) != 0 {
		t.Fatalf("repeated Hippogriff sync was not idempotent: %+v", creatureSyncReport)
	}
	if _, err = pool.Exec(ctx, `update campaign_srd_entry_overrides set translations=$1 where campaign_id=$2 and catalog_entry_id=$3`, json.RawMessage(`{"pt-BR.summary":"Resumo antigo sem origem"}`), campaignA, hippogriff.ID); err != nil {
		t.Fatal(err)
	}
	_, creatureEntriesA, err = repo.List(ctx, campaignA, owner)
	if err != nil {
		t.Fatal(err)
	}
	if got := decodeTranslations(findEntryByName(creatureEntriesA, "other", "Hippogriff").Translations)["pt-BR.summary"]; got != approvedHippogriffSummary {
		t.Fatalf("unmarked campaign override hid reviewed Hippogriff summary: got %q, want %q", got, approvedHippogriffSummary)
	}

	// A package revision must refresh only the audited creature fields in an
	// already-populated canonical catalog, preserving its other mechanics.
	adultBlackDragon := findEntryByName(entriesA, "other", "Adult Black Dragon")
	if adultBlackDragon.ID == "" {
		t.Fatal("Adult Black Dragon is missing from the shared creature catalog")
	}
	var adultBlackDragonPackEntry srdEntry
	for _, entry := range uniqueEntries(pack.Entries) {
		if entry.EntryType == "other" && entry.Name == "Adult Black Dragon" {
			adultBlackDragonPackEntry = entry
			break
		}
	}
	if adultBlackDragonPackEntry.Name == "" {
		t.Fatal("Adult Black Dragon is missing from the embedded creature pack")
	}
	var originalDragonRules json.RawMessage
	var originalDragonCatalogRevision string
	if err = pool.QueryRow(ctx, `select rules from srd_catalog_entries where id=$1`, adultBlackDragon.ID).Scan(&originalDragonRules); err != nil {
		t.Fatal(err)
	}
	if err = pool.QueryRow(ctx, `select revision from srd_catalog_sources where id=$1`, sharedSourceID).Scan(&originalDragonCatalogRevision); err != nil {
		t.Fatal(err)
	}
	defer func() {
		_, _ = pool.Exec(context.Background(), `update srd_catalog_entries set rules=$1 where id=$2`, originalDragonRules, adultBlackDragon.ID)
		_, _ = pool.Exec(context.Background(), `update srd_catalog_sources set revision=$1 where id=$2`, originalDragonCatalogRevision, sharedSourceID)
	}()
	var staleDragonRules map[string]any
	if err = json.Unmarshal(originalDragonRules, &staleDragonRules); err != nil {
		t.Fatal(err)
	}
	staleDragonRules["actions"] = []map[string]any{{"name": "Stale action"}}
	staleDragonRules["senses"] = "Stale senses"
	staleDragonRules["languages"] = "Stale languages"
	staleDragonRules["speed"] = "Stale speed"
	staleDragonRules["releaseTestMarker"] = "preserve"
	staleRulesJSON, err := json.Marshal(staleDragonRules)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, `update srd_catalog_entries set rules=$1 where id=$2`, staleRulesJSON, adultBlackDragon.ID); err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, `update srd_catalog_sources set revision='cartridge-import-6' where id=$1`, sharedSourceID); err != nil {
		t.Fatal(err)
	}
	_, refreshedCreatureEntries, err := repo.List(ctx, campaignA, owner)
	if err != nil {
		t.Fatal(err)
	}
	refreshedDragon := findEntryByName(refreshedCreatureEntries, "other", "Adult Black Dragon")
	var refreshedDragonRules, expectedDragonRules map[string]any
	if err = json.Unmarshal(refreshedDragon.Rules, &refreshedDragonRules); err != nil {
		t.Fatal(err)
	}
	if err = json.Unmarshal(adultBlackDragonPackEntry.Rules, &expectedDragonRules); err != nil {
		t.Fatal(err)
	}
	for _, field := range []string{"actions", "senses", "languages", "speed"} {
		if !reflect.DeepEqual(refreshedDragonRules[field], expectedDragonRules[field]) {
			t.Errorf("creature %s did not refresh from revision %s: got=%v want=%v", field, pack.Revision, refreshedDragonRules[field], expectedDragonRules[field])
		}
	}
	if refreshedDragonRules["hpMax"] != staleDragonRules["hpMax"] || refreshedDragonRules["creatureType"] != staleDragonRules["creatureType"] || refreshedDragonRules["releaseTestMarker"] != "preserve" {
		t.Fatalf("creature refresh changed fields outside the audited scope: got=%v", refreshedDragonRules)
	}
	var refreshedRevision string
	if err = pool.QueryRow(ctx, `select revision from srd_catalog_sources where id=$1`, sharedSourceID).Scan(&refreshedRevision); err != nil {
		t.Fatal(err)
	}
	if refreshedRevision != pack.Revision {
		t.Fatalf("catalog revision = %q, want %q", refreshedRevision, pack.Revision)
	}

	// Exercise the description-only catalog revision against a row that still
	// has the older persisted rules shape, alongside campaign-scoped overrides.
	bagOfHolding := findEntryByName(entriesA, "other", "Bag of Holding")
	if bagOfHolding.ID == "" {
		t.Fatal("Bag of Holding is missing from the shared magic-item catalog")
	}
	var bagPackEntry srdEntry
	for _, entry := range uniqueEntries(pack.Entries) {
		if entry.EntryType == "other" && entry.Name == "Bag of Holding" {
			bagPackEntry = entry
			break
		}
	}
	if bagPackEntry.Name == "" {
		t.Fatal("Bag of Holding is missing from the embedded magic-item pack")
	}
	approvedBagTranslations := decodeTranslations(bagPackEntry.Translations)
	approvedBagDescription := approvedBagTranslations["pt-BR.rules.description"]
	if approvedBagDescription == "" || approvedBagTranslations["pt-BR.rules.description.source"] != "reviewed" {
		t.Fatal("Bag of Holding description is not reviewed in the embedded pack")
	}
	var originalBagRules, originalBagTranslations json.RawMessage
	if err = pool.QueryRow(ctx, `select rules,translations from srd_catalog_entries where id=$1`, bagOfHolding.ID).Scan(&originalBagRules, &originalBagTranslations); err != nil {
		t.Fatal(err)
	}
	var originalCatalogRevision string
	if err = pool.QueryRow(ctx, `select revision from srd_catalog_sources where id=$1`, sharedSourceID).Scan(&originalCatalogRevision); err != nil {
		t.Fatal(err)
	}
	defer func() {
		_, _ = pool.Exec(context.Background(), `update srd_catalog_entries set rules=$1,translations=$2 where id=$3`, originalBagRules, originalBagTranslations, bagOfHolding.ID)
		_, _ = pool.Exec(context.Background(), `update srd_catalog_sources set revision=$1 where id=$2`, originalCatalogRevision, sharedSourceID)
	}()
	if _, err = pool.Exec(ctx, `update srd_catalog_entries set rules='{"catalog":"magic-item","legacyRule":"keep"}'::jsonb,translations='{"pt-BR.rules.description":"Descrição IA anterior","pt-BR.rules.description.source":"ai"}'::jsonb where id=$1`, bagOfHolding.ID); err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, `update srd_catalog_sources set revision='cartridge-import-5' where id=$1`, sharedSourceID); err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, `insert into campaign_srd_entry_overrides(campaign_id,catalog_entry_id,translations,updated_by) values($1,$2,$3,$5),($4,$2,$6,$5) on conflict(campaign_id,catalog_entry_id) do update set translations=excluded.translations`, campaignA, bagOfHolding.ID, json.RawMessage(`{"pt-BR.rules.description":"Descrição IA da campanha A","pt-BR.rules.description.source":"ai"}`), campaignB, owner, json.RawMessage(`{"pt-BR.rules.description":"Descrição manual da campanha B","pt-BR.rules.description.source":"manual"}`)); err != nil {
		t.Fatal(err)
	}
	_, bagEntriesA, err := repo.List(ctx, campaignA, owner)
	if err != nil {
		t.Fatal(err)
	}
	_, bagEntriesB, err := repo.List(ctx, campaignB, gmB)
	if err != nil {
		t.Fatal(err)
	}
	bagA := findEntryByName(bagEntriesA, "other", "Bag of Holding")
	bagB := findEntryByName(bagEntriesB, "other", "Bag of Holding")
	var bagRules, bagSourceRules map[string]any
	if err = json.Unmarshal(bagA.Rules, &bagRules); err != nil {
		t.Fatal(err)
	}
	if err = json.Unmarshal(bagPackEntry.Rules, &bagSourceRules); err != nil {
		t.Fatal(err)
	}
	if bagRules["description"] != bagSourceRules["description"] || bagRules["legacyRule"] != "keep" {
		t.Fatalf("magic-item source description was not additively persisted: rules=%v", bagRules)
	}
	if bagTranslations := decodeTranslations(bagA.Translations); bagTranslations["pt-BR.rules.description"] != approvedBagDescription || bagTranslations["pt-BR.rules.description.source"] != "reviewed" {
		t.Fatalf("canonical reviewed item description was not persisted: %v", bagTranslations)
	}
	if got := decodeTranslations(bagA.Translations)["pt-BR.rules.description"]; got != approvedBagDescription {
		t.Fatalf("campaign A's AI override hid reviewed description: got %q, want %q", got, approvedBagDescription)
	}
	if got := decodeTranslations(bagB.Translations)["pt-BR.rules.description"]; got != "Descrição manual da campanha B" {
		t.Fatalf("campaign B's manual override was not preserved: %q", got)
	}
	bagSyncReport, err := repo.syncReviewedTranslations(ctx, sharedSourceID, []srdEntry{bagPackEntry})
	if err != nil {
		t.Fatal(err)
	}
	if len(bagSyncReport.Updated) != 0 || len(bagSyncReport.Unresolved) != 0 {
		t.Fatalf("repeated magic-item description sync was not idempotent: %+v", bagSyncReport)
	}
	if _, err = pool.Exec(ctx, `update campaign_srd_entry_overrides set translations=$1 where campaign_id=$2 and catalog_entry_id=$3`, json.RawMessage(`{"pt-BR.rules.description":"Descrição sem proveniência"}`), campaignA, bagOfHolding.ID); err != nil {
		t.Fatal(err)
	}
	_, bagEntriesA, err = repo.List(ctx, campaignA, owner)
	if err != nil {
		t.Fatal(err)
	}
	_, bagEntriesB, err = repo.List(ctx, campaignB, gmB)
	if err != nil {
		t.Fatal(err)
	}
	if got := decodeTranslations(findEntryByName(bagEntriesA, "other", "Bag of Holding").Translations)["pt-BR.rules.description"]; got != approvedBagDescription {
		t.Fatalf("unmarked campaign override hid reviewed description: got %q, want %q", got, approvedBagDescription)
	}
	if got := decodeTranslations(findEntryByName(bagEntriesB, "other", "Bag of Holding").Translations)["pt-BR.rules.description"]; got != "Descrição manual da campanha B" {
		t.Fatalf("campaign B manual override changed after campaign A sync: %q", got)
	}

	// Simulate an existing catalog and campaign overrides written by prior AI
	// translation runs, plus protected and unmarked legacy values.
	var originalRevision string
	if err = pool.QueryRow(ctx, `select revision from srd_catalog_sources where id=$1`, sharedSourceID).Scan(&originalRevision); err != nil {
		t.Fatal(err)
	}
	originalTranslations := map[string]json.RawMessage{}
	for _, name := range []string{"Spear", "Lance", "Pike"} {
		var saved json.RawMessage
		if err = pool.QueryRow(ctx, `select translations from srd_catalog_entries where source_id=$1 and entry_type='item' and name=$2`, sharedSourceID, name).Scan(&saved); err != nil {
			t.Fatal(err)
		}
		originalTranslations[name] = saved
	}
	defer func() {
		for name, translations := range originalTranslations {
			_, _ = pool.Exec(context.Background(), `update srd_catalog_entries set translations=$1 where source_id=$2 and entry_type='item' and name=$3`, translations, sharedSourceID, name)
		}
		_, _ = pool.Exec(context.Background(), `update srd_catalog_sources set revision=$1 where id=$2`, originalRevision, sharedSourceID)
	}()

	for _, name := range []string{"Spear", "Lance", "Pike"} {
		if _, err = pool.Exec(ctx, `update srd_catalog_entries set translations=jsonb_build_object('pt-BR',$1::text,'pt-BR.source','ai') where source_id=$2 and entry_type='item' and name=$3`, "tradução IA antiga de "+name, sharedSourceID, name); err != nil {
			t.Fatal(err)
		}
	}
	if _, err = pool.Exec(ctx, `update srd_catalog_entries set translations=jsonb_build_object('pt-BR','Tradução antiga sem marcador') where source_id=$1 and entry_type='item' and name='Lance'`, sharedSourceID); err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, `update srd_catalog_entries set translations=translations || jsonb_build_object('pt-BR.summary','Resumo IA não revisado','pt-BR.summary.source','ai') where source_id=$1 and entry_type='item' and name='Spear'`, sharedSourceID); err != nil {
		t.Fatal(err)
	}
	spear := findEntryByName(entriesA, "item", "Spear")
	if _, err = pool.Exec(ctx, `insert into campaign_srd_entry_overrides(campaign_id,catalog_entry_id,translations,updated_by) values($1,$2,$3,$4),($5,$2,$6,$4) on conflict(campaign_id,catalog_entry_id) do update set translations=excluded.translations`, campaignA, spear.ID, json.RawMessage(`{"pt-BR":"Lança IA antiga A","pt-BR.source":"ai"}`), owner, campaignB, json.RawMessage(`{"pt-BR":"Lança manual B","pt-BR.source":"manual"}`)); err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, `update srd_catalog_sources set revision='cartridge-import-1' where id=$1`, sharedSourceID); err != nil {
		t.Fatal(err)
	}
	_, syncedA, err := repo.List(ctx, campaignA, owner)
	if err != nil {
		t.Fatal(err)
	}
	_, syncedB, err := repo.List(ctx, campaignB, gmB)
	if err != nil {
		t.Fatal(err)
	}
	if got := decodeTranslations(findEntryByName(syncedA, "item", "Spear").Translations)["pt-BR"]; got != "Lança" {
		t.Fatalf("AI canonical/campaign translation was not replaced: %q", got)
	}
	if got := decodeTranslations(findEntryByName(syncedB, "item", "Spear").Translations)["pt-BR"]; got != "Lança manual B" {
		t.Fatalf("campaign B manual translation was not preserved: %q", got)
	}
	for _, name := range []string{"Lance", "Pike"} {
		gotA := decodeTranslations(findEntryByName(syncedA, "item", name).Translations)["pt-BR"]
		gotB := decodeTranslations(findEntryByName(syncedB, "item", name).Translations)["pt-BR"]
		want := map[string]string{"Lance": "Lança de cavalaria", "Pike": "Pique"}[name]
		if gotA != want || gotB != want {
			t.Errorf("campaigns do not share corrected %s translation: A=%q B=%q want=%q", name, gotA, gotB, want)
		}
	}
	var syncedSpear json.RawMessage
	if err = pool.QueryRow(ctx, `select translations from srd_catalog_entries where id=$1`, spear.ID).Scan(&syncedSpear); err != nil {
		t.Fatal(err)
	}
	if got := decodeTranslations(syncedSpear)["pt-BR.source"]; got != "reviewed" {
		t.Fatalf("canonical provenance = %q, want reviewed", got)
	}
	if translations := decodeTranslations(syncedSpear); translations["pt-BR.summary"] != "Arma simples de combate corpo a corpo." || translations["pt-BR.summary.source"] != "reviewed" {
		t.Fatalf("approved item summary was not synchronized: %v", translations)
	}

	// Explicitly protected canonical values remain untouched by another sync.
	if _, err = pool.Exec(ctx, `update srd_catalog_entries set translations=jsonb_build_object('pt-BR','Lança oficial','pt-BR.source','official') where source_id=$1 and entry_type='item' and name='Lance'`, sharedSourceID); err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, `update srd_catalog_entries set translations=jsonb_build_object('pt-BR','Pique legado de origem externa','pt-BR.source','external') where source_id=$1 and entry_type='item' and name='Pike'`, sharedSourceID); err != nil {
		t.Fatal(err)
	}
	syncReport, err := repo.syncReviewedTranslations(ctx, sharedSourceID, uniqueEntries(pack.Entries))
	if err != nil {
		t.Fatal(err)
	}
	if len(syncReport.Unresolved) != 1 || syncReport.Unresolved[0] != "item:Pike pt-BR" {
		t.Fatalf("unknown canonical provenance report = %v, want [item:Pike pt-BR]", syncReport.Unresolved)
	}
	var lanceTranslations, pikeTranslations json.RawMessage
	if err = pool.QueryRow(ctx, `select translations from srd_catalog_entries where source_id=$1 and entry_type='item' and name='Lance'`, sharedSourceID).Scan(&lanceTranslations); err != nil {
		t.Fatal(err)
	}
	if err = pool.QueryRow(ctx, `select translations from srd_catalog_entries where source_id=$1 and entry_type='item' and name='Pike'`, sharedSourceID).Scan(&pikeTranslations); err != nil {
		t.Fatal(err)
	}
	if decodeTranslations(lanceTranslations)["pt-BR"] != "Lança oficial" || decodeTranslations(pikeTranslations)["pt-BR"] != "Pique legado de origem externa" {
		t.Fatal("protected or unmarked canonical translation was overwritten")
	}
	secondReport, err := repo.syncReviewedTranslations(ctx, sharedSourceID, uniqueEntries(pack.Entries))
	if err != nil {
		t.Fatal(err)
	}
	if len(secondReport.Updated) != 0 || len(secondReport.Unresolved) != 1 {
		t.Fatalf("repeated sync was not idempotent: %+v", secondReport)
	}

	// An unmarked campaign override is treated as legacy AI for the approved
	// field: it remains stored but cannot conceal the reviewed canonical value.
	if _, err = pool.Exec(ctx, `update campaign_srd_entry_overrides set translations=$1 where campaign_id=$2 and catalog_entry_id=$3`, json.RawMessage(`{"pt-BR":"Rótulo sem proveniência"}`), campaignA, spear.ID); err != nil {
		t.Fatal(err)
	}
	unresolvedOverrides, err := repo.auditCampaignTranslationOverrides(ctx, campaignA, sharedSourceID, uniqueEntries(pack.Entries))
	if err != nil {
		t.Fatal(err)
	}
	if len(unresolvedOverrides) != 0 {
		t.Fatalf("unmarked campaign override was incorrectly reported as unknown: %v", unresolvedOverrides)
	}
	_, auditedEntries, err := repo.List(ctx, campaignA, owner)
	if err != nil {
		t.Fatal(err)
	}
	if got := decodeTranslations(findEntryByName(auditedEntries, "item", "Spear").Translations)["pt-BR"]; got != "Lança" {
		t.Fatalf("unmarked campaign override hid canonical translation: %q", got)
	}
	var retainedOverride json.RawMessage
	if err = pool.QueryRow(ctx, `select translations from campaign_srd_entry_overrides where campaign_id=$1 and catalog_entry_id=$2`, campaignA, spear.ID).Scan(&retainedOverride); err != nil {
		t.Fatal(err)
	}
	if decodeTranslations(retainedOverride)["pt-BR"] != "Rótulo sem proveniência" {
		t.Fatal("unknown campaign override was silently deleted")
	}
	if _, err = pool.Exec(ctx, `update campaign_srd_entry_overrides set translations=$1 where campaign_id=$2 and catalog_entry_id=$3`, json.RawMessage(`{"pt-BR":"Rótulo de origem desconhecida","pt-BR.source":"external"}`), campaignA, spear.ID); err != nil {
		t.Fatal(err)
	}
	unresolvedOverrides, err = repo.auditCampaignTranslationOverrides(ctx, campaignA, sharedSourceID, uniqueEntries(pack.Entries))
	if err != nil {
		t.Fatal(err)
	}
	if len(unresolvedOverrides) != 1 || unresolvedOverrides[0] != "item:Spear pt-BR" {
		t.Fatalf("explicit unknown source audit = %v, want [item:Spear pt-BR]", unresolvedOverrides)
	}
}

func findEntryByName(entries []Entry, kind, name string) Entry {
	for _, entry := range entries {
		if entry.EntryType == kind && entry.Name == name {
			return entry
		}
	}
	return Entry{}
}
func findSourceBySlug(sources []Source, slug string) Source {
	for _, source := range sources {
		if source.Slug == slug {
			return source
		}
	}
	return Source{}
}
