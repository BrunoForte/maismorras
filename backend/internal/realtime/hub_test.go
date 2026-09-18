package realtime

import "testing"

func TestOriginPatternsUsesConfiguredHosts(t *testing.T) {
	got := originPatterns("https://maismorras.vercel.app, http://localhost:5173")
	if len(got) != 2 || got[0] != "maismorras.vercel.app" || got[1] != "localhost:5173" {
		t.Fatalf("origin patterns = %#v", got)
	}
}
