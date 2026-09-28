package audience

import "testing"

func TestPolicyAllowsOnlyConfiguredAudience(t *testing.T) {
	tests := []struct {
		name   string
		policy Policy
		userID string
		want   bool
	}{
		{name: "all", policy: Policy{Mode: ModeAll}, userID: "player-a", want: true},
		{name: "none", policy: Policy{Mode: ModeNone}, userID: "player-a"},
		{name: "selected", policy: Policy{Mode: ModeSelected, UserIDs: []string{"player-a"}}, userID: "player-a", want: true},
		{name: "not selected", policy: Policy{Mode: ModeSelected, UserIDs: []string{"player-a"}}, userID: "player-b"},
		{name: "unknown mode fails closed", policy: Policy{Mode: "unexpected"}, userID: "player-a"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.policy.Allows(tt.userID); got != tt.want {
				t.Fatalf("Allows(%q) = %t, want %t", tt.userID, got, tt.want)
			}
		})
	}
}
