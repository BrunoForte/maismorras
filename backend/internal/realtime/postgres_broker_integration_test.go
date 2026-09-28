package realtime

import (
	"context"
	"encoding/json"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Set REALTIME_TEST_DATABASE_URL to exercise PostgreSQL NOTIFY delivery between
// independent connections. The normal unit suite stays self-contained.
func TestPostgresBrokerPublishesAcrossConnections(t *testing.T) {
	databaseURL := os.Getenv("REALTIME_TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("REALTIME_TEST_DATABASE_URL is not configured")
	}
	if !ListenCompatibleDatabaseURL(databaseURL) {
		t.Fatal("REALTIME_TEST_DATABASE_URL must use a direct or session connection on port 5432")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	listener, err := pgx.Connect(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close(context.Background())
	if _, err := listener.Exec(ctx, "LISTEN "+postgresRealtimeChannel); err != nil {
		t.Fatal(err)
	}

	envelope := Envelope{
		ProtocolVersion: realtimeProtocolVersion,
		EventID:         newRealtimeID(),
		OriginInstance:  "integration-publisher",
		SceneID:         "integration-scene",
		Payload:         json.RawMessage(`{"type":"scene.refresh"}`),
	}
	broker := NewPostgresBroker(pool, databaseURL, envelope.OriginInstance, nil)
	if err := broker.Publish(ctx, envelope); err != nil {
		t.Fatal(err)
	}
	notification, err := listener.WaitForNotification(ctx)
	if err != nil {
		t.Fatal(err)
	}
	var received Envelope
	if err := json.Unmarshal([]byte(notification.Payload), &received); err != nil {
		t.Fatal(err)
	}
	if received.EventID != envelope.EventID || received.OriginInstance != envelope.OriginInstance || received.SceneID != envelope.SceneID {
		t.Fatalf("received envelope %#v does not match publish %#v", received, envelope)
	}
}
