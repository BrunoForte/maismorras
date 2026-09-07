package compendium

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"vtt-backend/internal/apperror"
	"vtt-backend/internal/auth"
)

type Handler struct{ repo *Repository }

func NewHandler(repo *Repository) *Handler { return &Handler{repo} }
func (h *Handler) List(w http.ResponseWriter, r *http.Request) error {
	p, _ := auth.FromContext(r.Context())
	s, e, err := h.repo.List(r.Context(), r.PathValue("campaignID"), p.UserID)
	if err != nil {
		return mapError(err)
	}
	return write(w, http.StatusOK, map[string]any{"sources": s, "entries": e})
}
func (h *Handler) CreateEntry(w http.ResponseWriter, r *http.Request) error {
	p, _ := auth.FromContext(r.Context())
	var item Entry
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 24<<10)).Decode(&item); err != nil {
		return apperror.BadRequest("INVALID_BODY", "JSON inválido.")
	}
	item.SourceID = strings.TrimSpace(item.SourceID)
	item.EntryType = strings.TrimSpace(item.EntryType)
	item.Name = strings.TrimSpace(item.Name)
	item.Summary = strings.TrimSpace(item.Summary)
	if item.SourceID == "" || item.Name == "" || len([]rune(item.Name)) > 120 || !validType(item.EntryType) || len([]rune(item.Summary)) > 2000 {
		return apperror.BadRequest("INVALID_COMPENDIUM_ENTRY", "Confira fonte, tipo, nome e resumo da entrada.")
	}
	created, err := h.repo.CreateEntry(r.Context(), r.PathValue("campaignID"), p.UserID, item)
	if err != nil {
		return mapError(err)
	}
	return write(w, http.StatusCreated, created)
}
func validType(v string) bool {
	for _, x := range []string{"species", "background", "class", "subclass", "feat", "spell", "item", "feature", "other"} {
		if v == x {
			return true
		}
	}
	return false
}
func write(w http.ResponseWriter, status int, value any) error {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	return json.NewEncoder(w).Encode(value)
}
func mapError(err error) error {
	if errors.Is(err, ErrForbidden) {
		return apperror.Forbidden("Apenas o narrador pode alterar o compêndio desta campanha.")
	}
	if errors.Is(err, ErrNotFound) {
		return apperror.NotFound("COMPENDIUM_SOURCE_NOT_FOUND", "A fonte do compêndio não foi encontrada.")
	}
	return apperror.Internal(err)
}
