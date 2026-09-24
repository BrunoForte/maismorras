package library

import (
	"reflect"
	"testing"
)

func TestNormalizePermissionSelection(t *testing.T) {
	tests := []struct {
		name       string
		restricted *bool
		userIDs    []string
		wantOnly   bool
		wantUsers  []string
	}{
		{name: "new all players selection ignores stale checkboxes", restricted: boolPointer(false), userIDs: []string{"player-1"}},
		{name: "new selected players selection", restricted: boolPointer(true), userIDs: []string{"player-1"}, wantOnly: true, wantUsers: []string{"player-1"}},
		{name: "legacy selected list remains restricted", userIDs: []string{"player-1"}, wantOnly: true, wantUsers: []string{"player-1"}},
		{name: "legacy empty list remains all players"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			restricted, users := normalizePermissionSelection(tt.restricted, tt.userIDs)
			if restricted != tt.wantOnly || !reflect.DeepEqual(users, tt.wantUsers) {
				t.Fatalf("normalizePermissionSelection() = (%v, %#v), want (%v, %#v)", restricted, users, tt.wantOnly, tt.wantUsers)
			}
		})
	}
}

func TestPermissionResponseOmitsGMAndKeepsSelectedPlayers(t *testing.T) {
	response := permissionResponse("gm-id", []string{"player-1", "gm-id", "player-2"}, true)
	if response["userIds"].([]string)[0] != "player-1" || response["userIds"].([]string)[1] != "player-2" {
		t.Fatalf("permissionResponse() userIds = %#v", response["userIds"])
	}
	if response["restricted"] != true || response["isGM"] != true {
		t.Fatalf("permissionResponse() = %#v", response)
	}
}

func TestPermissionResponseRepresentsEmptyAllowlist(t *testing.T) {
	response := permissionResponse("gm-id", nil, true)
	if response["userIds"].([]string) == nil || len(response["userIds"].([]string)) != 0 {
		t.Fatalf("empty selected-player list must be represented as an empty array: %#v", response)
	}
	if response["restricted"] != true {
		t.Fatalf("empty allowlist must stay restricted: %#v", response)
	}
}

func boolPointer(value bool) *bool { return &value }
