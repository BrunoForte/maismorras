package overlayaccess

import (
	"strings"
	"testing"
)

func TestRandomTokenIsOpaqueAndUnique(t *testing.T) {
	first, err := randomToken("obs_access_", 32)
	if err != nil {
		t.Fatal(err)
	}
	second, err := randomToken("obs_access_", 32)
	if err != nil {
		t.Fatal(err)
	}
	if first == second || !IsOverlayToken(first) || len(strings.TrimPrefix(first, "obs_access_")) != 64 {
		t.Fatal("tokens must be unique 256-bit opaque credentials")
	}
	if digest(first) == first || len(digest(first)) != 64 {
		t.Fatal("only a fixed-length hash should be stored instead of the bearer credential")
	}
}
