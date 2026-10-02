package translation

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestValidateTranslatedFieldsPreservesMechanicsMarkupAndURLs(t *testing.T) {
	source := map[string]string{"pt-BR.rules.description": "Roll **1d20+4** at https://example.test/rules (UUID 123e4567-e89b-42d3-a456-426614174000)."}
	valid := map[string]string{"pt-BR.rules.description": "Role **1d20+4** em https://example.test/rules (UUID 123e4567-e89b-42d3-a456-426614174000)."}
	if err := ValidateTranslatedFields(source, valid); err != nil {
		t.Fatalf("valid translation rejected: %v", err)
	}
	for _, invalid := range []string{
		"Role **1d20+3** em https://example.test/rules (UUID 123e4567-e89b-42d3-a456-426614174000).",
		"Role **1d20+4** em https://example.test/other (UUID 123e4567-e89b-42d3-a456-426614174000).",
		"Role 1d20+4 em https://example.test/rules (UUID 123e4567-e89b-42d3-a456-426614174000).",
		"Role **1d20+4** em https://example.test/rules.",
	} {
		if err := ValidateTranslatedFields(source, map[string]string{"pt-BR.rules.description": invalid}); err == nil {
			t.Errorf("expected protected-token change to be rejected: %q", invalid)
		}
	}
}

func TestValidateTranslatedFieldsRejectsMissingAndEmptyValues(t *testing.T) {
	source := map[string]string{"name": "Wizard", "summary": "A spellcaster."}
	for _, result := range []map[string]string{
		{"name": "Mago"},
		{"name": "Mago", "summary": "  "},
		{"name": "Mago", "summary": "Um conjurador.", "extra": "campo"},
	} {
		if err := ValidateTranslatedFields(source, result); err == nil {
			t.Errorf("expected invalid field set to be rejected: %#v", result)
		}
	}
}

func TestProviderFailureCategories(t *testing.T) {
	for _, test := range []struct {
		err  error
		want string
	}{
		{ErrNotConfigured, "not_configured"},
		{ErrQuotaExceeded, "quota_exceeded"},
		{ErrRateLimited, "rate_limited"},
		{ErrTimeout, "timeout"},
		{ErrProviderUnavailable, "provider_unavailable"},
		{errors.New("bad response"), "provider_error"},
	} {
		if got := FailureCategory(test.err); got != test.want {
			t.Errorf("FailureCategory(%v)=%q, want %q", test.err, got, test.want)
		}
	}
}

func TestTranslationTimeoutAndQuotaAreCategorizedWithoutProviderBody(t *testing.T) {
	t.Run("quota", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusPaymentRequired)
			_, _ = w.Write([]byte("private-provider-response"))
		}))
		defer server.Close()
		_, err := NewService(server.Client(), server.URL, "test-key", "model").Translate(context.Background(), map[string]string{"name": "Wizard"})
		if !errors.Is(err, ErrQuotaExceeded) || err.Error() != ErrQuotaExceeded.Error() {
			t.Fatalf("error=%v, want sanitized quota sentinel", err)
		}
	})
	t.Run("timeout", func(t *testing.T) {
		ctx, cancel := context.WithDeadline(context.Background(), time.Now().Add(-time.Second))
		defer cancel()
		_, err := NewService(http.DefaultClient, "https://provider.invalid", "test-key", "model").Translate(ctx, map[string]string{"name": "Wizard"})
		if !errors.Is(err, ErrTimeout) {
			t.Fatalf("error=%v, want timeout sentinel", err)
		}
	})
}
