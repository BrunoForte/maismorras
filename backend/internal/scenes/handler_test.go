package scenes

import (
	"errors"
	"net/http"
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
