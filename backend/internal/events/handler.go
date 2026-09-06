package events

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	"vtt-backend/internal/apperror"
	"vtt-backend/internal/auth"
)

type Event struct {
	ID        int64           `json:"id"`
	Author    string          `json:"author"`
	Type      string          `json:"type"`
	Payload   json.RawMessage `json:"payload"`
	CreatedAt string          `json:"createdAt"`
}
type Handler struct{ pool *pgxpool.Pool }

func NewHandler(pool *pgxpool.Pool) *Handler { return &Handler{pool: pool} }
func (h *Handler) List(w http.ResponseWriter, r *http.Request) error {
	p, _ := auth.FromContext(r.Context())
	campaignID := r.PathValue("campaignID")
	var member bool
	if err := h.pool.QueryRow(r.Context(), `select exists(select 1 from campaign_members where campaign_id=$1 and user_id=$2)`, campaignID, p.UserID).Scan(&member); err != nil || !member {
		return apperror.Forbidden("Você não participa desta campanha.")
	}
	rows, err := h.pool.Query(r.Context(), `select e.id,coalesce(pr.display_name,'Aventureiro'),e.event_type,e.payload,e.created_at::text from game_events e left join profiles pr on pr.id=e.actor_id where e.campaign_id=$1 and e.event_type in ('chat.message','dice.roll') order by e.id desc limit 100`, campaignID)
	if err != nil {
		return apperror.Internal(err)
	}
	defer rows.Close()
	items := []Event{}
	for rows.Next() {
		var item Event
		if err := rows.Scan(&item.ID, &item.Author, &item.Type, &item.Payload, &item.CreatedAt); err != nil {
			return apperror.Internal(err)
		}
		items = append(items, item)
	}
	for left, right := 0, len(items)-1; left < right; left, right = left+1, right-1 {
		items[left], items[right] = items[right], items[left]
	}
	return write(w, http.StatusOK, map[string]any{"events": items})
}
func (h *Handler) Create(w http.ResponseWriter, r *http.Request) error {
	p, _ := auth.FromContext(r.Context())
	campaignID := r.PathValue("campaignID")
	var in struct {
		Type    string          `json:"type"`
		Payload json.RawMessage `json:"payload"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10)).Decode(&in); err != nil {
		return apperror.BadRequest("INVALID_BODY", "JSON inválido.")
	}
	if in.Type != "chat.message" && in.Type != "dice.roll" {
		return apperror.BadRequest("INVALID_EVENT", "Evento inválido.")
	}
	if len(in.Payload) == 0 || !json.Valid(in.Payload) {
		return apperror.BadRequest("INVALID_EVENT", "Conteúdo inválido.")
	}
	var exists bool
	if err := h.pool.QueryRow(r.Context(), `select exists(select 1 from campaign_members where campaign_id=$1 and user_id=$2)`, campaignID, p.UserID).Scan(&exists); err != nil || !exists {
		return apperror.Forbidden("Você não participa desta campanha.")
	}
	if in.Type == "chat.message" {
		var payload struct {
			Text string `json:"text"`
		}
		_ = json.Unmarshal(in.Payload, &payload)
		if len([]rune(strings.TrimSpace(payload.Text))) == 0 || len([]rune(payload.Text)) > 2000 {
			return apperror.BadRequest("INVALID_MESSAGE", "A mensagem deve ter entre 1 e 2000 caracteres.")
		}
	}
	var item Event
	err := h.pool.QueryRow(r.Context(), `insert into game_events(campaign_id,actor_id,event_type,payload) values($1,$2,$3,$4) returning id,event_type,payload,created_at::text`, campaignID, p.UserID, in.Type, in.Payload).Scan(&item.ID, &item.Type, &item.Payload, &item.CreatedAt)
	if err != nil {
		return apperror.Internal(err)
	}
	_ = h.pool.QueryRow(r.Context(), `select display_name from profiles where id=$1`, p.UserID).Scan(&item.Author)
	return write(w, http.StatusCreated, item)
}
func write(w http.ResponseWriter, status int, v any) error {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	return json.NewEncoder(w).Encode(v)
}
