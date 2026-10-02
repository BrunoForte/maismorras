package translation

import (
	"errors"
	"regexp"
	"strings"
)

var protectedTextPattern = regexp.MustCompile(`https?://[^\s)\]}>,]+|(?i)\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b|(?i)\b\d+d\d+(?:[+-]\d+)?\b|\b\d+(?:[.,]\d+)?\b|<\/?[A-Za-z][^>]*>|\[[^\]]*\]\(|\)|[\x60*_~#>]+`)

var (
	ErrProviderUnavailable = errors.New("translation provider unavailable")
	ErrRateLimited         = errors.New("translation provider rate limited")
	ErrTimeout             = errors.New("translation provider timed out")
)

func FailureCategory(err error) string {
	switch {
	case errors.Is(err, ErrNotConfigured):
		return "not_configured"
	case errors.Is(err, ErrQuotaExceeded):
		return "quota_exceeded"
	case errors.Is(err, ErrRateLimited):
		return "rate_limited"
	case errors.Is(err, ErrTimeout):
		return "timeout"
	case errors.Is(err, ErrProviderUnavailable):
		return "provider_unavailable"
	default:
		return "provider_error"
	}
}

func ValidateTranslatedFields(source, translated map[string]string) error {
	if len(source) == 0 || len(source) != len(translated) {
		return errors.New("translation field set mismatch")
	}
	for key, original := range source {
		value, ok := translated[key]
		if !ok || strings.TrimSpace(value) == "" || !sameProtectedTokens(original, value) {
			return errors.New("translation changed protected content")
		}
	}
	return nil
}

func sameProtectedTokens(source, translated string) bool {
	return strings.Join(protectedTextPattern.FindAllString(source, -1), "\x00") ==
		strings.Join(protectedTextPattern.FindAllString(translated, -1), "\x00")
}
