package scenes

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"vtt-backend/internal/apperror"
)

func TestTokenColorCollisionMapsToConflict(t *testing.T) {
	err := mapError(ErrTokenColorInUse)
	var response *apperror.Error
	if !errors.As(err, &response) {
		t.Fatalf("mapError returned %T, want *apperror.Error", err)
	}
	if response.Status != http.StatusConflict || response.Code != "TOKEN_COLOR_IN_USE" {
		t.Fatalf("unexpected response: status=%d code=%q", response.Status, response.Code)
	}
}

func TestDecodeHitPointsUpdateAcceptsExactlyOneSupportedField(t *testing.T) {
	for _, test := range []struct {
		name string
		body string
		want hitPointsUpdate
		ok   bool
	}{
		{name: "absolute zero", body: `{"hpCurrent":0}`, want: hitPointsUpdate{HPCurrent: intPointer(0)}, ok: true},
		{name: "negative delta", body: `{"delta":-10}`, want: hitPointsUpdate{Delta: intPointer(-10)}, ok: true},
		{name: "reject both", body: `{"delta":1,"hpCurrent":2}`},
		{name: "reject neither", body: `{}`},
		{name: "reject unknown key", body: `{"hpCurrent":4,"hpMax":99}`},
		{name: "reject fractional value", body: `{"delta":1.5}`},
	} {
		t.Run(test.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodPatch, "/", strings.NewReader(test.body))
			got, err := decodeHitPointsUpdate(request)
			if test.ok && err != nil {
				t.Fatalf("decodeHitPointsUpdate() error = %v", err)
			}
			if !test.ok && err == nil {
				t.Fatalf("decodeHitPointsUpdate(%s) succeeded, want error", test.body)
			}
			if test.ok && (got.HPCurrent == nil) != (test.want.HPCurrent == nil) {
				t.Fatalf("decoded operation = %#v, want %#v", got, test.want)
			}
			if test.ok && got.HPCurrent != nil && *got.HPCurrent != *test.want.HPCurrent {
				t.Fatalf("absolute HP = %d, want %d", *got.HPCurrent, *test.want.HPCurrent)
			}
			if test.ok && got.Delta != nil && *got.Delta != *test.want.Delta {
				t.Fatalf("delta = %d, want %d", *got.Delta, *test.want.Delta)
			}
		})
	}
}

func intPointer(value int) *int { return &value }

func TestClampHitPoints(t *testing.T) {
	for _, test := range []struct{ value, maximum, want int }{
		{-10, 20, 0},
		{0, 20, 0},
		{7, 20, 7},
		{30, 20, 20},
	} {
		if got := clampHitPoints(test.value, test.maximum); got != test.want {
			t.Errorf("clampHitPoints(%d, %d) = %d, want %d", test.value, test.maximum, got, test.want)
		}
	}
}

func TestMissingTokenMapsToNotFound(t *testing.T) {
	err := mapError(ErrTokenNotFound)
	var response *apperror.Error
	if !errors.As(err, &response) {
		t.Fatalf("mapError returned %T, want *apperror.Error", err)
	}
	if response.Status != http.StatusNotFound || response.Code != "TOKEN_NOT_FOUND" {
		t.Fatalf("unexpected response: status=%d code=%q", response.Status, response.Code)
	}
}

func TestTokenColorsAreDistinctAcrossHueFallback(t *testing.T) {
	seen := map[int]bool{}
	for hue := range 360 {
		color := tokenColorFromHue(hue)
		if color < 0 || color > 0xFFFFFF {
			t.Fatalf("hue %d generated invalid RGB color %#x", hue, color)
		}
		if seen[color] {
			t.Fatalf("hue %d generated a duplicate color %#x", hue, color)
		}
		seen[color] = true
	}
}

func TestValidMapDimensions(t *testing.T) {
	for _, test := range []struct {
		name   string
		width  int
		height int
		valid  bool
	}{
		{name: "minimum", width: 5, height: 5, valid: true},
		{name: "maximum", width: 100, height: 100, valid: true},
		{name: "too narrow", width: 4, height: 20},
		{name: "too tall", width: 20, height: 101},
	} {
		t.Run(test.name, func(t *testing.T) {
			if got := validMapDimensions(test.width, test.height); got != test.valid {
				t.Fatalf("validMapDimensions(%d, %d) = %v, want %v", test.width, test.height, got, test.valid)
			}
		})
	}
}

func TestDecodeCompendiumMonsterSheetSupportsSRDShape(t *testing.T) {
	raw := []byte(`{"catalog":"monster","hpMax":150,"armorClass":17,"initiative":7,"size":2,"imageUrl":"campaigns/c1/media/aboleth.webp","resistances":"cold; fire","immunities":"","actions":[{"name":"Tentacle","kind":"action","toHit":9,"damage":"2d6+5"}]}`)
	sheet, err := decodeCompendiumMonsterSheet(raw)
	if err != nil {
		t.Fatalf("decodeCompendiumMonsterSheet() error = %v", err)
	}
	if sheet.HitPointsMax != 150 || sheet.HitPointsCurrent != 150 || sheet.ArmorClass != 17 || sheet.ImageURL == "" {
		t.Fatalf("SRD stats were not mapped into the actor sheet: %#v", sheet)
	}
	if len(sheet.Resistances) != 1 || sheet.Resistances[0] != "cold; fire" || len(sheet.Actions) != 1 {
		t.Fatalf("SRD text fields or actions were not preserved: %#v", sheet)
	}
}

func TestCanEditCharacterTokenHitPoints(t *testing.T) {
	owner := "player-1"
	otherPlayer := "player-2"
	for _, test := range []struct {
		name      string
		role      string
		kind      string
		ownerID   *string
		userID    string
		wantAllow bool
	}{
		{name: "GM may edit any scene token", role: "gm", kind: "npc", userID: otherPlayer, wantAllow: true},
		{name: "character owner may edit own character", role: "player", kind: "character", ownerID: &owner, userID: owner, wantAllow: true},
		{name: "another player cannot edit character", role: "player", kind: "character", ownerID: &owner, userID: otherPlayer},
		{name: "player cannot edit character without an owner", role: "player", kind: "character", userID: owner},
		{name: "player cannot edit NPC", role: "player", kind: "npc", ownerID: &otherPlayer, userID: otherPlayer},
		{name: "player cannot edit an unlinked token", role: "player", userID: owner},
		{name: "unknown role is denied", role: "spectator", kind: "character", ownerID: &owner, userID: owner},
	} {
		t.Run(test.name, func(t *testing.T) {
			if got := canEditCharacterTokenHitPoints(test.role, test.kind, test.ownerID, test.userID); got != test.wantAllow {
				t.Fatalf("canEditCharacterTokenHitPoints() = %v, want %v", got, test.wantAllow)
			}
		})
	}
}
