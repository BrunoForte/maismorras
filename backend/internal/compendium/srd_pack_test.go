package compendium

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
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
		if level > 6 {
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
