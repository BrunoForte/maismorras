package scenes

import "testing"

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
