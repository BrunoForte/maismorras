package config

import (
	"testing"
	"time"
)

func TestLoadUsesSafeDefaults(t *testing.T) {
	for _, key := range []string{"PORT", "CORS_ORIGIN", "UPSTREAM_TIMEOUT", "TRANSLATION_TIMEOUT", "MAX_IMAGE_BYTES", "SUPABASE_URL", "DEEPL_API_KEY", "CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN", "REALTIME_BROKER", "REALTIME_BROKER_DATABASE_URL"} {
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
	if cfg.DeepLTranslateURL != "https://api-free.deepl.com/v2/translate" || cfg.CloudflareImageModel != "@cf/black-forest-labs/flux-1-schnell" {
		t.Fatalf("unexpected AI provider defaults: %+v", cfg)
	}
}

func TestLoadNormalizesOperationalValues(t *testing.T) {
	t.Setenv("PORT", "9090")
	t.Setenv("CORS_ORIGIN", "https://example.test")
	t.Setenv("UPSTREAM_TIMEOUT", "3s")
	t.Setenv("TRANSLATION_TIMEOUT", "90s")
	t.Setenv("MAX_IMAGE_BYTES", "1234")
	t.Setenv("SUPABASE_URL", "https://project.supabase.co/")
	t.Setenv("DEEPL_API_KEY", "deepl-test")
	t.Setenv("DEEPL_TRANSLATE_URL", "https://example.test/translate")
	t.Setenv("CLOUDFLARE_ACCOUNT_ID", "account-test")
	t.Setenv("CLOUDFLARE_API_TOKEN", "token-test")
	t.Setenv("CLOUDFLARE_IMAGE_MODEL", "@cf/test/model")
	cfg := Load()
	if cfg.Port != "9090" || cfg.UpstreamTimeout != 3*time.Second || cfg.TranslationTimeout != 90*time.Second || cfg.MaxImageBytes != 1234 || cfg.SupabaseURL != "https://project.supabase.co" {
		t.Fatalf("normalization failed: %+v", cfg)
	}
	if cfg.DeepLAPIKey != "deepl-test" || cfg.DeepLTranslateURL != "https://example.test/translate" || cfg.CloudflareAccountID != "account-test" || cfg.CloudflareAPIToken != "token-test" || cfg.CloudflareImageModel != "@cf/test/model" {
		t.Fatalf("provider settings not loaded: %+v", cfg)
	}
}

func TestProviderSelectionUsesConfiguredServicesAndSafeFallbacks(t *testing.T) {
	if (Config{}).TranslationProvider() != "pollinations" {
		t.Fatal("missing DeepL configuration should use Pollinations Text fallback")
	}
	if (Config{}).ImageProvider() != "pollinations" {
		t.Fatal("missing Cloudflare configuration should use Pollinations image fallback")
	}
	if (Config{DeepLAPIKey: "configured"}).TranslationProvider() != "deepl" {
		t.Fatal("configured DeepL key should select DeepL")
	}
	if (Config{CloudflareAccountID: "account"}).ImageProvider() != "pollinations" {
		t.Fatal("incomplete Cloudflare credentials should use Pollinations fallback")
	}
	if (Config{CloudflareAccountID: "account", CloudflareAPIToken: "configured"}).ImageProvider() != "cloudflare_workers_ai" {
		t.Fatal("complete Cloudflare configuration should select Workers AI")
	}
}
