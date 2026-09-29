package realtime

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
)

// TestPostgresBrokerReadinessReconnects exercises the production listener loop
// against local Supabase Postgres, including initial readiness and recovery
// after PostgreSQL terminates the active listener session.
func TestPostgresBrokerReadinessReconnects(t *testing.T) {
	databaseURL := os.Getenv("REALTIME_TEST_DATABASE_URL")
	if !isLocalSupabaseTestURL(databaseURL) {
		t.Skip("requires the isolated local Supabase Postgres URL")
	}
	broker := NewPostgresBroker(nil, databaseURL, "readiness-integration", nil)
	hub := NewHub()
	hub.ConfigureBroker(broker)
	ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
	defer cancel()
	connected := make(chan struct{}, 3)
	listenerPIDs := make(chan uint32, 3)
	done := make(chan error, 1)
	if ready, state := hub.Readiness(); ready || state != "starting" {
		t.Fatalf("broker should start unready before its listener starts: %v, %q", ready, state)
	}
	go func() {
		done <- broker.listen(ctx, func(Envelope) {}, func() { connected <- struct{}{} }, func(pid uint32) {
			listenerPIDs <- pid
		})
	}()

	waitForReadinessState(t, ctx, hub, "connected", true)
	select {
	case <-connected:
	case <-ctx.Done():
		t.Fatal("listener did not establish its initial connection")
	}
	var listenerPID uint32
	select {
	case listenerPID = <-listenerPIDs:
	case <-ctx.Done():
		t.Fatal("listener did not report its database connection")
	}
	admin, err := pgx.Connect(ctx, databaseURL)
	if err != nil {
		t.Fatalf("connect to local Postgres control session: %v", err)
	}
	defer admin.Close(context.Background())
	var terminated bool
	if err := admin.QueryRow(ctx, "select pg_terminate_backend($1)", listenerPID).Scan(&terminated); err != nil {
		t.Fatalf("terminate the broker listener session: %v", err)
	}
	if !terminated {
		t.Fatal("Postgres did not terminate the broker listener session")
	}
	waitForReadinessState(t, ctx, hub, "degraded", true)
	select {
	case <-connected:
	case <-ctx.Done():
		t.Fatal("listener did not reconnect after its active connection was interrupted")
	}
	select {
	case <-listenerPIDs:
	case <-ctx.Done():
		t.Fatal("listener did not establish a new Postgres session")
	}
	waitForReadinessState(t, ctx, hub, "connected", true)

	cancel()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("listener did not stop after context cancellation")
	}
}

func waitForReadinessState(t *testing.T, ctx context.Context, provider ReadinessProvider, state string, ready bool) {
	t.Helper()
	ticker := time.NewTicker(10 * time.Millisecond)
	defer ticker.Stop()
	for {
		actualReady, actualState := provider.Readiness()
		if actualReady == ready && actualState == state {
			return
		}
		select {
		case <-ctx.Done():
			t.Fatalf("broker readiness never reached %q (ready=%v, state=%q)", state, actualReady, actualState)
		case <-ticker.C:
		}
	}
}
