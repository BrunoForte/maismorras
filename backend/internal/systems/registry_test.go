package systems

import "testing"

func TestRegistryExposesOnlyImplementedSystem(t *testing.T) {
	all := All()
	if len(all) != 1 || all[0].Definition().Ref != DefaultRef() {
		t.Fatalf("All() = %#v, want only the implemented D&D 2024 system", all)
	}
	adapter, ok := Resolve(Dnd2024)
	if !ok || adapter.Definition().DisplayName != "D&D 2024" {
		t.Fatalf("Resolve(Dnd2024) = (%v, %t)", adapter, ok)
	}
	definition := adapter.Definition()
	capabilities := definition.Capabilities
	if !capabilities.CharacterSheet || !capabilities.Compendium || !capabilities.Combat || !capabilities.Spells {
		t.Fatalf("D&D 2024 capabilities unexpectedly incomplete: %+v", capabilities)
	}
	if definition.Sheet.SchemaID == "" || definition.Sheet.Version != 1 || definition.Rules.ID == "" || definition.Rules.Version == "" {
		t.Fatalf("D&D 2024 definition is not versioned completely: %+v", definition)
	}
	if len(definition.Resources) == 0 || len(definition.Dice.Sides) == 0 || len(definition.Dice.Modes) == 0 {
		t.Fatalf("D&D 2024 definition is missing resource or dice metadata: %+v", definition)
	}
}

func TestParseRejectsUnimplementedSystems(t *testing.T) {
	if _, err := Parse("dnd35"); err == nil {
		t.Fatal("D&D 3.5 should not be selectable until its rules are implemented")
	}
}

func TestParseRefPinsKnownVersionAndDefaultsLegacyRequest(t *testing.T) {
	legacyRef, err := ParseRef("dnd2024", "")
	if err != nil || legacyRef != DefaultRef() {
		t.Fatalf("ParseRef without version = (%+v, %v), want %+v", legacyRef, err, DefaultRef())
	}
	versionedRef, err := ParseRef("dnd2024", "1.0.0")
	if err != nil || versionedRef != DefaultRef() {
		t.Fatalf("ParseRef with current version = (%+v, %v), want %+v", versionedRef, err, DefaultRef())
	}
	if _, err := ParseRef("dnd2024", "2.0.0"); err == nil {
		t.Fatal("unknown versions must not silently fall back to the current rules")
	}
	if _, ok := ResolveRef(DefaultRef()); !ok {
		t.Fatal("persisted default version should resolve")
	}
}

func TestDnd2024CharacterRulesUseTypedD20Contract(t *testing.T) {
	rules := Dnd2024Rules{}
	if rules.AbilityModifier(8) != -1 || rules.AbilityModifier(20) != 5 {
		t.Fatal("ability modifiers do not match D&D 2024 score bands")
	}
	if rules.ProficiencyBonus(1) != 2 || rules.ProficiencyBonus(5) != 3 || rules.ProficiencyBonus(17) != 6 {
		t.Fatal("proficiency bonus does not match D&D 2024 level progression")
	}
	sequence := []int{4, 17}
	index := 0
	result, err := rules.RollD20(RollAdvantage, 3, func(sides int) (int, error) {
		if sides != 20 {
			t.Fatalf("roller requested d%d; want d20", sides)
		}
		value := sequence[index]
		index++
		return value, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Rolls) != 2 || result.Kept != 17 || result.Total != 20 || result.Mode != RollAdvantage {
		t.Fatalf("unexpected typed d20 result: %+v", result)
	}
}

func TestVersionedCharacterRuleResolutionPreservesDnd2024Behavior(t *testing.T) {
	rules, ok := ResolveD20CharacterRules(DefaultRef())
	if !ok {
		t.Fatal("default versioned character rules must resolve")
	}
	if got := rules.AbilityModifier(8); got != -1 {
		t.Fatalf("D&D 2024 ability modifier = %d, want -1", got)
	}
	if got := rules.ProficiencyBonus(5); got != 3 {
		t.Fatalf("D&D 2024 proficiency bonus = %d, want 3", got)
	}
	sequence := []int{4, 17}
	index := 0
	result, err := rules.RollD20(RollAdvantage, 3, func(int) (int, error) {
		value := sequence[index]
		index++
		return value, nil
	})
	if err != nil || result.Total != 20 || result.Kept != 17 || len(result.Rolls) != 2 {
		t.Fatalf("version-resolved D&D 2024 roll = %+v, %v", result, err)
	}
	if _, ok := ResolveD20CharacterRules(Ref{ID: Dnd2024, Version: "2.0.0"}); ok {
		t.Fatal("unsupported versions must not resolve to current rules")
	}
}

func TestD20RulesRejectInvalidModeAndDieValue(t *testing.T) {
	rules := Dnd2024Rules{}
	if _, err := rules.RollD20("exploding", 0, func(int) (int, error) { return 1, nil }); err == nil {
		t.Fatal("expected unsupported roll mode to fail")
	}
	if _, err := rules.RollD20(RollNormal, 0, func(int) (int, error) { return 21, nil }); err == nil {
		t.Fatal("expected out-of-range die result to fail")
	}
}
