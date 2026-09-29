package realtime

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
	"vtt-backend/internal/observability"
)

func TestPostgresBrokerLogsReadinessTransitionsWithoutConnectionData(t *testing.T) {
	var output bytes.Buffer
	logger := slog.New(observability.NewCloudLoggingHandler(&output, nil))
	broker := NewPostgresBroker(nil, "postgres://private-user:private-password@private-db.invalid:5432/game", "instance-123", logger)
	broker.markConnected()
	broker.markDisconnected()
	broker.markConnected()

	lines := strings.Split(strings.TrimSpace(output.String()), "\n")
	if len(lines) != 3 {
		t.Fatalf("readiness emitted %d log lines, want 3: %s", len(lines), output.String())
	}
	wantEvents := []string{"realtime.broker.connected", "realtime.broker.degraded", "realtime.broker.reconnected"}
	for i, line := range lines {
		var entry map[string]any
		if err := json.Unmarshal([]byte(line), &entry); err != nil {
			t.Fatalf("broker log is not valid JSON: %v; line=%q", err, line)
		}
		if got := entry["event"]; got != wantEvents[i] {
			t.Fatalf("event[%d] = %#v, want %q", i, got, wantEvents[i])
		}
		if got := entry["broker_mode"]; got != "postgres" {
			t.Fatalf("broker_mode = %#v, want postgres", got)
		}
	}
	for _, secret := range []string{"private-user", "private-password", "private-db.invalid", "postgres://", "payload"} {
		if strings.Contains(output.String(), secret) {
			t.Fatalf("broker logs contain sensitive data %q: %s", secret, output.String())
		}
	}
}

func TestSafeBrokerErrorLogAttributesExcludeErrorText(t *testing.T) {
	var output bytes.Buffer
	logger := slog.New(observability.NewCloudLoggingHandler(&output, nil))
	attrs := observability.SafeErrorAttrs(&pgconn.PgError{Code: "57P01", Message: "password=do-not-log"})
	logger.Warn("broker operation failed", append([]any{"event", "realtime.broker.connection_failed"}, attrs...)...)
	line := output.String()
	if strings.Contains(line, "password=do-not-log") {
		t.Fatalf("error detail leaked to log: %s", line)
	}
	var entry map[string]any
	if err := json.Unmarshal([]byte(line), &entry); err != nil {
		t.Fatalf("broker error log is not valid JSON: %v", err)
	}
	if got := entry["postgres_error_code"]; got != "57P01" {
		t.Fatalf("postgres error code = %#v, want 57P01", got)
	}
	if got := entry["severity"]; got != "WARNING" {
		t.Fatalf("Cloud Logging severity = %#v, want WARNING", got)
	}
}
