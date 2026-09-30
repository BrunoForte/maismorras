package apphttp

import (
	"bufio"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"

	"vtt-backend/internal/config"
	"vtt-backend/internal/overlayaccess"
	"vtt-backend/internal/realtime"
)

func TestHealth(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	res := httptest.NewRecorder()

	health(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", res.Code, http.StatusOK)
	}
	if got, want := res.Header().Get("Content-Type"), "application/json; charset=utf-8"; got != want {
		t.Fatalf("content type = %q, want %q", got, want)
	}
	if got, want := res.Body.String(), `{"status":"ok"}`; got != want {
		t.Fatalf("body = %q, want %q", got, want)
	}
}

type readinessStub struct {
	ready bool
	state string
}

func (r *readinessStub) Readiness() (bool, string) { return r.ready, r.state }

func TestReadinessEndpoint(t *testing.T) {
	provider := &readinessStub{ready: false, state: "starting"}
	handler := readinessHandler(provider)
	req := httptest.NewRequest(http.MethodGet, "/health/ready", nil)
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)
	if res.Code != http.StatusServiceUnavailable || res.Body.String() != `{"status":"not_ready","realtime":"starting"}` {
		t.Fatalf("initial readiness = %d %s", res.Code, res.Body.String())
	}
	if got := res.Header().Get("Cache-Control"); got != "no-store" {
		t.Fatalf("cache control = %q, want no-store", got)
	}

	provider.ready, provider.state = true, "connected"
	res = httptest.NewRecorder()
	handler.ServeHTTP(res, req)
	if res.Code != http.StatusOK || res.Body.String() != `{"status":"ok","realtime":"connected"}` {
		t.Fatalf("connected readiness = %d %s", res.Code, res.Body.String())
	}

	provider.state = "degraded"
	res = httptest.NewRecorder()
	handler.ServeHTTP(res, req)
	if res.Code != http.StatusOK || res.Body.String() != `{"status":"ok","realtime":"degraded"}` {
		t.Fatalf("transient outage readiness = %d %s", res.Code, res.Body.String())
	}
}

func TestLocalHubIsReadyWithoutBroker(t *testing.T) {
	var provider realtime.ReadinessProvider = realtime.NewHub()
	ready, state := provider.Readiness()
	if !ready || state != "local" {
		t.Fatalf("local hub readiness = %v, %q", ready, state)
	}
}

type hijackableRecorder struct {
	*httptest.ResponseRecorder
}

func (h *hijackableRecorder) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	return nil, bufio.NewReadWriter(bufio.NewReader(nil), bufio.NewWriter(nil)), nil
}

func TestStatusRecorderForwardsHijack(t *testing.T) {
	underlying := &hijackableRecorder{ResponseRecorder: httptest.NewRecorder()}
	recorder := &statusRecorder{ResponseWriter: underlying, status: http.StatusOK}

	if _, _, err := recorder.Hijack(); err != nil {
		t.Fatalf("Hijack() returned error: %v", err)
	}
	if recorder.status != http.StatusSwitchingProtocols {
		t.Fatalf("Hijack status = %d, want %d", recorder.status, http.StatusSwitchingProtocols)
	}
}

func TestDynamicAPIResponsesAreNotStored(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	cfg := config.Config{CORSOrigin: "https://app.example.test"}
	router := NewRouter(
		cfg, logger,
		nil, nil, nil, nil, nil, nil, nil, nil, nil,
		http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusUnauthorized) }),
		overlayaccess.NewHandler(nil, cfg),
	)
	paths := []string{
		"/api/v1/campaigns",
		"/api/v1/campaigns/00000000-0000-4000-8000-000000000001/scenes",
		"/api/v1/campaigns/00000000-0000-4000-8000-000000000001/notes",
		"/api/v1/campaigns/00000000-0000-4000-8000-000000000001/events",
		"/api/v1/scenes/00000000-0000-4000-8000-000000000002",
		"/api/v1/scenes/00000000-0000-4000-8000-000000000002/tokens/00000000-0000-4000-8000-000000000003",
		"/api/v1/scenes/00000000-0000-4000-8000-000000000002/overlay-layout",
		"/api/v1/scenes/00000000-0000-4000-8000-000000000002/presentation",
		"/api/v1/scenes/00000000-0000-4000-8000-000000000002/combat",
		"/api/v1/scenes/00000000-0000-4000-8000-000000000002/effects",
	}
	for _, path := range paths {
		t.Run(path, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodGet, path, nil)
			response := httptest.NewRecorder()
			router.ServeHTTP(response, request)
			if response.Code != http.StatusUnauthorized {
				t.Fatalf("status = %d, want unauthorized", response.Code)
			}
			if got := response.Header().Get("Cache-Control"); got != "no-store" {
				t.Fatalf("cache control = %q, want no-store", got)
			}
			if got := response.Header().Get("X-Content-Type-Options"); got != "nosniff" {
				t.Fatalf("security header was lost: X-Content-Type-Options = %q", got)
			}
		})
	}
}
