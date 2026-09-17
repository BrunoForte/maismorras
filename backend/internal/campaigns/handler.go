package campaigns

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
	items, err := h.repo.List(r.Context(), p.UserID, p.IsAdmin)
	if err != nil {
		return apperror.Internal(err)
	}
	w.Header().Set("Content-Type", "application/json")
	return json.NewEncoder(w).Encode(map[string]any{"campaigns": items})
}
func (h *Handler) CreateInvite(w http.ResponseWriter, r *http.Request) error {
	p, _ := auth.FromContext(r.Context())
	invite, err := h.repo.CreateInvite(r.Context(), r.PathValue("campaignID"), p.UserID)
	if errors.Is(err, ErrForbidden) {
		return apperror.Forbidden("Somente o narrador pode criar convites.")
	}
	if err != nil {
		return apperror.Internal(err)
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	return json.NewEncoder(w).Encode(invite)
}
func (h *Handler) AcceptInvite(w http.ResponseWriter, r *http.Request) error {
	p, _ := auth.FromContext(r.Context())
	campaign, err := h.repo.AcceptInvite(r.Context(), r.PathValue("code"), p.UserID)
	if errors.Is(err, ErrInviteInvalid) {
		return apperror.BadRequest("INVALID_INVITE", "Este convite expirou, foi usado ou não existe.")
	}
	if err != nil {
		return apperror.Internal(err)
	}
	w.Header().Set("Content-Type", "application/json")
	return json.NewEncoder(w).Encode(campaign)
}
func (h *Handler) RemoveMember(w http.ResponseWriter, r *http.Request) error {
	p, _ := auth.FromContext(r.Context())
	if err := h.repo.RemoveMember(r.Context(), r.PathValue("campaignID"), r.PathValue("userID"), p.UserID); errors.Is(err, ErrForbidden) {
		return apperror.Forbidden("Somente o narrador pode remover jogadores.")
	} else if errors.Is(err, ErrNotFound) {
		return apperror.NotFound("MEMBER_NOT_FOUND", "Jogador não encontrado nesta campanha.")
	} else if err != nil {
		return apperror.Internal(err)
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}
func (h *Handler) Create(w http.ResponseWriter, r *http.Request) error {
	p, _ := auth.FromContext(r.Context())
	var input struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&input); err != nil {
		return apperror.BadRequest("INVALID_BODY", "JSON inválido.")
	}
	input.Name = strings.TrimSpace(input.Name)
	if input.Name == "" || len([]rune(input.Name)) > 120 {
		return apperror.BadRequest("INVALID_NAME", "Nome deve ter entre 1 e 120 caracteres.")
	}
	item, err := h.repo.Create(r.Context(), p.UserID, input.Name)
	if err != nil {
		return apperror.Internal(err)
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	return json.NewEncoder(w).Encode(item)
}

func (h *Handler) Rename(w http.ResponseWriter, r *http.Request) error {
	p, _ := auth.FromContext(r.Context())
	var input struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&input); err != nil {
		return apperror.BadRequest("INVALID_BODY", "JSON inválido.")
	}
	input.Name = strings.TrimSpace(input.Name)
	if input.Name == "" || len([]rune(input.Name)) > 120 {
		return apperror.BadRequest("INVALID_NAME", "Nome deve ter entre 1 e 120 caracteres.")
	}
	item, err := h.repo.Rename(r.Context(), r.PathValue("campaignID"), p.UserID, input.Name)
	if errors.Is(err, ErrForbidden) {
		return apperror.Forbidden("Somente o criador pode renomear esta campanha.")
	}
	if err != nil {
		return apperror.Internal(err)
	}
	w.Header().Set("Content-Type", "application/json")
	return json.NewEncoder(w).Encode(item)
}

func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) error {
	p, _ := auth.FromContext(r.Context())
	err := h.repo.Delete(r.Context(), r.PathValue("campaignID"), p.UserID)
	if errors.Is(err, ErrForbidden) {
		return apperror.Forbidden("Somente o criador pode excluir esta campanha.")
	}
	if err != nil {
		return apperror.Internal(err)
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}
