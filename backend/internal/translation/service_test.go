package translation

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestTranslatePreservesFieldContract(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Authorization"); got != "Bearer sk_test" {
			t.Fatalf("authorization = %q", got)
		}
		body, _ := io.ReadAll(r.Body)
		if len(body) == 0 {
			t.Fatal("expected request body")
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"{\"pt-BR\":\"Mago\",\"pt-BR.summary\":\"Um conjurador.\"}"}}]}`))
	}))
	defer server.Close()
	service := NewService(server.Client(), server.URL, "sk_test", "openai-fast")
	translated, err := service.Translate(context.Background(), map[string]string{"pt-BR": "Wizard", "pt-BR.summary": "A spellcaster."})
	if err != nil {
		t.Fatal(err)
	}
	if translated["pt-BR"] != "Mago" || translated["pt-BR.summary"] != "Um conjurador." {
		t.Fatalf("unexpected translation: %#v", translated)
	}
}

func TestTranslateRequiresConfiguration(t *testing.T) {
	service := NewService(http.DefaultClient, "", "", "")
	if _, err := service.Translate(context.Background(), map[string]string{"pt-BR": "Wizard"}); err != ErrNotConfigured {
		t.Fatalf("err = %v", err)
	}
}
