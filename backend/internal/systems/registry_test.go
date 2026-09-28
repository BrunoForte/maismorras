package systems

import "testing"

func TestRegistryExposesOnlyImplementedSystem(t *testing.T) {
	all := All()
	if len(all) != 1 || all[0].ID() != Dnd2024 {
		t.Fatalf("All() = %#v, want only the implemented D&D 2024 system", all)
	}
	adapter, ok := Resolve(Dnd2024)
	if !ok || adapter.DisplayName() != "D&D 2024" {
		t.Fatalf("Resolve(Dnd2024) = (%v, %t)", adapter, ok)
	}
	capabilities := adapter.Capabilities()
	if !capabilities.CharacterSheet || !capabilities.Compendium || !capabilities.Combat || !capabilities.Spells {
		t.Fatalf("D&D 2024 capabilities unexpectedly incomplete: %+v", capabilities)
	}
}

func TestParseRejectsUnimplementedSystems(t *testing.T) {
	if _, err := Parse("dnd35"); err == nil {
		t.Fatal("D&D 3.5 should not be selectable until its rules are implemented")
	}
}

func TestDnd2024CharacterRulesUseTypedRollContract(t *testing.T) {
	rules := Dnd2024Adapter{}.CharacterRules()
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

func TestD20RulesRejectInvalidModeAndDieValue(t *testing.T) {
	rules := Dnd2024Rules{}
	if _, err := rules.RollD20("exploding", 0, func(int) (int, error) { return 1, nil }); err == nil {
		t.Fatal("expected unsupported roll mode to fail")
	}
	if _, err := rules.RollD20(RollNormal, 0, func(int) (int, error) { return 21, nil }); err == nil {
		t.Fatal("expected out-of-range die result to fail")
	}
}
