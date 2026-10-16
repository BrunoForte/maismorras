package characters

import (
	"errors"
	"reflect"
	"testing"
)

func TestConsumeSpellSlotForCastLeavesCantripsFreeAndConsumesCompatibleLeveledSlot(t *testing.T) {
	sheet := Sheet{SpellSlots: []SpellSlot{
		{Level: 1, Current: 2, Max: 2},
		{Level: 3, Current: 1, Max: 1},
	}}
	if err := consumeSpellSlotForCast(&sheet, 0, 0); err != nil {
		t.Fatalf("cantrip should not require a spell slot: %v", err)
	}
	if sheet.SpellSlots[0].Current != 2 || sheet.SpellSlots[1].Current != 1 {
		t.Fatalf("cantrip consumed a spell slot: %+v", sheet.SpellSlots)
	}
	if err := consumeSpellSlotForCast(&sheet, 2, 3); err != nil {
		t.Fatalf("level 2 spell should use a compatible level 3 slot: %v", err)
	}
	if sheet.SpellSlots[0].Current != 2 || sheet.SpellSlots[1].Current != 0 {
		t.Fatalf("leveled cast consumed the wrong slot: %+v", sheet.SpellSlots)
	}
	if err := consumeSpellSlotForCast(&sheet, 1, 1); err != nil {
		t.Fatalf("level 1 spell should consume a level 1 slot: %v", err)
	}
	if err := consumeSpellSlotForCast(&sheet, 1, 1); err != nil {
		t.Fatalf("second level 1 spell should consume the remaining slot: %v", err)
	}
	if sheet.SpellSlots[0].Current != 0 {
		t.Fatalf("level 1 casts consumed the wrong slot: %+v", sheet.SpellSlots)
	}
	if err := consumeSpellSlotForCast(&sheet, 1, 1); err == nil {
		t.Fatal("cast without a remaining compatible slot should fail")
	}
	if err := consumeSpellSlotForCast(&sheet, 0, 1); err == nil {
		t.Fatal("cantrip request must not spend a slot")
	}
}

func TestDnd2024SpellSlotsIgnoreClientCountsPreserveServerUsesAndAddNoFeatSlots(t *testing.T) {
	previous := []SpellSlot{{Level: 1, Current: 0, Max: 2}, {Level: 2, Current: 1, Max: 1}}
	got := dnd2024SpellSlots("wizard", 3, previous)
	want := []SpellSlot{{Level: 1, Current: 0, Max: 4}, {Level: 2, Current: 1, Max: 2}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("wizard slot progression = %#v, want %#v", got, want)
	}
	newSlots := dnd2024SpellSlots("wizard", 1, nil)
	if !reflect.DeepEqual(newSlots, []SpellSlot{{Level: 1, Current: 2, Max: 2}}) {
		t.Fatalf("new wizard slots = %#v", newSlots)
	}
	if got := dnd2024SpellSlots("warlock", 5, nil); len(got) != 0 {
		t.Fatalf("changed existing pact-magic slot model unexpectedly: %#v", got)
	}
}

func TestNarratorSpellSlotAdjustmentChangesOnlyAvailableCountAndKeepsCastSpending(t *testing.T) {
	sheet := Sheet{Class: "wizard", Level: 5, SpellSlots: dnd2024SpellSlots("wizard", 5, nil)}
	if err := setAvailableSpellSlots(&sheet, 2, 1); err != nil {
		t.Fatal(err)
	}
	if len(sheet.SpellSlots) != 3 || sheet.SpellSlots[1] != (SpellSlot{Level: 2, Current: 1, Max: 3}) || sheet.SpellSlots[0].Max != 4 {
		t.Fatalf("slot adjustment changed progression maxima or another level: %+v", sheet.SpellSlots)
	}
	if !consumeCharacterSpellSlot(&sheet, 2) || sheet.SpellSlots[1].Current != 0 || sheet.SpellSlots[1].Max != 3 {
		t.Fatalf("normal spell spending did not consume the adjusted available count: %+v", sheet.SpellSlots)
	}
	if err := setAvailableSpellSlots(&sheet, 2, 2); err != nil || sheet.SpellSlots[1].Current != 2 || sheet.SpellSlots[1].Max != 3 {
		t.Fatalf("narrator could not increase the available count within maximum: %+v, %v", sheet.SpellSlots, err)
	}
}

func TestNarratorSpellSlotAdjustmentRejectsOutOfRangeAndUnknownLevels(t *testing.T) {
	sheet := Sheet{Class: "wizard", Level: 3, SpellSlots: dnd2024SpellSlots("wizard", 3, nil)}
	original := append([]SpellSlot(nil), sheet.SpellSlots...)
	for _, test := range []struct{ level, current int }{{1, -1}, {1, 5}, {3, 1}} {
		if err := setAvailableSpellSlots(&sheet, test.level, test.current); !errors.Is(err, ErrInvalidSpellSlot) {
			t.Errorf("adjustment level=%d current=%d error=%v, want ErrInvalidSpellSlot", test.level, test.current, err)
		}
		if !reflect.DeepEqual(sheet.SpellSlots, original) {
			t.Fatalf("invalid adjustment changed sheet slots: %+v", sheet.SpellSlots)
		}
	}
}
