package compendium

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http/httptest"
	"strings"
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

func TestCollectMissingTranslationFieldsOnlyCollectsProseAndPreservesProtectedProvenance(t *testing.T) {
	rules := map[string]any{
		"id":          "fireball-uuid",
		"name":        "Fireball",
		"description": "A bright streak flashes from your pointing finger.",
		"damage":      "8d6 fire damage",
		"range":       "150 feet",
		"actions": []any{map[string]any{
			"name":        "Flame Burst",
			"description": "Each creature in the area takes 2d6 damage.",
			"toHit":       "+7",
		}},
	}
	translations := map[string]string{
		"pt-BR.rules.description":                  "Descrição revisada manualmente.",
		"pt-BR.rules.description.source":           "manual",
		"pt-BR.rules.actions.0.name":               "Explosão de Chamas",
		"pt-BR.rules.actions.0.name.source":        "official",
		"pt-BR.rules.actions.0.description":        "2d6 de dano.",
		"pt-BR.rules.actions.0.description.source": "ai",
	}
	fields := map[string]string{}
	collectMissingTranslationFields(fields, translations, "pt-BR.rules", rules)
	if _, ok := fields["pt-BR.rules.name"]; !ok {
		t.Fatal("user-facing nested name should be eligible for translation")
	}
	if _, ok := fields["pt-BR.rules.actions.0.name"]; ok {
		t.Fatal("official translation was included in pending fields")
	}
	if _, ok := fields["pt-BR.rules.actions.0.description"]; ok {
		t.Fatal("existing AI translation was included again")
	}
	if _, ok := fields["pt-BR.rules.damage"]; ok {
		t.Fatal("mechanical damage field should not be translated")
	}
	if _, ok := fields["pt-BR.rules.range"]; ok {
		t.Fatal("mechanical range field should not be translated")
	}
	if _, ok := fields["pt-BR.rules.id"]; ok {
		t.Fatal("identifier should not be translated")
	}
	if _, ok := fields["pt-BR.rules.actions.0.toHit"]; ok {
		t.Fatal("attack modifier should not be translated")
	}
}

func TestTranslationFailureLogAttributesContainOnlySafeDimensions(t *testing.T) {
	request := httptest.NewRequest("POST", "/translate", nil)
	request.Header.Set("X-Request-ID", "not-a-safe-request-id-with-token")
	request.SetPathValue("campaignID", "not-a-campaign-uuid")
	request.SetPathValue("entryID", "not-an-entry-uuid")
	attrs := translationFailureAttrs(request, "deepl", errors.New("https://provider.test?secret=sk_private prompt private text"))
	serialized := fmt.Sprint(attrs)
	for _, forbidden := range []string{"secret", "sk_private", "prompt", "private text", "not-a-safe", "not-a-campaign", "not-an-entry"} {
		if strings.Contains(serialized, forbidden) {
			t.Errorf("log attributes contain unsafe value %q: %s", forbidden, serialized)
		}
	}
	if !strings.Contains(serialized, "provider deepl") || !strings.Contains(serialized, "failure_category provider_error") {
		t.Fatalf("safe dimensions missing from log attributes: %s", serialized)
	}
}
