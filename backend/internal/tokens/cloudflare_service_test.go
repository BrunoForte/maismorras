package tokens

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"vtt-backend/internal/apperror"
)

func TestCloudflareServiceGenerate(t *testing.T) {
	wantBytes := []byte("fake-png-image")
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got, want := r.Method, http.MethodPost; got != want {
			t.Errorf("method=%s want %s", got, want)
		}
		if got, want := r.URL.Path, "/account-id/ai/run/@cf/black-forest-labs/flux-1-schnell"; got != want {
			t.Errorf("path=%s want %s", got, want)
		}
		if got, want := r.Header.Get("Authorization"), "Bearer cf_secret"; got != want {
			t.Errorf("authorization=%q want %q", got, want)
		}
		var input struct {
			Prompt string `json:"prompt"`
			Steps  int    `json:"steps"`
		}
		if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(input.Prompt, "elfa") || input.Steps != 4 {
			t.Errorf("unexpected input: %+v", input)
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "result": map[string]string{"image": base64.StdEncoding.EncodeToString(wantBytes)}})
	}))
	defer server.Close()

	service := NewCloudflareService(server.Client(), "account-id", "cf_secret", "@cf/black-forest-labs/flux-1-schnell", 1024)
	service.baseURL = server.URL
	got, err := service.Generate(context.Background(), "elfa")
	if err != nil {
		t.Fatal(err)
	}
	if got != "data:image/png;base64,"+base64.StdEncoding.EncodeToString(wantBytes) {
		t.Fatalf("image result=%q", got)
	}
}

func TestCloudflareServiceMapKeepsRequiredTopDownPrompt(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var input struct {
			Prompt string `json:"prompt"`
		}
		_ = json.NewDecoder(r.Body).Decode(&input)
		for _, required := range []string{"vilarejo", "ONLY a playable 2D top-down tactical battle map", "ABSOLUTELY NO horizon", "1.5 meters by 1.5 meters"} {
			if !strings.Contains(input.Prompt, required) {
				t.Errorf("prompt is missing %q", required)
			}
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "result": map[string]string{"image": base64.StdEncoding.EncodeToString([]byte("map"))}})
	}))
	defer server.Close()

	service := NewCloudflareService(server.Client(), "account", "token", "model", 100)
	service.baseURL = server.URL
	if _, err := service.GenerateMap(context.Background(), "vilarejo"); err != nil {
		t.Fatal(err)
	}
}

func TestCloudflareServiceRejectsOversizedImage(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "result": map[string]string{"image": base64.StdEncoding.EncodeToString([]byte("too large"))}})
	}))
	defer server.Close()
	service := NewCloudflareService(server.Client(), "account", "token", "model", 4)
	service.baseURL = server.URL
	_, err := service.Generate(context.Background(), "portrait")
	var appErr *apperror.Error
	if !errors.As(err, &appErr) || appErr.Status != http.StatusBadGateway {
		t.Fatalf("err=%v want 502 AppError", err)
	}
}

func TestCloudflareServiceMapsQuotaAndHidesProviderDetails(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusTooManyRequests)
		_, _ = w.Write([]byte("private cloudflare detail"))
	}))
	defer server.Close()
	service := NewCloudflareService(server.Client(), "account", "token", "model", 100)
	service.baseURL = server.URL
	_, err := service.Generate(context.Background(), "portrait")
	var appErr *apperror.Error
	if !errors.As(err, &appErr) || appErr.Status != http.StatusTooManyRequests || strings.Contains(err.Error(), "private cloudflare detail") {
		t.Fatalf("err=%v should be a safe rate-limit response", err)
	}
}
