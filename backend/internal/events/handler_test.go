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
