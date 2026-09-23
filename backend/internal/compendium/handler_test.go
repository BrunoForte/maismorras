package compendium

import (
	"encoding/json"
	"testing"
)

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

func TestValidRules(t *testing.T) {
	if !validRules(json.RawMessage(`{"kind":"monster","hpMax":18}`)) {
		t.Fatal("expected object rules valid")
	}
	if validRules(json.RawMessage(`["not an object"]`)) {
		t.Fatal("array rules must be rejected")
	}
}

func TestIsUntranslated(t *testing.T) {
	tests := []struct {
		name, source, translated string
		want                     bool
	}{
		{"missing", "Fireball", "", true},
		{"still source text", "Fireball", "  fireball  ", true},
		{"translated", "Fireball", "Bola de fogo", false},
		{"empty source", "  ", "", false},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := isUntranslated(test.source, test.translated); got != test.want {
				t.Fatalf("isUntranslated(%q, %q) = %t, want %t", test.source, test.translated, got, test.want)
			}
		})
	}
}
