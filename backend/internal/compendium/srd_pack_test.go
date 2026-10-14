package compendium

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
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

func TestSRDMagicItemNamesAreReviewedAndOnlyTheirTranslationsChanged(t *testing.T) {
	var pack map[string]any
	if err := json.Unmarshal(srdPackJSON, &pack); err != nil {
		t.Fatal(err)
	}
	entries, ok := pack["entries"].([]any)
	if !ok {
		t.Fatal("SRD entries are not an array")
	}
	targets := make([]map[string]any, 0, 248)
	bySourceName := make(map[string]map[string]any)
	localizedNames := make(map[string]string)
	for _, raw := range entries {
		entry, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		rules, _ := entry["rules"].(map[string]any)
		if entry["entryType"] != "other" || rules["catalog"] != "magic-item" {
			continue
		}
		targets = append(targets, entry)
		name, _ := entry["name"].(string)
		translations, _ := entry["translations"].(map[string]any)
		localized, _ := translations["pt-BR"].(string)
		if strings.TrimSpace(localized) == "" || localized == name || translations["pt-BR.source"] != "reviewed" {
			t.Errorf("%s lacks a distinct reviewed Portuguese name", name)
		}
		if len(translations) != 4 {
			t.Errorf("%s has unexpected localized fields: %#v", name, translations)
		}
		if strings.TrimSpace(fmt.Sprint(translations["pt-BR.rules.description"])) == "" || translations["pt-BR.rules.description.source"] != "reviewed" {
			t.Errorf("%s lacks a reviewed PT-BR rules.description", name)
		}
		if entry["summary"] != "Item mágico do System Reference Document 5.2.1." {
			t.Errorf("%s generic summary changed", name)
		}
		if rules["catalog"] != "magic-item" || len(rules) != 2 || strings.TrimSpace(fmt.Sprint(rules["description"])) == "" {
			t.Errorf("%s has unexpected mechanics or lacks the official English description: %#v", name, rules)
		}
		if previous, exists := localizedNames[localized]; exists {
			t.Errorf("localized name collision %q: %s and %s", localized, previous, name)
		}
		localizedNames[localized] = name
		bySourceName[name] = entry
	}
	if len(targets) != 248 {
		t.Fatalf("magic-item catalog count = %d, want 248", len(targets))
	}
	for _, choice := range []struct{ source, expected string }{
		{"Bag of Holding", "Bolsa de Carga"},
		{"Periapt of Health", "Periapto da Saúde"},
		{"Ammunition of Slaying", "Munição Matadora"},
		{"Mace of Disruption", "Maça da Ruptura"},
		{"Ioun Stone", "Pedra Ioun"},
	} {
		entry := bySourceName[choice.source]
		translations, _ := entry["translations"].(map[string]any)
		if translations["pt-BR"] != choice.expected {
			t.Errorf("%s translation = %v, want %q", choice.source, translations["pt-BR"], choice.expected)
		}
	}

	// These 17 entries also exist in the typed item catalog. Their original
	// records are left untouched, and both representations use the same label.
	typedItems := make(map[string]map[string]any)
	for _, raw := range entries {
		entry, _ := raw.(map[string]any)
		if entry["entryType"] == "item" {
			typedItems[fmt.Sprint(entry["name"])] = entry
		}
	}
	overlaps := 0
	for name, entry := range bySourceName {
		typed, exists := typedItems[name]
		if !exists {
			continue
		}
		overlaps++
		localized, _ := entry["translations"].(map[string]any)
		typedTranslations, _ := typed["translations"].(map[string]any)
		if typedTranslations["pt-BR"] != localized["pt-BR"] {
			t.Errorf("typed item and catalog record disagree for %s", name)
		}
	}
	if overlaps != 17 {
		t.Errorf("typed-item overlaps = %d, want 17", overlaps)
	}
	if armor := bySourceName["Armor of Resistance"]["rules"].(map[string]any); strings.Contains(fmt.Sprint(armor["description"]), "Apparatus of the Crab Levers") {
		t.Error("Apparatus of the Crab lever table leaked into Armor of Resistance")
	}
	if apparatus := bySourceName["Apparatus of the Crab"]["rules"].(map[string]any); !strings.Contains(fmt.Sprint(apparatus["description"]), "Apparatus of the Crab Levers") {
		t.Error("Apparatus of the Crab source description is missing its lever table")
	}
	if spellguard := bySourceName["Spellguard Shield"]["rules"].(map[string]any); strings.Contains(fmt.Sprint(spellguard["description"]), "Spell Scroll") {
		t.Error("generic Spell Scroll text leaked into Spellguard Shield")
	}
	featherText := fmt.Sprint(bySourceName["Feather Token"]["translations"].(map[string]any)["pt-BR.rules.description"])
	for _, required := range []string{"232 km por dia", "descansando 1 hora a cada 3 horas", "água com pelo menos 18 m de diâmetro"} {
		if !strings.Contains(featherText, required) {
			t.Errorf("Feather Token description is missing source detail %q", required)
		}
	}
	deckText := fmt.Sprint(bySourceName["Mysterious Deck"]["translations"].(map[string]any)["pt-BR.rules.description"])
	for _, required := range []string{"1 hora após a anterior", "Avatar da Morte", "intervenção divina", "desejo"} {
		if !strings.Contains(strings.ToLower(deckText), strings.ToLower(required)) {
			t.Errorf("Mysterious Deck description is missing source detail %q", required)
		}
	}

	// Exercise the same field-level policy used by the persisted catalog sync
	// for a real item in this batch: legacy AI and missing provenance update,
	// protected editorial values remain intact, and a second sync is a no-op.
	bag := bySourceName["Bag of Holding"]
	bagTranslations, _ := bag["translations"].(map[string]any)
	bagTitleTranslations := map[string]any{
		"pt-BR":        bagTranslations["pt-BR"],
		"pt-BR.source": bagTranslations["pt-BR.source"],
	}
	bagEntry := srdEntry{
		EntryType:    "other",
		Name:         "Bag of Holding",
		Translations: mustJSON(t, bagTitleTranslations),
	}
	for _, current := range []map[string]string{
		{"pt-BR": "Bolsa gerada anteriormente", "pt-BR.source": "ai"},
		{"pt-BR": "Bolsa antiga sem origem"},
	} {
		changed, updated, unresolved := applyReviewedTranslation(current, bagEntry)
		if !changed || current["pt-BR"] != "Bolsa de Carga" || current["pt-BR.source"] != "reviewed" || len(updated) != 1 || len(unresolved) != 0 {
			t.Errorf("Bag of Holding legacy translation was not safely updated: changed=%t current=%v updated=%v unresolved=%v", changed, current, updated, unresolved)
		}
		changed, updated, unresolved = applyReviewedTranslation(current, bagEntry)
		if changed || len(updated) != 0 || len(unresolved) != 0 {
			t.Errorf("Bag of Holding repeated sync was not idempotent: changed=%t updated=%v unresolved=%v", changed, updated, unresolved)
		}
	}
	protected := map[string]string{"pt-BR": "Bolsa da campanha", "pt-BR.source": "manual"}
	if changed, _, _ := applyReviewedTranslation(protected, bagEntry); changed || protected["pt-BR"] != "Bolsa da campanha" {
		t.Errorf("manual Bag of Holding title was overwritten: %v", protected)
	}

	// Removing this batch's item descriptions and restoring the prior package
	// revision pins the package source snapshot, including the creature-action
	// restorations now reviewed in the current branch.
	for _, entry := range targets {
		translations, _ := entry["translations"].(map[string]any)
		delete(translations, "pt-BR.rules.description")
		delete(translations, "pt-BR.rules.description.source")
		delete(entry["rules"].(map[string]any), "description")
	}
	pack["revision"] = "cartridge-import-5"
	canonical, err := json.Marshal(pack)
	if err != nil {
		t.Fatal(err)
	}
	digest := sha256.Sum256(canonical)
	if got := hex.EncodeToString(digest[:]); got != "bc7b6686b1ea96a24074273ce7e37a1317d04d592e11a19c8edc1d800fe9ceeb" {
		t.Fatalf("SRD package source snapshot changed: digest=%s", got)
	}
}

func TestSRDCreatureCatalogIsLocalizedAndNonTargetMechanicsRemainUnchanged(t *testing.T) {
	type action struct {
		Name        string `json:"name"`
		Damage      string `json:"damage"`
		Range       string `json:"range"`
		Description string `json:"description"`
	}
	type monsterRules struct {
		Catalog      string   `json:"catalog"`
		CreatureType string   `json:"creatureType"`
		Speed        string   `json:"speed"`
		Senses       string   `json:"senses"`
		Languages    string   `json:"languages"`
		Resistances  string   `json:"resistances"`
		Immunities   string   `json:"immunities"`
		Actions      []action `json:"actions"`
	}
	var pack srdPack
	if err := json.Unmarshal(srdPackJSON, &pack); err != nil {
		t.Fatal(err)
	}
	creatures := make([]srdEntry, 0, 330)
	for _, entry := range pack.Entries {
		var header struct {
			Catalog string `json:"catalog"`
		}
		if entry.EntryType != "other" || json.Unmarshal(entry.Rules, &header) != nil || header.Catalog != "monster" {
			continue
		}
		var rules monsterRules
		if err := json.Unmarshal(entry.Rules, &rules); err != nil {
			t.Fatalf("decode rules for %s: %v", entry.Name, err)
		}
		creatures = append(creatures, entry)
	}
	if len(creatures) != 330 {
		t.Fatalf("creature count = %d, want 330", len(creatures))
	}
	sort.Slice(creatures, func(i, j int) bool {
		left, right := strings.ToLower(creatures[i].Name), strings.ToLower(creatures[j].Name)
		if left == right {
			return "other:"+creatures[i].Name < "other:"+creatures[j].Name
		}
		return left < right
	})
	if creatures[164].Name != "Hill Giant" || creatures[165].Name != "Hippogriff" {
		t.Fatalf("unexpected stable split: 165th=%q, 166th=%q", creatures[164].Name, creatures[165].Name)
	}
	pendingActionTargets := pendingCreatureActionTargets(t)
	for index, entry := range creatures {
		var translations map[string]string
		var rules monsterRules
		if err := json.Unmarshal(entry.Translations, &translations); err != nil {
			t.Fatalf("decode translations for %s: %v", entry.Name, err)
		}
		if err := json.Unmarshal(entry.Rules, &rules); err != nil {
			t.Fatalf("decode rules for %s: %v", entry.Name, err)
		}
		for _, key := range []string{"pt-BR", "pt-BR.source", "pt-BR.summary", "pt-BR.summary.source", "pt-BR.rules.creatureType", "pt-BR.rules.creatureType.source"} {
			if strings.TrimSpace(translations[key]) == "" {
				t.Errorf("%s missing reviewed translation %s", entry.Name, key)
			}
		}
		if translations["pt-BR.source"] != "reviewed" || translations["pt-BR.summary.source"] != "reviewed" || translations["pt-BR.rules.creatureType.source"] != "reviewed" {
			t.Errorf("%s translations lack reviewed provenance", entry.Name)
		}
		approvedCreatureTitles := map[string]string{
			"Merfolk Skirmisher": "Tritão Combatente",
			"Phase Spider":       "Aranha de Fase",
			"Sphinx of Lore":     "Esfinge do Saber",
			"Tough":              "Valentão",
		}
		if expected, ok := approvedCreatureTitles[entry.Name]; ok && translations["pt-BR"] != expected {
			t.Errorf("%s localized name = %q, want %q", entry.Name, translations["pt-BR"], expected)
		}
		for _, key := range []string{"speed", "senses", "languages", "resistances", "immunities"} {
			var source string
			switch key {
			case "speed":
				source = rules.Speed
			case "senses":
				source = rules.Senses
			case "languages":
				source = rules.Languages
			case "resistances":
				if index >= 165 {
					source = rules.Resistances
				}
			case "immunities":
				if index >= 165 {
					source = rules.Immunities
				}
			}
			if source != "" && (strings.TrimSpace(translations["pt-BR.rules."+key]) == "" || translations["pt-BR.rules."+key+".source"] != "reviewed") {
				t.Errorf("%s missing reviewed %s translation", entry.Name, key)
			}
		}
		for actionIndex, item := range rules.Actions {
			for _, field := range []struct{ name, source string }{{"name", item.Name}, {"damage", item.Damage}, {"range", item.Range}, {"description", item.Description}} {
				if field.source == "" {
					continue
				}
				key := fmt.Sprintf("pt-BR.rules.actions.%d.%s", actionIndex, field.name)
				if strings.TrimSpace(translations[key]) == "" || (translations[key+".source"] != "reviewed" && !pendingActionTargets[fmt.Sprintf("%s|%d", entry.Name, actionIndex)]) {
					t.Errorf("%s action %d missing reviewed %s translation", entry.Name, actionIndex, field.name)
				}
			}
		}
	}

	// This digest pins every source name, summary, rules object, ID-like field,
	// and non-translation pack metadata, including the creature actions explicitly
	// restored by the source-audit batches.
	var source map[string]any
	if err := json.Unmarshal(srdPackJSON, &source); err != nil {
		t.Fatal(err)
	}
	stripTranslations(source)
	source["revision"] = "cartridge-import-5"
	canonical, err := json.Marshal(source)
	if err != nil {
		t.Fatal(err)
	}
	digest := sha256.Sum256(canonical)
	if got := hex.EncodeToString(digest[:]); got != "8a6cfb3efca916174800c3b3fa0fd1e40164ce40578edf2eac95c69cb085d3ff" {
		t.Fatalf("non-translation SRD pack content changed: digest=%s", got)
	}
}

func TestSRDCreatureTruncatedMetadataRestorationsMatchReviewedSource(t *testing.T) {
	type creatureAction struct {
		Name string `json:"name"`
	}
	type creatureRules struct {
		Actions []creatureAction `json:"actions"`
	}
	type expectedField struct {
		creature string
		field    string
		source   string
		ptBR     string
	}
	want := []expectedField{
		{"Barbed Devil", "senses", "Darkvision 120 ft. (unimpeded by magical Darkness); Passive Perception 18", "Visão no Escuro 120 ft. (não é impedida por Escuridão mágica); Percepção Passiva 18"},
		{"Bearded Devil", "senses", "Darkvision 120 ft. (unimpeded by magical Darkness); Passive Perception 10", "Visão no Escuro 120 ft. (não é impedida por Escuridão mágica); Percepção Passiva 10"},
		{"Bone Devil", "senses", "Darkvision 120 ft. (unimpeded by magical Darkness); Passive Perception 12", "Visão no Escuro 120 ft. (não é impedida por Escuridão mágica); Percepção Passiva 12"},
		{"Chain Devil", "senses", "Darkvision 120 ft. (unimpeded by magical Darkness); Passive Perception 11", "Visão no Escuro 120 ft. (não é impedida por Escuridão mágica); Percepção Passiva 11"},
		{"Horned Devil", "senses", "Darkvision 150 ft. (unimpeded by magical Darkness); Passive Perception 13", "Visão no Escuro 150 ft. (não é impedida por Escuridão mágica); Percepção Passiva 13"},
		{"Imp", "senses", "Darkvision 120 ft. (unimpeded by magical Darkness); Passive Perception 11", "Visão no Escuro 120 ft. (não é impedida por Escuridão mágica); Percepção Passiva 11"},
		{"Lemure", "senses", "Darkvision 120 ft. (unimpeded by magical Darkness); Passive Perception 10", "Visão no Escuro 120 ft. (não é impedida por Escuridão mágica); Percepção Passiva 10"},
		{"Blink Dog", "languages", "Blink Dog; understands Elvish and Sylvan but can’t speak them", "Cão Teleportador; compreende Élfico e Silvestre, mas não pode falar esses idiomas"},
		{"Dretch", "languages", "Abyssal; telepathy 60 ft. (works only with creatures that understand Abyssal)", "Abissal; telepatia 60 ft. (funciona apenas com criaturas que compreendem Abissal)"},
		{"Giant Elk", "languages", "Celestial; understands Common, Elvish, and Sylvan but can’t speak them", "Celestial; compreende Comum, Élfico e Silvestre, mas não pode falar esses idiomas"},
		{"Giant Owl", "languages", "Celestial; understands Common, Elvish, and Sylvan but can’t speak them", "Celestial; compreende Comum, Élfico e Silvestre, mas não pode falar esses idiomas"},
		{"Kraken", "languages", "Understands Abyssal, Celestial, Infernal, and Primordial but can’t speak; telepathy 120 ft.", "Compreende Abissal, Celestial, Infernal e Primordial, mas não pode falar; telepatia 120 ft."},
		{"Ogre Zombie", "languages", "Understands Common and Giant but can’t speak", "Compreende Comum e Gigante, mas não pode falar"},
		{"Otyugh", "languages", "Otyugh; telepathy 120 ft. (doesn’t allow the receiving creature to respond telepathically)", "Otyugh; telepatia 120 ft. (não permite que a criatura receptora responda telepaticamente)"},
		{"Pegasus", "languages", "Understands Celestial, Common, Elvish, and Sylvan but can’t speak", "Compreende Celestial, Comum, Élfico e Silvestre, mas não pode falar"},
		{"Pseudodragon", "languages", "Understands Common and Draconic but can’t speak", "Compreende Comum e Dracônico, mas não pode falar"},
		{"Werebear", "speed", "30 ft., 40 ft. (bear form only), Climb 30 ft. (bear form only)", "30 ft., 40 ft. (somente na forma de urso), Escalada 30 ft. (somente na forma de urso)"},
	}
	var pack srdPack
	if err := json.Unmarshal(srdPackJSON, &pack); err != nil {
		t.Fatal(err)
	}
	byName := make(map[string]srdEntry, len(pack.Entries))
	for _, entry := range pack.Entries {
		if entry.EntryType == "other" {
			byName[entry.Name] = entry
		}
	}
	for _, field := range want {
		entry, ok := byName[field.creature]
		if !ok {
			t.Errorf("missing creature %q", field.creature)
			continue
		}
		var rules map[string]any
		var translations map[string]string
		if err := json.Unmarshal(entry.Rules, &rules); err != nil {
			t.Errorf("decode %s rules: %v", field.creature, err)
			continue
		}
		if err := json.Unmarshal(entry.Translations, &translations); err != nil {
			t.Errorf("decode %s translations: %v", field.creature, err)
			continue
		}
		key := "pt-BR.rules." + field.field
		if rules[field.field] != field.source {
			t.Errorf("%s source %s = %v, want %q", field.creature, field.field, rules[field.field], field.source)
		}
		if translations[key] != field.ptBR || translations[key+".source"] != "reviewed" {
			t.Errorf("%s %s translation/provenance = %q/%q, want %q/reviewed", field.creature, field.field, translations[key], translations[key+".source"], field.ptBR)
		}
	}
	if len(want) != 17 {
		t.Fatalf("metadata restoration fixture count = %d, want 17", len(want))
	}
	for _, check := range []struct {
		creature string
		removed  string
	}{
		{"Basilisk", "Beard"},
		{"Venomous Snake", "Hooves"},
		{"Vulture", "Hooves"},
	} {
		var rules creatureRules
		if err := json.Unmarshal(byName[check.creature].Rules, &rules); err != nil {
			t.Fatalf("decode %s rules: %v", check.creature, err)
		}
		for _, action := range rules.Actions {
			if action.Name == check.removed {
				t.Errorf("%s retains action %q that the official block does not contain", check.creature, check.removed)
			}
		}
	}
	var reviewed map[string]string
	if err := json.Unmarshal(byName["Barbed Devil"].Translations, &reviewed); err != nil {
		t.Fatal(err)
	}
	fieldTranslations := map[string]string{
		"pt-BR.source":              reviewed["pt-BR.source"],
		"pt-BR.rules.senses":        reviewed["pt-BR.rules.senses"],
		"pt-BR.rules.senses.source": reviewed["pt-BR.rules.senses.source"],
	}
	entry := srdEntry{EntryType: "other", Name: "Barbed Devil", Translations: mustJSON(t, fieldTranslations)}
	for _, prior := range []map[string]string{
		{"pt-BR.rules.senses": "trecho antigo", "pt-BR.rules.senses.source": "ai"},
		{"pt-BR.rules.senses": "trecho antigo sem origem"},
	} {
		changed, updated, unresolved := applyReviewedTranslation(prior, entry)
		if !changed || prior["pt-BR.rules.senses"] != reviewed["pt-BR.rules.senses"] || prior["pt-BR.rules.senses.source"] != "reviewed" || len(updated) != 1 || len(unresolved) != 0 {
			t.Errorf("reviewed creature field did not replace legacy catalog value: changed=%t value=%v updated=%v unresolved=%v", changed, prior, updated, unresolved)
		}
		changed, updated, unresolved = applyReviewedTranslation(prior, entry)
		if changed || len(updated) != 0 || len(unresolved) != 0 {
			t.Errorf("reimporting reviewed creature field was not idempotent: changed=%t updated=%v unresolved=%v", changed, updated, unresolved)
		}
	}
	protected := map[string]string{"pt-BR.rules.senses": "edição protegida", "pt-BR.rules.senses.source": "manual"}
	if changed, _, _ := applyReviewedTranslation(protected, entry); changed || protected["pt-BR.rules.senses"] != "edição protegida" {
		t.Errorf("manual creature field was overwritten during sync: %v", protected)
	}
}

func TestSRDCreaturePendingActionTargetsAreNotMarkedReviewed(t *testing.T) {
	var pack srdPack
	if err := json.Unmarshal(srdPackJSON, &pack); err != nil {
		t.Fatal(err)
	}
	byName := make(map[string]srdEntry, len(pack.Entries))
	for _, entry := range pack.Entries {
		if entry.EntryType == "other" {
			byName[entry.Name] = entry
		}
	}
	for target := range pendingCreatureActionTargets(t) {
		parts := strings.Split(target, "|")
		entryName, actionIndex := parts[0], parts[1]
		entry, ok := byName[entryName]
		if !ok {
			t.Errorf("manifest creature %q is missing from SRD pack", entryName)
			continue
		}
		var translations map[string]string
		if err := json.Unmarshal(entry.Translations, &translations); err != nil {
			t.Errorf("decode %s translations: %v", entryName, err)
			continue
		}
		for _, field := range []string{"name", "range", "damage", "description"} {
			key := "pt-BR.rules.actions." + actionIndex + "." + field + ".source"
			if translations[key] == "reviewed" {
				t.Errorf("pending action field %s.%s is still marked reviewed", entryName, key)
			}
		}
	}
}

func TestSRDCreatureRestoredActionsMatchOfficialSRD521(t *testing.T) {
	type action struct {
		Name        string `json:"name"`
		ToHit       *int   `json:"toHit"`
		Range       string `json:"range"`
		Damage      string `json:"damage"`
		Description string `json:"description"`
	}
	type rules struct {
		Actions []action `json:"actions"`
	}
	want := []struct {
		creature, name, damage, description, localizedName, localizedDamage, localizedDescription, localizedRange string
		index, toHit                                                                                              int
		expectNoToHit                                                                                             bool
	}{
		{
			creature: "Allosaurus", index: 0, name: "Bite", toHit: 6, damage: "15 (2d10 + 4)",
			description:   "Melee Attack Roll: +6, reach 5 ft. Hit: 15 (2d10 + 4) Piercing damage.",
			localizedName: "Mordida", localizedDamage: "15 (2d10 + 4)",
			localizedDescription: "Jogada de Ataque Corpo a Corpo: +6, alcance 5 ft. Acerto: 15 (2d10 + 4) de dano perfurante.",
		},
		{
			creature: "Allosaurus", index: 1, name: "Claws", toHit: 6, damage: "8 (1d8 + 4)",
			description:   "Melee Attack Roll: +6, reach 5 ft. Hit: 8 (1d8 + 4) Slashing damage. If the target is a Large or smaller creature and the allosaurus moved 30+ feet straight toward it immediately before the hit, the target has the Prone condition, and the allosaurus can make one Bite attack against it.",
			localizedName: "Garras", localizedDamage: "8 (1d8 + 4)",
			localizedDescription: "Jogada de Ataque Corpo a Corpo: +6, alcance 5 ft. Acerto: 8 (1d8 + 4) de dano cortante. Se o alvo for uma criatura Grande ou menor e o alossauro tiver se movido 30+ ft em linha reta na direção dele imediatamente antes do acerto, o alvo fica Caído, e o alossauro pode realizar um ataque de Mordida contra ele.",
		},
		{
			creature: "Awakened Shrub", index: 0, name: "Rake", toHit: 1, damage: "1 Slashing",
			description:   "Melee Attack Roll: +1, reach 5 ft. Hit: 1 Slashing damage.",
			localizedName: "Rasgar", localizedDamage: "1 Cortante",
			localizedDescription: "Jogada de Ataque Corpo a Corpo: +1, alcance 5 ft. Acerto: 1 de dano cortante.",
		},
		{
			creature: "Assassin", index: 0, name: "Shortsword", toHit: 7, damage: "7 (1d6 + 4) Piercing damage plus 17 (5d6) Poison damage",
			description:   "Melee Attack Roll: +7, reach 5 ft. Hit: 7 (1d6 + 4) Piercing damage plus 17 (5d6) Poison damage, and the target has the Poisoned condition until the start of the assassin’s next turn.",
			localizedName: "Espada Curta", localizedDamage: "7 (1d6 + 4) de dano perfurante mais 17 (5d6) de dano de veneno",
			localizedDescription: "Jogada de Ataque Corpo a Corpo: +7, alcance 5 ft. Acerto: 7 (1d6 + 4) de dano perfurante mais 17 (5d6) de dano de veneno, e o alvo fica Envenenado até o início do próximo turno do assassino.", localizedRange: "alcance 5 ft.",
		},
		{creature: "Adult Black Dragon", index: 0, name: "Rend", toHit: 11, damage: "13 (2d6 + 6) Slashing damage plus 4 (1d8) Acid damage", description: "Melee Attack Roll: +11, reach 10 ft. Hit: 13 (2d6 + 6) Slashing damage plus 4 (1d8) Acid damage.", localizedName: "Dilacerar", localizedDamage: "13 (2d6 + 6) de dano cortante mais 4 (1d8) de dano ácido", localizedDescription: "Jogada de Ataque Corpo a Corpo: +11, alcance 10 ft. Acerto: 13 (2d6 + 6) de dano cortante mais 4 (1d8) de dano ácido.", localizedRange: "alcance 10 ft"},
		{creature: "Adult Blue Dragon", index: 0, name: "Rend", toHit: 12, damage: "16 (2d8 + 7) Slashing damage plus 5 (1d10) Lightning damage", description: "Melee Attack Roll: +12, reach 10 ft. Hit: 16 (2d8 + 7) Slashing damage plus 5 (1d10) Lightning damage.", localizedName: "Dilacerar", localizedDamage: "16 (2d8 + 7) de dano cortante mais 5 (1d10) de dano elétrico", localizedDescription: "Jogada de Ataque Corpo a Corpo: +12, alcance 10 ft. Acerto: 16 (2d8 + 7) de dano cortante mais 5 (1d10) de dano elétrico.", localizedRange: "alcance 10 ft"},
		{creature: "Adult Brass Dragon", index: 0, name: "Rend", toHit: 11, damage: "17 (2d10 + 6) Slashing damage plus 4 (1d8) Fire damage", description: "Melee Attack Roll: +11, reach 10 ft. Hit: 17 (2d10 + 6) Slashing damage plus 4 (1d8) Fire damage.", localizedName: "Dilacerar", localizedDamage: "17 (2d10 + 6) de dano cortante mais 4 (1d8) de dano de fogo", localizedDescription: "Jogada de Ataque Corpo a Corpo: +11, alcance 10 ft. Acerto: 17 (2d10 + 6) de dano cortante mais 4 (1d8) de dano de fogo.", localizedRange: "alcance 10 ft"},
		{creature: "Adult Bronze Dragon", index: 0, name: "Rend", toHit: 12, damage: "16 (2d8 + 7) Slashing damage plus 5 (1d10) Lightning damage", description: "Melee Attack Roll: +12, reach 10 ft. Hit: 16 (2d8 + 7) Slashing damage plus 5 (1d10) Lightning damage.", localizedName: "Dilacerar", localizedDamage: "16 (2d8 + 7) de dano cortante mais 5 (1d10) de dano elétrico", localizedDescription: "Jogada de Ataque Corpo a Corpo: +12, alcance 10 ft. Acerto: 16 (2d8 + 7) de dano cortante mais 5 (1d10) de dano elétrico.", localizedRange: "alcance 10 ft"},
		{creature: "Adult Copper Dragon", index: 0, name: "Rend", toHit: 11, damage: "17 (2d10 + 6) Slashing damage plus 4 (1d8) Acid damage", description: "Melee Attack Roll: +11, reach 10 ft. Hit: 17 (2d10 + 6) Slashing damage plus 4 (1d8) Acid damage.", localizedName: "Dilacerar", localizedDamage: "17 (2d10 + 6) de dano cortante mais 4 (1d8) de dano ácido", localizedDescription: "Jogada de Ataque Corpo a Corpo: +11, alcance 10 ft. Acerto: 17 (2d10 + 6) de dano cortante mais 4 (1d8) de dano ácido.", localizedRange: "alcance 10 ft"},
		{creature: "Adult Gold Dragon", index: 0, name: "Rend", toHit: 14, damage: "17 (2d8 + 8) Slashing damage plus 4 (1d8) Fire damage", description: "Melee Attack Roll: +14, reach 10 ft. Hit: 17 (2d8 + 8) Slashing damage plus 4 (1d8) Fire damage.", localizedName: "Dilacerar", localizedDamage: "17 (2d8 + 8) de dano cortante mais 4 (1d8) de dano de fogo", localizedDescription: "Jogada de Ataque Corpo a Corpo: +14, alcance 10 ft. Acerto: 17 (2d8 + 8) de dano cortante mais 4 (1d8) de dano de fogo.", localizedRange: "alcance 10 ft"},
		{creature: "Adult Green Dragon", index: 0, name: "Rend", toHit: 11, damage: "15 (2d8 + 6) Slashing damage plus 7 (2d6) Poison damage", description: "Melee Attack Roll: +11, reach 10 ft. Hit: 15 (2d8 + 6) Slashing damage plus 7 (2d6) Poison damage.", localizedName: "Dilacerar", localizedDamage: "15 (2d8 + 6) de dano cortante mais 7 (2d6) de dano de veneno", localizedDescription: "Jogada de Ataque Corpo a Corpo: +11, alcance 10 ft. Acerto: 15 (2d8 + 6) de dano cortante mais 7 (2d6) de dano de veneno.", localizedRange: "alcance 10 ft"},
		{creature: "Adult Red Dragon", index: 0, name: "Rend", toHit: 14, damage: "13 (1d10 + 8) Slashing damage plus 5 (2d4) Fire damage", description: "Melee Attack Roll: +14, reach 10 ft. Hit: 13 (1d10 + 8) Slashing damage plus 5 (2d4) Fire damage.", localizedName: "Dilacerar", localizedDamage: "13 (1d10 + 8) de dano cortante mais 5 (2d4) de dano de fogo", localizedDescription: "Jogada de Ataque Corpo a Corpo: +14, alcance 10 ft. Acerto: 13 (1d10 + 8) de dano cortante mais 5 (2d4) de dano de fogo.", localizedRange: "alcance 10 ft"},
		{creature: "Adult Silver Dragon", index: 0, name: "Rend", toHit: 13, damage: "17 (2d8 + 8) Slashing damage plus 4 (1d8) Cold damage", description: "Melee Attack Roll: +13, reach 10 ft. Hit: 17 (2d8 + 8) Slashing damage plus 4 (1d8) Cold damage.", localizedName: "Dilacerar", localizedDamage: "17 (2d8 + 8) de dano cortante mais 4 (1d8) de dano de frio", localizedDescription: "Jogada de Ataque Corpo a Corpo: +13, alcance 10 ft. Acerto: 17 (2d8 + 8) de dano cortante mais 4 (1d8) de dano de frio.", localizedRange: "alcance 10 ft"},
		{creature: "Adult White Dragon", index: 0, name: "Rend", toHit: 11, damage: "13 (2d6 + 6) Slashing damage plus 4 (1d8) Cold damage", description: "Melee Attack Roll: +11, reach 10 ft. Hit: 13 (2d6 + 6) Slashing damage plus 4 (1d8) Cold damage.", localizedName: "Dilacerar", localizedDamage: "13 (2d6 + 6) de dano cortante mais 4 (1d8) de dano de frio", localizedDescription: "Jogada de Ataque Corpo a Corpo: +11, alcance 10 ft. Acerto: 13 (2d6 + 6) de dano cortante mais 4 (1d8) de dano de frio.", localizedRange: "alcance 10 ft"},
		{creature: "Ancient Black Dragon", index: 0, name: "Rend", toHit: 15, damage: "17 (2d8 + 8) Slashing damage plus 9 (2d8) Acid damage", description: "Melee Attack Roll: +15, reach 15 ft. Hit: 17 (2d8 + 8) Slashing damage plus 9 (2d8) Acid damage.", localizedName: "Dilacerar", localizedDamage: "17 (2d8 + 8) de dano cortante mais 9 (2d8) de dano ácido", localizedDescription: "Jogada de Ataque Corpo a Corpo: +15, alcance 15 ft. Acerto: 17 (2d8 + 8) de dano cortante mais 9 (2d8) de dano ácido.", localizedRange: "alcance 15 ft"},
		{creature: "Ancient Blue Dragon", index: 0, name: "Rend", toHit: 16, damage: "18 (2d8 + 9) Slashing damage plus 11 (2d10) Lightning damage", description: "Melee Attack Roll: +16, reach 15 ft. Hit: 18 (2d8 + 9) Slashing damage plus 11 (2d10) Lightning damage.", localizedName: "Dilacerar", localizedDamage: "18 (2d8 + 9) de dano cortante mais 11 (2d10) de dano elétrico", localizedDescription: "Jogada de Ataque Corpo a Corpo: +16, alcance 15 ft. Acerto: 18 (2d8 + 9) de dano cortante mais 11 (2d10) de dano elétrico.", localizedRange: "alcance 15 ft"},
		{creature: "Ancient Brass Dragon", index: 0, name: "Rend", toHit: 14, damage: "19 (2d10 + 8) Slashing damage plus 7 (2d6) Fire damage", description: "Melee Attack Roll: +14, reach 15 ft. Hit: 19 (2d10 + 8) Slashing damage plus 7 (2d6) Fire damage.", localizedName: "Dilacerar", localizedDamage: "19 (2d10 + 8) de dano cortante mais 7 (2d6) de dano de fogo", localizedDescription: "Jogada de Ataque Corpo a Corpo: +14, alcance 15 ft. Acerto: 19 (2d10 + 8) de dano cortante mais 7 (2d6) de dano de fogo.", localizedRange: "alcance 15 ft"},
		{creature: "Ancient Bronze Dragon", index: 0, name: "Rend", toHit: 16, damage: "18 (2d8 + 9) Slashing damage plus 9 (2d8) Lightning damage", description: "Melee Attack Roll: +16, reach 15 ft. Hit: 18 (2d8 + 9) Slashing damage plus 9 (2d8) Lightning damage.", localizedName: "Dilacerar", localizedDamage: "18 (2d8 + 9) de dano cortante mais 9 (2d8) de dano elétrico", localizedDescription: "Jogada de Ataque Corpo a Corpo: +16, alcance 15 ft. Acerto: 18 (2d8 + 9) de dano cortante mais 9 (2d8) de dano elétrico.", localizedRange: "alcance 15 ft"},
		{creature: "Ancient Copper Dragon", index: 0, name: "Rend", toHit: 15, damage: "19 (2d10 + 8) Slashing damage plus 9 (2d8) Acid damage", description: "Melee Attack Roll: +15, reach 15 ft. Hit: 19 (2d10 + 8) Slashing damage plus 9 (2d8) Acid damage.", localizedName: "Dilacerar", localizedDamage: "19 (2d10 + 8) de dano cortante mais 9 (2d8) de dano ácido", localizedDescription: "Jogada de Ataque Corpo a Corpo: +15, alcance 15 ft. Acerto: 19 (2d10 + 8) de dano cortante mais 9 (2d8) de dano ácido.", localizedRange: "alcance 15 ft"},
		{creature: "Ancient Green Dragon", index: 0, name: "Rend", toHit: 15, damage: "17 (2d8 + 8) Slashing damage plus 10 (3d6) Poison damage", description: "Melee Attack Roll: +15, reach 15 ft. Hit: 17 (2d8 + 8) Slashing damage plus 10 (3d6) Poison damage.", localizedName: "Dilacerar", localizedDamage: "17 (2d8 + 8) de dano cortante mais 10 (3d6) de dano de veneno", localizedDescription: "Jogada de Ataque Corpo a Corpo: +15, alcance 15 ft. Acerto: 17 (2d8 + 8) de dano cortante mais 10 (3d6) de dano de veneno.", localizedRange: "alcance 15 ft"},
		{creature: "Ancient White Dragon", index: 0, name: "Rend", toHit: 14, damage: "17 (2d8 + 8) Slashing damage plus 7 (2d6) Cold damage", description: "Melee Attack Roll: +14, reach 15 ft. Hit: 17 (2d8 + 8) Slashing damage plus 7 (2d6) Cold damage.", localizedName: "Dilacerar", localizedDamage: "17 (2d8 + 8) de dano cortante mais 7 (2d6) de dano de frio", localizedDescription: "Jogada de Ataque Corpo a Corpo: +14, alcance 15 ft. Acerto: 17 (2d8 + 8) de dano cortante mais 7 (2d6) de dano de frio.", localizedRange: "alcance 15 ft"},
		{creature: "Animated Rug of Smothering", index: 0, name: "Smother", toHit: 5, damage: "10 (2d6 + 3) Bludgeoning damage", description: "Melee Attack Roll: +5, reach 5 ft. Hit: 10 (2d6 + 3) Bludgeoning damage. If the target is a Medium or smaller creature, the rug can give it the Grappled condition (escape DC 13) instead of dealing damage. Until the grapple ends, the target has the Blinded and Restrained conditions, is suffocating, and takes 10 (2d6 + 3) Bludgeoning damage at the start of each of its turns. The rug can smother only one creature at a time. While grappling the target, the rug can’t take this action, the rug halves the damage it takes (round down), and the target takes the same amount of damage.", localizedName: "Sufocar", localizedDamage: "10 (2d6 + 3) de dano contundente", localizedDescription: "Jogada de Ataque Corpo a Corpo: +5, alcance 5 ft. Acerto: 10 (2d6 + 3) de dano contundente. Se o alvo for uma criatura Média ou menor, o tapete pode impor a condição Agarrado ao alvo (CD para escapar 13), em vez de causar dano. Enquanto o agarrão durar, o alvo fica com as condições Cego e Impedido, está sufocando e sofre 10 (2d6 + 3) de dano contundente no início de cada um de seus turnos. O tapete só pode sufocar uma criatura por vez. Enquanto estiver agarrando o alvo, o tapete não pode realizar esta ação; o dano que sofre é reduzido à metade (arredondado para baixo), e o alvo sofre a mesma quantidade de dano."},
		{creature: "Ankylosaurus", index: 0, name: "Tail", toHit: 6, damage: "9 (1d10 + 4) Bludgeoning damage", description: "Melee Attack Roll: +6, reach 10 ft. Hit: 9 (1d10 + 4) Bludgeoning damage. If the target is a Huge or smaller creature, it has the Prone condition.", localizedName: "Cauda", localizedDamage: "9 (1d10 + 4) de dano contundente", localizedDescription: "Jogada de Ataque Corpo a Corpo: +6, alcance 10 ft. Acerto: 9 (1d10 + 4) de dano contundente. Se o alvo for uma criatura Enorme ou menor, fica Caído.", localizedRange: "alcance 10 ft"},
		{creature: "Archelon", index: 0, name: "Bite", toHit: 6, damage: "14 (3d6 + 4) Piercing damage", description: "Melee Attack Roll: +6, reach 5 ft. Hit: 14 (3d6 + 4) Piercing damage.", localizedName: "Mordida", localizedDamage: "14 (3d6 + 4) de dano perfurante", localizedDescription: "Jogada de Ataque Corpo a Corpo: +6, alcance 5 ft. Acerto: 14 (3d6 + 4) de dano perfurante."},
		{creature: "Awakened Tree", index: 0, name: "Slam", toHit: 6, damage: "14 (3d6 + 4) Bludgeoning damage", description: "Melee Attack Roll: +6, reach 10 ft. Hit: 14 (3d6 + 4) Bludgeoning damage.", localizedName: "Pancada", localizedDamage: "14 (3d6 + 4) de dano contundente", localizedDescription: "Jogada de Ataque Corpo a Corpo: +6, alcance 10 ft. Acerto: 14 (3d6 + 4) de dano contundente.", localizedRange: "alcance 10 ft"},
		{creature: "Baboon", index: 0, name: "Bite", toHit: 1, damage: "1 (1d4 − 1) Piercing damage", description: "Melee Attack Roll: +1, reach 5 ft. Hit: 1 (1d4 − 1) Piercing damage.", localizedName: "Mordida", localizedDamage: "1 (1d4 − 1) de dano perfurante", localizedDescription: "Jogada de Ataque Corpo a Corpo: +1, alcance 5 ft. Acerto: 1 (1d4 − 1) de dano perfurante."},
		{creature: "Badger", index: 0, name: "Bite", toHit: 2, damage: "1 Piercing damage", description: "Melee Attack Roll: +2, reach 5 ft. Hit: 1 Piercing damage.", localizedName: "Mordida", localizedDamage: "1 de dano perfurante", localizedDescription: "Jogada de Ataque Corpo a Corpo: +2, alcance 5 ft. Acerto: 1 de dano perfurante."},
		{creature: "Balor", index: 0, name: "Flame Whip", toHit: 14, damage: "18 (3d6 + 8) Force damage plus 17 (5d6) Fire damage", description: "Melee Attack Roll: +14, reach 30 ft. Hit: 18 (3d6 + 8) Force damage plus 17 (5d6) Fire damage. If the target is a Huge or smaller creature, the balor pulls the target up to 25 feet straight toward itself, and the target has the Prone condition.", localizedName: "Chicote Flamejante", localizedDamage: "18 (3d6 + 8) de dano de energia mais 17 (5d6) de dano de fogo", localizedDescription: "Jogada de Ataque Corpo a Corpo: +14, alcance 30 ft. Acerto: 18 (3d6 + 8) de dano de energia mais 17 (5d6) de dano de fogo. Se o alvo for uma criatura Enorme ou menor, o balor puxa o alvo até 25 ft em linha reta na direção dele, e o alvo fica Caído.", localizedRange: "alcance 30 ft"},
		{creature: "Balor", index: 1, name: "Lightning Blade", toHit: 14, damage: "21 (3d8 + 8) Force damage plus 22 (4d10) Lightning damage", description: "Melee Attack Roll: +14, reach 10 ft. Hit: 21 (3d8 + 8) Force damage plus 22 (4d10) Lightning damage, and the target can’t take Reactions until the start of the balor’s next turn.", localizedName: "Lâmina Elétrica", localizedDamage: "21 (3d8 + 8) de dano de energia mais 22 (4d10) de dano elétrico", localizedDescription: "Jogada de Ataque Corpo a Corpo: +14, alcance 10 ft. Acerto: 21 (3d8 + 8) de dano de energia mais 22 (4d10) de dano elétrico, e o alvo não pode realizar Reações até o início do próximo turno do balor.", localizedRange: "alcance 10 ft"},
		{creature: "Bandit", index: 0, name: "Scimitar", toHit: 3, damage: "4 (1d6 + 1) Slashing damage", description: "Melee Attack Roll: +3, reach 5 ft. Hit: 4 (1d6 + 1) Slashing damage.", localizedName: "Cimitarra", localizedDamage: "4 (1d6 + 1) de dano cortante", localizedDescription: "Jogada de Ataque Corpo a Corpo: +3, alcance 5 ft. Acerto: 4 (1d6 + 1) de dano cortante."},
		{creature: "Bandit Captain", index: 0, name: "Scimitar", toHit: 5, damage: "6 (1d6 + 3) Slashing damage", description: "Melee Attack Roll: +5, reach 5 ft. Hit: 6 (1d6 + 3) Slashing damage.", localizedName: "Cimitarra", localizedDamage: "6 (1d6 + 3) de dano cortante", localizedDescription: "Jogada de Ataque Corpo a Corpo: +5, alcance 5 ft. Acerto: 6 (1d6 + 3) de dano cortante."},
		{creature: "Barbed Devil", index: 0, name: "Claws", toHit: 6, damage: "10 (2d6 + 3) Piercing damage", description: "Melee Attack Roll: +6, reach 5 ft. Hit: 10 (2d6 + 3) Piercing damage. If the target is a Large or smaller creature, it has the Grappled condition (escape DC 13) from both claws.", localizedName: "Garras", localizedDamage: "10 (2d6 + 3) de dano perfurante", localizedDescription: "Jogada de Ataque Corpo a Corpo: +6, alcance 5 ft. Acerto: 10 (2d6 + 3) de dano perfurante. Se o alvo for uma criatura Grande ou menor, fica Agarrado pelas duas garras (CD para escapar 13).", localizedRange: "alcance 5 ft"},
		{creature: "Barbed Devil", index: 1, name: "Tail", toHit: 6, damage: "14 (2d10 + 3) Slashing damage", description: "Melee Attack Roll: +6, reach 10 ft. Hit: 14 (2d10 + 3) Slashing damage.", localizedName: "Cauda", localizedDamage: "14 (2d10 + 3) de dano cortante", localizedDescription: "Jogada de Ataque Corpo a Corpo: +6, alcance 10 ft. Acerto: 14 (2d10 + 3) de dano cortante.", localizedRange: "alcance 10 ft"},
		{creature: "Bat", index: 0, name: "Bite", toHit: 4, damage: "1 Piercing damage", description: "Melee Attack Roll: +4, reach 5 ft. Hit: 1 Piercing damage.", localizedName: "Mordida", localizedDamage: "1 de dano perfurante", localizedDescription: "Jogada de Ataque Corpo a Corpo: +4, alcance 5 ft. Acerto: 1 de dano perfurante.", localizedRange: "alcance 5 ft"},
		{creature: "Bearded Devil", index: 0, name: "Beard", toHit: 5, damage: "7 (1d8 + 3) Piercing damage", description: "Melee Attack Roll: +5, reach 5 ft. Hit: 7 (1d8 + 3) Piercing damage, and the target has the Poisoned condition until the start of the devil’s next turn. Until this poison ends, the target can’t regain Hit Points.", localizedName: "Barba", localizedDamage: "7 (1d8 + 3) de dano perfurante", localizedDescription: "Jogada de Ataque Corpo a Corpo: +5, alcance 5 ft. Acerto: 7 (1d8 + 3) de dano perfurante, e o alvo fica Envenenado até o início do próximo turno do diabo. Enquanto esse veneno durar, o alvo não pode recuperar Pontos de Vida.", localizedRange: "alcance 5 ft"},
		{creature: "Bearded Devil", index: 1, name: "Infernal Glaive", toHit: 5, damage: "8 (1d10 + 3) Slashing damage", description: "Melee Attack Roll: +5, reach 10 ft. Hit: 8 (1d10 + 3) Slashing damage. If the target is a creature and doesn’t already have an infernal wound, it is subjected to the following effect. Constitution Saving Throw: DC 12. Failure: The target receives an infernal wound. While wounded, the target loses 5 (1d10) Hit Points at the start of each of its turns. The wound closes after 1 minute, after a spell restores Hit Points to the target, or after the target or a creature within 5 feet of it takes an action to stanch the wound, doing so by succeeding on a DC 12 Wisdom (Medicine) check.", localizedName: "Glaive Infernal", localizedDamage: "8 (1d10 + 3) de dano cortante", localizedDescription: "Jogada de Ataque Corpo a Corpo: +5, alcance 10 ft. Acerto: 8 (1d10 + 3) de dano cortante. Se o alvo for uma criatura e ainda não tiver uma ferida infernal, sofre o seguinte efeito. Teste de Resistência de Constituição: CD 12. Falha: o alvo recebe uma ferida infernal. Enquanto estiver ferido, perde 5 (1d10) Pontos de Vida no início de cada um de seus turnos. A ferida se fecha após 1 minuto, depois que uma magia restaura Pontos de Vida do alvo ou quando o alvo ou uma criatura a até 5 ft dele usa uma ação para estancar a ferida, sendo bem-sucedida em um teste de Sabedoria (Medicina) CD 12.", localizedRange: "alcance 10 ft"},
		{creature: "Behir", index: 0, name: "Bite", toHit: 10, damage: "19 (2d12 + 6) Piercing damage plus 11 (2d10) Lightning damage", description: "Melee Attack Roll: +10, reach 10 ft. Hit: 19 (2d12 + 6) Piercing damage plus 11 (2d10) Lightning damage.", localizedName: "Mordida", localizedDamage: "19 (2d12 + 6) de dano perfurante mais 11 (2d10) de dano elétrico", localizedDescription: "Jogada de Ataque Corpo a Corpo: +10, alcance 10 ft. Acerto: 19 (2d12 + 6) de dano perfurante mais 11 (2d10) de dano elétrico.", localizedRange: "alcance 10 ft"},
		{creature: "Blue Dragon Wyrmling", index: 0, name: "Rend", toHit: 5, damage: "8 (1d10 + 3) Slashing damage plus 3 (1d6) Lightning damage", description: "Melee Attack Roll: +5, reach 5 ft. Hit: 8 (1d10 + 3) Slashing damage plus 3 (1d6) Lightning damage.", localizedName: "Dilacerar", localizedDamage: "8 (1d10 + 3) de dano cortante mais 3 (1d6) de dano elétrico", localizedDescription: "Jogada de Ataque Corpo a Corpo: +5, alcance 5 ft. Acerto: 8 (1d10 + 3) de dano cortante mais 3 (1d6) de dano elétrico.", localizedRange: "alcance 5 ft"},
		{creature: "Blue Dragon Wyrmling", index: 1, name: "Lightning Breath", damage: "21 (6d6) Lightning damage", description: "Recharge 5–6. Dexterity Saving Throw: DC 12, each creature in a 30-foot-long, 5-foot-wide Line. Failure: 21 (6d6) Lightning damage. Success: Half damage.", localizedName: "Sopro Elétrico", localizedDamage: "21 (6d6) de dano elétrico", localizedDescription: "Recarga 5–6. Teste de Resistência de Destreza: CD 12, cada criatura em uma linha de 30 ft de comprimento e 5 ft de largura. Falha: 21 (6d6) de dano elétrico. Sucesso: metade do dano.", localizedRange: "linha de 30 ft de comprimento e 5 ft de largura", expectNoToHit: true},
		{creature: "Bone Devil", index: 0, name: "Claw", toHit: 8, damage: "13 (2d8 + 4) Slashing damage", description: "Melee Attack Roll: +8, reach 10 ft. Hit: 13 (2d8 + 4) Slashing damage.", localizedName: "Garra", localizedDamage: "13 (2d8 + 4) de dano cortante", localizedDescription: "Jogada de Ataque Corpo a Corpo: +8, alcance 10 ft. Acerto: 13 (2d8 + 4) de dano cortante.", localizedRange: "alcance 10 ft"},
		{creature: "Bone Devil", index: 1, name: "Infernal Sting", toHit: 8, damage: "15 (2d10 + 4) Piercing damage plus 18 (4d8) Poison damage", description: "Melee Attack Roll: +8, reach 10 ft. Hit: 15 (2d10 + 4) Piercing damage plus 18 (4d8) Poison damage, and the target has the Poisoned condition until the start of the devil’s next turn. While Poisoned, the target can’t regain Hit Points.", localizedName: "Ferroada Infernal", localizedDamage: "15 (2d10 + 4) de dano perfurante mais 18 (4d8) de dano de veneno", localizedDescription: "Jogada de Ataque Corpo a Corpo: +8, alcance 10 ft. Acerto: 15 (2d10 + 4) de dano perfurante mais 18 (4d8) de dano de veneno, e o alvo fica Envenenado até o início do próximo turno do diabo. Enquanto estiver Envenenado, o alvo não pode recuperar Pontos de Vida.", localizedRange: "alcance 10 ft"},
		{creature: "Brass Dragon Wyrmling", index: 0, name: "Rend", toHit: 4, damage: "7 (1d10 + 2) Slashing damage", description: "Melee Attack Roll: +4, reach 5 ft. Hit: 7 (1d10 + 2) Slashing damage.", localizedName: "Dilacerar", localizedDamage: "7 (1d10 + 2) de dano cortante", localizedDescription: "Jogada de Ataque Corpo a Corpo: +4, alcance 5 ft. Acerto: 7 (1d10 + 2) de dano cortante."},
		{creature: "Bronze Dragon Wyrmling", index: 0, name: "Rend", toHit: 5, damage: "8 (1d10 + 3) Slashing damage", description: "Melee Attack Roll: +5, reach 5 ft. Hit: 8 (1d10 + 3) Slashing damage.", localizedName: "Dilacerar", localizedDamage: "8 (1d10 + 3) de dano cortante", localizedDescription: "Jogada de Ataque Corpo a Corpo: +5, alcance 5 ft. Acerto: 8 (1d10 + 3) de dano cortante."},
		{creature: "Bronze Dragon Wyrmling", index: 1, name: "Lightning Breath", damage: "16 (3d10) Lightning damage", description: "Recharge 5–6. Dexterity Saving Throw: DC 12, each creature in a 40-foot-long, 5-foot-wide Line. Failure: 16 (3d10) Lightning damage. Success: Half damage.", localizedName: "Sopro Elétrico", localizedDamage: "16 (3d10) de dano elétrico", localizedDescription: "Recarga 5–6. Teste de Resistência de Destreza: CD 12, cada criatura em uma linha de 40 ft de comprimento e 5 ft de largura. Falha: 16 (3d10) de dano elétrico. Sucesso: metade do dano.", localizedRange: "linha de 40 ft de comprimento e 5 ft de largura", expectNoToHit: true},
		{creature: "Bugbear Warrior", index: 0, name: "Grab", toHit: 4, damage: "9 (2d6 + 2) Bludgeoning damage", description: "Melee Attack Roll: +4, reach 10 ft. Hit: 9 (2d6 + 2) Bludgeoning damage. If the target is a Medium or smaller creature, it has the Grappled condition (escape DC 12).", localizedName: "Agarrar", localizedDamage: "9 (2d6 + 2) de dano contundente", localizedDescription: "Jogada de Ataque Corpo a Corpo: +4, alcance 10 ft. Acerto: 9 (2d6 + 2) de dano contundente. Se o alvo for uma criatura Média ou menor, fica Agarrado (CD para escapar 12).", localizedRange: "alcance 10 ft"},
		{creature: "Bulette", index: 0, name: "Bite", toHit: 7, damage: "17 (2d12 + 4) Piercing damage", description: "Melee Attack Roll: +7, reach 5 ft. Hit: 17 (2d12 + 4) Piercing damage.", localizedName: "Mordida", localizedDamage: "17 (2d12 + 4) de dano perfurante", localizedDescription: "Jogada de Ataque Corpo a Corpo: +7, alcance 5 ft. Acerto: 17 (2d12 + 4) de dano perfurante.", localizedRange: "alcance 5 ft"},
		{creature: "Cat", index: 0, name: "Scratch", toHit: 4, damage: "1 Slashing damage", description: "Melee Attack Roll: +4, reach 5 ft. Hit: 1 Slashing damage.", localizedName: "Arranhão", localizedDamage: "1 de dano cortante", localizedDescription: "Jogada de Ataque Corpo a Corpo: +4, alcance 5 ft. Acerto: 1 de dano cortante."},
		{creature: "Centaur Trooper", index: 0, name: "Pike", toHit: 6, damage: "9 (1d10 + 4) Piercing damage", description: "Melee Attack Roll: +6, reach 10 ft. Hit: 9 (1d10 + 4) Piercing damage.", localizedName: "Pique", localizedDamage: "9 (1d10 + 4) de dano perfurante", localizedDescription: "Jogada de Ataque Corpo a Corpo: +6, alcance 10 ft. Acerto: 9 (1d10 + 4) de dano perfurante.", localizedRange: "alcance 10 ft"},
		{creature: "Chuul", index: 0, name: "Pincer", toHit: 6, damage: "9 (1d10 + 4) Bludgeoning damage", description: "Melee Attack Roll: +6, reach 10 ft. Hit: 9 (1d10 + 4) Bludgeoning damage. If the target is a Large or smaller creature, it has the Grappled condition (escape DC 14) from one of two pincers.", localizedName: "Pinça", localizedDamage: "9 (1d10 + 4) de dano contundente", localizedDescription: "Jogada de Ataque Corpo a Corpo: +6, alcance 10 ft. Acerto: 9 (1d10 + 4) de dano contundente. Se o alvo for uma criatura Grande ou menor, fica Agarrado (CD para escapar 14) por uma das duas pinças.", localizedRange: "alcance 10 ft"},
		{creature: "Clay Golem", index: 0, name: "Slam", toHit: 9, damage: "10 (1d10 + 5) Bludgeoning damage plus 6 (1d12) Acid damage", description: "Melee Attack Roll: +9, reach 5 ft. Hit: 10 (1d10 + 5) Bludgeoning damage plus 6 (1d12) Acid damage, and the target’s Hit Point maximum decreases by an amount equal to the Acid damage taken.", localizedName: "Pancada", localizedDamage: "10 (1d10 + 5) de dano contundente mais 6 (1d12) de dano ácido", localizedDescription: "Jogada de Ataque Corpo a Corpo: +9, alcance 5 ft. Acerto: 10 (1d10 + 5) de dano contundente mais 6 (1d12) de dano ácido, e o máximo de Pontos de Vida do alvo é reduzido em uma quantidade igual ao dano ácido sofrido.", localizedRange: "alcance 5 ft"},
		{creature: "Cloaker", index: 0, name: "Attach", toHit: 6, damage: "13 (3d6 + 3) Piercing damage", description: "Melee Attack Roll: +6, reach 5 ft. Hit: 13 (3d6 + 3) Piercing damage. If the target is a Large or smaller creature, the cloaker attaches to it. While the cloaker is attached, the target has the Blinded condition, and the cloaker can’t make Attach attacks against other targets. In addition, the cloaker halves the damage it takes (round down), and the target takes the same amount of damage. The cloaker can detach itself by spending 5 feet of movement. The target or a creature within 5 feet of it can take an action to try to detach the cloaker, doing so by succeeding on a DC 14 Strength (Athletics) check.", localizedName: "Aderir", localizedDamage: "13 (3d6 + 3) de dano perfurante", localizedDescription: "Jogada de Ataque Corpo a Corpo: +6, alcance 5 ft. Acerto: 13 (3d6 + 3) de dano perfurante. Se o alvo for uma criatura Grande ou menor, o cloaker se prende a ela. Enquanto estiver preso, o alvo fica Cego, e o cloaker não pode realizar ataques de Aderir contra outros alvos. Além disso, o cloaker sofre metade do dano (arredondado para baixo), e o alvo sofre a mesma quantidade de dano. O cloaker pode se desprender gastando 5 ft de deslocamento. O alvo ou uma criatura a até 5 ft dele pode usar uma ação para tentar desprender o cloaker, sendo bem-sucedido em um teste de Força (Atletismo) CD 14.", localizedRange: "alcance 5 ft"},
		{creature: "Cloaker", index: 1, name: "Tail", toHit: 6, damage: "8 (1d10 + 3) Slashing damage", description: "Melee Attack Roll: +6, reach 10 ft. Hit: 8 (1d10 + 3) Slashing damage.", localizedName: "Cauda", localizedDamage: "8 (1d10 + 3) de dano cortante", localizedDescription: "Jogada de Ataque Corpo a Corpo: +6, alcance 10 ft. Acerto: 8 (1d10 + 3) de dano cortante.", localizedRange: "alcance 10 ft"},
		{creature: "Constrictor Snake", index: 0, name: "Bite", toHit: 4, damage: "6 (1d8 + 2) Piercing damage", description: "Melee Attack Roll: +4, reach 5 ft. Hit: 6 (1d8 + 2) Piercing damage.", localizedName: "Mordida", localizedDamage: "6 (1d8 + 2) de dano perfurante", localizedDescription: "Jogada de Ataque Corpo a Corpo: +4, alcance 5 ft. Acerto: 6 (1d8 + 2) de dano perfurante.", localizedRange: "alcance 5 ft"},
		{creature: "Constrictor Snake", index: 1, name: "Constrict", damage: "7 (3d4) Bludgeoning damage", description: "Strength Saving Throw: DC 12, one Medium or smaller creature the snake can see within 5 feet. Failure: 7 (3d4) Bludgeoning damage, and the target has the Grappled condition (escape DC 12).", localizedName: "Constrição", localizedDamage: "7 (3d4) de dano contundente", localizedDescription: "Teste de Resistência de Força: CD 12, uma criatura Média ou menor que a cobra possa ver a até 5 ft. Falha: 7 (3d4) de dano contundente, e o alvo fica Agarrado (CD para escapar 12).", localizedRange: "uma criatura Média ou menor que a cobra possa ver a até 5 ft", expectNoToHit: true},
		{creature: "Copper Dragon Wyrmling", index: 0, name: "Rend", toHit: 4, damage: "7 (1d10 + 2) Slashing damage", description: "Melee Attack Roll: +4, reach 5 ft. Hit: 7 (1d10 + 2) Slashing damage.", localizedName: "Dilacerar", localizedDamage: "7 (1d10 + 2) de dano cortante", localizedDescription: "Jogada de Ataque Corpo a Corpo: +4, alcance 5 ft. Acerto: 7 (1d10 + 2) de dano cortante.", localizedRange: "alcance 5 ft"},
		{creature: "Crab", index: 0, name: "Claw", toHit: 2, damage: "1 Bludgeoning damage", description: "Melee Attack Roll: +2, reach 5 ft. Hit: 1 Bludgeoning damage.", localizedName: "Garra", localizedDamage: "1 de dano contundente", localizedDescription: "Jogada de Ataque Corpo a Corpo: +2, alcance 5 ft. Acerto: 1 de dano contundente.", localizedRange: "alcance 5 ft"},
		{creature: "Cultist Fanatic", index: 0, name: "Pact Blade", toHit: 4, damage: "6 (1d8 + 2) Slashing damage plus 7 (2d6) Necrotic damage", description: "Melee Attack Roll: +4, reach 5 ft. Hit: 6 (1d8 + 2) Slashing damage plus 7 (2d6) Necrotic damage.", localizedName: "Lâmina do Pacto", localizedDamage: "6 (1d8 + 2) de dano cortante mais 7 (2d6) de dano necrótico", localizedDescription: "Jogada de Ataque Corpo a Corpo: +4, alcance 5 ft. Acerto: 6 (1d8 + 2) de dano cortante mais 7 (2d6) de dano necrótico.", localizedRange: "alcance 5 ft"},
		{creature: "Darkmantle", index: 0, name: "Crush", toHit: 5, damage: "6 (1d6 + 3) Bludgeoning damage", description: "Melee Attack Roll: +5, reach 5 ft. Hit: 6 (1d6 + 3) Bludgeoning damage, and the darkmantle attaches to the target. If the target is a Medium or smaller creature and the darkmantle had Advantage on the attack roll, it covers the target, which has the Blinded condition and is suffocating while the darkmantle is attached in this way. While attached to a target, the darkmantle can attack only the target but has Advantage on its attack rolls. Its Speed becomes 0, it can’t benefit from any bonus to its Speed, and it moves with the target. A creature can take an action to try to detach the darkmantle from itself, doing so with a successful DC 13 Strength (Athletics) check. On its turn, the darkmantle can detach itself by using 5 feet of movement.", localizedName: "Esmagar", localizedDamage: "6 (1d6 + 3) de dano contundente", localizedDescription: "Jogada de Ataque Corpo a Corpo: +5, alcance 5 ft. Acerto: 6 (1d6 + 3) de dano contundente, e o manto sombrio se prende ao alvo. Se o alvo for uma criatura Média ou menor e o manto sombrio tiver Vantagem na jogada de ataque, ele cobre o alvo, que fica Cego e sufocado enquanto o manto permanecer preso dessa forma. Enquanto estiver preso a um alvo, o manto sombrio só pode atacar esse alvo, mas tem Vantagem nas jogadas de ataque. Seu deslocamento torna-se 0, ele não pode se beneficiar de nenhum bônus de deslocamento e se move junto com o alvo. Uma criatura pode usar uma ação para tentar desprender o manto sombrio de si mesma, sendo bem-sucedida em um teste de Força (Atletismo) CD 13. No próprio turno, o manto sombrio pode se desprender usando 5 ft de deslocamento.", localizedRange: "alcance 5 ft"},
		{creature: "Death Dog", index: 0, name: "Bite", toHit: 4, damage: "4 (1d4 + 2) Piercing damage", description: "Melee Attack Roll: +4, reach 5 ft. Hit: 4 (1d4 + 2) Piercing damage. If the target is a creature, it is subjected to the following effect. Constitution Saving Throw: DC 12. First Failure: The target has the Poisoned condition. While Poisoned, the target’s Hit Point maximum doesn’t return to normal when finishing a Long Rest, and it repeats the save every 24 hours that elapse, ending the effect on itself on a success. Subsequent Failures: The Poisoned target’s Hit Point maximum decreases by 5 (1d10).", localizedName: "Mordida", localizedDamage: "4 (1d4 + 2) de dano perfurante", localizedDescription: "Jogada de Ataque Corpo a Corpo: +4, alcance 5 ft. Acerto: 4 (1d4 + 2) de dano perfurante. Se o alvo for uma criatura, fica sujeito ao seguinte efeito. Teste de Resistência de Constituição: CD 12. Primeira Falha: o alvo fica Envenenado. Enquanto estiver Envenenado, o máximo de Pontos de Vida do alvo não volta ao normal ao concluir um Descanso Longo, e ele repete o teste a cada 24 horas decorridas, encerrando o efeito em si mesmo se for bem-sucedido. Falhas subsequentes: o máximo de Pontos de Vida do alvo diminui em 5 (1d10).", localizedRange: "alcance 5 ft"},
		{creature: "Deva", index: 0, name: "Holy Mace", toHit: 8, damage: "7 (1d6 + 4) Bludgeoning damage plus 18 (4d8) Radiant damage", description: "Melee Attack Roll: +8, reach 5 ft. Hit: 7 (1d6 + 4) Bludgeoning damage plus 18 (4d8) Radiant damage.", localizedName: "Maça Sagrada", localizedDamage: "7 (1d6 + 4) de dano contundente mais 18 (4d8) de dano radiante", localizedDescription: "Jogada de Ataque Corpo a Corpo: +8, alcance 5 ft. Acerto: 7 (1d6 + 4) de dano contundente mais 18 (4d8) de dano radiante.", localizedRange: "alcance 5 ft"},
		{creature: "Djinni", index: 0, name: "Storm Blade", toHit: 9, damage: "12 (2d6 + 5) Slashing damage plus 7 (2d6) Lightning damage", description: "Melee Attack Roll: +9, reach 5 feet. Hit: 12 (2d6 + 5) Slashing damage plus 7 (2d6) Lightning damage.", localizedName: "Lâmina Tempestuosa", localizedDamage: "12 (2d6 + 5) de dano cortante mais 7 (2d6) de dano elétrico", localizedDescription: "Jogada de Ataque Corpo a Corpo: +9, alcance 5 pés. Acerto: 12 (2d6 + 5) de dano cortante mais 7 (2d6) de dano elétrico.", localizedRange: "alcance 5 pés"},
		{creature: "Djinni", index: 1, name: "Storm Bolt", toHit: 9, damage: "13 (3d8) Thunder damage", description: "Ranged Attack Roll: +9, range 120 feet. Hit: 13 (3d8) Thunder damage. If the target is a Large or smaller creature, it has the Prone condition.", localizedName: "Raio Tempestuoso", localizedDamage: "13 (3d8) de dano trovejante", localizedDescription: "Jogada de Ataque à Distância: +9, alcance 120 pés. Acerto: 13 (3d8) de dano trovejante. Se o alvo for uma criatura Grande ou menor, fica Caído.", localizedRange: "alcance 120 pés"},
		{creature: "Draft Horse", index: 0, name: "Hooves", toHit: 6, damage: "6 (1d4 + 4) Bludgeoning damage", description: "Melee Attack Roll: +6, reach 5 ft. Hit: 6 (1d4 + 4) Bludgeoning damage.", localizedName: "Cascos", localizedDamage: "6 (1d4 + 4) de dano contundente", localizedDescription: "Jogada de Ataque Corpo a Corpo: +6, alcance 5 ft. Acerto: 6 (1d4 + 4) de dano contundente.", localizedRange: "alcance 5 ft"},
		{creature: "Dragon Turtle", index: 1, name: "Tail", toHit: 13, damage: "18 (2d10 + 7) Bludgeoning damage", description: "Melee Attack Roll: +13, reach 15 ft. Hit: 18 (2d10 + 7) Bludgeoning damage. If the target is a Huge or smaller creature, it has the Prone condition.", localizedName: "Cauda", localizedDamage: "18 (2d10 + 7) de dano contundente", localizedDescription: "Jogada de Ataque Corpo a Corpo: +13, alcance 15 ft. Acerto: 18 (2d10 + 7) de dano contundente. Se o alvo for uma criatura Imensa ou menor, fica Caído.", localizedRange: "alcance 15 ft"},
	}
	var pack srdPack
	if err := json.Unmarshal(srdPackJSON, &pack); err != nil {
		t.Fatal(err)
	}
	byName := make(map[string]srdEntry)
	for _, entry := range pack.Entries {
		byName[entry.Name] = entry
	}
	for _, test := range want {
		t.Run(test.creature+"/"+test.name, func(t *testing.T) {
			entry, ok := byName[test.creature]
			if !ok {
				t.Fatalf("missing creature %q", test.creature)
			}
			var creatureRules rules
			var translations map[string]string
			if err := json.Unmarshal(entry.Rules, &creatureRules); err != nil {
				t.Fatalf("decode %s rules: %v", test.creature, err)
			}
			if err := json.Unmarshal(entry.Translations, &translations); err != nil {
				t.Fatalf("decode %s translations: %v", test.creature, err)
			}
			if test.index >= len(creatureRules.Actions) {
				t.Fatalf("missing action %s[%d]", test.creature, test.index)
			}
			got := creatureRules.Actions[test.index]
			sourceRange := "reach 5 ft"
			if test.localizedRange == "alcance 10 ft" {
				sourceRange = "reach 10 ft"
			} else if test.localizedRange == "alcance 15 ft" {
				sourceRange = "reach 15 ft"
			} else if test.localizedRange == "alcance 30 ft" {
				sourceRange = "reach 30 ft"
			} else if test.localizedRange == "linha de 30 ft de comprimento e 5 ft de largura" {
				sourceRange = "30-foot-long, 5-foot-wide Line"
			} else if test.localizedRange == "linha de 40 ft de comprimento e 5 ft de largura" {
				sourceRange = "40-foot-long, 5-foot-wide Line"
			} else if strings.HasPrefix(test.localizedRange, "uma criatura Média ou menor") {
				sourceRange = "one Medium or smaller creature the snake can see within 5 ft"
			} else if test.localizedRange == "alcance 5 pés" {
				sourceRange = "reach 5 feet"
			} else if test.localizedRange == "alcance 120 pés" {
				sourceRange = "range 120 feet"
			}
			toHitMatches := (test.expectNoToHit && got.ToHit == nil) || (!test.expectNoToHit && got.ToHit != nil && *got.ToHit == test.toHit)
			if got.Name != test.name || !toHitMatches || got.Range != sourceRange || got.Damage != test.damage || got.Description != test.description {
				t.Errorf("source action = %+v; want name %q, +%d, %s, damage %q and complete SRD description", got, test.name, test.toHit, sourceRange, test.damage)
			}
			prefix := fmt.Sprintf("pt-BR.rules.actions.%d", test.index)
			localizedRange := test.localizedRange
			if localizedRange == "" {
				localizedRange = "alcance 5 ft"
			}
			for field, expected := range map[string]string{
				"name": test.localizedName, "damage": test.localizedDamage,
				"range": localizedRange, "description": test.localizedDescription,
			} {
				if translations[prefix+"."+field] != expected || translations[prefix+"."+field+".source"] != "reviewed" {
					t.Errorf("localized %s = %q (%q), want %q (reviewed)", field, translations[prefix+"."+field], translations[prefix+"."+field+".source"], expected)
				}
			}
		})
	}
}

func TestSRDCreatureActionsAbsentFromOfficialBlocksWereRemoved(t *testing.T) {
	var pack srdPack
	if err := json.Unmarshal(srdPackJSON, &pack); err != nil {
		t.Fatal(err)
	}
	byName := make(map[string]json.RawMessage, len(pack.Entries))
	for _, entry := range pack.Entries {
		byName[entry.Name] = entry.Rules
	}
	removed := map[string][]string{
		"Basilisk": {"Beard"}, "Venomous Snake": {"Hooves"}, "Vulture": {"Hooves"},
		"Allosaurus": {"Tail"}, "Animated Armor": {"Smother"}, "Animated Flying Sword": {"Smother"},
		"Awakened Shrub": {"Slam"}, "Blink Dog": {"Rend"}, "Bone Devil": {"Rend"}, "Brown Bear": {"Scratch"},
		"Bugbear Stalker": {"Grab"}, "Camel": {"Scratch"}, "Cat": {"Claw"}, "Chimera": {"Pincer"}, "Commoner": {"Rend"},
		"Crab": {"Bite", "Ram"}, "Cultist": {"Pact Blade", "Crush"}, "Cultist Fanatic": {"Crush"}, "Deer": {"Hooves", "Bite"},
		"Dire Wolf": {"Hooves", "Talons"}, "Draft Horse": {"Talons", "Gore"},
	}
	removedTranslations := map[string][]string{
		"Basilisk": {"Barba"}, "Venomous Snake": {"Cascos"}, "Vulture": {"Cascos"},
		"Allosaurus": {"Cauda"}, "Animated Armor": {"Sufocar"}, "Animated Flying Sword": {"Sufocar"},
		"Awakened Shrub": {"Pancada"}, "Blink Dog": {"Dilacerar"}, "Bone Devil": {"Dilacerar"}, "Brown Bear": {"Arranhar"},
		"Bugbear Stalker": {"Agarrar"}, "Camel": {"Arranhão"}, "Cat": {"Garra"}, "Chimera": {"Pinça"}, "Commoner": {"Dilacerar"},
		"Crab": {"Mordida", "Investida"}, "Cultist": {"Lâmina do Pacto", "Esmagar"}, "Cultist Fanatic": {"Esmagar"}, "Deer": {"Cascos", "Mordida"},
		"Dire Wolf": {"Cascos", "Garras"}, "Draft Horse": {"Garras", "Chifrada"},
	}
	for creature, actionNames := range removed {
		t.Run(creature, func(t *testing.T) {
			var rules struct {
				Actions []struct {
					Name string `json:"name"`
				} `json:"actions"`
			}
			if err := json.Unmarshal(byName[creature], &rules); err != nil {
				t.Fatal(err)
			}
			for _, removedName := range actionNames {
				for _, action := range rules.Actions {
					if action.Name == removedName {
						t.Errorf("action %q remains in %s", removedName, creature)
					}
				}
			}
			var entry srdEntry
			for _, candidate := range pack.Entries {
				if candidate.EntryType == "other" && candidate.Name == creature {
					entry = candidate
					break
				}
			}
			var translations map[string]string
			if err := json.Unmarshal(entry.Translations, &translations); err != nil {
				t.Fatal(err)
			}
			for key, value := range translations {
				if strings.HasPrefix(key, "pt-BR.rules.actions.") && strings.HasSuffix(key, ".name") {
					for _, removedName := range removedTranslations[creature] {
						if value == removedName {
							t.Errorf("localized removed action %q remains at %s", value, key)
						}
					}
				}
			}
		})
	}
}

func pendingCreatureActionTargets(t *testing.T) map[string]bool {
	t.Helper()
	manifestPath := filepath.Join("..", "..", "..", "docs", "SRD_5_2_1_CREATURE_ACTION_SOURCE_AUDIT.md")
	manifest, err := os.ReadFile(manifestPath)
	if err != nil {
		t.Fatalf("read action audit manifest: %v", err)
	}
	rowPattern := regexp.MustCompile("(?m)^\\| `other:(.+)\\.rules\\.actions\\.(\\d+)` \\|.*\\| (pendente — texto preservado, sem reviewed|verificado — removido|verificado — restaurado) \\|")
	rows := rowPattern.FindAllStringSubmatch(string(manifest), -1)
	if len(rows) != 187 {
		t.Fatalf("action audit manifest rows = %d, want 187", len(rows))
	}
	pending := make(map[string]bool)
	verifiedRemoved := 0
	verifiedRestored := 0
	for _, row := range rows {
		if row[3] == "verificado — removido" {
			verifiedRemoved++
			continue
		}
		if row[3] == "verificado — restaurado" {
			verifiedRestored++
			continue
		}
		pending[fmt.Sprintf("%s|%s", row[1], row[2])] = true
	}
	if len(pending) != 99 || verifiedRemoved != 24 || verifiedRestored != 64 {
		t.Fatalf("action audit states = %d pending, %d verified/removed, %d verified/restored; want 99, 24 and 64", len(pending), verifiedRemoved, verifiedRestored)
	}
	return pending
}

func stripTranslations(value any) {
	switch node := value.(type) {
	case map[string]any:
		delete(node, "translations")
		if node["entryType"] == "other" {
			if rules, ok := node["rules"].(map[string]any); ok && rules["catalog"] == "magic-item" {
				delete(rules, "description")
			}
		}
		for _, child := range node {
			stripTranslations(child)
		}
	case []any:
		for _, child := range node {
			stripTranslations(child)
		}
	}
}

func TestSRDSpeciesAndBackgroundTranslationsAreReviewedWithoutChangingRules(t *testing.T) {
	type projection struct {
		EntryType string `json:"entryType"`
		Name      string `json:"name"`
		Summary   string `json:"summary"`
		Rules     any    `json:"rules"`
	}
	var sourcePack srdPack
	if err := json.Unmarshal(srdPackJSON, &sourcePack); err != nil {
		t.Fatal(err)
	}
	counts := map[string]int{}
	projected := make([]projection, 0, len(sourcePack.Entries))
	for _, entry := range sourcePack.Entries {
		var rules map[string]any
		if err := json.Unmarshal(entry.Rules, &rules); err != nil {
			t.Fatalf("%s %q rules: %v", entry.EntryType, entry.Name, err)
		}
		if entry.EntryType == "other" && rules["catalog"] == "magic-item" {
			delete(rules, "description")
		}
		projected = append(projected, projection{EntryType: entry.EntryType, Name: entry.Name, Summary: entry.Summary, Rules: rules})
		if entry.EntryType != "species" && entry.EntryType != "background" {
			continue
		}
		counts[entry.EntryType]++
		translations := map[string]string{}
		if err := json.Unmarshal(entry.Translations, &translations); err != nil {
			t.Fatalf("%s %q translations: %v", entry.EntryType, entry.Name, err)
		}
		checkReviewed := func(key string) {
			t.Helper()
			if strings.TrimSpace(translations[key]) == "" || translations[key+".source"] != "reviewed" {
				t.Errorf("%s %q field %s is missing reviewed PT-BR text", entry.EntryType, entry.Name, key)
			}
		}
		for _, key := range []string{"pt-BR", "pt-BR.summary", "pt-BR.rules.name", "pt-BR.rules.description"} {
			checkReviewed(key)
		}
		if entry.EntryType == "species" {
			traits, _ := rules["traits"].([]any)
			for index, raw := range traits {
				for _, field := range []string{"name", "description"} {
					checkReviewed(fmt.Sprintf("pt-BR.rules.traits.%d.%s", index, field))
				}
				if trait, ok := raw.(map[string]any); !ok || strings.TrimSpace(fmt.Sprint(trait["id"])) == "" {
					t.Errorf("%s %q trait %d lost its mechanical ID", entry.EntryType, entry.Name, index)
				}
			}
		} else {
			for _, field := range []string{"skillProficiencies", "startingEquipment"} {
				values, _ := rules[field].([]any)
				for index := range values {
					checkReviewed(fmt.Sprintf("pt-BR.rules.%s.%d", field, index))
				}
			}
			for _, field := range []string{"toolProficiency", "feat"} {
				checkReviewed("pt-BR.rules." + field)
			}
		}
	}
	if counts["species"] != 9 || counts["background"] != 16 {
		t.Fatalf("SRD species/background inventory = %v, want 9 species and 16 backgrounds", counts)
	}
	mechanicsJSON, err := json.Marshal(projected)
	if err != nil {
		t.Fatal(err)
	}
	mechanicsHash := sha256.Sum256(mechanicsJSON)
	if got := hex.EncodeToString(mechanicsHash[:]); got != "43f5fbd271026ca81ad0704921807b442c6c1d8cab8c6e4032f9aa1a625c621c" {
		t.Fatalf("non-translation package content changed: projection digest %s", got)
	}
}

func TestSRDConditionTranslationsAreCompleteAndReviewed(t *testing.T) {
	pack, err := loadSRDPack()
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]string{
		"Blinded": "Cego", "Charmed": "Enfeitiçado", "Deafened": "Surdo",
		"Exhaustion": "Exaustão", "Frightened": "Amedrontado", "Grappled": "Agarrado",
		"Incapacitated": "Incapacitado", "Invisible": "Invisível", "Paralyzed": "Paralisado",
		"Petrified": "Petrificado", "Poisoned": "Envenenado", "Prone": "Caído",
		"Restrained": "Impedido", "Stunned": "Atordoado", "Unconscious": "Inconsciente",
	}
	found := map[string]bool{}
	for _, entry := range pack.Entries {
		var rules map[string]any
		if err := json.Unmarshal(entry.Rules, &rules); err != nil {
			t.Fatalf("decode %s rules: %v", entry.Name, err)
		}
		if entry.EntryType != "other" || rules["catalog"] != "conditions" {
			continue
		}
		name, ok := want[entry.Name]
		if !ok {
			t.Errorf("unexpected condition entry: %q", entry.Name)
			continue
		}
		found[entry.Name] = true
		translations := decodeTranslations(entry.Translations)
		for _, key := range []string{"pt-BR", "pt-BR.summary", "pt-BR.rules.name", "pt-BR.rules.description"} {
			if strings.TrimSpace(translations[key]) == "" || translations[key+".source"] != "reviewed" {
				t.Errorf("%s %s is absent or not reviewed", entry.Name, key)
			}
		}
		if translations["pt-BR"] != name || translations["pt-BR.rules.name"] != name {
			t.Errorf("%s localized name/rules.name = %q/%q, want %q", entry.Name, translations["pt-BR"], translations["pt-BR.rules.name"], name)
		}
		if effects, ok := rules["effects"].([]any); ok {
			for index := range effects {
				key := fmt.Sprintf("pt-BR.rules.effects.%d", index)
				if strings.TrimSpace(translations[key]) == "" || translations[key+".source"] != "reviewed" {
					t.Errorf("%s %s is absent or not reviewed", entry.Name, key)
				}
			}
		}
		if _, exists := rules["notes"]; exists {
			if translations["pt-BR.rules.notes"] == "" || translations["pt-BR.rules.notes.source"] != "reviewed" {
				t.Errorf("%s notes translation is absent or not reviewed", entry.Name)
			}
		}
	}
	if len(found) != len(want) {
		missing := make([]string, 0)
		for name := range want {
			if !found[name] {
				missing = append(missing, name)
			}
		}
		sort.Strings(missing)
		t.Fatalf("condition entries = %d, want %d; missing %v", len(found), len(want), missing)
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

func TestSRDOwnerSpellTitleChoicesAreApplied(t *testing.T) {
	pack, err := loadSRDPack()
	if err != nil {
		t.Fatal(err)
	}

	wantTitles := map[string]string{
		"Bestow Curse": "Rogar Maldição",
		"Geas":         "Geas",
		"Harm":         "Ferir",
		"Hallow":       "Consagrar",
		"Flame Strike": "Golpe Flamejante",
	}
	wantDescriptionTerms := map[string][]string{
		"Animate Objects": {"Ação — Impacto."},
		"Find Steed":      {"Impacto Sobrenatural", "Olhar Cruel"},
	}

	for _, entry := range pack.Entries {
		if entry.EntryType != "spell" {
			continue
		}
		translations := decodeTranslations(entry.Translations)
		if want := wantTitles[entry.Name]; want != "" {
			if got := translations["pt-BR"]; got != want {
				t.Errorf("%s title = %q, want %q", entry.Name, got, want)
			}
			if got := translations["pt-BR.source"]; got != "reviewed" {
				t.Errorf("%s title source = %q, want reviewed", entry.Name, got)
			}
			delete(wantTitles, entry.Name)
		}
		if terms := wantDescriptionTerms[entry.Name]; len(terms) > 0 {
			description := translations["pt-BR.rules.description"]
			for _, term := range terms {
				if !strings.Contains(description, term) {
					t.Errorf("%s localized description missing %q", entry.Name, term)
				}
			}
			delete(wantDescriptionTerms, entry.Name)
		}
	}
	if len(wantTitles) > 0 {
		t.Errorf("missing spell title translations: %v", wantTitles)
	}
	if len(wantDescriptionTerms) > 0 {
		t.Errorf("missing spell descriptions: %v", wantDescriptionTerms)
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

func TestSRDClassFeatFeatureCoreTranslationCoverage(t *testing.T) {
	pack, err := loadSRDPack()
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]int{"class": 12, "subclass": 19, "feat": 47, "feature": 18}
	got := map[string]int{}
	wantTitles := map[string]string{
		"Ability Score Improvement":    "Aumento no Valor de Habilidade",
		"Boon of Combat Prowess":       "Pacto da Proeza em Combate",
		"Boon of Dimensional Travel":   "Pacto da Viagem Dimensional",
		"Boon of Fate":                 "Pacto do Destino",
		"Boon of Irresistible Offense": "Pacto do Ataque Irresistível",
		"Boon of Spell Recall":         "Pacto da Recuperação de Magia",
		"Boon of the Night Spirit":     "Pacto do Espírito da Noite",
		"Boon of Truesight":            "Pacto da Visão Verdadeira",
		"College of Glamour":           "Colégio do Glamour",
		"Animal Handling":              "Adestrar Animais",
	}
	classFeatures, subclassFeatures, featBenefits := 0, 0, 0
	for _, entry := range uniqueEntries(pack.Entries) {
		if _, included := want[entry.EntryType]; !included {
			continue
		}
		var rules map[string]any
		if err := json.Unmarshal(entry.Rules, &rules); err != nil {
			t.Fatalf("decode %s rules: %v", entry.Name, err)
		}
		if len(rules) == 0 {
			continue // Ignore the legacy name-only index appended by loadSRDPack.
		}
		got[entry.EntryType]++
		translations := decodeTranslations(entry.Translations)
		if want := wantTitles[entry.Name]; want != "" && translations["pt-BR"] != want {
			t.Errorf("%s title = %q, want %q", entry.Name, translations["pt-BR"], want)
		}
		for _, key := range []string{"pt-BR", "pt-BR.summary", "pt-BR.rules.description"} {
			if strings.TrimSpace(translations[key]) == "" || translations[key+".source"] != "reviewed" {
				t.Errorf("%s %s is missing or not reviewed", entry.Name, key)
			}
		}
		if _, exists := rules["name"]; exists {
			if translations["pt-BR.rules.name"] != translations["pt-BR"] || translations["pt-BR.rules.name.source"] != "reviewed" {
				t.Errorf("%s rules.name localization is missing or not reviewed", entry.Name)
			}
		} else if _, exists := translations["pt-BR.rules.name"]; exists {
			t.Errorf("%s has a rules.name localization absent from source", entry.Name)
		}
		if entry.EntryType == "class" || entry.EntryType == "subclass" {
			rawFeatures, exists := rules["features"]
			if !exists {
				continue
			}
			features, ok := rawFeatures.([]any)
			if !ok {
				t.Errorf("%s rules.features has type %T", entry.Name, rawFeatures)
				continue
			}
			for index, rawFeature := range features {
				feature, ok := rawFeature.(map[string]any)
				if !ok {
					t.Errorf("%s feature %d has type %T", entry.Name, index, rawFeature)
					continue
				}
				for _, field := range []string{"name", "description"} {
					if _, exists := feature[field]; !exists {
						continue
					}
					key := fmt.Sprintf("pt-BR.rules.features.%d.%s", index, field)
					if strings.TrimSpace(translations[key]) == "" || translations[key+".source"] != "reviewed" {
						t.Errorf("%s %s is missing or not reviewed", entry.Name, key)
					}
					if field == "name" && feature[field] == "Pact Boon" && translations[key] != "Dádiva do Pacto" {
						t.Errorf("Pact Boon localized title = %q, want Dádiva do Pacto", translations[key])
					}
				}
				if entry.EntryType == "class" {
					classFeatures++
				} else {
					subclassFeatures++
				}
			}
		}
		if entry.EntryType == "feat" {
			if rawBenefits, exists := rules["benefits"]; exists {
				benefits, ok := rawBenefits.([]any)
				if !ok {
					t.Errorf("%s rules.benefits has type %T", entry.Name, rawBenefits)
					continue
				}
				for index := range benefits {
					key := fmt.Sprintf("pt-BR.rules.benefits.%d", index)
					if strings.TrimSpace(translations[key]) == "" || translations[key+".source"] != "reviewed" {
						t.Errorf("%s %s is missing or not reviewed", entry.Name, key)
					}
					featBenefits++
				}
			}
		}
	}
	for entryType, count := range want {
		if got[entryType] != count {
			t.Errorf("%s count = %d, want %d", entryType, got[entryType], count)
		}
	}
	if classFeatures != 62 || subclassFeatures != 86 || featBenefits != 120 {
		t.Errorf("nested localized content counts: class features=%d subclass features=%d feat benefits=%d", classFeatures, subclassFeatures, featBenefits)
	}
}

func TestSRDLocalizationBatchPreservesAllSourceAndMechanicalFields(t *testing.T) {
	pack, err := loadSRDPack()
	if err != nil {
		t.Fatal(err)
	}
	type sourceRecord struct {
		EntryType string          `json:"entryType"`
		Name      string          `json:"name"`
		Summary   string          `json:"summary"`
		Rules     json.RawMessage `json:"rules"`
	}
	entries := uniqueEntries(pack.Entries)
	records := make([]sourceRecord, 0, len(entries))
	for _, entry := range entries {
		var rules map[string]any
		if err := json.Unmarshal(entry.Rules, &rules); err != nil {
			t.Fatalf("decode %s rules: %v", entry.Name, err)
		}
		if entry.EntryType == "other" && rules["catalog"] == "magic-item" {
			delete(rules, "description")
		}
		mechanicsRules, err := json.Marshal(rules)
		if err != nil {
			t.Fatalf("marshal %s rules: %v", entry.Name, err)
		}
		records = append(records, sourceRecord{
			EntryType: entry.EntryType,
			Name:      entry.Name,
			Summary:   entry.Summary,
			Rules:     mechanicsRules,
		})
	}
	sort.Slice(records, func(i, j int) bool {
		if records[i].EntryType != records[j].EntryType {
			return records[i].EntryType < records[j].EntryType
		}
		return records[i].Name < records[j].Name
	})
	data, err := json.Marshal(records)
	if err != nil {
		t.Fatal(err)
	}
	digest := sha256.Sum256(data)
	const wantSourceDigest = "393385985b66dcdcc462ac66e5482f22eb725eb6994b601f5c725b4d8c6024a3"
	if got := hex.EncodeToString(digest[:]); got != wantSourceDigest {
		t.Fatalf("source/mechanical snapshot changed: SHA-256 = %s", got)
	}
}

func TestSRDFirstLevelSpellTranslationsAreCompleteAndReviewed(t *testing.T) {
	pack, err := loadSRDPack()
	if err != nil {
		t.Fatal(err)
	}
	spells, names, sourceDescriptions, localizedDescriptions := 0, 0, 0, 0
	for _, entry := range pack.Entries {
		if entry.EntryType != "spell" {
			continue
		}
		var rules map[string]any
		if err := json.Unmarshal(entry.Rules, &rules); err != nil {
			t.Fatalf("decode %s rules: %v", entry.Name, err)
		}
		if rules["level"] != float64(1) {
			continue
		}
		spells++
		translations := decodeTranslations(entry.Translations)
		for _, key := range []string{"pt-BR", "pt-BR.summary"} {
			if translations[key] == "" || translations[key] == entry.Name || translations[key+".source"] != "reviewed" {
				t.Errorf("%s %s is missing, still English, or not reviewed: %v", entry.Name, key, translations)
			}
		}
		if _, exists := rules["name"]; exists {
			names++
			if translations["pt-BR.rules.name"] != translations["pt-BR"] || translations["pt-BR.rules.name.source"] != "reviewed" {
				t.Errorf("%s rules.name localization is missing or not reviewed", entry.Name)
			}
		} else if _, exists := translations["pt-BR.rules.name"]; exists {
			t.Errorf("%s has a localization for rules.name that is absent from the source", entry.Name)
		}
		if _, exists := rules["description"]; exists {
			sourceDescriptions++
		}
		if translations["pt-BR.rules.description"] == "" || translations["pt-BR.rules.description.source"] != "reviewed" {
			t.Errorf("%s rules.description localization is missing or not reviewed", entry.Name)
		} else {
			localizedDescriptions++
		}
	}
	if spells != 57 || names != 19 || sourceDescriptions != 19 || localizedDescriptions != 57 {
		t.Fatalf("first-level spell coverage = %d spells, %d rules.name fields, %d source descriptions, %d localized descriptions; want 57, 19, 19, 57", spells, names, sourceDescriptions, localizedDescriptions)
	}
}

func TestSRDFirstLevelSpellSourceAndMechanicsRemainUnchanged(t *testing.T) {
	pack, err := loadSRDPack()
	if err != nil {
		t.Fatal(err)
	}
	rows := make([]map[string]any, 0, 57)
	for _, entry := range pack.Entries {
		if entry.EntryType != "spell" {
			continue
		}
		var rules map[string]any
		if err := json.Unmarshal(entry.Rules, &rules); err != nil {
			t.Fatalf("decode %s rules: %v", entry.Name, err)
		}
		if rules["level"] != float64(1) {
			continue
		}
		delete(rules, "mechanicsAudit")
		delete(rules, "damage")
		delete(rules, "scaling")
		rows = append(rows, map[string]any{"name": entry.Name, "summary": entry.Summary, "rules": rules})
	}
	encoded, err := json.Marshal(rows)
	if err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256(encoded)
	const want = "0ecb77d229853a15ffecd3e234c89f60cd2c53148fa250ec224e23d48b934754"
	if got := hex.EncodeToString(sum[:]); got != want {
		t.Fatalf("first-level source/mechanics digest = %s, want unchanged digest %s", got, want)
	}
}

func TestSRDCantripAndFirstLevelMechanicsAreAudited(t *testing.T) {
	pack, err := loadSRDPack()
	if err != nil {
		t.Fatal(err)
	}
	counts := map[string]int{"spells": 0, "damage": 0, "noDamage": 0, "scaling": 0, "noScaling": 0}
	levels := map[int]int{}
	spellNames := map[string]map[string]any{}
	for _, entry := range pack.Entries {
		if entry.EntryType != "spell" {
			continue
		}
		var rules map[string]any
		if err := json.Unmarshal(entry.Rules, &rules); err != nil {
			t.Fatalf("decode %s rules: %v", entry.Name, err)
		}
		level, ok := rules["level"].(float64)
		if !ok || level < 0 || level > 9 {
			if _, audited := rules["mechanicsAudit"]; audited {
				t.Errorf("out-of-scope spell %s was marked audited", entry.Name)
			}
			continue
		}
		if level > 9 {
			if _, audited := rules["mechanicsAudit"]; audited {
				t.Errorf("out-of-scope spell %s was marked audited", entry.Name)
			}
			continue
		}
		if level > 1 {
			continue
		}
		counts["spells"]++
		levels[int(level)]++
		spellNames[entry.Name] = rules
		translations := decodeTranslations(entry.Translations)
		for _, key := range []string{"pt-BR", "pt-BR.summary", "pt-BR.rules.description"} {
			if strings.TrimSpace(translations[key]) == "" || translations[key+".source"] != "reviewed" {
				t.Errorf("%s %s translation is absent or not reviewed", entry.Name, key)
			}
		}
		audit, ok := rules["mechanicsAudit"].(map[string]any)
		if !ok || audit["status"] != "reviewed" || audit["source"] != "D&D SRD 5.2.1" {
			t.Errorf("%s lacks reviewed SRD 5.2.1 mechanics provenance: %#v", entry.Name, rules["mechanicsAudit"])
		}
		if rules["damage"] == nil {
			counts["noDamage"]++
		} else {
			counts["damage"]++
			damage, ok := rules["damage"].(map[string]any)
			components, componentsOK := damage["components"].([]any)
			if !ok || !componentsOK || len(components) == 0 {
				t.Errorf("%s has untyped damage data: %#v", entry.Name, rules["damage"])
			} else {
				for _, raw := range components {
					component, ok := raw.(map[string]any)
					if !ok || strings.TrimSpace(fmt.Sprint(component["formula"])) == "" || strings.TrimSpace(fmt.Sprint(component["type"])) == "" {
						t.Errorf("%s has a damage component without formula or type: %#v", entry.Name, raw)
						continue
					}
					formula := fmt.Sprint(component["formula"])
					if dice := regexp.MustCompile(`\d+d\d+`).FindString(formula); dice != "" && !strings.Contains(strings.ToLower(translations["pt-BR.rules.description"]), strings.ToLower(dice)) {
						t.Errorf("%s damage formula %q is absent from its localized description", entry.Name, formula)
					}
				}
			}
		}
		if rules["scaling"] == nil {
			counts["noScaling"]++
		} else {
			counts["scaling"]++
			scaling, ok := rules["scaling"].(map[string]any)
			if !ok || (scaling["characterLevel"] == nil && scaling["spellSlot"] == nil) {
				t.Errorf("%s has untyped or empty scaling data: %#v", entry.Name, rules["scaling"])
			}
		}
	}
	if counts["spells"] != 85 || levels[0] != 28 || levels[1] != 57 {
		t.Fatalf("audited spell coverage = %d total (%d cantrips, %d first-level), want 85 (28, 57)", counts["spells"], levels[0], levels[1])
	}
	if counts["damage"] != 31 || counts["noDamage"] != 54 || counts["scaling"] != 45 || counts["noScaling"] != 40 {
		t.Fatalf("damage/scaling applicability = damage %d, no damage %d, scaling %d, no scaling %d; want 31, 54, 45, 40", counts["damage"], counts["noDamage"], counts["scaling"], counts["noScaling"])
	}

	wantDamage := map[string]string{
		"Acid Splash": "1d6|acid", "Acid SplASh": "1d6|acid", "Chill Touch": "1d10|necrotic",
		"Eldritch Blast": "1d10|force|per-beam", "Fire Bolt": "1d10|fire", "Poison Spray": "1d12|poison",
		"Produce Flame": "1d8|fire", "Ray of Frost": "1d8|cold", "Sacred Flame": "1d8|radiant",
		"Shillelagh": "d8|varies|types=force,weapon-normal", "Shocking Grasp": "1d8|lightning",
		"Sorcerous Burst": "1d8|varies|types=acid,cold,fire,lightning,poison,psychic,thunder|explode=d8:8:spellcasting-ability-modifier",
		"Starry Wisp":     "1d8|radiant", "True Strike": "weapon damage|varies|types=radiant,weapon-normal", "Vicious Mockery": "1d6|psychic",
		"Burning Hands": "3d6|fire", "Chromatic Orb": "3d8|varies|types=acid,cold,fire,lightning,poison,thunder",
		"Dissonant Whispers": "3d6|psychic", "Divine Favor": "1d4|radiant|weapon-hit",
		"Divine Smite": "2d8|radiant|extra=1d8|radiant|fiend-or-undead", "Ensnaring Strike": "1d6|piercing|restrained-start-of-turn",
		"Guiding Bolt": "4d6|radiant", "Hellish Rebuke": "2d10|fire", "Hex": "1d6|necrotic|attack-hit",
		"Hunter’s Mark": "1d6|force|attack-hit", "Ice Knife": "1d10|piercing|attack-hit;2d6|cold|burst-save-fail",
		"Inflict Wounds": "2d10|necrotic", "Magic Missile": "1d4+1|force|instances=3|automatic-hit",
		"Ray of Sickness": "2d8|poison", "Searing Smite": "1d6|fire|weapon-hit;1d6|fire|start-of-turn", "Thunderwave": "2d8|thunder",
	}
	for name, want := range wantDamage {
		rules, ok := spellNames[name]
		if !ok {
			t.Errorf("missing damage spell %q", name)
			continue
		}
		if got := spellDamageSignature(t, name, rules["damage"]); got != want {
			t.Errorf("%s damage = %q, want %q", name, got, want)
		}
	}

	wantCharacterLevels := map[string]string{
		"Acid Splash":     "5:damage-formula:2d6:acid;11:damage-formula:3d6:acid;17:damage-formula:4d6:acid",
		"Acid SplASh":     "5:damage-formula:2d6:acid;11:damage-formula:3d6:acid;17:damage-formula:4d6:acid",
		"Chill Touch":     "5:damage-formula:2d10:necrotic;11:damage-formula:3d10:necrotic;17:damage-formula:4d10:necrotic",
		"Eldritch Blast":  "5:beam-count:2;11:beam-count:3;17:beam-count:4",
		"Fire Bolt":       "5:damage-formula:2d10:fire;11:damage-formula:3d10:fire;17:damage-formula:4d10:fire",
		"Poison Spray":    "5:damage-formula:2d12:poison;11:damage-formula:3d12:poison;17:damage-formula:4d12:poison",
		"Produce Flame":   "5:damage-formula:2d8:fire;11:damage-formula:3d8:fire;17:damage-formula:4d8:fire",
		"Ray of Frost":    "5:damage-formula:2d8:cold;11:damage-formula:3d8:cold;17:damage-formula:4d8:cold",
		"Sacred Flame":    "5:damage-formula:2d8:radiant;11:damage-formula:3d8:radiant;17:damage-formula:4d8:radiant",
		"Shillelagh":      "5:weapon-damage-die:d10;11:weapon-damage-die:d12;17:weapon-damage-die:2d6",
		"Shocking Grasp":  "5:damage-formula:2d8:lightning;11:damage-formula:3d8:lightning;17:damage-formula:4d8:lightning",
		"Sorcerous Burst": "5:damage-formula:2d8:varies;11:damage-formula:3d8:varies;17:damage-formula:4d8:varies",
		"Spare the Dying": "5:range-feet:30;11:range-feet:60;17:range-feet:120",
		"Starry Wisp":     "5:damage-formula:2d8:radiant;11:damage-formula:3d8:radiant;17:damage-formula:4d8:radiant",
		"True Strike":     "5:extra-damage:1d6:radiant;11:extra-damage:2d6:radiant;17:extra-damage:3d6:radiant",
		"Vicious Mockery": "5:damage-formula:2d6:psychic;11:damage-formula:3d6:psychic;17:damage-formula:4d6:psychic",
	}
	for name, want := range wantCharacterLevels {
		if got := spellCharacterScalingSignature(t, name, spellNames[name]["scaling"]); got != want {
			t.Errorf("%s character-level scaling = %q, want %q", name, got, want)
		}
	}
	wantSlotNames := []string{"Animal Friendship", "Bane", "Bless", "Burning Hands", "Charm Person", "Chromatic Orb", "Command", "Create or Destroy Water", "Cure Wounds", "Dissonant Whispers", "Divine Smite", "Ensnaring Strike", "False Life", "Fog Cloud", "Guiding Bolt", "Healing Word", "Hellish Rebuke", "Heroism", "Hex", "Hideous Laughter", "Hunter’s Mark", "Ice Knife", "Inflict Wounds", "Jump", "Longstrider", "Magic Missile", "Ray of Sickness", "Searing Smite", "Thunderwave"}
	wantSlotSignatures := map[string]string{
		"Animal Friendship": "2:additional-targets:1:1:Beast", "Bane": "2:additional-targets:1:1", "Bless": "2:additional-targets:1:1",
		"Burning Hands": "2:damage-increase:1:1d6:fire", "Charm Person": "2:additional-targets:1:1",
		"Chromatic Orb": "2:damage-increase:1:1d8:varies;2:maximum-leaps-equals-slot-level",
		"Command":       "2:additional-targets:1:1", "Create or Destroy Water": "2:water-volume-or-cube-size:1:10:5:one-mode",
		"Cure Wounds": "2:healing-increase:1:2d8", "Dissonant Whispers": "2:damage-increase:1:1d6:psychic",
		"Divine Smite": "2:damage-increase:1:1d8:radiant", "Ensnaring Strike": "2:damage-increase:1:1d6:piercing",
		"False Life": "2:temporary-hit-points-increase:1:5", "Fog Cloud": "2:radius-increase:1:20",
		"Guiding Bolt": "2:damage-increase:1:1d6:radiant", "Healing Word": "2:healing-increase:1:2d4",
		"Hellish Rebuke": "2:damage-increase:1:1d10:fire", "Heroism": "2:additional-targets:1:1",
		"Hex":              "2:duration-tier:4 hours;3:duration-tier:8 hours;5:duration-tier:24 hours",
		"Hideous Laughter": "2:additional-targets:1:1", "Hunter’s Mark": "3:duration-tier:8 hours;5:duration-tier:24 hours",
		"Ice Knife": "2:damage-increase:1:1d6:cold:burst-save-fail", "Inflict Wounds": "2:damage-increase:1:1d10:necrotic",
		"Jump": "2:additional-targets:1:1", "Longstrider": "2:additional-targets:1:1",
		"Magic Missile": "2:additional-instances:1:force:1:1d4+1", "Ray of Sickness": "2:damage-increase:1:1d8:poison",
		"Searing Smite": "2:damage-increase-all-components:1:1d6:fire", "Thunderwave": "2:damage-increase:1:1d8:thunder",
	}
	gotSlotNames := []string{}
	for name, rules := range spellNames {
		scaling, _ := rules["scaling"].(map[string]any)
		if slot, ok := scaling["spellSlot"].(map[string]any); ok {
			gotSlotNames = append(gotSlotNames, name)
			if slot["baseLevel"] != float64(1) {
				t.Errorf("%s slot scaling base level = %v, want 1", name, slot["baseLevel"])
			}
			if got, want := spellSlotScalingSignature(t, name, slot["effects"]), wantSlotSignatures[name]; got != want {
				t.Errorf("%s slot scaling = %q, want %q", name, got, want)
			}
		}
	}
	sort.Strings(gotSlotNames)
	sort.Strings(wantSlotNames)
	if strings.Join(gotSlotNames, ",") != strings.Join(wantSlotNames, ",") {
		t.Errorf("spell-slot scaling names = %v, want %v", gotSlotNames, wantSlotNames)
	}
	for _, name := range []string{"Hex", "Hunter’s Mark", "Magic Missile", "Create or Destroy Water", "Cure Wounds", "Ice Knife", "Chromatic Orb", "Searing Smite"} {
		if signature := spellSlotScalingSignature(t, name, spellNames[name]["scaling"].(map[string]any)["spellSlot"].(map[string]any)["effects"]); signature == "" {
			t.Errorf("%s slot scaling lacks typed effect data", name)
		}
	}
}

func TestSRDSecondThroughSixthLevelSpellTranslationsAreReviewed(t *testing.T) {
	pack, err := loadSRDPack()
	if err != nil {
		t.Fatal(err)
	}
	levels := map[int]int{}
	counts := map[string]int{"damage": 0, "noDamage": 0, "scaling": 0, "noScaling": 0}
	count := 0
	for _, entry := range pack.Entries {
		if entry.EntryType != "spell" {
			continue
		}
		var rules map[string]any
		if err := json.Unmarshal(entry.Rules, &rules); err != nil {
			t.Fatalf("decode %s rules: %v", entry.Name, err)
		}
		level, ok := rules["level"].(float64)
		if !ok || level < 2 || level > 6 {
			continue
		}
		count++
		levels[int(level)]++
		translations := decodeTranslations(entry.Translations)
		for _, key := range []string{"pt-BR", "pt-BR.summary", "pt-BR.rules.description"} {
			if strings.TrimSpace(translations[key]) == "" || translations[key+".source"] != "reviewed" {
				t.Errorf("%s %s translation is absent or not reviewed", entry.Name, key)
			}
		}
		if _, exists := translations["pt-BR.rules.name"]; exists && translations["pt-BR.rules.name.source"] != "reviewed" {
			t.Errorf("%s rules.name translation is not reviewed", entry.Name)
		}
		audit, ok := rules["mechanicsAudit"].(map[string]any)
		if !ok || audit["status"] != "reviewed" || audit["source"] != "D&D SRD 5.2.1" {
			t.Errorf("%s mechanics were not audited against the SRD: %#v", entry.Name, rules["mechanicsAudit"])
		}
		if rules["damage"] == nil {
			counts["noDamage"]++
		} else {
			counts["damage"]++
			damage, ok := rules["damage"].(map[string]any)
			components, componentsOK := damage["components"].([]any)
			if !ok || !componentsOK || len(components) == 0 {
				t.Errorf("%s has untyped damage data: %#v", entry.Name, rules["damage"])
			}
		}
		if rules["scaling"] == nil {
			counts["noScaling"]++
		} else {
			counts["scaling"]++
			scaling, ok := rules["scaling"].(map[string]any)
			slot, slotOK := scaling["spellSlot"].(map[string]any)
			if !ok || !slotOK || slot["baseLevel"] != level {
				t.Errorf("%s has malformed spell-slot scaling: %#v", entry.Name, rules["scaling"])
				continue
			}
			effects, effectsOK := slot["effects"].([]any)
			if !effectsOK || len(effects) == 0 {
				t.Errorf("%s spell-slot scaling has no effects", entry.Name)
				continue
			}
			for _, raw := range effects {
				effect, ok := raw.(map[string]any)
				if !ok || effect["kind"] != "rule-text" || effect["fromSlotLevel"] != level+1 {
					t.Errorf("%s has untyped or incorrectly thresholded slot scaling: %#v", entry.Name, raw)
					continue
				}
				text, ok := effect["text"].(map[string]any)
				if !ok || strings.TrimSpace(fmt.Sprint(text["en"])) == "" || strings.TrimSpace(fmt.Sprint(text["ptBR"])) == "" {
					t.Errorf("%s slot scaling lacks source and PT-BR text: %#v", entry.Name, effect["text"])
				} else if !strings.Contains(translations["pt-BR.rules.description"], fmt.Sprint(text["ptBR"])) {
					t.Errorf("%s typed PT-BR slot effect is absent from its localized description", entry.Name)
				}
			}
		}
	}
	wantLevels := map[int]int{2: 56, 3: 42, 4: 34, 5: 38, 6: 31}
	if count != 201 {
		t.Fatalf("reviewed spell translations = %d, want 201", count)
	}
	for level, want := range wantLevels {
		if levels[level] != want {
			t.Errorf("level %d reviewed spell translations = %d, want %d", level, levels[level], want)
		}
	}
	if counts["damage"] != 63 || counts["noDamage"] != 138 || counts["scaling"] != 76 || counts["noScaling"] != 125 {
		t.Fatalf("level 2–6 applicability = damage %d/%d, scaling %d/%d; want 63/138 and 76/125", counts["damage"], counts["noDamage"], counts["scaling"], counts["noScaling"])
	}
	spellByName := map[string]srdEntry{}
	for _, entry := range pack.Entries {
		if entry.EntryType == "spell" {
			spellByName[entry.Name] = entry
		}
	}
	wantDamage := map[string]string{
		"Animate Objects":  "1d4+3|force|animated-object-slam-medium-or-smaller;2d6+3+modificador da habilidade de conjuração|force|animated-object-slam-large;2d12+3+modificador da habilidade de conjuração|force|animated-object-slam-huge",
		"Acid Arrow":       "4d4|acid;2d4|acid",
		"Fireball":         "8d6|fire",
		"Flame Blade":      "3d6|fire|melee-spell-attack-hit",
		"Forbiddance":      "5d10|varies|types=radiant,necrotic|entered-area-save-fail",
		"Glyph of Warding": "5d8|varies|types=acid,cold,fire,lightning,thunder|explosive-rune-failed-save",
		"Conjure Fey":      "3d12|psychic|fey-spirit-hit",
		"Find Steed":       "1d8 + nível da magia|varies|types=radiant,psychic,necrotic|steed-slam-hit",
		"Spiritual Weapon": "1d8 + modificador da habilidade de conjuração|force|weapon-hit",
	}
	for name, want := range wantDamage {
		entry, ok := spellByName[name]
		if !ok {
			t.Errorf("missing expected spell %q", name)
			continue
		}
		var rules map[string]any
		if err := json.Unmarshal(entry.Rules, &rules); err != nil {
			t.Fatalf("decode %s rules: %v", name, err)
		}
		if got := spellDamageSignature(t, name, rules["damage"]); got != want {
			t.Errorf("%s damage signature = %q, want %q", name, got, want)
		}
	}
	wantNames := map[string]string{
		"Alter Self": "Alterar-se", "Haste": "Acelerar", "Shining Smite": "Golpe Resplandecente",
		"Call Lightning": "Invocar Relâmpagos", "Counterspell": "Contramágica",
		"Glyph of Warding": "Glifo de Proteção", "Find Steed": "Convocar Montaria",
		"Warding Bond": "Vínculo Guardião", "Conjure Fey": "Conjurar Seres Feéricos",
	}
	for name, want := range wantNames {
		entry := spellByName[name]
		translations := decodeTranslations(entry.Translations)
		if got := translations["pt-BR"]; got != want {
			t.Errorf("%s approved name = %q, want %q", name, got, want)
		}
	}
	wantSlotText := map[string][]string{
		"Bestow Curse":  {"level 5+ spell slot", "duration becomes 8 hours", "spell lasts until dispelled"},
		"Create Undead": {"level 7 spell slot", "level 8 spell slot", "level 9 spell slot"},
		"Fireball":      {"damage increases by 1d6 for each spell slot level above 3"},
		"Modify Memory": {"7 days ago", "30 days ago", "365 days ago", "any time in the creature’s past"},
	}
	for name, fragments := range wantSlotText {
		entry := spellByName[name]
		var rules map[string]any
		if err := json.Unmarshal(entry.Rules, &rules); err != nil {
			t.Fatalf("decode %s rules: %v", name, err)
		}
		scaling := rules["scaling"].(map[string]any)["spellSlot"].(map[string]any)
		effect := scaling["effects"].([]any)[0].(map[string]any)
		text := effect["text"].(map[string]any)["en"].(string)
		for _, fragment := range fragments {
			if !strings.Contains(text, fragment) {
				t.Errorf("%s source slot-scaling text %q lacks %q", name, text, fragment)
			}
		}
	}
}

func TestSRDSeventhThroughNinthLevelSpellTranslationsAndMechanicsAreReviewed(t *testing.T) {
	pack, err := loadSRDPack()
	if err != nil {
		t.Fatal(err)
	}
	wantLevels := map[int]int{7: 20, 8: 16, 9: 16}
	wantApprovedTitles := map[string]string{
		"Etherealness": "Forma Etérea",
		"Glibness":     "Loquacidade",
		"Mind Blank":   "Mente Vazia",
		"Plane Shift":  "Viagem Planar",
		"Weird":        "Estranho",
	}
	levels := map[int]int{}
	counts := map[string]int{"damage": 0, "noDamage": 0, "scaling": 0, "noScaling": 0}
	spellCount := 0
	for _, entry := range pack.Entries {
		if entry.EntryType != "spell" {
			continue
		}
		spellCount++
		var rules map[string]any
		if err := json.Unmarshal(entry.Rules, &rules); err != nil {
			t.Fatalf("decode %s rules: %v", entry.Name, err)
		}
		level, ok := rules["level"].(float64)
		if !ok || level < 7 || level > 9 {
			continue
		}
		levels[int(level)]++
		translations := decodeTranslations(entry.Translations)
		if want, ok := wantApprovedTitles[entry.Name]; ok && translations["pt-BR"] != want {
			t.Errorf("%s approved title = %q, want %q", entry.Name, translations["pt-BR"], want)
		}
		for _, key := range []string{"pt-BR", "pt-BR.summary", "pt-BR.rules.description"} {
			if strings.TrimSpace(translations[key]) == "" || translations[key+".source"] != "reviewed" {
				t.Errorf("%s %s translation is absent or not reviewed", entry.Name, key)
			}
		}
		audit, ok := rules["mechanicsAudit"].(map[string]any)
		if !ok || audit["status"] != "reviewed" || audit["source"] != "D&D SRD 5.2.1" {
			t.Errorf("%s mechanics were not audited against the SRD: %#v", entry.Name, rules["mechanicsAudit"])
		}
		if rules["damage"] == nil {
			counts["noDamage"]++
		} else {
			counts["damage"]++
			damage, ok := rules["damage"].(map[string]any)
			components, componentsOK := damage["components"].([]any)
			if !ok || !componentsOK || len(components) == 0 {
				t.Errorf("%s has untyped damage data: %#v", entry.Name, rules["damage"])
			}
		}
		if rules["scaling"] == nil {
			counts["noScaling"]++
		} else {
			counts["scaling"]++
			scaling, ok := rules["scaling"].(map[string]any)
			slot, slotOK := scaling["spellSlot"].(map[string]any)
			if !ok || !slotOK || slot["baseLevel"] != level {
				t.Errorf("%s has malformed slot scaling: %#v", entry.Name, rules["scaling"])
				continue
			}
			effects, effectsOK := slot["effects"].([]any)
			if !effectsOK || len(effects) == 0 {
				t.Errorf("%s slot scaling has no effects", entry.Name)
				continue
			}
			for _, raw := range effects {
				effect, ok := raw.(map[string]any)
				if !ok || effect["kind"] != "rule-text" || effect["fromSlotLevel"] != level+1 {
					t.Errorf("%s has incorrectly thresholded slot scaling: %#v", entry.Name, raw)
					continue
				}
				text, ok := effect["text"].(map[string]any)
				if !ok || strings.TrimSpace(fmt.Sprint(text["en"])) == "" || strings.TrimSpace(fmt.Sprint(text["ptBR"])) == "" || !strings.Contains(translations["pt-BR.rules.description"], fmt.Sprint(text["ptBR"])) {
					t.Errorf("%s slot scaling lacks localized source text: %#v", entry.Name, effect["text"])
				}
			}
		}
	}
	if spellCount != 338 {
		t.Fatalf("SRD spell count = %d, want 338", spellCount)
	}
	for level, want := range wantLevels {
		if levels[level] != want {
			t.Errorf("level %d spells = %d, want %d", level, levels[level], want)
		}
	}
	if counts["damage"] != 19 || counts["noDamage"] != 33 || counts["scaling"] != 4 || counts["noScaling"] != 48 {
		t.Fatalf("levels 7–9 applicability: damage %d/%d, scaling %d/%d; want 19/33 and 4/48", counts["damage"], counts["noDamage"], counts["scaling"], counts["noScaling"])
	}
	wantDamage := map[string]string{
		"Arcane Sword": "4d12|force|attack-hit", "Befuddlement": "10d12|psychic", "Conjure Celestial": "6d12|radiant|searing-light",
		"Delayed Blast Fireball": "12d6|fire|explosion|extra=1d6|fire|each-turn-before-detonation", "Earthquake": "12d6|bludgeoning|structure-collapse-failed-save;50|bludgeoning|structure-per-turn", "Etherealness": "2 × feet moved|force|shunted-on-return",
		"Finger of Death": "7d8 + 30|necrotic", "Fire Storm": "7d10|fire", "Incendiary Cloud": "10d8|fire|turn-or-entry",
		"Meteor Swarm": "20d6|fire;20d6|bludgeoning", "Power Word Kill": "12d12|psychic|target-over-100-hp", "Prismatic Spray": "12d6|varies|types=fire,acid,lightning,poison,cold|random-ray",
		"Prismatic Wall": "12d6|varies|types=fire,acid,lightning,poison,cold|layer", "Storm of Vengeance": "2d6|thunder|initial;4d6|acid|round-2;10d6|lightning|round-3;2d6|bludgeoning|round-4;1d6|cold|round-5-to-10",
		"Sunburst": "12d6|radiant", "Symbol": "10d10|necrotic|death-effect", "Teleport": "3d10|force|teleportation-mishap", "Tsunami": "6d10|bludgeoning|initial;5d10|bludgeoning|wave-round-1;4d10|bludgeoning|wave-round-2;3d10|bludgeoning|wave-round-3;2d10|bludgeoning|wave-round-4;1d10|bludgeoning|wave-round-5",
		"Weird": "10d10|psychic|initial;5d10|psychic|failed-repeat-save",
	}
	byName := map[string]srdEntry{}
	for _, entry := range pack.Entries {
		if entry.EntryType == "spell" {
			byName[entry.Name] = entry
		}
	}
	for name, want := range wantDamage {
		var rules map[string]any
		if err := json.Unmarshal(byName[name].Rules, &rules); err != nil {
			t.Fatal(err)
		}
		if got := spellDamageSignature(t, name, rules["damage"]); got != want {
			t.Errorf("%s damage signature = %q, want %q", name, got, want)
		}
	}
	for name, want := range map[string]struct{ damageType, dice string }{
		"Finger of Death": {damageType: "necrotic", dice: "7d8+30"},
		"Meteor Swarm":    {damageType: "fire", dice: "20d6"},
		"Tsunami":         {damageType: "bludgeoning", dice: "6d10"},
	} {
		var rules map[string]any
		if err := json.Unmarshal(byName[name].Rules, &rules); err != nil {
			t.Fatal(err)
		}
		damage, ok := rules["damage"].(map[string]any)
		if !ok || damage["type"] != want.damageType || damage["dice"] != want.dice {
			t.Errorf("%s legacy damage fallback = %#v, want type %q and dice %q", name, rules["damage"], want.damageType, want.dice)
		}
	}
	for name, base := range map[string]float64{"Conjure Celestial": 7, "Delayed Blast Fireball": 7, "Etherealness": 7, "Dominate Monster": 8} {
		var rules map[string]any
		if err := json.Unmarshal(byName[name].Rules, &rules); err != nil {
			t.Fatal(err)
		}
		slot := rules["scaling"].(map[string]any)["spellSlot"].(map[string]any)
		if slot["baseLevel"] != base {
			t.Errorf("%s scaling base = %v, want %v", name, slot["baseLevel"], base)
		}
	}
}

func spellDamageSignature(t *testing.T, name string, value any) string {
	t.Helper()
	damage, ok := value.(map[string]any)
	if !ok {
		return ""
	}
	components, ok := damage["components"].([]any)
	if !ok {
		return ""
	}
	parts := make([]string, 0, len(components))
	for _, raw := range components {
		component, ok := raw.(map[string]any)
		if !ok {
			return ""
		}
		part := fmt.Sprintf("%v|%v", component["formula"], component["type"])
		if types, ok := component["types"].([]any); ok {
			values := make([]string, len(types))
			for index, item := range types {
				values[index] = fmt.Sprint(item)
			}
			part += "|types=" + strings.Join(values, ",")
		}
		if instances := component["instances"]; instances != nil {
			part += "|instances=" + fmt.Sprint(instances)
			if component["trigger"] != nil {
				part += "|" + fmt.Sprint(component["trigger"])
			}
		} else if trigger := component["trigger"]; trigger != nil {
			part += "|" + fmt.Sprint(trigger)
		}
		if exploding, ok := component["explodingDice"].(map[string]any); ok {
			part += fmt.Sprintf("|explode=%v:%v:%v", exploding["die"], exploding["triggersOn"], exploding["maxAdditionalDice"])
		}
		if additional, ok := component["additional"].([]any); ok {
			for _, rawExtra := range additional {
				extra := rawExtra.(map[string]any)
				part += fmt.Sprintf("|extra=%v|%v|%v", extra["formula"], extra["type"], extra["trigger"])
			}
		}
		parts = append(parts, part)
	}
	return strings.Join(parts, ";")
}

func spellCharacterScalingSignature(t *testing.T, name string, value any) string {
	t.Helper()
	rules, ok := value.(map[string]any)
	if !ok {
		return ""
	}
	rows, ok := rules["characterLevel"].([]any)
	if !ok {
		return ""
	}
	parts := []string{}
	for _, raw := range rows {
		row := raw.(map[string]any)
		effects := row["effects"].([]any)
		effect := effects[0].(map[string]any)
		part := fmt.Sprintf("%v:%v", row["level"], effect["kind"])
		for _, key := range []string{"formula", "type", "count", "die", "feet"} {
			if effect[key] != nil {
				part += ":" + fmt.Sprint(effect[key])
			}
		}
		parts = append(parts, part)
	}
	return strings.Join(parts, ";")
}

func spellSlotScalingSignature(t *testing.T, name string, value any) string {
	t.Helper()
	effects, ok := value.([]any)
	if !ok {
		return ""
	}
	parts := []string{}
	for _, raw := range effects {
		effect, ok := raw.(map[string]any)
		if !ok {
			return ""
		}
		part := fmt.Sprintf("%v:%v", effect["fromSlotLevel"], effect["kind"])
		for _, key := range []string{"everySlotLevels", "formula", "type", "count", "targetType", "componentFormula", "additionalGallons", "cubeSideFeet", "choice", "feet", "amount", "duration", "componentTrigger"} {
			if effect[key] != nil {
				part += ":" + fmt.Sprint(effect[key])
			}
		}
		parts = append(parts, part)
	}
	return strings.Join(parts, ";")
}

func TestSRDCantripTranslationBatchIsReconciled(t *testing.T) {
	pack, err := loadSRDPack()
	if err != nil {
		t.Fatal(err)
	}
	cantrips := 0
	for _, entry := range pack.Entries {
		if entry.EntryType != "spell" {
			continue
		}
		var rules map[string]any
		if err := json.Unmarshal(entry.Rules, &rules); err != nil {
			t.Fatalf("decode %s rules: %v", entry.Name, err)
		}
		if rules["level"] != float64(0) {
			continue
		}
		cantrips++
		translations := decodeTranslations(entry.Translations)
		if translations["pt-BR"] == "" || translations["pt-BR.source"] != "reviewed" || translations["pt-BR.summary"] == "" || translations["pt-BR.summary.source"] != "reviewed" {
			t.Errorf("cantrip %s lacks reconciled reviewed name/summary: %v", entry.Name, translations)
		}
	}
	if cantrips != 28 {
		t.Fatalf("cantrip count = %d, want 28", cantrips)
	}
}

func TestSRDFirstLevelSpellTranslationSyncReplacesAIAndPreservesProtectedFields(t *testing.T) {
	pack, err := loadSRDPack()
	if err != nil {
		t.Fatal(err)
	}
	var bless srdEntry
	for _, entry := range pack.Entries {
		if entry.EntryType == "spell" && entry.Name == "Bless" {
			bless = entry
			break
		}
	}
	if bless.Name == "" {
		t.Fatal("Bless not found in the SRD pack")
	}
	approved := decodeTranslations(bless.Translations)
	current := map[string]string{}
	for _, key := range []string{"pt-BR", "pt-BR.summary", "pt-BR.rules.name", "pt-BR.rules.description"} {
		current[key] = "tradução antiga de IA"
		current[key+".source"] = "ai"
	}
	current["pt-BR.rules.description"] = "Descrição manual protegida"
	current["pt-BR.rules.description.source"] = "manual"
	changed, updated, unresolved := applyReviewedTranslation(current, bless)
	if !changed || len(updated) != 3 || len(unresolved) != 0 {
		t.Fatalf("sync result: changed=%t updated=%v unresolved=%v", changed, updated, unresolved)
	}
	for _, key := range []string{"pt-BR", "pt-BR.summary", "pt-BR.rules.name"} {
		if current[key] != approved[key] || current[key+".source"] != "reviewed" {
			t.Errorf("%s was not replaced by its reviewed value: got %q (%q), want %q (reviewed)", key, current[key], current[key+".source"], approved[key])
		}
	}
	if current["pt-BR.rules.description"] != "Descrição manual protegida" || current["pt-BR.rules.description.source"] != "manual" {
		t.Fatal("manual description was overwritten")
	}
	changed, updated, unresolved = applyReviewedTranslation(current, bless)
	if changed || len(updated) != 0 || len(unresolved) != 0 {
		t.Fatalf("second sync was not idempotent: changed=%t updated=%v unresolved=%v", changed, updated, unresolved)
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

func TestSorcerousBurstSourceTextMatchesSRD521(t *testing.T) {
	pack, err := loadSRDPack()
	if err != nil {
		t.Fatal(err)
	}
	const expected = "You cast sorcerous energy at one creature or object within range. Make a ranged spell attack against the target. On a hit, the target takes 1d8 damage of a type you choose: Acid, Cold, Fire, Lightning, Poison, Psychic, or Thunder. If you roll an 8 on a d8 for this spell, you can roll another d8, and add it to the damage. When you cast this spell, the maximum number of these d8s you can add to the spell’s damage equals your spellcasting ability modifier. Cantrip Upgrade. The damage increases by 1d8 when you reach levels 5 (2d8), 11 (3d8), and 17 (4d8)."
	for _, entry := range pack.Entries {
		if entry.EntryType != "spell" || entry.Name != "Sorcerous Burst" {
			continue
		}
		if entry.Summary != expected {
			t.Errorf("source summary = %q, want full SRD 5.2.1 text", entry.Summary)
		}
		var rules map[string]any
		if err := json.Unmarshal(entry.Rules, &rules); err != nil {
			t.Fatalf("decode Sorcerous Burst rules: %v", err)
		}
		if rules["description"] != expected {
			t.Errorf("source description = %q, want full SRD 5.2.1 text", rules["description"])
		}
		translations := decodeTranslations(entry.Translations)
		if translations["pt-BR"] != "Rajada Arcana" || translations["pt-BR.rules.name"] != "Rajada Arcana" {
			t.Errorf("owner-approved localized name changed: %v", translations)
		}
		if translations["pt-BR.rules.description.source"] != "reviewed" || !strings.Contains(translations["pt-BR.rules.description"], "psíquico") {
			t.Errorf("reviewed Portuguese description was lost or changed: %v", translations)
		}
		return
	}
	t.Fatal("Sorcerous Burst not found in SRD pack")
}
