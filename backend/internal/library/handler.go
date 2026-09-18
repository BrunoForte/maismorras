package library

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"path"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"vtt-backend/internal/apperror"
	"vtt-backend/internal/auth"
	"vtt-backend/internal/config"
)

type Handler struct {
	pool   *pgxpool.Pool
	cfg    config.Config
	client *http.Client
}

func NewHandler(pool *pgxpool.Pool, cfg config.Config) *Handler {
	return &Handler{pool: pool, cfg: cfg, client: &http.Client{Timeout: 8 * time.Second}}
}

// SignedURL authorizes the campaign member first, then asks Supabase Storage
// for a short-lived URL. The secret key never leaves this process.
func (h *Handler) SignedURL(w http.ResponseWriter, r *http.Request) error {
	p, _ := auth.FromContext(r.Context())
	campaignID := r.PathValue("campaignID")
	var in struct {
		Path string `json:"path"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10)).Decode(&in); err != nil {
		return apperror.BadRequest("INVALID_BODY", "JSON inválido.")
	}
	in.Path = strings.TrimSpace(in.Path)
	prefix := "campaigns/" + campaignID + "/"
	if in.Path == "" || !strings.HasPrefix(in.Path, prefix) || strings.Contains(in.Path, "..") || path.IsAbs(in.Path) {
		return apperror.BadRequest("INVALID_ASSET", "Arquivo inválido para esta campanha.")
	}
	var allowed bool
	if err := h.pool.QueryRow(r.Context(), `select exists(select 1 from campaign_members where campaign_id=$1 and user_id=$2)`, campaignID, p.UserID).Scan(&allowed); err != nil || !allowed {
		return apperror.Forbidden("Você não participa desta campanha.")
	}
	if h.cfg.SupabaseURL == "" || h.cfg.SupabaseSecretKey == "" {
		return apperror.ServiceUnavailable("Storage seguro não está configurado no servidor.")
	}
	payload, _ := json.Marshal(map[string]int{"expiresIn": 3600})
	endpoint := h.cfg.SupabaseURL + "/storage/v1/object/sign/campaign-assets/" + url.PathEscape(in.Path)
	req, _ := http.NewRequestWithContext(context.Background(), http.MethodPost, endpoint, bytes.NewReader(payload))
	req.Header.Set("Authorization", "Bearer "+h.cfg.SupabaseSecretKey)
	req.Header.Set("apikey", h.cfg.SupabaseSecretKey)
	req.Header.Set("Content-Type", "application/json")
	resp, err := h.client.Do(req)
	if err != nil {
		return apperror.Internal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode/100 != 2 {
		return apperror.Internal(nil)
	}
	var out struct {
		SignedURL string `json:"signedURL"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil || out.SignedURL == "" {
		return apperror.Internal(err)
	}
	if strings.HasPrefix(out.SignedURL, "/") {
		out.SignedURL = h.cfg.SupabaseURL + "/storage/v1" + out.SignedURL
	}
	return write(w, http.StatusOK, map[string]string{"url": out.SignedURL})
}
func write(w http.ResponseWriter, status int, value any) error {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	return json.NewEncoder(w).Encode(value)
}
