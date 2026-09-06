package tokens

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"strings"
	"testing"

	"vtt-backend/internal/apperror"
)

func TestPollinationsServiceGenerate(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.UserAgent(), "Mozilla/5.0") {
			t.Errorf("User-Agent = %q, expected browser-like User-Agent", r.UserAgent())
		}
		if got, want := r.URL.Query().Get("width"), "256"; got != want {
			t.Errorf("width = %q, want %q", got, want)
		}
		if got, want := r.URL.Query().Get("height"), "256"; got != want {
			t.Errorf("height = %q, want %q", got, want)
		}
		if got, want := r.URL.Query().Get("nologo"), "true"; got != want {
			t.Errorf("nologo = %q, want %q", got, want)
		}
		seed, err := strconv.Atoi(r.URL.Query().Get("seed"))
		if err != nil || seed < 0 || seed > 100000 {
			t.Errorf("seed = %q, expected integer between 0 and 100000", r.URL.Query().Get("seed"))
		}

		encodedPrompt := strings.TrimPrefix(r.URL.EscapedPath(), "/prompt/")
		prompt, err := url.PathUnescape(encodedPrompt)
		if err != nil {
			t.Fatal(err)
		}
		if want := "elfa arqueira" + promptSuffix; prompt != want {
			t.Errorf("prompt = %q, want %q", prompt, want)
		}

		w.Header().Set("Content-Type", "image/png")
		_, _ = w.Write([]byte("fake-png"))
	}))
	defer server.Close()

	service := NewPollinationsService(server.Client(), server.URL, 1024)
	photoURL, err := service.Generate(context.Background(), "elfa arqueira")
	if err != nil {
		t.Fatalf("Generate() error = %v", err)
	}
	if want := "data:image/png;base64,ZmFrZS1wbmc="; photoURL != want {
		t.Errorf("Generate() = %q, want %q", photoURL, want)
	}
}

func TestPollinationsServiceGenerateConvertsUpstreamFailuresToBadGateway(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer server.Close()

	service := NewPollinationsService(server.Client(), server.URL, 1024)
	_, err := service.Generate(context.Background(), "mago")

	var appErr *apperror.Error
	if !errors.As(err, &appErr) {
		t.Fatalf("error = %T, want *apperror.Error", err)
	}
	if got, want := appErr.Status, http.StatusBadGateway; got != want {
		t.Errorf("status = %d, want %d", got, want)
	}
}

func TestPollinationsServiceGenerateRejectsOversizedImage(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("12345"))
	}))
	defer server.Close()

	service := NewPollinationsService(server.Client(), server.URL, 4)
	_, err := service.Generate(context.Background(), "dragão")

	var appErr *apperror.Error
	if !errors.As(err, &appErr) || appErr.Status != http.StatusBadGateway {
		t.Fatalf("error = %#v, want 502 AppError", err)
	}
}
