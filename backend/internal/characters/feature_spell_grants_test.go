package characters

import "testing"

func TestAuthorizedFeatureSpellLevelRequiresCurrentClassSubclassAndLevel(t *testing.T) {
	classes := []characterFeatureEntry{{
		ID: "class-entry-paladin", EntryType: "class", Name: "Paladin",
		Translations: map[string]string{"pt-BR": "Paladino"},
		Rules:        map[string]any{"id": "paladin"},
	}}
	feature := characterFeatureEntry{
		ID: "subclass-entry-crown", EntryType: "subclass", Name: "Oath of the Crown",
		Translations: map[string]string{"pt-BR": "Juramento da Coroa"},
		Rules: map[string]any{
			"classId": "class-entry-paladin",
			"features": []any{map[string]any{
				"id": "crown-spells", "level": float64(3), "name": "Crown Spells",
				"grants": []any{map[string]any{"type": "spell", "spellEntryId": "spell-aid"}},
			}},
		},
	}

	if level, ok := authorizedFeatureSpellLevel(Sheet{Class: "Paladino", Subclass: "Juramento da Coroa", Level: 3}, feature, classes, "crown-spells", "spell-aid"); !ok || level != 3 {
		t.Fatalf("valid subclass grant level=(%d,%v), want (3,true)", level, ok)
	}
	for _, test := range []struct {
		name    string
		sheet   Sheet
		entry   characterFeatureEntry
		classes []characterFeatureEntry
	}{
		{name: "wrong current class", sheet: Sheet{Class: "wizard", Subclass: "Oath of the Crown", Level: 5}, entry: feature},
		{name: "wrong current subclass", sheet: Sheet{Class: "paladin", Subclass: "Oath of Devotion", Level: 5}, entry: feature},
		{name: "insufficient character level", sheet: Sheet{Class: "paladin", Subclass: "Oath of the Crown", Level: 2}, entry: feature},
		{name: "non-subclass entry", sheet: Sheet{Class: "paladin", Subclass: "Oath of the Crown", Level: 5}, entry: characterFeatureEntry{ID: "feat", EntryType: "feat", Name: "Oath of the Crown", Rules: feature.Rules}},
		{name: "current class absent from enabled compendium", sheet: Sheet{Class: "paladin", Subclass: "Oath of the Crown", Level: 5}, entry: feature, classes: []characterFeatureEntry{}},
	} {
		t.Run(test.name, func(t *testing.T) {
			classEntries := test.classes
			if test.classes == nil {
				classEntries = classes
			}
			if _, ok := authorizedFeatureSpellLevel(test.sheet, test.entry, classEntries, "crown-spells", "spell-aid"); ok {
				t.Fatal("unavailable feature spell was authorized")
			}
		})
	}
}

func TestAuthorizedFeatureSpellLevelRequiresExplicitSpellGrant(t *testing.T) {
	classes := []characterFeatureEntry{{ID: "class-entry", EntryType: "class", Name: "Paladin", Rules: map[string]any{"id": "paladin"}}}
	feature := characterFeatureEntry{
		ID: "class-entry", EntryType: "class", Name: "Paladin",
		Rules: map[string]any{"id": "paladin", "features": []any{map[string]any{
			"id": "feature", "level": float64(1), "name": "Feature",
			"grants": []any{map[string]any{"type": "script", "spellEntryId": "spell-aid"}},
		}}},
	}
	if _, ok := authorizedFeatureSpellLevel(Sheet{Class: "paladin", Level: 1}, feature, classes, "feature", "spell-aid"); ok {
		t.Fatal("non-spell grant was authorized as a spell")
	}
	if _, ok := authorizedFeatureSpellLevel(Sheet{Class: "paladin", Level: 1}, feature, classes, "feature", "other-spell"); ok {
		t.Fatal("spell not declared by the selected feature was authorized")
	}
}

func TestAuthorizedFeatureSpellLevelAcceptsCurrentClassFeature(t *testing.T) {
	class := characterFeatureEntry{
		ID: "class-entry-paladin", EntryType: "class", Name: "Paladin",
		Translations: map[string]string{"pt-BR": "Paladino"},
		Rules: map[string]any{
			"id": "paladin",
			"features": []any{map[string]any{
				"id": "prepared-spell", "level": float64(2),
				"name": "Prepared Spell", "grants": []any{map[string]any{"type": "spell", "spellEntryId": "spell-aid"}},
			}},
		},
	}
	if level, ok := authorizedFeatureSpellLevel(Sheet{Class: "Paladino", Level: 2}, class, []characterFeatureEntry{class}, "prepared-spell", "spell-aid"); !ok || level != 2 {
		t.Fatalf("valid class grant level=(%d,%v), want (2,true)", level, ok)
	}
}

func TestSubclassClassReferenceDoesNotFallThroughFromConflictingKnownClassID(t *testing.T) {
	classes := []characterFeatureEntry{
		{ID: "class-entry-paladin", EntryType: "class", Name: "Paladin", Rules: map[string]any{"id": "paladin"}},
		{ID: "class-entry-wizard", EntryType: "class", Name: "Wizard", Rules: map[string]any{"id": "wizard"}},
	}
	entry := characterFeatureEntry{
		ID: "subclass-entry", EntryType: "subclass", Name: "Oath of the Crown",
		Rules: map[string]any{"classId": "class-entry-wizard", "className": "Paladin"},
	}
	if subclassEntryMatchesClass(entry, "Paladin", classes) {
		t.Fatal("conflicting className overrode a known classId")
	}
	entry.Rules["classId"] = "legacy-unknown-reference"
	if !subclassEntryMatchesClass(entry, "Paladin", classes) {
		t.Fatal("unknown legacy class ID did not use the className fallback")
	}
}
