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
	"vtt-backend/internal/observability"
)

type Handler struct {
	pool   *pgxpool.Pool
	cfg    config.Config
	client *http.Client
	audio  audioStateBroadcaster
}

type audioStateBroadcaster interface {
	BroadcastAudioState(sceneID, path string, playing bool, volume float64, positionMs, startedAt, revision int64, loop, effects bool, requestID string)
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
		Path                string `json:"path"`
		PresentationSceneID string `json:"presentationSceneId"`
		Surface             string `json:"surface"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10)).Decode(&in); err != nil {
		return apperror.BadRequest("INVALID_BODY", "JSON inválido.")
	}
	in.Path = strings.TrimSpace(in.Path)
	prefix := "campaigns/" + campaignID + "/"
	if in.Path == "" || !strings.HasPrefix(in.Path, prefix) || strings.Contains(in.Path, "..") || path.IsAbs(in.Path) {
		return apperror.BadRequest("INVALID_ASSET", "Arquivo inválido para esta campanha.")
	}
	if (in.Surface != "" && in.Surface != "presentation" && in.Surface != "overlay") || ((in.Surface == "presentation" || in.Surface == "overlay") && in.PresentationSceneID == "") {
		return apperror.BadRequest("INVALID_PRESENTATION", "Destino de apresentação inválido.")
	}
	if p.OverlayOnly {
		if in.Surface != "overlay" || in.PresentationSceneID == "" {
			return apperror.Forbidden("A overlay só pode carregar arquivos vinculados ao seu layout ativo.")
		}
		var referenced bool
		err := h.pool.QueryRow(r.Context(), `select exists(
			select 1 from scenes s where s.id=$2 and s.campaign_id=$1 and (
				s.background_url=$3
				or (s.ambient_audio_enabled and s.ambient_audio_path=$3)
				or (s.ambient_effect_enabled and s.ambient_effect_path=$3)
				or exists(select 1 from scene_tokens st where st.scene_id=s.id and not st.is_hidden and st.image_url=$3)
				or exists(select 1 from scene_tokens st join actors a on a.id=st.actor_id where st.scene_id=s.id and not st.is_hidden and (a.sheet->>'portraitPath'=$3 or a.sheet->>'tokenPortraitPath'=$3 or a.token->>'imageUrl'=$3))
				or exists(select 1 from scene_presentations sp where sp.scene_id=s.id and sp.asset_path=$3 and sp.visible and sp.overlay_visible)
				or exists(select 1 from scene_overlay_layouts l where l.scene_id=s.id and (
					l.layout->>'background'=$3 or exists(
						select 1 from jsonb_each(case when jsonb_typeof(l.layout->'profiles')='object' then l.layout->'profiles' else '{}'::jsonb end) profile
						where profile.value->>'background'=$3
					)
				))
			)
		)`, campaignID, in.PresentationSceneID, in.Path).Scan(&referenced)
		if err != nil || !referenced {
			return apperror.Forbidden("Este arquivo não está sendo usado pela overlay desta cena.")
		}
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
	      or ($3 and exists (select 1 from public.scenes s where s.campaign_id=$1 and ((s.ambient_audio_path=$4 and s.ambient_audio_enabled) or (s.ambient_effect_path=$4 and s.ambient_effect_enabled))))
      or (not $3 and $5 in ('presentation','overlay') and exists (
        select 1 from public.scene_presentations sp
        join public.scenes ps on ps.id=sp.scene_id and ps.campaign_id=$1
        where sp.scene_id=nullif($6,'')::uuid and sp.asset_path=$4 and sp.visible
          and (( $5='overlay' and m.role='gm'::public.campaign_role and sp.overlay_visible )
            or ( $5='presentation' and (not sp.audience_restricted or $2=any(sp.visible_user_ids))))
      ))
      or (not $3 and (
        not exists (select 1 from public.library_item_permissions lp where lp.campaign_id=$1 and lp.item_type='asset'::public.library_item_type and lp.item_key=$4)
        or exists (select 1 from public.library_item_permissions lp where lp.campaign_id=$1 and lp.item_type='asset'::public.library_item_type and lp.item_key=$4 and lp.user_id=$2)
      ))
    )
)`, campaignID, p.UserID, isAudioPath(in.Path), in.Path, in.Surface, in.PresentationSceneID).Scan(&allowed); err != nil || !allowed {
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
	h.clearStaleAudioReferences(r, campaignID, assetPath)
	queries := []struct {
		name string
		sql  string
	}{
		{"scene tokens", `update public.scene_tokens st set image_url=null from public.scenes s where st.scene_id=s.id and s.campaign_id=$1 and st.image_url=$2`},
		{"scene backgrounds", `update public.scenes set background_url=null,updated_at=now() where campaign_id=$1 and background_url=$2`},
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
			attrs := []any{"event", "library.asset_reference_cleanup_failed", "request_id", r.Header.Get("X-Request-ID"), "campaign_id", observability.SafeUUID(campaignID), "reference_type", query.name}
			slog.Warn("removed asset reference cleanup failed", append(attrs, observability.SafeErrorAttrs(err)...)...)
		}
	}
}

func (h *Handler) clearStaleAudioReferences(r *http.Request, campaignID, assetPath string) {
	for _, channel := range []struct {
		column  string
		effects bool
	}{{column: "ambient_audio"}, {column: "ambient_effect", effects: true}} {
		query := `update public.scenes set ` + channel.column + `_path=null,` + channel.column + `_enabled=false,` + channel.column + `_started_at=null,` + channel.column + `_position_ms=0,` + channel.column + `_revision=` + channel.column + `_revision+1,updated_at=now() where campaign_id=$1 and ` + channel.column + `_path=$2 returning id::text,` + channel.column + `_revision,` + channel.column + `_loop`
		rows, err := h.pool.Query(r.Context(), query, campaignID, assetPath)
		if err != nil {
			attrs := []any{"event", "library.asset_reference_cleanup_failed", "request_id", r.Header.Get("X-Request-ID"), "campaign_id", observability.SafeUUID(campaignID), "reference_type", channel.column}
			slog.Warn("removed asset audio reference cleanup failed", append(attrs, observability.SafeErrorAttrs(err)...)...)
			continue
		}
		type clearedAudio struct {
			sceneID  string
			revision int64
			loop     bool
		}
		cleared := make([]clearedAudio, 0, 1)
		for rows.Next() {
			var state clearedAudio
			if err := rows.Scan(&state.sceneID, &state.revision, &state.loop); err != nil {
				attrs := []any{"event", "library.asset_reference_cleanup_failed", "request_id", r.Header.Get("X-Request-ID"), "campaign_id", observability.SafeUUID(campaignID), "reference_type", channel.column}
				slog.Warn("removed asset audio reference cleanup failed", append(attrs, observability.SafeErrorAttrs(err)...)...)
				continue
			}
			cleared = append(cleared, state)
		}
		if err := rows.Err(); err != nil {
			attrs := []any{"event", "library.asset_reference_cleanup_failed", "request_id", r.Header.Get("X-Request-ID"), "campaign_id", observability.SafeUUID(campaignID), "reference_type", channel.column}
			slog.Warn("removed asset audio reference cleanup failed", append(attrs, observability.SafeErrorAttrs(err)...)...)
		}
		rows.Close()
		if h.audio != nil {
			for _, state := range cleared {
				h.audio.BroadcastAudioState(state.sceneID, "", false, 0, 0, 0, state.revision, state.loop, channel.effects, r.Header.Get("X-Request-ID"))
			}
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
