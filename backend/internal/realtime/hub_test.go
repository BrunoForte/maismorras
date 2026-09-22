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
