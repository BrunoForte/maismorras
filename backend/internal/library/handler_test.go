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

func TestReclassifiedAudioPathSupportsExistingAndTaggedAssets(t *testing.T) {
	campaignID := "campaign-id"
	tests := []struct {
		path    string
		kind    string
		looping bool
		want    string
	}{
		{"campaigns/campaign-id/media/ambient.mp3", "effect", false, "campaigns/campaign-id/media/effect_once__ambient.mp3"},
		{"campaigns/campaign-id/media/64d0ac72-44de-4f2a-b976-ef6d3088d741-music__rain.mp3", "effect", false, "campaigns/campaign-id/media/64d0ac72-44de-4f2a-b976-ef6d3088d741-effect_once__rain.mp3"},
		{"campaigns/campaign-id/media/sfx__thunder.ogg", "music", true, "campaigns/campaign-id/media/music_loop__thunder.ogg"},
		{"campaigns/campaign-id/media/effect_once__rain.mp3", "effect", true, "campaigns/campaign-id/media/effect_loop__rain.mp3"},
	}
	for _, tt := range tests {
		got, err := configuredAudioPath(campaignID, tt.path, tt.kind, tt.looping)
		if err != nil || got != tt.want {
			t.Errorf("reclassifiedAudioPath(%q, %q) = (%q, %v), want %q", tt.path, tt.kind, got, err, tt.want)
		}
	}
}

func TestReclassifiedAudioPathRejectsUnsafeOrNonAudioPaths(t *testing.T) {
	for _, path := range []string{
		"campaigns/other/media/audio.mp3",
		"campaigns/campaign-id/media/subfolder/audio.mp3",
		"campaigns/campaign-id/media/../audio.mp3",
		"campaigns/campaign-id/media/image.png",
	} {
		if _, err := configuredAudioPath("campaign-id", path, "effect", false); err == nil {
			t.Errorf("expected path %q to be rejected", path)
		}
	}
	if _, err := configuredAudioPath("campaign-id", "campaigns/campaign-id/media/audio.mp3", "ambient", false); err == nil {
		t.Fatal("expected invalid audio kind to be rejected")
	}
}
