package library

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
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
	audio  audioStateBroadcaster
}

type audioStateBroadcaster interface {
	BroadcastAudioState(sceneID, path string, playing bool, volume float64, positionMs, startedAt, revision int64, effects bool)
}

func NewHandler(pool *pgxpool.Pool, cfg config.Config, audio ...audioStateBroadcaster) *Handler {
	handler := &Handler{pool: pool, cfg: cfg, client: &http.Client{Timeout: 8 * time.Second}}
	if len(audio) > 0 {
		handler.audio = audio[0]
	}
	return handler
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
	// Jogadores não podem listar ou escolher músicas, mas precisam receber a faixa vinculada à cena para ouvir a reprodução do narrador.
	var allowed bool
	if err := h.pool.QueryRow(r.Context(), `select exists(
    select 1 from campaign_members m
    where m.campaign_id=$1 and m.user_id=$2
    and (
      m.role='gm'::public.campaign_role
      or ($3 and exists (select 1 from public.scenes s where s.campaign_id=$1 and s.ambient_audio_path=$4 and s.ambient_audio_enabled))
      or (not $3 and (
        not exists (select 1 from public.library_item_permissions lp where lp.campaign_id=$1 and lp.item_type='asset'::public.library_item_type and lp.item_key=$4)
        or exists (select 1 from public.library_item_permissions lp where lp.campaign_id=$1 and lp.item_type='asset'::public.library_item_type and lp.item_key=$4 and lp.user_id=$2)
      ))
    )
)`, campaignID, p.UserID, isAudioPath(in.Path), in.Path).Scan(&allowed); err != nil || !allowed {
		return apperror.Forbidden("Você não tem acesso a este item.")
	}
	if h.cfg.SupabaseURL == "" || h.cfg.SupabaseSecretKey == "" {
		return apperror.ServiceUnavailable("Storage seguro não está configurado no servidor.")
	}
	payload, _ := json.Marshal(map[string]int{"expiresIn": 3600})
	endpoint := h.cfg.SupabaseURL + "/storage/v1/object/sign/campaign-assets/" + escapeStorageObjectPath(in.Path)
	req, _ := http.NewRequestWithContext(r.Context(), http.MethodPost, endpoint, bytes.NewReader(payload))
	req.Header.Set("Authorization", "Bearer "+h.cfg.SupabaseSecretKey)
	req.Header.Set("apikey", h.cfg.SupabaseSecretKey)
	req.Header.Set("Content-Type", "application/json")
	resp, err := h.client.Do(req)
	if err != nil {
		return apperror.Internal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode/100 != 2 {
		if resp.StatusCode == http.StatusBadRequest || resp.StatusCode == http.StatusNotFound {
			body, _ := io.ReadAll(io.LimitReader(resp.Body, 4<<10))
			message := strings.ToLower(string(body))
			if resp.StatusCode == http.StatusNotFound || strings.Contains(message, "not found") || strings.Contains(message, "does not exist") {
				h.removeStaleAssetReferences(r, campaignID, in.Path)
				return apperror.NotFound("ASSET_NOT_FOUND", "Este arquivo não existe mais no Storage.")
			}
		}
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
	return write(w, http.StatusOK, map[string]any{"url": out.SignedURL, "expiresAt": time.Now().Add(55 * time.Minute).Unix()})
}

// Remove database references only after Storage definitively reports that the
// object is missing, so clients stop requesting an asset that no longer exists.
func (h *Handler) removeStaleAssetReferences(r *http.Request, campaignID, assetPath string) {
	queries := []struct {
		name string
		sql  string
	}{
		{"scene tokens", `update public.scene_tokens st set image_url=null from public.scenes s where st.scene_id=s.id and s.campaign_id=$1 and st.image_url=$2`},
		{"scene backgrounds", `update public.scenes set background_url=null,updated_at=now() where campaign_id=$1 and background_url=$2`},
		{"scene audio", `update public.scenes set ambient_audio_path=null,ambient_audio_enabled=false,ambient_audio_started_at=null,ambient_audio_revision=ambient_audio_revision+1,updated_at=now() where campaign_id=$1 and ambient_audio_path=$2`},
		{"scene presentations", `update public.scene_presentations set asset_path='',visible=false,updated_at=now() where campaign_id=$1 and asset_path=$2`},
		{"actor portraits", `update public.actors set sheet=jsonb_set(sheet,'{portraitPath}','null'::jsonb,true) where campaign_id=$1 and sheet->>'portraitPath'=$2`},
		{"actor token portraits", `update public.actors set sheet=jsonb_set(sheet,'{tokenPortraitPath}','null'::jsonb,true) where campaign_id=$1 and sheet->>'tokenPortraitPath'=$2`},
		{"NPC portraits", `update public.actors set sheet=jsonb_set(sheet,'{imageUrl}','null'::jsonb,true) where campaign_id=$1 and sheet->>'imageUrl'=$2`},
		{"actor tokens", `update public.actors set token=jsonb_set(token,'{imageUrl}','null'::jsonb,true) where campaign_id=$1 and token->>'imageUrl'=$2`},
		{"asset catalog", `update public.campaign_assets set deleted_at=coalesce(deleted_at,now()),orphaned_at=coalesce(orphaned_at,now()) where campaign_id=$1 and (path=$2 or thumbnail_path=$2)`},
		{"asset permissions", `delete from public.library_item_permissions where campaign_id=$1 and item_type='asset'::public.library_item_type and item_key=$2`},
	}
	for _, query := range queries {
		if _, err := h.pool.Exec(r.Context(), query.sql, campaignID, assetPath); err != nil {
			slog.Warn("removed asset reference cleanup failed", "request_id", r.Header.Get("X-Request-ID"), "campaign_id", campaignID, "reference_type", query.name, "error", err)
		}
	}
}

// Storage object paths contain slash-separated segments. Escape each segment
// independently so reserved characters in filenames are encoded without
// turning directory separators into %2F.
func escapeStorageObjectPath(objectPath string) string {
	segments := strings.Split(objectPath, "/")
	for i, segment := range segments {
		segments[i] = url.PathEscape(segment)
	}
	return strings.Join(segments, "/")
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
