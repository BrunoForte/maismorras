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
	var role string
	if err := h.pool.QueryRow(r.Context(), "select role::text from campaign_members where campaign_id=$1 and user_id=$2", campaignID, p.UserID).Scan(&role); err != nil {
		return apperror.Forbidden("Você não participa desta campanha.")
	}
	if role != "gm" && isAudioPath(in.Path) {
		return apperror.Forbidden("Músicas são controladas pelo narrador.")
	}
	var allowed bool
	if err := h.pool.QueryRow(r.Context(), `select exists(select 1 from campaign_members m where m.campaign_id=$1 and m.user_id=$2 and (m.role='gm'::public.campaign_role or not exists (select 1 from public.library_item_permissions lp where lp.campaign_id=$1 and lp.item_type='asset'::public.library_item_type and lp.item_key=$3) or exists (select 1 from public.library_item_permissions lp where lp.campaign_id=$1 and lp.item_type='asset'::public.library_item_type and lp.item_key=$3 and lp.user_id=$2)))`, campaignID, p.UserID, in.Path).Scan(&allowed); err != nil || !allowed {
		return apperror.Forbidden("Você não tem acesso a este item.")
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
func isAudioPath(value string) bool {
	value = strings.ToLower(value)
	for _, extension := range []string{".mp3", ".ogg", ".wav", ".m4a", ".aac", ".flac"} {
		if strings.HasSuffix(value, extension) {
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
