package scenes

import "testing"

func TestInitiativeAdvantageKeepsHigherRoll(t *testing.T) {
	rolls := []int{4, 17}
	if got := highestRoll(rolls); got != 17 {
		t.Fatalf("highestRoll(%v) = %d, want 17", rolls, got)
	}
}

func TestRollD20CountAndBounds(t *testing.T) {
	for _, test := range []struct {
		name      string
		advantage bool
		wantCount int
	}{{"normal", false, 1}, {"advantage", true, 2}} {
		t.Run(test.name, func(t *testing.T) {
			rolls, err := rollD20(test.advantage)
			if err != nil {
				t.Fatal(err)
			}
			if len(rolls) != test.wantCount {
				t.Fatalf("got %d d20 results, want %d", len(rolls), test.wantCount)
			}
			for _, roll := range rolls {
				if roll < 1 || roll > 20 {
					t.Fatalf("d20 result out of range: %d", roll)
				}
			}
		})
	}
}

func TestPresentationDismissalRequiresEmptyHiddenPayload(t *testing.T) {
	if !isPresentationDismissal(Presentation{}) {
		t.Fatal("empty presentation should be dismissible")
	}
	if isPresentationDismissal(Presentation{Visible: true}) {
		t.Fatal("visible presentation must not be treated as a dismissal")
	}
	if isPresentationDismissal(Presentation{AssetPath: "campaigns/map.png"}) {
		t.Fatal("presentation with an asset must not be treated as a dismissal")
	}
}

func TestApplyVisibilityRedactsPrivateFieldsForOtherPlayer(t *testing.T) {
	owner := "owner-id"
	token := Token{
		OwnerID: &owner, Name: "Arcanista", HPCurrent: 17, HPMax: 24, ArmorClass: 16,
		Statuses: []string{"Envenenado"}, Visibility: Visibility{},
	}

	got := applyVisibility(token, "player", "other-player")
	if got.Name != "Desconhecido" || got.HPCurrent != 0 || got.HPMax != 0 || got.ArmorClass != 0 || got.Statuses != nil {
		t.Fatalf("private fields leaked to another player: %#v", got)
	}
}

func TestApplyVisibilityPreservesOwnerAndGMData(t *testing.T) {
	owner := "owner-id"
	token := Token{OwnerID: &owner, Name: "Arcanista", HPCurrent: 17, HPMax: 24, ArmorClass: 16, Statuses: []string{"Envenenado"}}

	for _, viewer := range []struct{ role, userID string }{{"player", owner}, {"gm", "gm-id"}} {
		got := applyVisibility(token, viewer.role, viewer.userID)
		if got.Name != token.Name || got.HPCurrent != token.HPCurrent || got.ArmorClass != token.ArmorClass || len(got.Statuses) != 1 {
			t.Fatalf("%s should see private data: %#v", viewer.role, got)
		}
	}
}

func TestApplyVisibilityRespectsPublishedFields(t *testing.T) {
	token := Token{Name: "Goblin", HPCurrent: 5, HPMax: 7, ArmorClass: 13, Statuses: []string{"Caído"}, Visibility: Visibility{ShowName: true, ShowHP: true, ShowAC: true, ShowStatuses: true}}
	got := applyVisibility(token, "player", "viewer")
	if got.Name != "Goblin" || got.HPCurrent != 5 || got.HPMax != 7 || got.ArmorClass != 13 || len(got.Statuses) != 1 {
		t.Fatalf("published fields were incorrectly redacted: %#v", got)
	}
}
