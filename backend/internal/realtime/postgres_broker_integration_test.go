package realtime

import (
	"context"
	"encoding/json"
	"errors"
	"net"
	"net/url"
	"os"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"nhooyr.io/websocket"
)

func TestPostgresBrokerReadinessSurvivesTransientDisconnect(t *testing.T) {
	broker := NewPostgresBroker(nil, "", "test-instance", nil)
	if ready, state := broker.Readiness(); ready || state != "starting" {
		t.Fatalf("initial readiness = %v, %q; want false, starting", ready, state)
	}
	broker.markConnected()
	if ready, state := broker.Readiness(); !ready || state != "connected" {
		t.Fatalf("connected readiness = %v, %q; want true, connected", ready, state)
	}
	broker.markDisconnected()
	if ready, state := broker.Readiness(); !ready || state != "degraded" {
		t.Fatalf("degraded readiness = %v, %q; want true, degraded", ready, state)
	}
	broker.markConnected()
	if ready, state := broker.Readiness(); !ready || state != "connected" {
		t.Fatalf("recovered readiness = %v, %q; want true, connected", ready, state)
	}
}

// Set REALTIME_TEST_DATABASE_URL to exercise PostgreSQL NOTIFY delivery between
// independent connections. The normal unit suite stays self-contained.
func TestPostgresBrokerPublishesAcrossConnections(t *testing.T) {
	databaseURL := os.Getenv("REALTIME_TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("REALTIME_TEST_DATABASE_URL is not configured")
	}
	if !ListenCompatibleDatabaseURL(databaseURL) && !isLocalSupabaseTestURL(databaseURL) {
		t.Fatal("REALTIME_TEST_DATABASE_URL must use a direct/session connection on port 5432 or a loopback Supabase URL matching REALTIME_TEST_LOCAL_SUPABASE_PORT")
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

// isLocalSupabaseTestURL permits only loopback PostgreSQL URLs on the configured
// local Supabase port. For an isolated stack on another port, set both
// REALTIME_TEST_DATABASE_URL to that stack's PostgreSQL URL and
// REALTIME_TEST_LOCAL_SUPABASE_PORT to the same port before running the tests.
// The default remains Supabase CLI's standard port, and this test-only setting
// never changes the production ListenCompatibleDatabaseURL policy.
func isLocalSupabaseTestURL(raw string) bool {
	parsed, err := url.Parse(raw)
	if err != nil || (parsed.Scheme != "postgres" && parsed.Scheme != "postgresql") {
		return false
	}
	portText := strings.TrimSpace(os.Getenv("REALTIME_TEST_LOCAL_SUPABASE_PORT"))
	if portText == "" {
		portText = "54322"
	}
	port, err := strconv.Atoi(portText)
	if err != nil || port < 1 || port > 65535 || parsed.Port() != strconv.Itoa(port) {
		return false
	}
	query := parsed.Query()
	if strings.EqualFold(query.Get("pool_mode"), "transaction") || strings.EqualFold(query.Get("pooling"), "transaction") {
		return false
	}
	switch strings.ToLower(parsed.Hostname()) {
	case "localhost", "127.0.0.1", "::1":
		return true
	default:
		return false
	}
}

// TestPostgresBrokerFanoutAcrossIndependentInstances exercises the full
// instance boundary: each hub owns local WebSocket peers and each broker owns
// an independent LISTEN connection to the same PostgreSQL database.
func TestPostgresBrokerFanoutAcrossIndependentInstances(t *testing.T) {
	databaseURL := os.Getenv("REALTIME_TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("REALTIME_TEST_DATABASE_URL is not configured")
	}
	if !ListenCompatibleDatabaseURL(databaseURL) && !isLocalSupabaseTestURL(databaseURL) {
		t.Fatal("REALTIME_TEST_DATABASE_URL must use a direct/session connection on port 5432 or a loopback Supabase URL matching REALTIME_TEST_LOCAL_SUPABASE_PORT")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()

	hubA, hubB := NewHub(), NewHub()
	brokerA := NewPostgresBroker(pool, databaseURL, hubA.OriginInstanceID(), nil)
	brokerB := NewPostgresBroker(pool, databaseURL, hubB.OriginInstanceID(), nil)
	hubA.ConfigureBroker(brokerA)
	hubB.ConfigureBroker(brokerB)

	listenCtxA, stopA := context.WithCancel(ctx)
	listenCtxB, stopB := context.WithCancel(ctx)
	defer stopA()
	defer stopB()
	readyA, readyB := make(chan struct{}, 1), make(chan struct{}, 1)
	doneA, doneB := make(chan error, 1), make(chan error, 1)
	go func() {
		doneA <- brokerA.Listen(listenCtxA, hubA.HandleRemote, func() {
			select {
			case readyA <- struct{}{}:
			default:
			}
		})
	}()
	go func() {
		doneB <- brokerB.Listen(listenCtxB, hubB.HandleRemote, func() {
			select {
			case readyB <- struct{}{}:
			default:
			}
		})
	}()
	waitForBrokerReady := func(ready <-chan struct{}, label string) {
		t.Helper()
		select {
		case <-ready:
		case <-ctx.Done():
			t.Fatalf("%s listener did not connect: %v", label, ctx.Err())
		}
	}
	waitForBrokerReady(readyA, "instance A")
	waitForBrokerReady(readyB, "instance B")

	const sceneID = "integration-scene"
	peerA, closePeerA := openTestPeer(t, hubA, sceneID, "instance-a-user")
	defer closePeerA()
	peerB, closePeerB := openTestPeer(t, hubB, sceneID, "instance-b-user")
	defer closePeerB()

	hubA.publishRoomEvent(ctx, sceneID, []byte(`{"type":"chat.updated"}`))
	for _, target := range []struct {
		name string
		conn *websocket.Conn
	}{{"publisher instance", peerA}, {"remote instance", peerB}} {
		readCtx, stopRead := context.WithTimeout(ctx, 3*time.Second)
		_, payload, readErr := target.conn.Read(readCtx)
		stopRead()
		if readErr != nil || string(payload) != `{"type":"chat.updated"}` {
			t.Fatalf("%s peer did not receive exactly the scene event: payload=%s err=%v", target.name, payload, readErr)
		}
	}

	// The sender's LISTEN connection receives its own NOTIFY, and the remote
	// hub must not publish it back. A second message would indicate an echo loop.
	for _, target := range []struct {
		name string
		conn *websocket.Conn
	}{{"publisher instance", peerA}, {"remote instance", peerB}} {
		readCtx, stopRead := context.WithTimeout(ctx, 150*time.Millisecond)
		_, payload, readErr := target.conn.Read(readCtx)
		stopRead()
		if readErr == nil {
			t.Fatalf("%s peer received an unexpected duplicate/echo: %s", target.name, payload)
		}
		if !errors.Is(readErr, context.DeadlineExceeded) && !errors.Is(readErr, net.ErrClosed) {
			t.Fatalf("%s peer read failed before the no-echo window elapsed: %v", target.name, readErr)
		}
	}

	stopA()
	stopB()
	for _, target := range []struct {
		name string
		done <-chan error
	}{{"instance A", doneA}, {"instance B", doneB}} {
		select {
		case listenErr := <-target.done:
			if listenErr != nil {
				t.Fatalf("%s listener did not stop cleanly after cancellation: %v", target.name, listenErr)
			}
		case <-time.After(2 * time.Second):
			t.Fatalf("%s listener did not stop after context cancellation", target.name)
		}
	}
}
