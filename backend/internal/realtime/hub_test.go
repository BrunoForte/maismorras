package realtime

import "testing"

func TestOriginPatternsUsesConfiguredHosts(t *testing.T) {
	got := originPatterns("https://maismorras.vercel.app, http://localhost:5173")
	if len(got) != 2 || got[0] != "maismorras.vercel.app" || got[1] != "localhost:5173" {
		t.Fatalf("origin patterns = %#v", got)
	}
}

func TestEventBroadcastPreservesBoundedData(t *testing.T) {
	payload := eventBroadcast("token.updated", []byte(`{"id":"token-1","x":4}`))
	if string(payload) != `{"type":"token.updated","data":{"id":"token-1","x":4}}` {
		t.Fatalf("unexpected payload: %s", payload)
	}
	tooLarge := eventBroadcast("token.updated", make([]byte, 25<<10))
	if string(tooLarge) == "" || string(tooLarge)[:1] != "{" {
		t.Fatal("expected valid JSON payload")
	}
}

