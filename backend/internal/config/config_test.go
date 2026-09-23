package config

import (
	"testing"
	"time"
)

func TestLoadUsesSafeDefaults(t *testing.T) {
	for _, key := range []string{"PORT", "CORS_ORIGIN", "UPSTREAM_TIMEOUT", "TRANSLATION_TIMEOUT", "MAX_IMAGE_BYTES", "SUPABASE_URL"} {
		t.Setenv(key, "")
	}
	cfg := Load()
	if cfg.Port != "8080" || cfg.CORSOrigin != "http://localhost:5173" {
		t.Fatalf("unexpected defaults: %+v", cfg)
	}
	if cfg.UpstreamTimeout != 20*time.Second || cfg.MaxImageBytes != 5*1024*1024 {
		t.Fatalf("unexpected limits: %+v", cfg)
	}
	if cfg.TranslationTimeout != 120*time.Second {
		t.Fatalf("translation timeout = %s, want 2m", cfg.TranslationTimeout)
	}
}

func TestLoadNormalizesOperationalValues(t *testing.T) {
	t.Setenv("PORT", "9090")
	t.Setenv("CORS_ORIGIN", "https://example.test")
	t.Setenv("UPSTREAM_TIMEOUT", "3s")
	t.Setenv("TRANSLATION_TIMEOUT", "90s")
	t.Setenv("MAX_IMAGE_BYTES", "1234")
	t.Setenv("SUPABASE_URL", "https://project.supabase.co/")
	cfg := Load()
	if cfg.Port != "9090" || cfg.UpstreamTimeout != 3*time.Second || cfg.TranslationTimeout != 90*time.Second || cfg.MaxImageBytes != 1234 || cfg.SupabaseURL != "https://project.supabase.co" {
		t.Fatalf("normalization failed: %+v", cfg)
	}
}
