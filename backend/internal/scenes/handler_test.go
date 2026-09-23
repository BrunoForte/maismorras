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
