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

func TestBroadcastAudioStateIncludesLoopAndChannelRevision(t *testing.T) {
	for _, test := range []struct {
		name      string
		effects   bool
		eventType string
		loop      bool
	}{
		{name: "music loop on", eventType: "audio.state", loop: true},
		{name: "effect loop off", effects: true, eventType: "audio.effects", loop: false},
	} {
		t.Run(test.name, func(t *testing.T) {
			hub := NewHub()
			broker := &brokerSpy{}
			hub.ConfigureBroker(broker)
			hub.BroadcastAudioState("scene-1", "campaigns/c1/media/track.mp3", true, .6, 1200, 1_700_000_000_000, 7, test.loop, test.effects, "request-1")
			if len(broker.published) != 1 {
				t.Fatalf("published envelopes = %d, want 1", len(broker.published))
			}
			var event struct {
				Type  string             `json:"type"`
				State audioRealtimeState `json:"state"`
			}
			if err := json.Unmarshal(broker.published[0].Payload, &event); err != nil {
				t.Fatal(err)
			}
			if event.Type != test.eventType || event.State.Revision != 7 || event.State.Loop == nil || *event.State.Loop != test.loop {
				t.Fatalf("broadcast state = %#v, want type %q, revision 7, loop %t", event, test.eventType, test.loop)
			}
		})
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

func TestPersistedCampaignEventsFanOutOnceAndKeepCombatLogsGMOnly(t *testing.T) {
	hub := NewHub()
	spy := &brokerSpy{}
	hub.ConfigureBroker(spy)
	player, closePlayer := openCampaignTestPeer(t, hub, "campaign-1", "player", false)
	defer closePlayer()
	secondPlayer, closeSecondPlayer := openCampaignTestPeer(t, hub, "campaign-1", "second-player", false)
	defer closeSecondPlayer()
	gm, closeGM := openCampaignTestPeer(t, hub, "campaign-1", "gm", true)
	defer closeGM()

	message := Envelope{ProtocolVersion: realtimeProtocolVersion, EventID: "db-event-101", OriginInstance: "postgres", RoomType: campaignRoomType, CampaignID: "campaign-1", Payload: json.RawMessage(`{"type":"campaign.event","event":{"id":101,"author":"Jogador","type":"dice.roll","payload":{"dados":[13]},"createdAt":"2026-10-01T12:00:00Z"}}`)}
	hub.HandleRemote(message)
	hub.HandleRemote(message)
	for _, conn := range []*websocket.Conn{player, secondPlayer, gm} {
		readCtx, cancel := context.WithTimeout(context.Background(), time.Second)
		_, raw, err := conn.Read(readCtx)
		cancel()
		if err != nil || !strings.Contains(string(raw), `"id":101`) {
			t.Fatalf("member did not receive committed campaign event: %s, %v", raw, err)
		}
	}
	if len(spy.published) != 0 {
		t.Fatalf("database-origin events must not be republished, got %d", len(spy.published))
	}

	combat := Envelope{ProtocolVersion: realtimeProtocolVersion, EventID: "db-event-102", OriginInstance: "postgres", RoomType: campaignRoomType, CampaignID: "campaign-1", Payload: json.RawMessage(`{"type":"campaign.event","event":{"id":102,"author":"Narrador","type":"combat.log","payload":{"text":"turno privado"},"createdAt":"2026-10-01T12:00:01Z"}}`)}
	hub.HandleRemote(combat)
	readCtx, cancel := context.WithTimeout(context.Background(), time.Second)
	_, raw, err := gm.Read(readCtx)
	cancel()
	if err != nil || !strings.Contains(string(raw), `"id":102`) {
		t.Fatalf("GM did not receive private combat log: %s, %v", raw, err)
	}
	readCtx, cancel = context.WithTimeout(context.Background(), 40*time.Millisecond)
	defer cancel()
	if _, raw, err = player.Read(readCtx); err == nil {
		t.Fatalf("player received GM-only combat log: %s", raw)
	}
}

func TestCampaignEventRejectsInvalidTypesAndMalformedIDs(t *testing.T) {
	for _, raw := range []json.RawMessage{
		json.RawMessage(`{"type":"campaign.event","event":{"id":0,"type":"dice.roll"}}`),
		json.RawMessage(`{"type":"campaign.event","event":{"id":1,"type":"scene.delta"}}`),
		json.RawMessage(`not-json`),
	} {
		if validCampaignEvent(raw) {
			t.Errorf("expected invalid campaign event to be rejected: %s", raw)
		}
	}
}

func TestCampaignRoomsAreInvalidatedAfterBrokerReconnect(t *testing.T) {
	hub := NewHub()
	peer, closePeer := openCampaignTestPeer(t, hub, "campaign-1", "player", false)
	defer closePeer()
	hub.RefreshLocalRooms()
	readCtx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	_, raw, err := peer.Read(readCtx)
	if err != nil || string(raw) != `{"type":"campaign.refresh"}` {
		t.Fatalf("campaign reconnect should request a history reconciliation: %s, %v", raw, err)
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
	return openTestRoomPeer(t, hub, roomKey(sceneRoomType, sceneID), &peer{userID: userID, ip: userID})
}

func openCampaignTestPeer(t *testing.T, hub *Hub, campaignID, userID string, canControl bool) (*websocket.Conn, func()) {
	return openTestRoomPeer(t, hub, roomKey(campaignRoomType, campaignID), &peer{userID: userID, ip: userID, canControl: canControl, roomType: campaignRoomType, role: map[bool]string{true: "gm", false: "player"}[canControl]})
}

func openTestRoomPeer(t *testing.T, hub *Hub, room string, localPeer *peer) (*websocket.Conn, func()) {
	t.Helper()
	ready := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		localPeer.conn = conn
		if !hub.join(room, localPeer) {
			_ = conn.Close(websocket.StatusPolicyViolation, "test peer rejected")
			return
		}
		close(ready)
		<-r.Context().Done()
		hub.leave(room, localPeer)
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
