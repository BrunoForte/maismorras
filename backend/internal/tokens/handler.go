package tokens

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"vtt-backend/internal/apperror"
)

type Handler struct{ service ImageGenerator }

func NewHandler(service ImageGenerator) *Handler { return &Handler{service: service} }

func (h *Handler) Generate(w http.ResponseWriter, r *http.Request) error {
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
