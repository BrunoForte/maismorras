package characters

import (
	"reflect"
	"testing"
)

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
