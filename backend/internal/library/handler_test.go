package library

import "testing"

func TestEscapeStorageObjectPathPreservesFolders(t *testing.T) {
	got := escapeStorageObjectPath("campaigns/campaign-id/portraits/user-id/hero name #1.png")
	want := "campaigns/campaign-id/portraits/user-id/hero%20name%20%231.png"
	if got != want {
		t.Fatalf("escapeStorageObjectPath() = %q, want %q", got, want)
	}
}

func TestIsAudioPathRecognizesSupportedAudioAssets(t *testing.T) {
	for _, path := range []string{"music/theme.mp3", "tracks/ambient.OGG", "loop.m4a"} {
		if !isAudioPath(path) {
			t.Errorf("expected %q to be audio", path)
		}
	}
}

func TestIsAudioPathRejectsNonAudioAssets(t *testing.T) {
	for _, path := range []string{"maps/dungeon.webp", "portraits/hero.png", "notes/handout.pdf", "music/theme.mp3.bak"} {
		if isAudioPath(path) {
			t.Errorf("expected %q not to be audio", path)
		}
	}
}
