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

func boolPointer(value bool) *bool { return &value }
