package notes

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"vtt-backend/internal/apperror"
	"vtt-backend/internal/auth"
)

type Note struct {
	ID         string `json:"id"`
	Title      string `json:"title"`
	Body       string `json:"body"`
	Visibility string `json:"visibility"`
}
type Handler struct{ pool *pgxpool.Pool }

func NewHandler(pool *pgxpool.Pool) *Handler { return &Handler{pool} }
func (h *Handler) List(w http.ResponseWriter, r *http.Request) error {
	p, _ := auth.FromContext(r.Context())
	cid := r.PathValue("campaignID")
	var role string
	if err := h.pool.QueryRow(r.Context(), `select role::text from campaign_members where campaign_id=$1 and user_id=$2`, cid, p.UserID).Scan(&role); errors.Is(err, pgx.ErrNoRows) {
		return apperror.Forbidden("Você não participa desta campanha.")
	} else if err != nil {
		slog.Error("notes campaign membership lookup failed", "request_id", r.Header.Get("X-Request-ID"), "campaign_id", cid, "error", err)
		return apperror.Internal(err)
	}
	q := `select id::text,title,body,visibility::text from notes where campaign_id=$1`
	if role != "gm" {
		q += ` and visibility='players' and (not exists (select 1 from public.library_item_permissions lp where lp.campaign_id=$1 and lp.item_type='note'::public.library_item_type and lp.item_key=notes.id::text) or exists (select 1 from public.library_item_permissions lp where lp.campaign_id=$1 and lp.item_type='note'::public.library_item_type and lp.item_key=notes.id::text and lp.user_id=$2))`
	}
	q += ` order by updated_at desc`
	rows, err := h.pool.Query(r.Context(), q, cid, p.UserID)
	if err != nil {
		slog.Error("notes list query failed", "request_id", r.Header.Get("X-Request-ID"), "campaign_id", cid, "error", err)
		return apperror.Internal(err)
	}
	defer rows.Close()
	items := []Note{}
	for rows.Next() {
		var n Note
		if err := rows.Scan(&n.ID, &n.Title, &n.Body, &n.Visibility); err != nil {
			slog.Error("notes list row scan failed", "request_id", r.Header.Get("X-Request-ID"), "campaign_id", cid, "error", err)
			return apperror.Internal(err)
		}
		items = append(items, n)
	}
	if err := rows.Err(); err != nil {
		slog.Error("notes list iteration failed", "request_id", r.Header.Get("X-Request-ID"), "campaign_id", cid, "error", err)
		return apperror.Internal(err)
	}
	return write(w, http.StatusOK, map[string]any{"notes": items})
}
func (h *Handler) Create(w http.ResponseWriter, r *http.Request) error {
	p, _ := auth.FromContext(r.Context())
	cid := r.PathValue("campaignID")
	var role string
	if err := h.pool.QueryRow(r.Context(), `select role::text from campaign_members where campaign_id=$1 and user_id=$2`, cid, p.UserID).Scan(&role); errors.Is(err, pgx.ErrNoRows) || (err == nil && role != "gm") {
		return apperror.Forbidden("Somente o narrador pode criar notas.")
	} else if err != nil {
		slog.Error("notes create membership lookup failed", "request_id", r.Header.Get("X-Request-ID"), "campaign_id", cid, "error", err)
		return apperror.Internal(err)
	}
	var in struct {
		Title      string `json:"title"`
		Body       string `json:"body"`
		Visibility string `json:"visibility"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 32<<10)).Decode(&in); err != nil {
		return apperror.BadRequest("INVALID_BODY", "JSON inválido.")
	}
	in.Title = strings.TrimSpace(in.Title)
	if in.Title == "" || len([]rune(in.Title)) > 120 {
		return apperror.BadRequest("INVALID_NOTE", "A nota precisa de um título válido.")
	}
	if in.Visibility != "players" {
		in.Visibility = "gm"
	}
	var n Note
	err := h.pool.QueryRow(r.Context(), `insert into notes(campaign_id,author_id,title,body,visibility) values($1,$2,$3,$4,$5::note_visibility) returning id::text,title,body,visibility::text`, cid, p.UserID, in.Title, in.Body, in.Visibility).Scan(&n.ID, &n.Title, &n.Body, &n.Visibility)
	if err != nil {
		slog.Error("notes create failed", "request_id", r.Header.Get("X-Request-ID"), "campaign_id", cid, "error", err)
		return apperror.Internal(err)
	}
	return write(w, http.StatusCreated, n)
}
func (h *Handler) Update(w http.ResponseWriter, r *http.Request) error {
	p, _ := auth.FromContext(r.Context())
	var in struct {
		Title      string `json:"title"`
		Body       string `json:"body"`
		Visibility string `json:"visibility"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 32<<10)).Decode(&in); err != nil {
		return apperror.BadRequest("INVALID_BODY", "JSON inválido.")
	}
	in.Title = strings.TrimSpace(in.Title)
	if in.Title == "" || len([]rune(in.Title)) > 120 {
		return apperror.BadRequest("INVALID_NOTE", "A nota precisa de um título válido.")
	}
	if in.Visibility != "players" {
		in.Visibility = "gm"
	}
	var n Note
	err := h.pool.QueryRow(r.Context(), `update notes set title=$1,body=$2,visibility=$3::note_visibility,updated_at=now() where id=$4 and author_id=$5 returning id::text,title,body,visibility::text`, in.Title, in.Body, in.Visibility, r.PathValue("noteID"), p.UserID).Scan(&n.ID, &n.Title, &n.Body, &n.Visibility)
	if errors.Is(err, pgx.ErrNoRows) {
		return apperror.NotFound("NOTE_NOT_FOUND", "Nota não encontrada ou sem permissão.")
	} else if err != nil {
		slog.Error("notes update failed", "request_id", r.Header.Get("X-Request-ID"), "note_id", r.PathValue("noteID"), "error", err)
		return apperror.Internal(err)
	}
	return write(w, http.StatusOK, n)
}
func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) error {
	p, _ := auth.FromContext(r.Context())
	result, err := h.pool.Exec(r.Context(), `delete from notes where id=$1 and author_id=$2`, r.PathValue("noteID"), p.UserID)
	if err != nil {
		slog.Error("notes delete failed", "request_id", r.Header.Get("X-Request-ID"), "note_id", r.PathValue("noteID"), "error", err)
		return apperror.Internal(err)
	}
	if result.RowsAffected() != 1 {
		return apperror.NotFound("NOTE_NOT_FOUND", "Nota não encontrada ou sem permissão.")
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}
func write(w http.ResponseWriter, s int, v any) error {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(s)
	return json.NewEncoder(w).Encode(v)
}
