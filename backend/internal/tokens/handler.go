package tokens

import (
	"context"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"vtt-backend/internal/apperror"
)

type Handler struct {
	service  ImageGenerator
	mu       sync.Mutex
	requests map[string][]time.Time
}

func NewHandler(service ImageGenerator) *Handler {
	return &Handler{service: service, requests: map[string][]time.Time{}}
}

func (h *Handler) Generate(w http.ResponseWriter, r *http.Request) error {
	if !h.allow(r.RemoteAddr) {
		return apperror.TooManyRequests("RATE_LIMITED", "Limite de geração atingido. Tente novamente em instantes.")
	}
	prompt := strings.TrimSpace(r.URL.Query().Get("prompt"))
	if prompt == "" {
		return apperror.BadRequest("INVALID_PROMPT", "O parâmetro 'prompt' é obrigatório.")
	}
	if len([]rune(prompt)) > 1500 {
		return apperror.BadRequest("INVALID_PROMPT", "O parâmetro 'prompt' deve ter no máximo 1500 caracteres.")
	}

	photoURL, err := h.service.Generate(r.Context(), prompt)
	if err != nil {
		return err
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	return json.NewEncoder(w).Encode(map[string]string{"fotoUrl": photoURL})
}

func (h *Handler) allow(remote string) bool {
	host, _, err := net.SplitHostPort(remote)
	if err != nil {
		host = remote
	}
	now := time.Now()
	cutoff := now.Add(-time.Minute)
	h.mu.Lock()
	defer h.mu.Unlock()
	items := h.requests[host]
	kept := items[:0]
	for _, t := range items {
		if t.After(cutoff) {
			kept = append(kept, t)
		}
	}
	if len(kept) >= 30 {
		h.requests[host] = kept
		return false
	}
	h.requests[host] = append(kept, now)
	return true
}

func (h *Handler) GenerateMap(w http.ResponseWriter, r *http.Request) error {
	prompt := strings.TrimSpace(r.URL.Query().Get("prompt"))
	if prompt == "" || len([]rune(prompt)) > 1500 {
		return apperror.BadRequest("INVALID_PROMPT", "Informe uma descrição de até 1500 caracteres.")
	}
	service, ok := h.service.(interface {
		GenerateMap(context.Context, string) (string, error)
	})
	if !ok {
		return apperror.Internal(errors.New("map generator unavailable"))
	}
	imageURL, err := service.GenerateMap(r.Context(), prompt)
	if err != nil {
		return err
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	return json.NewEncoder(w).Encode(map[string]string{"fotoUrl": imageURL})
}
