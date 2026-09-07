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
	if err := normalizeEntry(&item); err != nil {
		return err
	}
	created, err := h.repo.CreateEntry(r.Context(), r.PathValue("campaignID"), p.UserID, item)
	if err != nil {
		return mapError(err)
	}
	return write(w, http.StatusCreated, created)
}

// ImportEntries is deliberately file-first: the server never fetches a third-party
// catalogue.  The GM supplies a JSON file that has already been checked for a
// compatible licence or written as their own campaign material.
func (h *Handler) ImportEntries(w http.ResponseWriter, r *http.Request) error {
	p, _ := auth.FromContext(r.Context())
	var in struct {
		SourceID  string  `json:"sourceId"`
		EntryType string  `json:"entryType"`
		Entries   []Entry `json:"entries"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 768<<10)).Decode(&in); err != nil {
		return apperror.BadRequest("INVALID_BODY", "Arquivo de importação inválido.")
	}
	in.SourceID, in.EntryType = strings.TrimSpace(in.SourceID), strings.TrimSpace(in.EntryType)
	if in.SourceID == "" || !validType(in.EntryType) || len(in.Entries) == 0 || len(in.Entries) > 250 {
		return apperror.BadRequest("INVALID_IMPORT", "Selecione fonte e tipo; cada importação aceita de 1 a 250 entradas.")
	}
	for i := range in.Entries {
		in.Entries[i].SourceID, in.Entries[i].EntryType = in.SourceID, in.EntryType
		if err := normalizeEntry(&in.Entries[i]); err != nil {
			return err
		}
	}
	count, err := h.repo.UpsertEntries(r.Context(), r.PathValue("campaignID"), p.UserID, in.Entries)
	if err != nil {
		return mapError(err)
	}
	return write(w, http.StatusOK, map[string]any{"imported": count})
}

func normalizeEntry(item *Entry) error {
	item.SourceID = strings.TrimSpace(item.SourceID)
	item.EntryType = strings.TrimSpace(item.EntryType)
	item.Name = strings.TrimSpace(item.Name)
	item.Summary = strings.TrimSpace(item.Summary)
	if item.SourceID == "" || item.Name == "" || len([]rune(item.Name)) > 120 || !validType(item.EntryType) || len([]rune(item.Summary)) > 2000 || !validRules(item.Rules) {
		return apperror.BadRequest("INVALID_COMPENDIUM_ENTRY", "Confira fonte, tipo, nome, resumo e regras da entrada.")
	}
	return nil
}

func validRules(raw json.RawMessage) bool {
	if len(raw) == 0 {
		return true
	}
	var value map[string]any
	return json.Unmarshal(raw, &value) == nil
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
