package compendium

import (
	"context"
	"encoding/json"
	"errors"
	"os"
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
	fields, err := repo.TranslationFields(ctx, campaignA, sharedA.ID, owner)
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := fields["pt-BR.summary"]; ok {
		t.Fatal("official translation appeared as pending")
	}
	started, release := make(chan struct{}), make(chan struct{})
	var providerCalls atomic.Int32
	translate := func(_ context.Context, fields map[string]string) (map[string]string, error) {
		providerCalls.Add(1)
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
		item, callErr := repo.TranslateShared(ctx, campaignA, sharedA.ID, owner, translate)
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
		_, callErr := repo.TranslateShared(ctx, campaignB, sharedB.ID, owner, func(context.Context, map[string]string) (map[string]string, error) {
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
	translatedB := findEntryByName(entriesB, "spell", "Fireball")
	if translatedB.ID != sharedA.ID || decodeTranslations(translatedB.Translations)["pt-BR.summary"] != "Resumo oficial" || decodeTranslations(translatedB.Translations)["pt-BR"] != "PT: Fireball" {
		t.Fatalf("campaign B did not see safe shared translation: %#v", decodeTranslations(translatedB.Translations))
	}
	_, err = repo.TranslateShared(ctx, campaignB, sharedB.ID, owner, func(context.Context, map[string]string) (map[string]string, error) {
		providerCalls.Add(1)
		return nil, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if providerCalls.Load() != 1 {
		t.Fatal("completed shared translation was requested again")
	}

	// Simulate an existing catalog and campaign overrides written by prior AI
	// translation runs, plus protected and unmarked legacy values.
	sharedSourceID := sharedA.SourceID
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
	pack, err := loadSRDPack()
	if err != nil {
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
