package sheetcompat

import (
	"encoding/json"
	"testing"
)

// The current character backend does not model manual CA adjustments yet.
// Saving a legacy typed Sheet must keep this newer JSONB field as stored.
func TestMarshalPreservingUnknownKeepsManualArmorClassAdjustments(t *testing.T) {
	type legacySheet struct {
		Name       string `json:"name"`
		ArmorClass int    `json:"armorClass"`
	}
	stored := []byte(`{"name":"Before","armorClass":15,"armorClassAdjustments":[{"id":"feat-1","value":2,"source":"Defensive Duelist","active":true}]}`)
	encoded, err := MarshalPreservingUnknown(stored, legacySheet{Name: "After", ArmorClass: 17})
	if err != nil {
		t.Fatal(err)
	}
	var got map[string]json.RawMessage
	if err := json.Unmarshal(encoded, &got); err != nil {
		t.Fatal(err)
	}
	if string(got["name"]) != `"After"` || string(got["armorClass"]) != `17` {
		t.Fatalf("known sheet values were not updated: %s", encoded)
	}
	want := `[{"id":"feat-1","value":2,"source":"Defensive Duelist","active":true}]`
	if string(got["armorClassAdjustments"]) != want {
		t.Fatalf("newer manual AC data was not preserved: got %s, want %s", got["armorClassAdjustments"], want)
	}
}
