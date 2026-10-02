package apphttp

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"log/slog"
	"vtt-backend/internal/apperror"
	"vtt-backend/internal/observability"
)

func TestRequestLoggerCorrelatesAndRedactsRequest(t *testing.T) {
	const requestID = "7b98efb1-0fb3-4f35-ae27-a832632ae9d4"
	const campaignID = "388320bf-12b4-4141-82ae-5cb7af84205b"
	var output bytes.Buffer
	logger := slog.New(observability.NewCloudLoggingHandler(&output, nil))

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/v1/campaigns/{campaignID}/notes", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusAccepted)
	})
	handler := requestLogger(logger)(mux)
	request := httptest.NewRequest(http.MethodGet, "/api/v1/campaigns/"+campaignID+"/notes?email=player@example.test&access_token=query-secret", nil)
	request.Header.Set("X-Request-ID", requestID)
	request.Header.Set("Authorization", "Bearer jwt-secret-value")
	request.Header.Set("Cookie", "session=cookie-secret-value")
	request.Header.Set("User-Agent", "user-agent-secret-value")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if got := response.Header().Get("X-Request-ID"); got != requestID {
		t.Fatalf("response request ID = %q, want %q", got, requestID)
	}
	if response.Code != http.StatusAccepted {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusAccepted)
	}
	entry := decodeLogEntry(t, output.String())
	assertLogField(t, entry, "event", "http.request.completed")
	assertLogField(t, entry, "request_id", requestID)
	assertLogField(t, entry, "method", http.MethodGet)
	assertLogField(t, entry, "route", "GET /api/v1/campaigns/{campaignID}/notes")
	assertLogField(t, entry, "campaign_id", campaignID)
	assertLogField(t, entry, "message", "request completed")
	assertLogField(t, entry, "status", float64(http.StatusAccepted))
	assertLogField(t, entry, "severity", "INFO")
	if _, ok := entry["duration_ms"].(float64); !ok {
		t.Fatalf("duration_ms missing or not numeric: %#v", entry["duration_ms"])
	}
	for _, secret := range []string{"player@example.test", "query-secret", "jwt-secret-value", "cookie-secret-value", "user-agent-secret-value", "192.0.2.1"} {
		if strings.Contains(output.String(), secret) {
			t.Fatalf("log contains sensitive request data %q: %s", secret, output.String())
		}
	}
}

func TestRequestLoggerGeneratesRequestIDAndErrorIncludesIt(t *testing.T) {
	var output bytes.Buffer
	logger := slog.New(observability.NewCloudLoggingHandler(&output, nil))
	handler := requestLogger(logger)(withError(func(http.ResponseWriter, *http.Request) error {
		return apperror.Internal(errors.New("do not expose database URL or access token"))
	}))
	request := httptest.NewRequest(http.MethodGet, "/private-path?token=query-secret", nil)
	request.Header.Set("X-Request-ID", "not a request id\r\nseverity=ERROR")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	requestID := response.Header().Get("X-Request-ID")
	if !validRequestID(requestID) {
		t.Fatalf("generated request ID is invalid: %q", requestID)
	}
	var body struct {
		Error map[string]string `json:"error"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode error response: %v", err)
	}
	if got := body.Error["request_id"]; got != requestID {
		t.Fatalf("error response request ID = %q, want %q", got, requestID)
	}
	if strings.Contains(response.Body.String(), "database URL") || strings.Contains(response.Body.String(), "query-secret") {
		t.Fatalf("error response leaked internal data: %s", response.Body.String())
	}
	entry := decodeLogEntry(t, output.String())
	assertLogField(t, entry, "status", float64(http.StatusInternalServerError))
	assertLogField(t, entry, "severity", "ERROR")
	if strings.Contains(output.String(), "database URL") || strings.Contains(output.String(), "query-secret") || strings.Contains(output.String(), "severity=ERROR") {
		t.Fatalf("log leaked internal or untrusted request data: %s", output.String())
	}
}

func TestCORSAllowsAndExposesRequestID(t *testing.T) {
	handler := cors("https://maismorras.example")(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	request := httptest.NewRequest(http.MethodOptions, "/api/v1/campaigns", nil)
	request.Header.Set("Origin", "https://maismorras.example")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusNoContent {
		t.Fatalf("preflight status = %d, want %d", response.Code, http.StatusNoContent)
	}
	if got := response.Header().Get("Access-Control-Allow-Headers"); !strings.Contains(got, "X-Request-ID") {
		t.Fatalf("request ID is not allowed by CORS: %q", got)
	}
	if got := response.Header().Get("Access-Control-Expose-Headers"); got != "X-Request-ID, Retry-After" {
		t.Fatalf("request ID and retry delay response headers are not exposed by CORS: %q", got)
	}
}

func decodeLogEntry(t *testing.T, line string) map[string]any {
	t.Helper()
	var entry map[string]any
	if err := json.Unmarshal([]byte(line), &entry); err != nil {
		t.Fatalf("log is not valid JSON: %v; line=%q", err, line)
	}
	return entry
}

func assertLogField(t *testing.T, entry map[string]any, key string, want any) {
	t.Helper()
	if got := entry[key]; got != want {
		t.Fatalf("log field %s = %#v, want %#v", key, got, want)
	}
}
