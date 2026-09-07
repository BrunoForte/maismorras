package npcs

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

func (h *Handler) List(w http.ResponseWriter, r *http.Request) error {
	p, _ := auth.FromContext(r.Context())
	items, err := h.repo.List(r.Context(), r.PathValue("campaignID"), p.UserID)
	if err != nil {
		return mapError(err)
	}
	return write(w, http.StatusOK, map[string]any{"npcs": items})
}
func (h *Handler) Create(w http.ResponseWriter, r *http.Request) error {
	p, _ := auth.FromContext(r.Context())
	var in struct {
		Name  string `json:"name"`
		Sheet Sheet  `json:"sheet"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 32<<10)).Decode(&in); err != nil {
		return apperror.BadRequest("INVALID_BODY", "JSON inválido.")
	}
	in.Name = strings.TrimSpace(in.Name)
	if err := validate(in.Name, in.Sheet); err != nil {
		return err
	}
	item, err := h.repo.Create(r.Context(), r.PathValue("campaignID"), p.UserID, in.Name, in.Sheet)
	if err != nil {
		return mapError(err)
	}
	return write(w, http.StatusCreated, item)
}
func (h *Handler) Update(w http.ResponseWriter, r *http.Request) error {
	p, _ := auth.FromContext(r.Context())
	var in struct {
		Name  string `json:"name"`
		Sheet Sheet  `json:"sheet"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 48<<10)).Decode(&in); err != nil {
		return apperror.BadRequest("INVALID_BODY", "JSON inválido.")
	}
	in.Name = strings.TrimSpace(in.Name)
	if err := validate(in.Name, in.Sheet); err != nil {
		return err
	}
	item, err := h.repo.Update(r.Context(), r.PathValue("campaignID"), r.PathValue("npcID"), p.UserID, in.Name, in.Sheet)
	if err != nil {
		return mapError(err)
	}
	return write(w, http.StatusOK, item)
}
func validate(name string, sheet Sheet) error {
	if name == "" || len([]rune(name)) > 120 || sheet.HitPointsMax < 1 || sheet.HitPointsCurrent < 0 || sheet.HitPointsCurrent > sheet.HitPointsMax || sheet.ArmorClass < 0 || sheet.ArmorClass > 99 || sheet.Size < 1 || sheet.Size > 6 || sheet.Color < 0 || sheet.Color > 16777215 || len(sheet.Traits) > 20 || len(sheet.Actions) > 30 || !validStatBlock(sheet) {
		return apperror.BadRequest("INVALID_NPC", "Confira nome, PV, CA, tamanho e cor do NPC.")
	}
	return nil
}
func validStatBlock(sheet Sheet) bool {
	for _, score := range []int{sheet.Abilities.Strength, sheet.Abilities.Dexterity, sheet.Abilities.Constitution, sheet.Abilities.Intelligence, sheet.Abilities.Wisdom, sheet.Abilities.Charisma} {
		if score < 0 || score > 30 {
			return false
		}
	}
	for _, trait := range sheet.Traits {
		if strings.TrimSpace(trait.Name) == "" || len([]rune(trait.Name)) > 120 || len([]rune(trait.Description)) > 1000 {
			return false
		}
	}
	for _, action := range sheet.Actions {
		if strings.TrimSpace(action.Name) == "" || len([]rune(action.Name)) > 120 || len([]rune(action.Description)) > 1000 || action.SaveDC < 0 || action.SaveDC > 50 {
			return false
		}
	}
	return true
}
func write(w http.ResponseWriter, status int, value any) error {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	return json.NewEncoder(w).Encode(value)
}
func mapError(err error) error {
	if errors.Is(err, ErrForbidden) {
		return apperror.Forbidden("Apenas o narrador pode gerenciar NPCs.")
	}
	return apperror.Internal(err)
}
