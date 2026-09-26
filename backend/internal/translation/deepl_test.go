package translation

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestDeepLTranslatePreservesFieldKeysAndUsesBrazilianPortuguese(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Authorization"); got != "DeepL-Auth-Key deepl_test_key" {
			t.Errorf("Authorization = %q", got)
		}
		var input deepLRequest
		if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
			t.Fatal(err)
		}
		if input.SourceLang != "EN" || input.TargetLang != "PT-BR" || !input.PreserveFormatting {
			t.Errorf("unexpected DeepL options: %+v", input)
		}
		var response strings.Builder
		response.WriteString(`{"translations":[`)
		for i, text := range input.Text {
			if i > 0 {
				response.WriteByte(',')
			}
			encoded, _ := json.Marshal(map[string]string{"text": "PT: " + text})
			response.Write(encoded)
		}
		response.WriteString(`]}`)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(response.String()))
	}))
	defer server.Close()

	service := NewDeepLService(server.Client(), server.URL, "deepl_test_key")
	result, err := service.Translate(context.Background(), map[string]string{
		"pt-BR":         "Wizard",
		"pt-BR.summary": "A spellcaster.",
	})
	if err != nil {
		t.Fatal(err)
	}
	if result["pt-BR"] != "PT: Wizard" || result["pt-BR.summary"] != "PT: A spellcaster." {
		t.Fatalf("translated fields = %#v", result)
	}
}

func TestDeepLTranslateSplitsLargeFieldSetsIntoBoundedRequests(t *testing.T) {
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		var input deepLRequest
		if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
			t.Fatal(err)
		}
		translations := make([]map[string]string, len(input.Text))
		for i, text := range input.Text {
			translations[i] = map[string]string{"text": "PT: " + text}
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"translations": translations})
	}))
	defer server.Close()

	fields := make(map[string]string, deeplMaxTextsPerRequest+1)
	for i := 0; i < deeplMaxTextsPerRequest+1; i++ {
		fields[fmt.Sprintf("field-%02d", i)] = "text"
	}
	result, err := NewDeepLService(server.Client(), server.URL, "key").Translate(context.Background(), fields)
	if err != nil {
		t.Fatal(err)
	}
	if calls != 2 || len(result) != len(fields) {
		t.Fatalf("calls=%d translations=%d, want 2 calls and %d fields", calls, len(result), len(fields))
	}
}

func TestDeepLTranslateRejectsMissingConfiguration(t *testing.T) {
	if _, err := NewDeepLService(http.DefaultClient, "", "").Translate(context.Background(), map[string]string{"pt-BR": "Wizard"}); err != ErrNotConfigured {
		t.Fatalf("error=%v, want ErrNotConfigured", err)
	}
}

func TestDeepLTranslateRejectsIncompleteResponse(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"translations":[]}`))
	}))
	defer server.Close()
	if _, err := NewDeepLService(server.Client(), server.URL, "key").Translate(context.Background(), map[string]string{"pt-BR": "Wizard"}); err == nil {
		t.Fatal("expected incomplete response error")
	}
}

func TestDeepLTranslateReturnsQuotaSentinelWithoutProviderPayload(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(456)
		_, _ = w.Write([]byte("private provider details"))
	}))
	defer server.Close()
	_, err := NewDeepLService(server.Client(), server.URL, "key").Translate(context.Background(), map[string]string{"pt-BR": "Wizard"})
	if err != ErrQuotaExceeded {
		t.Fatalf("error=%v, want ErrQuotaExceeded", err)
	}
}
