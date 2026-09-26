package scenes

import "testing"

func TestOverlayCameraCharacterIDs(t *testing.T) {
	validID := "34c52f5e-b8cb-4f16-b881-c93c3bf5cc74"
	ids, err := overlayCameraCharacterIDs([]byte(`[{"url":"https://vdo.ninja/one","characterId":"` + validID + `"},"https://vdo.ninja/legacy"]`))
	if err != nil {
		t.Fatal(err)
	}
	if len(ids) != 1 || ids[0] != validID {
		t.Fatalf("got character ids %v, want [%s]", ids, validID)
	}
	if _, err := overlayCameraCharacterIDs([]byte(`[{"characterId":"not-a-uuid"}]`)); err == nil {
		t.Fatal("expected invalid character id to be rejected")
	}
}

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

func TestPresentationRecipientAuthorization(t *testing.T) {
	p := Presentation{Visible: true, AudienceRestricted: true, VisibleUserIDs: []string{"player-a"}, OverlayVisible: true}
	if !presentationVisibleTo(p, "player", "player-a", false) {
		t.Fatal("selected player should see the presentation")
	}
	if presentationVisibleTo(p, "player", "player-b", false) {
		t.Fatal("unselected player must not see the presentation")
	}
	if presentationVisibleTo(p, "player", "player-b", true) {
		t.Fatal("only the GM session should load content for the OBS overlay")
	}
	if !presentationVisibleTo(p, "gm", "gm-id", true) {
		t.Fatal("GM should see the image in the overlay when that destination is enabled")
	}
	p.OverlayVisible = false
	if presentationVisibleTo(p, "gm", "gm-id", true) {
		t.Fatal("overlay must stay hidden when the GM did not select it")
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
