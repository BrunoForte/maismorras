package tokens

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"vtt-backend/internal/auth"
)

type stubGenerator struct {
	photoURL  string
	prompt    string
	err       error
	mapURL    string
	mapPrompt string
	mapErr    error
}

type stubGenerationPolicy struct {
	mapAllowed  bool
	quotaAllows bool
	operations  []string
}

func (s *stubGenerationPolicy) CanGenerateMap(context.Context, string, string, bool) (bool, error) {
	return s.mapAllowed, nil
}

func (s *stubGenerationPolicy) Consume(_ context.Context, _, operation string, _ int) (bool, error) {
	s.operations = append(s.operations, operation)
	return s.quotaAllows, nil
}

func authenticatedRequest(req *http.Request) *http.Request {
	return req.WithContext(auth.WithPrincipal(req.Context(), auth.Principal{UserID: "user-id"}))
}

func (s *stubGenerator) Generate(_ context.Context, prompt string) (string, error) {
	s.prompt = prompt
	return s.photoURL, s.err
}

func (s *stubGenerator) GenerateMap(_ context.Context, prompt string) (string, error) {
	s.mapPrompt = prompt
	return s.mapURL, s.mapErr
}

func TestHandlerGenerateReturnsPhotoURL(t *testing.T) {
	t.Parallel()
	service := &stubGenerator{photoURL: "data:image/png;base64,abc"}
	policy := &stubGenerationPolicy{quotaAllows: true}
	handler := NewHandler(service, policy)
	req := authenticatedRequest(httptest.NewRequest(http.MethodGet, "/api/v1/tokens/gerar?prompt=mago", nil))
	response := httptest.NewRecorder()

	err := handler.Generate(response, req)
	if err != nil {
		t.Fatalf("Generate() error = %v", err)
	}
	if got, want := service.prompt, "mago"; got != want {
		t.Errorf("service prompt = %q, want %q", got, want)
	}
	if len(policy.operations) != 1 || policy.operations[0] != "portrait" {
		t.Fatalf("quota operations = %#v, want one portrait quota check", policy.operations)
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

func TestHandlerGenerateMapReturnsPhotoURL(t *testing.T) {
	t.Parallel()
	service := &stubGenerator{mapURL: "data:image/png;base64,mapa"}
	policy := &stubGenerationPolicy{mapAllowed: true, quotaAllows: true}
	handler := NewHandler(service, policy)
	req := authenticatedRequest(httptest.NewRequest(http.MethodGet, "/api/v1/campaigns/campaign-id/scenes/generate-background?prompt=masmorra", nil))
	req.SetPathValue("campaignID", "campaign-id")
	response := httptest.NewRecorder()
	err := handler.GenerateMap(response, req)
	if err != nil {
		t.Fatalf("GenerateMap() error = %v", err)
	}
	if got, want := service.mapPrompt, "masmorra"; got != want {
		t.Errorf("map prompt = %q, want %q", got, want)
	}
	if len(policy.operations) != 1 || policy.operations[0] != "map" {
		t.Fatalf("quota operations = %#v, want one map quota check", policy.operations)
	}

	var body map[string]string
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if got, want := body["fotoUrl"], service.mapURL; got != want {
		t.Errorf("fotoUrl = %q, want %q", got, want)
	}
}

func TestHandlerGenerateMapRequiresCampaignGM(t *testing.T) {
	t.Parallel()
	policy := &stubGenerationPolicy{mapAllowed: false, quotaAllows: true}
	service := &stubGenerator{mapURL: "should-not-be-generated"}
	handler := NewHandler(service, policy)
	req := authenticatedRequest(httptest.NewRequest(http.MethodGet, "/api/v1/campaigns/campaign-id/scenes/generate-background?prompt=masmorra", nil))
	req.SetPathValue("campaignID", "campaign-id")
	response := httptest.NewRecorder()

	err := handler.GenerateMap(response, req)
	if err == nil {
		t.Fatal("GenerateMap() error = nil for a non-GM")
	}
	if service.mapPrompt != "" || len(policy.operations) != 0 {
		t.Fatal("unauthorized map generation reached the provider or consumed quota")
	}
}

func TestHandlerGenerateRejectsMissingAuthenticatedIdentity(t *testing.T) {
	t.Parallel()
	service := &stubGenerator{}
	handler := NewHandler(service, &stubGenerationPolicy{quotaAllows: true})
	req := httptest.NewRequest(http.MethodGet, "/api/v1/tokens/gerar?prompt=mago", nil)
	response := httptest.NewRecorder()

	if err := handler.Generate(response, req); err == nil {
		t.Fatal("Generate() error = nil for an unauthenticated request")
	}
	if service.prompt != "" {
		t.Fatal("unauthenticated request reached the image provider")
	}
}
