package characters

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"vtt-backend/internal/apperror"
	"vtt-backend/internal/auth"
)

type Handler struct{ repo *Repository }

func NewHandler(repo *Repository) *Handler { return &Handler{repo: repo} }

func (h *Handler) GetMine(w http.ResponseWriter, r *http.Request) error {
	p, _ := auth.FromContext(r.Context())
	item, err := h.repo.GetMine(r.Context(), r.PathValue("campaignID"), p.UserID)
	if err != nil {
		return mapError(err)
	}
	return write(w, http.StatusOK, item)
}

func (h *Handler) SaveMine(w http.ResponseWriter, r *http.Request) error {
	p, _ := auth.FromContext(r.Context())
	var sheet Sheet
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 48<<10)).Decode(&sheet); err != nil {
		return apperror.BadRequest("INVALID_BODY", "JSON inválido.")
	}
	sheet.Name = strings.TrimSpace(sheet.Name)
	if err := validate(sheet); err != nil {
		return err
	}
	item, err := h.repo.SaveMine(r.Context(), r.PathValue("campaignID"), p.UserID, sheet)
	if err != nil {
		return mapError(err)
	}
	return write(w, http.StatusOK, item)
}
func (h *Handler) ListForGM(w http.ResponseWriter, r *http.Request) error {
	p, _ := auth.FromContext(r.Context())
	items, err := h.repo.ListForGM(r.Context(), r.PathValue("campaignID"), p.UserID)
	if err != nil {
		return mapError(err)
	}
	return write(w, http.StatusOK, map[string]any{"participants": items})
}

func validate(sheet Sheet) error {
	if sheet.Name == "" || len([]rune(sheet.Name)) > 120 || sheet.Level < 1 || sheet.Level > 20 || sheet.HitPointsMax < 1 || sheet.HitPointsCurrent < 0 || sheet.HitPointsCurrent > sheet.HitPointsMax || sheet.ArmorClass < 0 || sheet.ArmorClass > 99 || sheet.Speed < 0 || sheet.Speed > 300 {
		return apperror.BadRequest("INVALID_SHEET", "Confira nome, nível, PV, CA e deslocamento da ficha.")
	}
	for _, score := range []int{sheet.AbilityScores.Strength, sheet.AbilityScores.Dexterity, sheet.AbilityScores.Constitution, sheet.AbilityScores.Intelligence, sheet.AbilityScores.Wisdom, sheet.AbilityScores.Charisma} {
		if score < 1 || score > 30 {
			return apperror.BadRequest("INVALID_SHEET", "Atributos devem estar entre 1 e 30.")
		}
	}
	return nil
}

func write(w http.ResponseWriter, status int, value any) error {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	return json.NewEncoder(w).Encode(value)
}
func mapError(err error) error {
	if errors.Is(err, ErrForbidden) {
		return apperror.Forbidden("Você não participa desta campanha.")
	}
	if errors.Is(err, ErrNotFound) {
		return apperror.NotFound("CHARACTER_NOT_FOUND", "Você ainda não criou uma ficha nesta campanha.")
	}
	return apperror.Internal(err)
}
