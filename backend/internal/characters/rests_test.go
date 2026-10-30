package characters

import (
	"errors"
	"reflect"
	"testing"
)

func TestResolveShortRestHitDice(t *testing.T) {
	cases := []struct {
		name      string
		level     int
		spent     int
		requested *int
		wantCount int
		wantLeft  int
		wantErr   error
	}{
		{name: "legacy clients spend one available die", level: 3, spent: 1, wantCount: 1, wantLeft: 2},
		{name: "legacy clients with no dice can still rest", level: 3, spent: 3, wantCount: 0, wantLeft: 0},
		{name: "explicit zero spends none", level: 3, requested: intPointer(0), wantCount: 0, wantLeft: 3},
		{name: "explicit multiple dice", level: 3, spent: 1, requested: intPointer(2), wantCount: 2, wantLeft: 2},
		{name: "cannot exceed available dice", level: 3, spent: 1, requested: intPointer(3), wantLeft: 2, wantErr: ErrInvalidHitDiceCount},
		{name: "cannot spend a negative number", level: 3, requested: intPointer(-1), wantLeft: 3, wantErr: ErrInvalidHitDiceCount},
		{name: "invalid spent state is rejected", level: 3, spent: 4, wantErr: ErrInvalidRestState},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			gotCount, gotLeft, err := resolveShortRestHitDice(test.level, test.spent, test.requested)
			if !errors.Is(err, test.wantErr) {
				t.Fatalf("error = %v, want %v", err, test.wantErr)
			}
			if gotCount != test.wantCount || gotLeft != test.wantLeft {
				t.Fatalf("count/available = %d/%d, want %d/%d", gotCount, gotLeft, test.wantCount, test.wantLeft)
			}
		})
	}
}

func TestRollShortRestHitDiceUsesServerRollsAndMinimumPerDie(t *testing.T) {
	cases := []struct {
		name     string
		count    int
		modifier int
		rolls    []int
		wantDice []int
		wantHeal int
	}{
		{name: "zero dice", count: 0, modifier: -5, wantDice: []int{}, wantHeal: 0},
		{name: "one die", count: 1, modifier: 2, rolls: []int{4}, wantDice: []int{4}, wantHeal: 6},
		{name: "several dice", count: 3, modifier: 1, rolls: []int{1, 2, 8}, wantDice: []int{1, 2, 8}, wantHeal: 14},
		{name: "negative constitution", count: 1, modifier: -3, rolls: []int{2}, wantDice: []int{2}, wantHeal: 1},
		{name: "minimum one hp for each die", count: 2, modifier: -2, rolls: []int{1, 1}, wantDice: []int{1, 1}, wantHeal: 2},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			index := 0
			gotDice, gotHeal, err := rollShortRestHitDice(test.count, 8, test.modifier, func(sides int) (int, error) {
				if sides != 8 {
					t.Fatalf("server requested d%d, want d8", sides)
				}
				if index >= len(test.rolls) {
					t.Fatalf("unexpected extra server roll")
				}
				roll := test.rolls[index]
				index++
				return roll, nil
			})
			if err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(gotDice, test.wantDice) || gotHeal != test.wantHeal || index != test.count {
				t.Fatalf("dice/healing/calls = %v/%d/%d, want %v/%d/%d", gotDice, gotHeal, index, test.wantDice, test.wantHeal, test.count)
			}
		})
	}
}

func TestShortRestRecoveryCapsHPAndRejectsInvalidPersistedHP(t *testing.T) {
	sheet := validSheet()
	sheet.HitPointsCurrent = 9
	sheet.HitPointsMax = 10
	got := applyRestRecovery(sheet, "short", 20, dnd2024TestRules())
	if got.HitPointsCurrent != 10 {
		t.Fatalf("short-rest HP = %d, want maximum 10", got.HitPointsCurrent)
	}

	invalid := sheet
	invalid.HitPointsCurrent = invalid.HitPointsMax + 1
	if err := validatePersistedRestState(invalid); !errors.Is(err, ErrInvalidRestState) {
		t.Fatalf("invalid persisted HP state error = %v, want ErrInvalidRestState", err)
	}
	if invalid.HitPointsCurrent <= sheet.HitPointsCurrent {
		t.Fatal("test setup must represent HP above maximum")
	}
}

func TestZeroDieShortRestStillRecoversShortRestResources(t *testing.T) {
	sheet := validSheet()
	sheet.HitPointsCurrent = 4
	sheet.HitPointsMax = 10
	sheet.Resources = []Resource{{ID: "short", Current: 0, Max: 1, RestoreOn: "short"}}

	got := applyRestRecovery(sheet, "short", 0, dnd2024TestRules())
	if got.HitPointsCurrent != 4 || got.HitDiceSpent != sheet.HitDiceSpent || got.Resources[0].Current != 1 {
		t.Fatalf("zero-die short rest should preserve HP/dice and recover resources: %+v", got)
	}
}

func TestValidatePersistedRestStateRejectsUnsafeValues(t *testing.T) {
	cases := []struct {
		name   string
		mutate func(*Sheet)
	}{
		{name: "HP above maximum", mutate: func(sheet *Sheet) { sheet.HitPointsCurrent = sheet.HitPointsMax + 1 }},
		{name: "negative HP", mutate: func(sheet *Sheet) { sheet.HitPointsCurrent = -1 }},
		{name: "missing maximum", mutate: func(sheet *Sheet) { sheet.HitPointsMax = 0 }},
		{name: "spent dice above level", mutate: func(sheet *Sheet) { sheet.HitDiceSpent = sheet.Level + 1 }},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			sheet := validSheet()
			test.mutate(&sheet)
			if err := validatePersistedRestState(sheet); !errors.Is(err, ErrInvalidRestState) {
				t.Fatalf("validation error = %v, want ErrInvalidRestState", err)
			}
		})
	}
}

func intPointer(value int) *int { return &value }
