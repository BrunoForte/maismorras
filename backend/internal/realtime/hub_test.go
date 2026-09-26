package realtime

import (
	"encoding/json"
	"testing"
)

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
