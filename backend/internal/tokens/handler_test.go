package tokens

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

type stubGenerator struct {
	photoURL string
	prompt   string
	err      error
}

func (s *stubGenerator) Generate(_ context.Context, prompt string) (string, error) {
	s.prompt = prompt
	return s.photoURL, s.err
}

func TestHandlerGenerateReturnsPhotoURL(t *testing.T) {
	t.Parallel()
	service := &stubGenerator{photoURL: "data:image/png;base64,abc"}
	handler := NewHandler(service)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/tokens/gerar?prompt=mago", nil)
	response := httptest.NewRecorder()

	err := handler.Generate(response, req)
	if err != nil {
		t.Fatalf("Generate() error = %v", err)
	}
	if got, want := service.prompt, "mago"; got != want {
		t.Errorf("service prompt = %q, want %q", got, want)
	}

	var body map[string]string
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if got, want := body["fotoUrl"], service.photoURL; got != want {
		t.Errorf("fotoUrl = %q, want %q", got, want)
	}
}

func TestHandlerGenerateRejectsMissingPrompt(t *testing.T) {
	t.Parallel()
	handler := NewHandler(&stubGenerator{})
	req := httptest.NewRequest(http.MethodGet, "/api/v1/tokens/gerar", nil)
	response := httptest.NewRecorder()

	err := handler.Generate(response, req)
	if err == nil {
		t.Fatal("Generate() error = nil, want validation error")
	}
}
