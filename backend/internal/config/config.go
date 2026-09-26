package config

import (
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

// Config centraliza configurações operacionais. Em produção, injete-as por variáveis de ambiente.
type Config struct {
	Port                 string
	CORSOrigin           string
	PollinationsBaseURL  string
	PollinationsTextURL  string
	PollinationsAPIKey   string
	TranslationModel     string
	DeepLAPIKey          string
	DeepLTranslateURL    string
	CloudflareAccountID  string
	CloudflareAPIToken   string
	CloudflareImageModel string
	UpstreamTimeout      time.Duration
	TranslationTimeout   time.Duration
	MaxImageBytes        int64
	DatabaseURL          string
	SupabaseJWTSecret    string
	SupabaseURL          string
	SupabaseSecretKey    string
}

func Load() Config {
	// Local development convenience. Production values continue to come from the host environment.
	_ = godotenv.Load()
	return Config{
		Port:                 env("PORT", "8080"),
		CORSOrigin:           env("CORS_ORIGIN", "http://localhost:5173"),
		PollinationsBaseURL:  env("POLLINATIONS_BASE_URL", "https://image.pollinations.ai"),
		PollinationsTextURL:  env("POLLINATIONS_TEXT_URL", "https://gen.pollinations.ai/v1/chat/completions"),
		PollinationsAPIKey:   os.Getenv("POLLINATIONS_API_KEY"),
		TranslationModel:     env("TRANSLATION_MODEL", "openai-fast"),
		DeepLAPIKey:          strings.TrimSpace(os.Getenv("DEEPL_API_KEY")),
		DeepLTranslateURL:    env("DEEPL_TRANSLATE_URL", "https://api-free.deepl.com/v2/translate"),
		CloudflareAccountID:  strings.TrimSpace(os.Getenv("CLOUDFLARE_ACCOUNT_ID")),
		CloudflareAPIToken:   strings.TrimSpace(os.Getenv("CLOUDFLARE_API_TOKEN")),
		CloudflareImageModel: env("CLOUDFLARE_IMAGE_MODEL", "@cf/black-forest-labs/flux-1-schnell"),
		UpstreamTimeout:      durationEnv("UPSTREAM_TIMEOUT", 20*time.Second),
		TranslationTimeout:   durationEnv("TRANSLATION_TIMEOUT", 120*time.Second),
		MaxImageBytes:        intEnv("MAX_IMAGE_BYTES", 5*1024*1024),
		DatabaseURL:          os.Getenv("DATABASE_URL"),
		SupabaseJWTSecret:    os.Getenv("SUPABASE_JWT_SECRET"),
		SupabaseURL:          strings.TrimRight(os.Getenv("SUPABASE_URL"), "/"),
		SupabaseSecretKey:    firstEnv("SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"),
	}
}

func firstEnv(keys ...string) string {
	for _, key := range keys {
		if value := strings.TrimSpace(os.Getenv(key)); value != "" {
			return value
		}
	}
	return ""
}

func env(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func durationEnv(key string, fallback time.Duration) time.Duration {
	value, err := time.ParseDuration(os.Getenv(key))
	if err != nil || value <= 0 {
		return fallback
	}
	return value
}

func intEnv(key string, fallback int64) int64 {
	value, err := strconv.ParseInt(os.Getenv(key), 10, 64)
	if err != nil || value <= 0 {
		return fallback
	}
	return value
}
