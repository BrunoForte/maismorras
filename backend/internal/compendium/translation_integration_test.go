package compendium

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func TestTranslationAuthorizationAndConcurrentManualEditsIntegration(t *testing.T) {
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
	ids := []string{compendiumTestUUID(t), compendiumTestUUID(t), compendiumTestUUID(t), compendiumTestUUID(t)}
	campaignID, gmID, playerID, sourceID := ids[0], ids[1], ids[2], ids[3]
	entryID := compendiumTestUUID(t)
	cleanup := func() {
		_, _ = pool.Exec(context.Background(), `delete from campaigns where id=$1`, campaignID)
		_, _ = pool.Exec(context.Background(), `delete from profiles where id in ($1,$2)`, gmID, playerID)
	}
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = tx.Rollback(context.Background()) }()
	if _, err := tx.Exec(ctx, `set local session_replication_role=replica`); err != nil {
		t.Skipf("database role cannot create isolated profiles: %v", err)
	}
	for _, user := range []struct{ id, name string }{{gmID, "Translation test GM"}, {playerID, "Translation test player"}} {
		if _, err := tx.Exec(ctx, `insert into profiles(id,display_name) values($1,$2)`, user.id, user.name); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := tx.Exec(ctx, `insert into campaigns(id,name,owner_id,system_id) values($1,'Translation integration',$2,'dnd2024')`, campaignID, gmID); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `insert into campaign_members(campaign_id,user_id,role) values($1,$2,'gm'),($1,$3,'player')`, campaignID, gmID, playerID); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `insert into compendium_sources(id,campaign_id,slug,title,kind) values($1,$2,'test-source','Translation test','srd')`, sourceID, campaignID); err != nil {
		t.Fatal(err)
	}
	rules := json.RawMessage(`{"id":"fireball","name":"Fireball","description":"A bright streak deals 8d6 fire damage.","damage":"8d6","range":"150 feet","toHit":"+7"}`)
	if _, err := tx.Exec(ctx, `insert into compendium_entries(id,campaign_id,source_id,entry_type,name,summary,rules,translations,is_published,created_by) values($1,$2,$3,'spell','Fireball','A bright streak.', $4, '{}'::jsonb,true,$5)`, entryID, campaignID, sourceID, rules, gmID); err != nil {
		t.Fatal(err)
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	defer cleanup()

	repo := NewRepository(pool)
	fields, err := repo.TranslationFields(ctx, campaignID, entryID, gmID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := repo.TranslationFields(ctx, campaignID, entryID, playerID); !errors.Is(err, ErrForbidden) {
		t.Fatalf("player TranslationFields error=%v, want forbidden", err)
	}
	for _, key := range []string{"pt-BR", "pt-BR.summary", "pt-BR.rules.name", "pt-BR.rules.description"} {
		if _, ok := fields[key]; !ok {
			t.Errorf("GM translation fields missing %s: %#v", key, fields)
		}
	}
	for _, key := range []string{"pt-BR.rules.id", "pt-BR.rules.damage", "pt-BR.rules.range", "pt-BR.rules.toHit"} {
		if _, ok := fields[key]; ok {
			t.Errorf("mechanical field %s should not be sent to translator", key)
		}
	}

	// Simulate an editor saving official/manual translations while the AI request
	// is in flight. The late provider response must preserve both values.
	if _, err := pool.Exec(ctx, `update compendium_entries set translations='{"pt-BR.summary":"Resumo oficial","pt-BR.summary.source":"official","pt-BR.rules.description":"Descrição revisada","pt-BR.rules.description.source":"manual"}'::jsonb where id=$1`, entryID); err != nil {
		t.Fatal(err)
	}
	providerResult := map[string]string{
		"pt-BR":                   "Bola de fogo",
		"pt-BR.summary":           "Resumo gerado",
		"pt-BR.rules.name":        "Bola de fogo",
		"pt-BR.rules.description": "Texto gerado",
		"pt-BR.rules.damage":      "8d6 alterado",
	}
	item, err := repo.SaveAITranslations(ctx, campaignID, entryID, gmID, fields, providerResult)
	if err != nil {
		t.Fatal(err)
	}
	var saved map[string]string
	if err := json.Unmarshal(item.Translations, &saved); err != nil {
		t.Fatal(err)
	}
	if saved["pt-BR.summary"] != "Resumo oficial" || saved["pt-BR.summary.source"] != "official" {
		t.Fatalf("official translation overwritten: %#v", saved)
	}
	if saved["pt-BR.rules.description"] != "Descrição revisada" || saved["pt-BR.rules.description.source"] != "manual" {
		t.Fatalf("manual translation overwritten: %#v", saved)
	}
	if saved["pt-BR"] != "Bola de fogo" || saved["pt-BR.source"] != "ai" || saved["pt-BR.rules.name.source"] != "ai" {
		t.Fatalf("missing AI translations/provenance: %#v", saved)
	}
	if _, ok := saved["pt-BR.rules.damage"]; ok {
		t.Fatal("unapproved mechanical provider field was persisted")
	}

	before := string(item.Translations)
	repeated, err := repo.SaveAITranslations(ctx, campaignID, entryID, gmID, fields, map[string]string{"pt-BR": "Degradação indevida"})
	if err != nil {
		t.Fatal(err)
	}
	if string(repeated.Translations) != before {
		t.Fatalf("repeated request changed saved translation: before=%s after=%s", before, repeated.Translations)
	}
}

func compendiumTestUUID(t *testing.T) string {
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
