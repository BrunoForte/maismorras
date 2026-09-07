package compendium

import "testing"

func TestValidType(t *testing.T) {
	for _, v := range []string{"species", "background", "class", "subclass", "feat", "spell", "item", "feature", "other"} {
		if !validType(v) {
			t.Errorf("expected %q valid", v)
		}
	}
	for _, v := range []string{"race", "", "SPELL"} {
		if validType(v) {
			t.Errorf("expected %q invalid", v)
		}
	}
}
