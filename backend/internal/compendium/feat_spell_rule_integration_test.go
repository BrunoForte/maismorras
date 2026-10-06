package compendium

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func TestCampaignFeatSpellRuleIsGMOnlyAndScopedToCampaignIntegration(t *testing.T) {
	databaseURL := os.Getenv("REALTIME_TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("REALTIME_TEST_DATABASE_URL is not configured")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()

	campaignA, campaignB := compendiumTestUUID(t), compendiumTestUUID(t)
	gmA, gmB, player := compendiumTestUUID(t), compendiumTestUUID(t), compendiumTestUUID(t)
	sourceA, sourceB := compendiumTestUUID(t), compendiumTestUUID(t)
	featA, featB := compendiumTestUUID(t), compendiumTestUUID(t)
	spellA, spellB := compendiumTestUUID(t), compendiumTestUUID(t)
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = tx.Rollback(context.Background()) }()
	if _, err := tx.Exec(ctx, `set local session_replication_role=replica`); err != nil {
		t.Skipf("database role cannot create isolated campaign fixtures: %v", err)
	}
	for _, user := range []struct{ id, name string }{{gmA, "feat-rule GM A"}, {gmB, "feat-rule GM B"}, {player, "feat-rule player"}} {
		if _, err := tx.Exec(ctx, `insert into profiles(id,display_name) values($1,$2)`, user.id, user.name); err != nil {
			t.Fatal(err)
		}
	}
	for _, campaign := range []struct{ id, owner string }{{campaignA, gmA}, {campaignB, gmB}} {
		if _, err := tx.Exec(ctx, `insert into campaigns(id,name,owner_id,system_id) values($1,'Feat spell rule integration',$2,'dnd2024')`, campaign.id, campaign.owner); err != nil {
			t.Fatal(err)
		}
		if _, err := tx.Exec(ctx, `insert into campaign_members(campaign_id,user_id,role) values($1,$2,'gm')`, campaign.id, campaign.owner); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := tx.Exec(ctx, `insert into campaign_members(campaign_id,user_id,role) values($1,$2,'player')`, campaignA, player); err != nil {
		t.Fatal(err)
	}
	for _, source := range []struct{ id, campaign, slug string }{{sourceA, campaignA, "feat-rule-a"}, {sourceB, campaignB, "feat-rule-b"}} {
		if _, err := tx.Exec(ctx, `insert into compendium_sources(id,campaign_id,slug,title,kind) values($1,$2,$3,'Feat spell test','srd')`, source.id, source.campaign, source.slug); err != nil {
			t.Fatal(err)
		}
	}
	featRules := json.RawMessage(`{"id":"magic-initiate","description":"Original feat text"}`)
	translations := json.RawMessage(`{"pt-BR":"Texto oficial","pt-BR.source":"official"}`)
	for _, row := range []struct {
		id, campaign, source, name, kind string
		rules, translations              json.RawMessage
	}{
		{featA, campaignA, sourceA, "Magic Initiate", "feat", featRules, translations},
		{featB, campaignB, sourceB, "Magic Initiate", "feat", featRules, translations},
		{spellA, campaignA, sourceA, "Shield", "spell", json.RawMessage(`{"level":1}`), json.RawMessage(`{}`)},
		{spellB, campaignB, sourceB, "Shield", "spell", json.RawMessage(`{"level":1}`), json.RawMessage(`{}`)},
	} {
		if _, err := tx.Exec(ctx, `insert into compendium_entries(id,campaign_id,source_id,entry_type,name,summary,rules,translations,is_published,created_by) values($1,$2,$3,$4,$5,'Original summary',$6,$7,true,$8)`, row.id, row.campaign, row.source, row.kind, row.name, row.rules, row.translations, map[string]string{campaignA: gmA, campaignB: gmB}[row.campaign]); err != nil {
			t.Fatal(err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	defer func() {
		_, _ = pool.Exec(context.Background(), `delete from campaigns where id in ($1,$2)`, campaignA, campaignB)
		_, _ = pool.Exec(context.Background(), `delete from profiles where id in ($1,$2,$3)`, gmA, gmB, player)
	}()

	repo := NewRepository(pool)
	rule := CampaignFeatSpellRule{Enabled: true, Spells: []CampaignFeatSpellDefinition{{
		SpellEntryID: spellA, FreeUses: 1, Recovery: "long", AbilityOptions: []string{"intelligence", "wisdom"},
	}}}
	updated, err := repo.SetCampaignFeatSpellRule(ctx, campaignA, gmA, featA, rule)
	if err != nil {
		t.Fatalf("GM configures campaign feat: %v", err)
	}
	if updated.Name != "Magic Initiate" {
		t.Fatalf("campaign rule overwrote feat content or translations: %+v", updated)
	}
	var savedRules, savedTranslations []byte
	if err := pool.QueryRow(ctx, `select rules,translations from compendium_entries where id=$1`, featA).Scan(&savedRules, &savedTranslations); err != nil {
		t.Fatal(err)
	}
	var saved map[string]any
	if err := json.Unmarshal(savedRules, &saved); err != nil {
		t.Fatal(err)
	}
	var savedTranslationMap map[string]string
	if err := json.Unmarshal(savedTranslations, &savedTranslationMap); err != nil {
		t.Fatal(err)
	}
	if saved["description"] != "Original feat text" || saved["campaignOverrides"].(map[string]any)["featSpellGrant"] == nil || savedTranslationMap["pt-BR"] != "Texto oficial" || savedTranslationMap["pt-BR.source"] != "official" {
		t.Fatalf("override did not preserve canonical content: %s / %s", savedRules, savedTranslations)
	}
	if _, err := repo.SetCampaignFeatSpellRule(ctx, campaignA, player, featA, rule); !errors.Is(err, ErrForbidden) {
		t.Fatalf("player rule edit error=%v, want forbidden", err)
	}
	if _, err := repo.SetCampaignFeatSpellRule(ctx, campaignB, gmB, featB, rule); !errors.Is(err, ErrInvalidFeatSpellRule) {
		t.Fatalf("cross-campaign spell reference error=%v, want invalid rule", err)
	}
	var rulesB []byte
	if err := pool.QueryRow(ctx, `select rules from compendium_entries where id=$1`, featB).Scan(&rulesB); err != nil {
		t.Fatal(err)
	}
	var campaignBRules map[string]any
	if err := json.Unmarshal(rulesB, &campaignBRules); err != nil {
		t.Fatal(err)
	}
	if campaignBRules["campaignOverrides"] != nil || campaignBRules["description"] != "Original feat text" {
		t.Fatalf("other campaign feat changed: %s", rulesB)
	}
}
