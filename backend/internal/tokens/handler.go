package tokens

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"

	"vtt-backend/internal/apperror"
	"vtt-backend/internal/auth"
)

type GenerationPolicy interface {
	CanGenerateMap(context.Context, string, string, bool) (bool, error)
	Consume(context.Context, string, string, int) (bool, error)
}

type Handler struct {
	service  ImageGenerator
	policy   GenerationPolicy
	mu       sync.Mutex
	requests map[string][]time.Time
}

func NewHandler(service ImageGenerator, policy ...GenerationPolicy) *Handler {
	h := &Handler{service: service, requests: map[string][]time.Time{}}
	if len(policy) > 0 {
		h.policy = policy[0]
	}
	return h
}

func (h *Handler) Generate(w http.ResponseWriter, r *http.Request) error {
	prompt := strings.TrimSpace(r.URL.Query().Get("prompt"))
	if prompt == "" {
		return apperror.BadRequest("INVALID_PROMPT", "O parâmetro 'prompt' é obrigatório.")
	}
	if len([]rune(prompt)) > 1500 {
		return apperror.BadRequest("INVALID_PROMPT", "O parâmetro 'prompt' deve ter no máximo 1500 caracteres.")
	}
	p, ok := auth.FromContext(r.Context())
	if !ok || p.UserID == "" {
		return apperror.Unauthorized("Token de acesso ausente.")
	}
	allowed, err := h.consume(r, p.UserID, "portrait", 10)
	if err != nil {
		return err
	}
	if !allowed {
		return apperror.TooManyRequests("RATE_LIMITED", "Limite de geração atingido. Tente novamente em instantes.")
	}

	photoURL, err := h.service.Generate(r.Context(), prompt)
	if err != nil {
		return err
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	return json.NewEncoder(w).Encode(map[string]string{"fotoUrl": photoURL})
}

func (h *Handler) consume(r *http.Request, userID, operation string, limit int) (bool, error) {
	if h.policy != nil {
		allowed, err := h.policy.Consume(r.Context(), userID, operation, limit)
		if err != nil {
			slog.Error("image generation quota lookup failed", "request_id", r.Header.Get("X-Request-ID"), "operation", operation, "error", err)
			return false, apperror.Internal(err)
		}
		return allowed, nil
	}
	now := time.Now()
	cutoff := now.Add(-time.Minute)
	h.mu.Lock()
	defer h.mu.Unlock()
	key := userID + ":" + operation
	items := h.requests[key]
	kept := items[:0]
	for _, t := range items {
		if t.After(cutoff) {
			kept = append(kept, t)
		}
	}
	if len(kept) >= limit {
		h.requests[key] = kept
		return false, nil
	}
	h.requests[key] = append(kept, now)
	return true, nil
}

func (h *Handler) GenerateMap(w http.ResponseWriter, r *http.Request) error {
	p, ok := auth.FromContext(r.Context())
	if !ok || p.UserID == "" {
		return apperror.Unauthorized("Token de acesso ausente.")
	}
	prompt := strings.TrimSpace(r.URL.Query().Get("prompt"))
	if prompt == "" || len([]rune(prompt)) > 1500 {
		return apperror.BadRequest("INVALID_PROMPT", "Informe uma descrição de até 1500 caracteres.")
	}
	campaignID := r.PathValue("campaignID")
	if h.policy == nil {
		return apperror.ServiceUnavailable("A geração de mapas precisa da política de autorização configurada.")
	}
	allowed, err := h.policy.CanGenerateMap(r.Context(), campaignID, p.UserID, p.IsAdmin)
	if err != nil {
		slog.Error("map generation authorization failed", "request_id", r.Header.Get("X-Request-ID"), "campaign_id", campaignID, "error", err)
		return apperror.Internal(err)
	}
	if !allowed {
		return apperror.Forbidden("Somente o narrador da campanha pode gerar mapas.")
	}
	allowed, err = h.consume(r, p.UserID, "map", 3)
	if err != nil {
		return err
	}
	if !allowed {
		return apperror.TooManyRequests("RATE_LIMITED", "Limite de geração atingido. Tente novamente em instantes.")
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
