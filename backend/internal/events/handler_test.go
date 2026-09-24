package events

import "testing"

func TestRollProducesAResultWithinRequestedDiceBounds(t *testing.T) {
	result, err := roll("2d6+3")
	if err != nil {
		t.Fatalf("roll failed: %v", err)
	}
	if result.Expression != "2d6+3" || result.Modifier != 3 || len(result.Dice) != 2 {
		t.Fatalf("unexpected result: %#v", result)
	}
	for _, die := range result.Dice {
		if die < 1 || die > 6 {
			t.Fatalf("die out of bounds: %d", die)
		}
	}
	if result.Total < 5 || result.Total > 15 {
		t.Fatalf("total out of bounds: %d", result.Total)
	}
}

func TestRollRejectsUnsafeExpressions(t *testing.T) {
	for _, expression := range []string{"", "1d1", "101d20", "1d20+10001", "alert(1)"} {
		if _, err := roll(expression); err == nil {
			t.Fatalf("expected %q to be rejected", expression)
		}
	}
}

func TestApplyMinimumDamageDieRecordsOriginalFacesAndAdjustsTotal(t *testing.T) {
	result := applyMinimumDamageDie(DiceResult{
		Expression: "3d6+2",
		Dice:       []int{1, 2, 5},
		Modifier:   2,
		Total:      10,
	}, 3)

	if result.Total != 13 {
		t.Fatalf("expected adjusted total 13, got %d", result.Total)
	}
	if len(result.Dice) != 3 || result.Dice[0] != 3 || result.Dice[1] != 3 || result.Dice[2] != 5 {
		t.Fatalf("unexpected adjusted dice: %#v", result.Dice)
	}
	if len(result.OriginalDice) != 3 || result.OriginalDice[0] != 1 || result.OriginalDice[1] != 2 {
		t.Fatalf("original dice were not preserved: %#v", result.OriginalDice)
	}
	if result.RuleApplied == "" {
		t.Fatal("expected applied rule to be disclosed")
	}
}

func TestApplyMinimumDamageDieDoesNotChangeHigherFaces(t *testing.T) {
	result := applyMinimumDamageDie(DiceResult{Dice: []int{3, 4, 6}, Total: 13}, 3)
	if result.Total != 13 || result.OriginalDice != nil || result.RuleApplied != "" {
		t.Fatalf("unexpected result for unaffected dice: %#v", result)
	}
}

func TestValidMinimumDamageRollOnlyAcceptsStandardDamageDice(t *testing.T) {
	for _, expression := range []string{"1d4", "2d6+3", "1d8-1", "2d10", "1d12"} {
		if !validMinimumDamageRoll(expression) {
			t.Errorf("expected %q to be a valid damage roll", expression)
		}
	}
	for _, expression := range []string{"1d20", "1d100", "1d3", "alert(1)"} {
		if validMinimumDamageRoll(expression) {
			t.Errorf("expected %q to be rejected for the damage rule", expression)
		}
	}
}
