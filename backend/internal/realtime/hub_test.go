package realtime

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"nhooyr.io/websocket"
)

type brokerSpy struct {
	published []Envelope
}

func (b *brokerSpy) Mode() string { return "test" }
func (b *brokerSpy) Publish(_ context.Context, envelope Envelope) error {
	b.published = append(b.published, envelope)
	return nil
}
func (b *brokerSpy) Listen(ctx context.Context, _ func(Envelope), _ func()) error {
	<-ctx.Done()
	return nil
}

func TestOriginPatternsUsesConfiguredHosts(t *testing.T) {
	got := originPatterns("https://maismorras.vercel.app, http://localhost:5173")
	if len(got) != 2 || got[0] != "maismorras.vercel.app" || got[1] != "localhost:5173" {
		t.Fatalf("origin patterns = %#v", got)
	}
}

func TestEventBroadcastPreservesBoundedData(t *testing.T) {
	payload := eventBroadcast("overlay.layout.updated", []byte(`{"id":"layout-1"}`))
	if string(payload) != `{"type":"overlay.layout.updated","data":{"id":"layout-1"}}` {
		t.Fatalf("unexpected payload: %s", payload)
	}
	tooLarge := eventBroadcast("overlay.layout.updated", make([]byte, 25<<10))
	if string(tooLarge) == "" || string(tooLarge)[:1] != "{" {
		t.Fatal("expected valid JSON payload")
	}
}

func TestTokenUpdateSignalDoesNotContainTokenFields(t *testing.T) {
	var input map[string]any
	payload := tokenUpdateBroadcast("12345678-1234-1234-1234-123456789012", false)
	if err := json.Unmarshal(payload, &input); err != nil {
		t.Fatal(err)
	}
	data := input["data"].(map[string]any)
	if len(data) != 2 || data["tokenId"] != "12345678-1234-1234-1234-123456789012" || data["deleted"] != false {
		t.Fatalf("expected minimal invalidation signal, got %#v", data)
	}
}

func TestPresentationRealtimeOnlyAllowsPlayerInvalidations(t *testing.T) {
	for _, value := range []json.RawMessage{nil, []byte("  "), []byte("null")} {
		if !canPublishPresentationUpdate(false, value) {
			t.Errorf("player dismissal invalidation should be allowed: %q", value)
		}
	}
	for _, value := range []json.RawMessage{[]byte(`{"assetPath":"private.png"}`), []byte(`{"visible":true}`)} {
		if canPublishPresentationUpdate(false, value) {
			t.Errorf("player must not broadcast presentation content: %s", value)
		}
	}
	if !canPublishPresentationUpdate(true, json.RawMessage(`{"visible":true}`)) {
		t.Fatal("GM should be able to publish a presentation update")
	}
}

func TestAudioRealtimeStateValidation(t *testing.T) {
	valid := &audioRealtimeState{Path: "campaigns/c1/media/rain.mp3", Playing: true, Volume: 0.65, Position: 1200, StartedAt: 1_700_000_000_000, Revision: 2}
	if !validAudioRealtimeState(valid) {
		t.Fatal("expected normal playback state to be valid")
	}
	for _, invalid := range []*audioRealtimeState{
		nil,
		{Path: "rain.mp3", Volume: -0.01},
		{Path: "rain.mp3", Volume: 1.01},
		{Path: "rain.mp3", Volume: 0.5, Position: -1},
		{Path: "rain.mp3", Volume: 0.5, Position: 24*60*60*1000 + 1},
		{Path: "rain.mp3", Volume: 0.5, StartedAt: -1},
		{Path: string(make([]byte, 501)), Volume: 0.5},
	} {
		if validAudioRealtimeState(invalid) {
			t.Errorf("expected invalid state to be rejected: %#v", invalid)
		}
	}
}

func TestOverlayReceivesOnlyReadOnlyRoomEvents(t *testing.T) {
	for _, raw := range []string{`{"type":"dice.roll"}`, `{"type":"map.ping"}`, `{"type":"scene.delta"}`, `not json`} {
		if safeOverlayEvent([]byte(raw)) {
			t.Errorf("overlay should not receive or process this event: %s", raw)
		}
	}
	for _, raw := range []string{`{"type":"scene.refresh"}`, `{"type":"chat.updated"}`, `{"type":"audio.state"}`, `{"type":"combat.updated"}`} {
		if !safeOverlayEvent([]byte(raw)) {
			t.Errorf("expected overlay-safe event: %s", raw)
		}
	}
}

func TestPostgresListenURLRequiresPersistentSessionConnection(t *testing.T) {
	for _, value := range []string{
		"postgresql://postgres:p@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=require",
		"postgres://postgres:p@db.project.supabase.co:5432/postgres?sslmode=require",
		"postgres://postgres:p@localhost:5432/postgres",
	} {
		if !ListenCompatibleDatabaseURL(value) {
			t.Errorf("expected LISTEN-compatible URL: %s", value)
		}
	}
	for _, value := range []string{
		"postgresql://postgres:p@aws-0-sa-east-1.pooler.supabase.com:6543/postgres",
		"postgres://postgres:p@db.project.supabase.co:5432/postgres?pool_mode=transaction",
		"not a url",
	} {
		if ListenCompatibleDatabaseURL(value) {
			t.Errorf("expected incompatible URL to be rejected: %s", value)
		}
	}
}

func TestLocalSupabaseTestURLIsRestrictedToLoopbackPort(t *testing.T) {
	for _, value := range []string{
		"postgresql://postgres:postgres@127.0.0.1:54322/postgres",
		"postgres://postgres:postgres@localhost:54322/postgres",
		"postgres://postgres:postgres@[::1]:54322/postgres",
	} {
		if !isLocalSupabaseTestURL(value) {
			t.Errorf("expected local Supabase test URL to be accepted: %s", value)
		}
	}
	for _, value := range []string{
		"postgres://postgres:postgres@db.example.com:54322/postgres",
		"postgres://postgres:postgres@127.0.0.1:5432/postgres",
		"https://127.0.0.1:54322/postgres",
	} {
		if isLocalSupabaseTestURL(value) {
			t.Errorf("expected non-local or unsupported test URL to be rejected: %s", value)
		}
	}
}

func TestOversizedRealtimeEventFallsBackToRefresh(t *testing.T) {
	got := boundedRealtimePayload([]byte(`{"type":"overlay.layout.updated","data":"` + strings.Repeat("x", maxRealtimePayloadBytes+1) + `"}`))
	if string(got) != `{"type":"scene.refresh"}` {
		t.Fatalf("oversized event was not replaced with refresh: %s", got)
	}
}

func TestRemoteEventIsNotRepublishedAndDuplicateIsIgnored(t *testing.T) {
	hub := NewHub()
	spy := &brokerSpy{}
	hub.ConfigureBroker(spy)
	envelope := Envelope{ProtocolVersion: realtimeProtocolVersion, EventID: "event-1", OriginInstance: "other-instance", SceneID: "scene-1", Payload: json.RawMessage(`{"type":"chat.updated"}`)}
	hub.HandleRemote(envelope)
	hub.HandleRemote(envelope)
	if len(spy.published) != 0 {
		t.Fatalf("remote events must never be republished; got %d publications", len(spy.published))
	}
}

func TestTwoLocalHubsRelayRemoteEventToTheirPeersOnce(t *testing.T) {
	const sceneID = "scene-1"
	publisher := NewHub()
	receiver := NewHub()
	publisherBroker := &brokerSpy{}
	receiverBroker := &brokerSpy{}
	publisher.ConfigureBroker(publisherBroker)
	receiver.ConfigureBroker(receiverBroker)
	_, closePublisherPeer := openTestPeer(t, publisher, sceneID, "publisher-user")
	defer closePublisherPeer()
	remotePeer, closeRemotePeer := openTestPeer(t, receiver, sceneID, "receiver-user")
	defer closeRemotePeer()

	publisher.publishRoomEvent(context.Background(), sceneID, []byte(`{"type":"chat.updated"}`))
	if len(publisherBroker.published) != 1 {
		t.Fatalf("local event should be published once, got %d", len(publisherBroker.published))
	}
	receiver.HandleRemote(publisherBroker.published[0])
	readCtx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	_, payload, err := remotePeer.Read(readCtx)
	if err != nil || string(payload) != `{"type":"chat.updated"}` {
		t.Fatalf("remote local peer did not receive event: payload=%s err=%v", payload, err)
	}
	receiver.RefreshLocalRooms()
	_, payload, err = remotePeer.Read(readCtx)
	if err != nil || string(payload) != `{"type":"scene.refresh"}` {
		t.Fatalf("recovered listener should reconcile local room from REST: payload=%s err=%v", payload, err)
	}
	if len(receiverBroker.published) != 0 {
		t.Fatalf("receiving hub must not republish remote events or recovery refreshes, got %d publications", len(receiverBroker.published))
	}
}

func openTestPeer(t *testing.T, hub *Hub, sceneID, userID string) (*websocket.Conn, func()) {
	t.Helper()
	ready := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		localPeer := &peer{conn: conn, userID: userID, ip: userID}
		if !hub.join(sceneID, localPeer) {
			_ = conn.Close(websocket.StatusPolicyViolation, "test peer rejected")
			return
		}
		close(ready)
		<-r.Context().Done()
		hub.leave(sceneID, localPeer)
		_ = conn.Close(websocket.StatusNormalClosure, "test complete")
	}))
	clientURL := "ws" + strings.TrimPrefix(server.URL, "http")
	conn, _, err := websocket.Dial(context.Background(), clientURL, nil)
	if err != nil {
		server.Close()
		t.Fatalf("open test websocket: %v", err)
	}
	select {
	case <-ready:
	case <-time.After(time.Second):
		_ = conn.CloseNow()
		server.Close()
		t.Fatal("test websocket peer did not join room")
	}
	return conn, func() {
		_ = conn.CloseNow()
		server.Close()
	}
}

func TestOwnOriginAndUnsafeRemoteEventsAreIgnored(t *testing.T) {
	hub := NewHub()
	spy := &brokerSpy{}
	hub.ConfigureBroker(spy)
	hub.HandleRemote(Envelope{ProtocolVersion: realtimeProtocolVersion, EventID: "self", OriginInstance: hub.OriginInstanceID(), SceneID: "scene-1", Payload: json.RawMessage(`{"type":"chat.updated"}`)})
	hub.HandleRemote(Envelope{ProtocolVersion: realtimeProtocolVersion, EventID: "unsafe", OriginInstance: "other", SceneID: "scene-1", Payload: json.RawMessage(`{"type":"dice.roll","data":{"token":"secret"}}`)})
	if len(spy.published) != 0 {
		t.Fatalf("remote dispatch must not publish events, got %d", len(spy.published))
	}
}

func TestBrokerListenerStopsOnContextCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	broker := NewPostgresBroker((*pgxpool.Pool)(nil), "postgres://invalid", "instance-1", slog.New(slog.NewTextHandler(&strings.Builder{}, nil)))
	done := make(chan error, 1)
	go func() { done <- broker.Listen(ctx, func(Envelope) {}, nil) }()
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("canceled listener should stop cleanly: %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("listener did not stop after context cancellation")
	}
}

func TestFailedBrokerPublishDoesNotPanicHub(t *testing.T) {
	spy := &failingBroker{err: errors.New("temporary outage")}
	hub := NewHub()
	hub.ConfigureBroker(spy)
	hub.publishRoomEvent(context.Background(), "scene-1", []byte(`{"type":"chat.updated"}`))
}

func TestInvalidOrOversizedSceneDeltaBecomesRefresh(t *testing.T) {
	valid := json.RawMessage(`{"kind":"area","action":"upsert","item":{"id":"12345678-1234-1234-1234-123456789012"}}`)
	if _, ok := sceneDeltaBroadcast(valid); !ok {
		t.Fatal("expected valid delta to be broadcast incrementally")
	}
	for _, input := range []json.RawMessage{
		json.RawMessage(`{"kind":"area","action":"upsert","item":{"id":"short"}}`),
		json.RawMessage(`{"kind":"token","action":"delete","id":"12345678-1234-1234-1234-123456789012"}`),
		json.RawMessage(strings.Repeat("x", (16<<10)+1)),
	} {
		if _, ok := sceneDeltaBroadcast(input); ok {
			t.Errorf("invalid scene delta should trigger a REST refresh: %s", input)
		}
	}
}

type failingBroker struct{ err error }

func (*failingBroker) Mode() string                              { return "test" }
func (b *failingBroker) Publish(context.Context, Envelope) error { return b.err }
func (*failingBroker) Listen(ctx context.Context, _ func(Envelope), _ func()) error {
	<-ctx.Done()
	return nil
}
