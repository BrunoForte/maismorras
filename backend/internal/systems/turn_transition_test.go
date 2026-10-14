package systems

import "testing"

func TestDnd2024CombatTurnTransitionPolicy(t *testing.T) {
	policy, ok := ResolveCombatTurnTransitionPolicy(DefaultRef())
	if !ok {
		t.Fatal("D&D 2024 combat turn transition policy is not registered")
	}

	for _, test := range []struct {
		name     string
		previous string
		next     string
		want     CombatTurnTransition
	}{
		{name: "empty combat remains empty", want: CombatTurnTransition{Kind: CombatTurnUnchanged}},
		{name: "combat starts", next: "token-a", want: CombatTurnTransition{Kind: CombatStarted, StartNextTurn: true, ResetNextMovement: true}},
		{name: "same token repeats without transition", previous: "token-a", next: "token-a", want: CombatTurnTransition{Kind: CombatTurnUnchanged}},
		{name: "active token changes", previous: "token-a", next: "token-b", want: CombatTurnTransition{Kind: CombatTurnAdvanced, EndPreviousTurn: true, StartNextTurn: true, ResetNextMovement: true}},
		{name: "combat ends", previous: "token-a", want: CombatTurnTransition{Kind: CombatEnded, EndPreviousTurn: true}},
	} {
		t.Run(test.name, func(t *testing.T) {
			if got := policy.PlanTurnTransition(test.previous, test.next); got != test.want {
				t.Fatalf("PlanTurnTransition(%q, %q) = %+v, want %+v", test.previous, test.next, got, test.want)
			}
		})
	}
}

func TestCombatTurnTransitionPolicyRequiresRegisteredVersion(t *testing.T) {
	for _, ref := range []Ref{
		{ID: Dnd2024, Version: "9.9.9"},
		{ID: "dnd35", Version: "1.0.0"},
	} {
		if policy, ok := ResolveCombatTurnTransitionPolicy(ref); ok || policy != nil {
			t.Fatalf("unsupported reference %+v resolved to %T", ref, policy)
		}
	}
}
