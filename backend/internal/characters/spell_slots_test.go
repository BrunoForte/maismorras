package characters

import (
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
