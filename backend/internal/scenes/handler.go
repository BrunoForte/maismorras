package scenes

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
	items, err := h.repo.List(r.Context(), r.PathValue("campaignID"), p.UserID)
	if err != nil {
		return mapError(err)
	}
	return write(w, http.StatusOK, map[string]any{"scenes": items})
}
func (h *Handler) Create(w http.ResponseWriter, r *http.Request) error {
	p, _ := auth.FromContext(r.Context())
	var in struct {
		Name string `json:"name"`
	}
	if err := decode(w, r, &in); err != nil {
		return err
	}
	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" || len([]rune(in.Name)) > 120 {
		return apperror.BadRequest("INVALID_NAME", "Nome deve ter entre 1 e 120 caracteres.")
	}
	s, err := h.repo.Create(r.Context(), r.PathValue("campaignID"), p.UserID, in.Name)
	if err != nil {
		return mapError(err)
	}
	return write(w, http.StatusCreated, s)
}
func (h *Handler) UpdateScene(w http.ResponseWriter, r *http.Request) error {
	p, _ := auth.FromContext(r.Context())
	var in Scene
	if err := decode(w, r, &in); err != nil {
		return err
	}
	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" || len([]rune(in.Name)) > 120 || in.GridSize < 20 || in.GridSize > 200 || !validSceneSettings(in) {
		return apperror.BadRequest("INVALID_SCENE", "Confira nome, grid, acesso de jogadores e visão da cena.")
	}
	scene, err := h.repo.UpdateScene(r.Context(), r.PathValue("sceneID"), p.UserID, in)
	if err != nil {
		return mapError(err)
	}
	return write(w, http.StatusOK, scene)
}
func validSceneSettings(s Scene) bool {
	return (s.PlayerAccess == "hidden" || s.PlayerAccess == "available" || s.PlayerAccess == "active") && (s.VisionMode == "manual" || s.VisionMode == "shared" || s.VisionMode == "token")
}
func (h *Handler) Detail(w http.ResponseWriter, r *http.Request) error {
	p, _ := auth.FromContext(r.Context())
	scene, tokens, fog, areas, err := h.repo.Detail(r.Context(), r.PathValue("sceneID"), p.UserID)
	if err != nil {
		return mapError(err)
	}
	return write(w, http.StatusOK, map[string]any{"scene": scene, "tokens": tokens, "fog": fog, "areas": areas})
}
func (h *Handler) Combat(w http.ResponseWriter, r *http.Request) error {
	p, _ := auth.FromContext(r.Context())
	state, err := h.repo.Combat(r.Context(), r.PathValue("sceneID"), p.UserID)
	if err != nil {
		return mapError(err)
	}
	return write(w, http.StatusOK, state)
}
func (h *Handler) Effects(w http.ResponseWriter, r *http.Request) error {
	p, _ := auth.FromContext(r.Context())
	items, err := h.repo.Effects(r.Context(), r.PathValue("sceneID"), p.UserID)
	if err != nil {
		return mapError(err)
	}
	return write(w, http.StatusOK, map[string]any{"effects": items})
}
func (h *Handler) EffectDefinitions(w http.ResponseWriter, r *http.Request) error {
	p, _ := auth.FromContext(r.Context())
	items, err := h.repo.EffectDefinitions(r.Context(), r.PathValue("sceneID"), p.UserID)
	if err != nil {
		return mapError(err)
	}
	return write(w, http.StatusOK, map[string]any{"definitions": items})
}
func (h *Handler) AddEffect(w http.ResponseWriter, r *http.Request) error {
	p, _ := auth.FromContext(r.Context())
	var e Effect
	if err := decode(w, r, &e); err != nil {
		return err
	}
	if strings.TrimSpace(e.TokenID) == "" || strings.TrimSpace(e.Name) == "" {
		return apperror.BadRequest("INVALID_EFFECT", "Informe token e efeito.")
	}
	if e.TickAt != "turn_start" && e.TickAt != "turn_end" {
		e.TickAt = "turn_end"
	}
	item, err := h.repo.AddEffect(r.Context(), r.PathValue("sceneID"), p.UserID, e)
	if err != nil {
		return mapError(err)
	}
	return write(w, http.StatusCreated, item)
}
func (h *Handler) RemoveEffect(w http.ResponseWriter, r *http.Request) error {
	p, _ := auth.FromContext(r.Context())
	if err := h.repo.RemoveEffect(r.Context(), r.PathValue("sceneID"), r.PathValue("effectID"), p.UserID); err != nil {
		return mapError(err)
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}
func (h *Handler) UpdateFog(w http.ResponseWriter, r *http.Request) error {
	p, _ := auth.FromContext(r.Context())
	var in struct {
		Mode  string  `json:"mode"`
		Cells [][]int `json:"cells"`
	}
	if err := decode(w, r, &in); err != nil {
		return err
	}
	cells := make([][2]int, 0, len(in.Cells))
	for _, cell := range in.Cells {
		if len(cell) != 2 {
			return apperror.BadRequest("INVALID_FOG", "Cada célula precisa ter coordenadas X e Y.")
		}
		cells = append(cells, [2]int{cell[0], cell[1]})
	}
	if err := h.repo.UpdateFog(r.Context(), r.PathValue("sceneID"), p.UserID, in.Mode, cells); err != nil {
		return mapError(err)
	}
	return write(w, http.StatusOK, map[string]bool{"ok": true})
}
func (h *Handler) CreateArea(w http.ResponseWriter, r *http.Request) error {
	p, _ := auth.FromContext(r.Context())
	var area Area
	if err := decode(w, r, &area); err != nil {
		return err
	}
	if (area.Shape != "line" && area.Shape != "circle" && area.Shape != "cone") || len([]rune(strings.TrimSpace(area.Label))) == 0 || len([]rune(area.Label)) > 80 || area.Color < 0 || area.Color > 16777215 {
		return apperror.BadRequest("INVALID_AREA", "Confira formato, rótulo e cor da área.")
	}
	area.Label = strings.TrimSpace(area.Label)
	item, err := h.repo.CreateArea(r.Context(), r.PathValue("sceneID"), p.UserID, area)
	if err != nil {
		return mapError(err)
	}
	return write(w, http.StatusCreated, item)
}
func (h *Handler) DeleteArea(w http.ResponseWriter, r *http.Request) error {
	p, _ := auth.FromContext(r.Context())
	if err := h.repo.DeleteArea(r.Context(), r.PathValue("sceneID"), r.PathValue("areaID"), p.UserID); err != nil {
		return mapError(err)
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}
func (h *Handler) SetCombat(w http.ResponseWriter, r *http.Request) error {
	p, _ := auth.FromContext(r.Context())
	var in struct {
		ActiveTokenID string `json:"activeTokenId"`
	}
	if err := decode(w, r, &in); err != nil {
		return err
	}
	state, err := h.repo.SetCombat(r.Context(), r.PathValue("sceneID"), strings.TrimSpace(in.ActiveTokenID), p.UserID)
	if err != nil {
		return mapError(err)
	}
	return write(w, http.StatusOK, state)
}
func (h *Handler) RollInitiative(w http.ResponseWriter, r *http.Request) error {
	p, _ := auth.FromContext(r.Context())
	tokens, err := h.repo.RollInitiative(r.Context(), r.PathValue("sceneID"), p.UserID)
	if err != nil {
		return mapError(err)
	}
	return write(w, http.StatusOK, map[string]any{"tokens": tokens})
}
func (h *Handler) CreateToken(w http.ResponseWriter, r *http.Request) error {
	p, _ := auth.FromContext(r.Context())
	var t Token
	if err := decode(w, r, &t); err != nil {
		return err
	}
	if err := validateToken(t); err != nil {
		return err
	}
	token, err := h.repo.CreateToken(r.Context(), r.PathValue("sceneID"), p.UserID, t)
	if err != nil {
		return mapError(err)
	}
	return write(w, http.StatusCreated, token)
}
func (h *Handler) UpdateToken(w http.ResponseWriter, r *http.Request) error {
	p, _ := auth.FromContext(r.Context())
	var t Token
	if err := decode(w, r, &t); err != nil {
		return err
	}
	if err := validateToken(t); err != nil {
		return err
	}
	token, err := h.repo.UpdateToken(r.Context(), r.PathValue("sceneID"), r.PathValue("tokenID"), p.UserID, t)
	if err != nil {
		return mapError(err)
	}
	return write(w, http.StatusOK, token)
}
func (h *Handler) CreateTokenFromCharacter(w http.ResponseWriter, r *http.Request) error {
	p, _ := auth.FromContext(r.Context())
	var in struct {
		ActorID string `json:"actorId"`
	}
	if err := decode(w, r, &in); err != nil {
		return err
	}
	if strings.TrimSpace(in.ActorID) == "" {
		return apperror.BadRequest("INVALID_ACTOR", "Escolha uma ficha válida.")
	}
	token, err := h.repo.CreateTokenFromCharacter(r.Context(), r.PathValue("sceneID"), in.ActorID, p.UserID)
	if errors.Is(err, ErrAlreadyLinked) {
		return apperror.BadRequest("ACTOR_ALREADY_ON_SCENE", "Esta ficha já possui um token nesta cena.")
	}
	if err != nil {
		return mapError(err)
	}
	return write(w, http.StatusCreated, token)
}
func (h *Handler) CreateTokenFromNPC(w http.ResponseWriter, r *http.Request) error {
	p, _ := auth.FromContext(r.Context())
	var in struct {
		ActorID string `json:"actorId"`
	}
	if err := decode(w, r, &in); err != nil {
		return err
	}
	if strings.TrimSpace(in.ActorID) == "" {
		return apperror.BadRequest("INVALID_ACTOR", "Escolha um NPC válido.")
	}
	token, err := h.repo.CreateTokenFromNPC(r.Context(), r.PathValue("sceneID"), in.ActorID, p.UserID)
	if errors.Is(err, ErrAlreadyLinked) {
		return apperror.BadRequest("ACTOR_ALREADY_ON_SCENE", "Este NPC já possui um token nesta cena.")
	}
	if err != nil {
		return mapError(err)
	}
	return write(w, http.StatusCreated, token)
}

// CreateTokenFromCompendiumMonster places a monster directly from a private or
// licensed compendium entry. The entry must contain a compact stat block; an
// index-only reference cannot accidentally become a misleading default token.
func (h *Handler) CreateTokenFromCompendiumMonster(w http.ResponseWriter, r *http.Request) error {
	p, _ := auth.FromContext(r.Context())
	var in struct {
		EntryID string `json:"entryId"`
	}
	if err := decode(w, r, &in); err != nil {
		return err
	}
	if strings.TrimSpace(in.EntryID) == "" {
		return apperror.BadRequest("INVALID_MONSTER", "Escolha um monstro do compêndio.")
	}
	token, err := h.repo.CreateTokenFromCompendiumMonster(r.Context(), r.PathValue("sceneID"), strings.TrimSpace(in.EntryID), p.UserID)
	if err != nil {
		return mapError(err)
	}
	return write(w, http.StatusCreated, token)
}
func decode(w http.ResponseWriter, r *http.Request, v any) error {
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 32<<10)).Decode(v); err != nil {
		return apperror.BadRequest("INVALID_BODY", "JSON inválido.")
	}
	return nil
}
func validateToken(t Token) error {
	if strings.TrimSpace(t.Name) == "" || len([]rune(t.Name)) > 120 {
		return apperror.BadRequest("INVALID_TOKEN", "Token precisa de um nome válido.")
	}
	if t.Size < 1 || t.Size > 6 || t.HPMax < 1 || t.HPCurrent < 0 || t.HPCurrent > t.HPMax || t.Color < 0 || t.Color > 16777215 {
		return apperror.BadRequest("INVALID_TOKEN", "Dados de token inválidos.")
	}
	return nil
}
func write(w http.ResponseWriter, status int, v any) error {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	return json.NewEncoder(w).Encode(v)
}
func mapError(err error) error {
	if errors.Is(err, ErrForbidden) {
		return apperror.Forbidden("Você não tem permissão para operar esta mesa.")
	}
	return apperror.Internal(err)
}
