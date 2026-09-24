package scenes

import (
	"encoding/json"
	"errors"
	"log/slog"
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
	// Older browser tabs may submit a scene payload without map dimensions.
	if in.MapWidthCells == 0 {
		in.MapWidthCells = 30
	}
	if in.MapHeightCells == 0 {
		in.MapHeightCells = 20
	}
	if in.Name == "" || len([]rune(in.Name)) > 120 || in.GridSize < 20 || in.GridSize > 200 || !validMapDimensions(in.MapWidthCells, in.MapHeightCells) || in.AmbientAudioVolume < 0 || in.AmbientAudioVolume > 100 || !validSceneSettings(in) {
		return apperror.BadRequest("INVALID_SCENE", "Confira nome, grid, dimensões do mapa, acesso de jogadores e visão da cena.")
	}
	scene, err := h.repo.UpdateScene(r.Context(), r.PathValue("sceneID"), p.UserID, in)
	if err != nil {
		return mapError(err)
	}
	return write(w, http.StatusOK, scene)
}
func validMapDimensions(width, height int) bool {
	return width >= 5 && width <= 100 && height >= 5 && height <= 100
}
func validSceneSettings(s Scene) bool {
	return (s.PlayerAccess == "hidden" || s.PlayerAccess == "available" || s.PlayerAccess == "active") && (s.VisionMode == "manual" || s.VisionMode == "shared" || s.VisionMode == "token")
}
func (h *Handler) Detail(w http.ResponseWriter, r *http.Request) error {
	p, _ := auth.FromContext(r.Context())
	scene, tokens, fog, areas, walls, err := h.repo.Detail(r.Context(), r.PathValue("sceneID"), p.UserID)
	if err != nil {
		return mapError(err)
	}
	return write(w, http.StatusOK, map[string]any{"scene": scene, "tokens": tokens, "fog": fog, "areas": areas, "walls": walls})
}
func (h *Handler) TokenDetail(w http.ResponseWriter, r *http.Request) error {
	p, _ := auth.FromContext(r.Context())
	_, tokens, _, _, _, err := h.repo.Detail(r.Context(), r.PathValue("sceneID"), p.UserID)
	if err != nil {
		return mapError(err)
	}
	tokenID := r.PathValue("tokenID")
	for _, token := range tokens {
		if token.ID == tokenID {
			return write(w, http.StatusOK, token)
		}
	}
	// Hidden or out-of-vision tokens are indistinguishable from deleted tokens.
	return apperror.NotFound("TOKEN_NOT_FOUND", "Token não encontrado.")
}
func (h *Handler) GetOverlaySettings(w http.ResponseWriter, r *http.Request) error {
	p, _ := auth.FromContext(r.Context())
	settings, err := h.repo.GetOverlaySettings(r.Context(), r.PathValue("campaignID"), p.UserID)
	if err != nil {
		return mapError(err)
	}
	return write(w, http.StatusOK, settings)
}
func (h *Handler) SaveOverlaySettings(w http.ResponseWriter, r *http.Request) error {
	p, _ := auth.FromContext(r.Context())
	var in struct {
		Enabled       bool            `json:"enabled"`
		Cameras       json.RawMessage `json:"cameras"`
		ActiveSceneID *string         `json:"activeSceneId"`
	}
	if err := decode(w, r, &in); err != nil {
		return err
	}
	if len(in.Cameras) > 256*1024 || (len(in.Cameras) > 0 && !json.Valid(in.Cameras)) {
		return apperror.BadRequest("INVALID_OVERLAY_SETTINGS", "Configuração de câmeras inválida.")
	}
	settings, err := h.repo.SaveOverlaySettings(r.Context(), r.PathValue("campaignID"), p.UserID, OverlaySettings{Enabled: in.Enabled, Cameras: in.Cameras, ActiveSceneID: in.ActiveSceneID})
	if err != nil {
		return mapError(err)
	}
	return write(w, http.StatusOK, settings)
}
func (h *Handler) GetOverlayLayout(w http.ResponseWriter, r *http.Request) error {
	p, _ := auth.FromContext(r.Context())
	layout, err := h.repo.GetOverlayLayout(r.Context(), r.PathValue("sceneID"), p.UserID)
	if err != nil {
		return mapError(err)
	}
	return write(w, http.StatusOK, map[string]any{"layout": layout})
}
func (h *Handler) SaveOverlayLayout(w http.ResponseWriter, r *http.Request) error {
	p, _ := auth.FromContext(r.Context())
	var layout map[string]any
	if err := decode(w, r, &layout); err != nil {
		return err
	}
	if len(layout) == 0 {
		return apperror.BadRequest("INVALID_LAYOUT", "O layout não pode ser vazio.")
	}
	if err := h.repo.SaveOverlayLayout(r.Context(), r.PathValue("sceneID"), p.UserID, layout); err != nil {
		return mapError(err)
	}
	return write(w, http.StatusOK, map[string]any{"layout": layout})
}
func (h *Handler) GetPresentation(w http.ResponseWriter, r *http.Request) error {
	p, _ := auth.FromContext(r.Context())
	item, err := h.repo.GetPresentation(r.Context(), r.PathValue("sceneID"), p.UserID)
	if err != nil {
		return mapError(err)
	}
	return write(w, http.StatusOK, item)
}
func (h *Handler) SavePresentation(w http.ResponseWriter, r *http.Request) error {
	p, _ := auth.FromContext(r.Context())
	var item Presentation
	if err := decode(w, r, &item); err != nil {
		return err
	}
	if len(item.AssetPath) > 500 || len(item.Title) > 200 || len(item.Description) > 12_000 {
		return apperror.BadRequest("INVALID_PRESENTATION", "Apresentação inválida.")
	}
	if err := h.repo.SavePresentation(r.Context(), r.PathValue("sceneID"), p.UserID, item); err != nil {
		return mapError(err)
	}
	return write(w, http.StatusOK, item)
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
func (h *Handler) CreateWall(w http.ResponseWriter, r *http.Request) error {
	p, _ := auth.FromContext(r.Context())
	var wall Wall
	if err := decode(w, r, &wall); err != nil {
		return err
	}
	if wall.StartX < -100000 || wall.StartX > 100000 || wall.EndX < -100000 || wall.EndX > 100000 || wall.StartY < -100000 || wall.StartY > 100000 || wall.EndY < -100000 || wall.EndY > 100000 || wall.StartX == wall.EndX && wall.StartY == wall.EndY {
		return apperror.BadRequest("INVALID_WALL", "Uma parede precisa ter comprimento.")
	}
	if wall.Kind != "" && wall.Kind != "wall" && wall.Kind != "door" {
		return apperror.BadRequest("INVALID_WALL", "Tipo de barreira inválido.")
	}
	item, err := h.repo.CreateWall(r.Context(), r.PathValue("sceneID"), p.UserID, wall)
	if err != nil {
		return mapError(err)
	}
	return write(w, http.StatusCreated, item)
}
func (h *Handler) SetWallOpen(w http.ResponseWriter, r *http.Request) error {
	p, _ := auth.FromContext(r.Context())
	var in struct {
		Open bool `json:"open"`
	}
	if err := decode(w, r, &in); err != nil {
		return err
	}
	wall, err := h.repo.SetWallOpen(r.Context(), r.PathValue("sceneID"), r.PathValue("wallID"), p.UserID, in.Open)
	if err != nil {
		return mapError(err)
	}
	return write(w, http.StatusOK, wall)
}
func (h *Handler) InteractDoor(w http.ResponseWriter, r *http.Request) error {
	p, _ := auth.FromContext(r.Context())
	wall, err := h.repo.InteractDoor(r.Context(), r.PathValue("sceneID"), p.UserID)
	if err != nil {
		return mapError(err)
	}
	return write(w, http.StatusOK, map[string]any{"open": wall.Open})
}
func (h *Handler) DeleteWall(w http.ResponseWriter, r *http.Request) error {
	p, _ := auth.FromContext(r.Context())
	if err := h.repo.DeleteWall(r.Context(), r.PathValue("sceneID"), r.PathValue("wallID"), p.UserID); err != nil {
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
func (h *Handler) RollTokenInitiative(w http.ResponseWriter, r *http.Request) error {
	p, _ := auth.FromContext(r.Context())
	result, err := h.repo.RollTokenInitiative(r.Context(), r.PathValue("sceneID"), r.PathValue("tokenID"), p.UserID)
	if err != nil {
		return mapError(err)
	}
	return write(w, http.StatusOK, result)
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
		if !errors.Is(err, ErrForbidden) && !errors.Is(err, ErrTokenNotFound) && !errors.Is(err, ErrBlockedMovement) && !errors.Is(err, ErrTokenColorInUse) {
			slog.Error("token update failed", "request_id", r.Header.Get("X-Request-ID"), "scene_id", r.PathValue("sceneID"), "token_id", r.PathValue("tokenID"), "error", err)
		}
		return mapError(err)
	}
	return write(w, http.StatusOK, token)
}
func (h *Handler) UpdateTokenAppearance(w http.ResponseWriter, r *http.Request) error {
	p, _ := auth.FromContext(r.Context())
	var in struct {
		ImageURL   *string    `json:"imageUrl"`
		Color      int        `json:"color"`
		Visibility Visibility `json:"visibility"`
	}
	if err := decode(w, r, &in); err != nil {
		return err
	}
	if in.Color < 0 || in.Color > 16777215 || in.Visibility.ImageScale < 0.5 || in.Visibility.ImageScale > 3 || in.Visibility.ImageOffsetX < -100 || in.Visibility.ImageOffsetX > 100 || in.Visibility.ImageOffsetY < -100 || in.Visibility.ImageOffsetY > 100 {
		return apperror.BadRequest("INVALID_APPEARANCE", "A aparência do token está fora dos limites permitidos.")
	}
	if err := h.repo.UpdateTokenAppearance(r.Context(), r.PathValue("sceneID"), r.PathValue("tokenID"), p.UserID, in.ImageURL, in.Color, in.Visibility); err != nil {
		return mapError(err)
	}
	return write(w, http.StatusOK, map[string]any{"ok": true})
}
func (h *Handler) SetTokenInitiative(w http.ResponseWriter, r *http.Request) error {
	p, _ := auth.FromContext(r.Context())
	var input struct {
		Initiative int `json:"initiative"`
	}
	if err := decode(w, r, &input); err != nil {
		return err
	}
	if input.Initiative < -100 || input.Initiative > 100 {
		return apperror.BadRequest("INVALID_INITIATIVE", "Iniciativa deve estar entre -100 e 100.")
	}
	if err := h.repo.SetTokenInitiative(r.Context(), r.PathValue("sceneID"), r.PathValue("tokenID"), p.UserID, input.Initiative); err != nil {
		return mapError(err)
	}
	return write(w, http.StatusOK, map[string]any{"initiative": input.Initiative})
}
func (h *Handler) DeleteToken(w http.ResponseWriter, r *http.Request) error {
	p, _ := auth.FromContext(r.Context())
	if err := h.repo.DeleteToken(r.Context(), r.PathValue("sceneID"), r.PathValue("tokenID"), p.UserID); err != nil {
		return mapError(err)
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}
func (h *Handler) MoveToken(w http.ResponseWriter, r *http.Request) error {
	p, _ := auth.FromContext(r.Context())
	var in struct {
		X int `json:"x"`
		Y int `json:"y"`
	}
	if err := decode(w, r, &in); err != nil {
		return err
	}
	token, err := h.repo.MoveToken(r.Context(), r.PathValue("sceneID"), r.PathValue("tokenID"), p.UserID, in.X, in.Y)
	if err != nil {
		return mapError(err)
	}
	return write(w, http.StatusOK, map[string]int{"x": token.X, "y": token.Y})
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
	if t.Size < 1 || t.Size > 6 || t.HPMax < 1 || t.HPCurrent < 0 || t.HPCurrent > t.HPMax || t.Color < 0 || t.Color > 16777215 || t.VisionRange < 0 || t.VisionRange > 30 || t.LightRange < 0 || t.LightRange > 30 {
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
	if errors.Is(err, ErrTokenColorInUse) {
		return apperror.Conflict("TOKEN_COLOR_IN_USE", "Esta cor já está sendo usada por outro personagem da campanha.")
	}
	if errors.Is(err, ErrTokenNotFound) {
		return apperror.NotFound("TOKEN_NOT_FOUND", "Este token não existe mais nesta cena. Atualize a cena e tente novamente.")
	}
	if errors.Is(err, ErrBlockedMovement) {
		return apperror.BadRequest("WALL_BLOCKED", "Uma parede bloqueia o caminho deste token.")
	}
	return apperror.Internal(err)
}
