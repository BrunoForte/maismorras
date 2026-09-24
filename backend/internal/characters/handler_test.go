package characters

import (
	"strings"
	"testing"
)

func TestCharacterAccessIsLimitedToOwnerOrCampaignGM(t *testing.T) {
	cases := []struct {
		name              string
		gm, member, owner bool
		want              bool
	}{
		{name: "campaign GM", gm: true, want: true},
		{name: "sheet owner who is a member", member: true, owner: true, want: true},
		{name: "other campaign member", member: true, want: false},
		{name: "owner outside campaign", owner: true, want: false},
		{name: "outsider", want: false},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			if got := characterAccessAllowed(test.gm, test.member, test.owner); got != test.want {
				t.Fatalf("characterAccessAllowed(%t, %t, %t) = %t, want %t", test.gm, test.member, test.owner, got, test.want)
			}
		})
	}
}

func TestAbilityModifierUsesDNDHalfDownForNegativeScores(t *testing.T) {
	cases := map[int]int{1: -5, 9: -1, 10: 0, 11: 0, 18: 4}
	for score, want := range cases {
		if got := abilityModifier(score); got != want {
			t.Errorf("abilityModifier(%d) = %d, want %d", score, got, want)
		}
	}
}

func TestSpellEffectAddsScalingForHigherSlots(t *testing.T) {
	rules := map[string]any{
		"description": "Each creature takes 3d6 fire damage.",
		"damage":      map[string]any{"dice": "3d6", "scalingType": "spell-level"},
	}
	got := spellEffect(rules, 1, 3)
	if !strings.Contains(got, "5d6") || strings.Contains(got, "3d6") {
		t.Fatalf("unexpected scaling effect: %q", got)
	}
}

func TestRollSpellEffectScalesDiceAndReturnsAllResults(t *testing.T) {
	rules := map[string]any{"damage": map[string]any{"dice": "8d6", "scalingType": "spell-level"}}
	expression, dice, modifier, total := rollSpellEffect(rules, 3, 4)
	if expression != "9d6" || len(dice) != 9 || modifier != 0 || total < 9 || total > 54 {
		t.Fatalf("unexpected roll: %s %v +%d = %d", expression, dice, modifier, total)
	}
}

func TestRollSpellEffectSupportsRepeatedProjectiles(t *testing.T) {
	rules := map[string]any{"damage": map[string]any{"dice": "1d4+1", "scalingType": "spell-level", "instances": float64(3), "scalingInstances": float64(1)}}
	expression, dice, modifier, _ := rollSpellEffect(rules, 1, 2)
	if expression != "4d4+4" || len(dice) != 4 || modifier != 4 {
		t.Fatalf("unexpected projectile roll: %s %v +%d", expression, dice, modifier)
	}
}

func TestSpellEffectDoesNotInventScaling(t *testing.T) {
	rules := map[string]any{"description": "An effect.", "damage": map[string]any{"dice": "1d8"}}
	if got := spellEffect(rules, 1, 2); got != "An effect." {
		t.Fatalf("unexpected effect: %q", got)
	}
}

func TestRollSpellEffectPreservesModifierWhenScaling(t *testing.T) {
	rules := map[string]any{"damage": map[string]any{"dice": "2d8+3", "scalingType": "spell-level"}}
	expression, dice, modifier, total := rollSpellEffect(rules, 2, 4)
	if expression != "4d8+3" || len(dice) != 4 || modifier != 3 || total < 7 || total > 35 {
		t.Fatalf("unexpected scaled modifier roll: %s %v +%d = %d", expression, dice, modifier, total)
	}
}

func TestCustomSpellRulesScaleConfiguredDicePerSlotLevel(t *testing.T) {
	rules, err := customSpellRules(Spell{
		Name: "Explosão de teste", Level: 1, DiceFormula: "2d6+1", ScalingDicePerLevel: 1,
	})
	if err != nil {
		t.Fatalf("customSpellRules returned error: %v", err)
	}
	expression, dice, modifier, total := rollSpellEffect(rules, 1, 3)
	if expression != "4d6+1" || len(dice) != 4 || modifier != 1 || total < 5 || total > 25 {
		t.Fatalf("unexpected custom spell scaling: %s %v +%d = %d", expression, dice, modifier, total)
	}
}

func TestCustomSpellRulesRejectInvalidScaling(t *testing.T) {
	_, err := customSpellRules(Spell{Level: 1, DiceFormula: "2d6", ScalingDicePerLevel: 11})
	if err == nil {
		t.Fatal("expected out-of-range scaling to be rejected")
	}
	_, err = customSpellRules(Spell{Level: 1, ScalingDicePerLevel: 1})
	if err == nil {
		t.Fatal("expected scaling without base damage dice to be rejected")
	}
}

func validSheet() Sheet {
	return Sheet{
		Name: "Lia", Level: 1, ArmorClass: 14, Speed: 9, HitPointsCurrent: 10, HitPointsMax: 10,
		AbilityScores: AbilityScores{Strength: 10, Dexterity: 14, Constitution: 12, Intelligence: 10, Wisdom: 10, Charisma: 8},
	}
}

func TestValidateAcceptsMinimalDND2024Sheet(t *testing.T) {
	if err := validate(validSheet()); err != nil {
		t.Fatalf("expected valid sheet, got %v", err)
	}
}

func TestValidateRejectsInvalidHitPoints(t *testing.T) {
	sheet := validSheet()
	sheet.HitPointsCurrent = 11
	if err := validate(sheet); err == nil {
		t.Fatal("expected invalid hit points to be rejected")
	}
}

func TestValidateRejectsInvalidAbilityScore(t *testing.T) {
	sheet := validSheet()
	sheet.AbilityScores.Charisma = 31
	if err := validate(sheet); err == nil {
		t.Fatal("expected invalid ability score to be rejected")
	}
}

func TestValidateAcceptsSpeciesLineage(t *testing.T) {
	sheet := validSheet()
	sheet.Species = "Elf"
	sheet.SpeciesLineage = "Drow"
	if err := validate(sheet); err != nil {
		t.Fatalf("expected lineage to be valid, got %v", err)
	}
}
