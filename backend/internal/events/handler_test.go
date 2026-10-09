package events

import "testing"

func TestRollWithModeReturnsKeptFaceAndBothRolledFaces(t *testing.T) {
	for _, mode := range []string{"advantage", "disadvantage"} {
		result, err := rollWithMode("1d20+4", mode)
		if err != nil {
			t.Fatalf("rollWithMode(%q): %v", mode, err)
		}
		if len(result.Dice) != 1 || len(result.OriginalDice) != 2 {
			t.Fatalf("mode result must include kept and both rolled faces: %#v", result)
		}
		wantKept := result.OriginalDice[0]
		if mode == "advantage" && result.OriginalDice[1] > wantKept {
			wantKept = result.OriginalDice[1]
		}
		if mode == "disadvantage" && result.OriginalDice[1] < wantKept {
			wantKept = result.OriginalDice[1]
		}
		if result.Dice[0] != wantKept || result.Total != wantKept+4 {
			t.Fatalf("incorrect kept result for %s: %#v", mode, result)
		}
	}
}

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

func TestRollSupportsEveryAdditiveDamageGroupAndModifier(t *testing.T) {
	result, err := roll("2d6+3d8+4d10+5")
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Dice) != 9 || result.Modifier != 5 || result.Total < 14 || result.Total > 81 {
		t.Fatalf("unexpected multi-group result: %+v", result)
	}
	for i, die := range result.Dice {
		limit := 6
		if i >= 2 && i < 5 {
			limit = 8
		}
		if i >= 5 {
			limit = 10
		}
		if die < 1 || die > limit {
			t.Fatalf("die %d has invalid face %d", i, die)
		}
	}
}

func TestRollRejectsMoreThanOneHundredDiceAcrossGroups(t *testing.T) {
	if _, err := roll("50d6+51d8"); err == nil {
		t.Fatal("expected total dice limit to be enforced")
	}
}

func TestWeaponDamageRollValidatesBaseAndDoublesCriticalDice(t *testing.T) {
	for _, expression := range []string{"10d6", "2d6+3d8+5d10"} {
		if !validWeaponDamageRoll(expression) {
			t.Errorf("expected non-critical weapon damage %q to be accepted", expression)
		}
	}
	for _, expression := range []string{"11d6", "5d6+6d8"} {
		if validWeaponDamageRoll(expression) {
			t.Errorf("expected non-critical weapon damage %q to be rejected", expression)
		}
	}
	if validWeaponDamageRoll("20d6+5") {
		t.Fatal("critical damage must be sent as the validated base formula")
	}
	doubled, err := doubleDiceExpression("2d6+3d8+5")
	if err != nil || doubled != "4d6+6d8+5" {
		t.Fatalf("unexpected critical expression %q, error %v", doubled, err)
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
	for _, expression := range []string{"1d4", "2d6+3", "1d8-1", "2d10", "1d12", "2d6+3d8+4d10"} {
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
