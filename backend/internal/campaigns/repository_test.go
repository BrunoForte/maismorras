package campaigns

import "testing"

func TestInviteLinkGrantsAccess(t *testing.T) {
	tests := []struct {
		name          string
		inactive      bool
		alreadyMember bool
		want          bool
	}{
		{name: "valid invite for new member", want: true},
		{name: "expired invite for existing member", inactive: true, alreadyMember: true, want: true},
		{name: "revoked invite for existing member", inactive: true, alreadyMember: true, want: true},
		{name: "expired invite for non-member", inactive: true, want: false},
		{name: "revoked invite for non-member", inactive: true, want: false},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := inviteLinkGrantsAccess(test.inactive, test.alreadyMember); got != test.want {
				t.Fatalf("inviteLinkGrantsAccess(%v, %v) = %v, want %v", test.inactive, test.alreadyMember, got, test.want)
			}
		})
	}
}
