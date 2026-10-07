package compendium

import (
	"encoding/json"
	"testing"
)

func TestSRDPackHasCompleteSpellIndex(t *testing.T) {
	pack, err := loadSRDPack()
	if err != nil {
		t.Fatalf("loadSRDPack() error = %v", err)
	}
	if pack.Version != "5.2.1" || pack.Revision == "" || pack.Attribution == "" {
		t.Fatalf("SRD attribution/version missing: %#v", pack)
	}
	spells := 0
	foundWish := false
	foundFireBolt := false
	for _, entry := range pack.Entries {
		if entry.EntryType != "spell" {
			continue
		}
		spells++
		foundWish = foundWish || entry.Name == "Wish"
		foundFireBolt = foundFireBolt || entry.Name == "Fire Bolt"
	}
	if spells != 338 || !foundWish || !foundFireBolt {
		t.Fatalf("unexpected spell index: spells=%d wish=%t fireBolt=%t", spells, foundWish, foundFireBolt)
	}
}

func TestSRDPackIncludesPlayerFacingCatalog(t *testing.T) {
	pack, err := loadSRDPack()
	if err != nil {
		t.Fatal(err)
	}
	got := map[string]bool{}
	for _, entry := range pack.Entries {
		got[entry.EntryType+":"+entry.Name] = true
	}
	for _, key := range []string{
		"class:Wizard", "subclass:Evoker", "background:Acolyte", "species:Dragonborn",
		"feat:Alert", "item:Longsword", "item:Plate Armor", "item:Thieves' Tools",
	} {
		if !got[key] {
			t.Errorf("missing SRD entry %q", key)
		}
	}
}

func TestSRDWeaponTranslationsAreReviewedAndDistinct(t *testing.T) {
	pack, err := loadSRDPack()
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]string{"Spear": "Lança", "Lance": "Lança de cavalaria", "Pike": "Pique"}
	for _, entry := range pack.Entries {
		if entry.EntryType != "item" || want[entry.Name] == "" {
			continue
		}
		translations := decodeTranslations(entry.Translations)
		if translations["pt-BR"] != want[entry.Name] || translations["pt-BR.source"] != "reviewed" {
			t.Errorf("%s translation = %q (%q), want %q marked reviewed", entry.Name, translations["pt-BR"], translations["pt-BR.source"], want[entry.Name])
		}
		delete(want, entry.Name)
	}
	if len(want) > 0 {
		t.Errorf("missing weapon translations: %v", want)
	}
}

func TestSRDItemTranslationBatchIsCompleteAndReviewed(t *testing.T) {
	pack, err := loadSRDPack()
	if err != nil {
		t.Fatal(err)
	}
	items := 0
	for _, entry := range pack.Entries {
		if entry.EntryType != "item" || decodeTranslations(entry.Translations)["pt-BR.source"] != "reviewed" {
			continue
		}
		items++
		translations := decodeTranslations(entry.Translations)
		if translations["pt-BR"] == "" || translations["pt-BR.source"] != "reviewed" {
			t.Errorf("%s name translation is missing or not reviewed: %v", entry.Name, translations)
		}
		if entry.Rules != nil && string(entry.Rules) != "null" {
			var rules map[string]any
			if err := json.Unmarshal(entry.Rules, &rules); err != nil {
				t.Fatalf("decode %s rules: %v", entry.Name, err)
			}
			if _, ok := rules["name"]; ok && (translations["pt-BR.rules.name"] != translations["pt-BR"] || translations["pt-BR.rules.name.source"] != "reviewed") {
				t.Errorf("%s rules.name localization is missing or not reviewed", entry.Name)
			}
			if _, ok := rules["description"]; ok && (translations["pt-BR.rules.description"] == "" || translations["pt-BR.rules.description.source"] != "reviewed") {
				t.Errorf("%s rules.description localization is missing or not reviewed", entry.Name)
			}
		}
		if translations["pt-BR.summary"] == "" || translations["pt-BR.summary.source"] != "reviewed" {
			t.Errorf("%s summary localization is missing or not reviewed", entry.Name)
		}
	}
	if items != 95 {
		t.Fatalf("translated item count = %d, want 95", items)
	}
}

func TestApplyReviewedTranslationProvenance(t *testing.T) {
	entry := srdEntry{
		EntryType:    "item",
		Name:         "Spear",
		Translations: json.RawMessage(`{"pt-BR":"Lança","pt-BR.source":"reviewed"}`),
	}
	t.Run("replaces AI and is idempotent", func(t *testing.T) {
		current := map[string]string{"pt-BR": "Lança gerada", "pt-BR.source": "ai"}
		changed, updated, unresolved := applyReviewedTranslation(current, entry)
		if !changed || current["pt-BR"] != "Lança" || current["pt-BR.source"] != "reviewed" || len(updated) != 1 || len(unresolved) != 0 {
			t.Fatalf("sync result: changed=%t current=%v updated=%v unresolved=%v", changed, current, updated, unresolved)
		}
		changed, _, _ = applyReviewedTranslation(current, entry)
		if changed {
			t.Fatal("second sync changed the already reviewed translation")
		}
	})
	t.Run("replaces non-empty value without provenance", func(t *testing.T) {
		current := map[string]string{"pt-BR": "Lança antiga"}
		changed, updated, unresolved := applyReviewedTranslation(current, entry)
		if !changed || current["pt-BR"] != "Lança" || current["pt-BR.source"] != "reviewed" || len(updated) != 1 || len(unresolved) != 0 {
			t.Fatalf("unmarked legacy translation handling: changed=%t current=%v updated=%v unresolved=%v", changed, current, updated, unresolved)
		}
	})
	for _, source := range []string{"official", "manual", "human", "user", "reviewed"} {
		t.Run("preserves "+source, func(t *testing.T) {
			current := map[string]string{"pt-BR": "Valor protegido", "pt-BR.source": source}
			changed, _, _ := applyReviewedTranslation(current, entry)
			if changed || current["pt-BR"] != "Valor protegido" || current["pt-BR.source"] != source {
				t.Fatalf("protected translation was changed: %v", current)
			}
		})
	}
	t.Run("preserves and reports unknown provenance", func(t *testing.T) {
		current := map[string]string{"pt-BR": "Valor de origem desconhecida", "pt-BR.source": "external"}
		changed, _, unresolved := applyReviewedTranslation(current, entry)
		if changed || current["pt-BR"] != "Valor de origem desconhecida" || len(unresolved) != 1 || unresolved[0] != "item:Spear pt-BR" {
			t.Fatalf("unknown provenance handling: changed=%t current=%v unresolved=%v", changed, current, unresolved)
		}
	})
	t.Run("does not touch unreviewed package fields", func(t *testing.T) {
		unreviewed := srdEntry{
			EntryType:    "item",
			Name:         "Spear",
			Translations: json.RawMessage(`{"pt-BR":"Lança"}`),
		}
		current := map[string]string{"pt-BR": "Gerada", "pt-BR.source": "ai"}
		changed, updated, unresolved := applyReviewedTranslation(current, unreviewed)
		if changed || len(updated) != 0 || len(unresolved) != 0 || current["pt-BR"] != "Gerada" || current["pt-BR.source"] != "ai" {
			t.Fatalf("unreviewed field was changed or audited: changed=%t current=%v updated=%v unresolved=%v", changed, current, updated, unresolved)
		}
	})
}

func TestReviewedCanonicalTranslationOverridesOnlyUnprotectedCampaignValues(t *testing.T) {
	canonical := map[string]string{"pt-BR": "Lança", "pt-BR.source": "reviewed"}
	for _, tc := range []struct {
		name, value, source, want string
	}{
		{name: "AI", value: "Lança antiga", source: "ai", want: "Lança"},
		{name: "unknown", value: "Sem proveniência", want: "Lança"},
		{name: "manual", value: "Lança da campanha", source: "manual", want: "Lança da campanha"},
		{name: "official", value: "Lança oficial", source: "official", want: "Lança oficial"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			scoped := map[string]string{"pt-BR": tc.value}
			if tc.source != "" {
				scoped["pt-BR.source"] = tc.source
			}
			merged := decodeTranslations(mergeCampaignTranslations(mustJSON(t, canonical), mustJSON(t, scoped)))
			if merged["pt-BR"] != tc.want {
				t.Fatalf("merged translation = %q, want %q", merged["pt-BR"], tc.want)
			}
			if tc.source == "manual" || tc.source == "official" {
				if merged["pt-BR.source"] != tc.source {
					t.Fatalf("protected provenance = %q, want %q", merged["pt-BR.source"], tc.source)
				}
			} else if merged["pt-BR.source"] != "reviewed" {
				t.Fatalf("canonical provenance = %q, want reviewed", merged["pt-BR.source"])
			}
		})
	}
}

func mustJSON(t *testing.T, value any) json.RawMessage {
	t.Helper()
	data, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	return data
}

func TestSRDPackIndexesOpenSRDMonstersAndMagicItems(t *testing.T) {
	pack, err := loadSRDPack()
	if err != nil {
		t.Fatal(err)
	}
	monsters, magicItems := 0, 0
	usableMonsters, monstersWithActions := 0, 0
	for _, entry := range pack.Entries {
		if entry.EntryType != "other" {
			continue
		}
		var rules struct {
			Catalog string `json:"catalog"`
		}
		if err := json.Unmarshal(entry.Rules, &rules); err != nil {
			t.Fatal(err)
		}
		switch rules.Catalog {
		case "monster":
			monsters++
			var stats struct {
				HPMax      int `json:"hpMax"`
				ArmorClass int `json:"armorClass"`
				Initiative int `json:"initiative"`
				Actions    []struct {
					Name  string `json:"name"`
					ToHit int    `json:"toHit"`
				} `json:"actions"`
			}
			if err := json.Unmarshal(entry.Rules, &stats); err != nil {
				t.Fatal(err)
			}
			if stats.HPMax > 0 && stats.ArmorClass >= 0 {
				usableMonsters++
			}
			if len(stats.Actions) > 0 && stats.Actions[0].Name != "" {
				monstersWithActions++
			}
		case "magic-item":
			magicItems++
		}
	}
	if monsters != 330 || usableMonsters != monsters || monstersWithActions < 290 || magicItems != 248 {
		t.Fatalf("unexpected SRD index: monsters=%d usable=%d withActions=%d magicItems=%d", monsters, usableMonsters, monstersWithActions, magicItems)
	}
}
