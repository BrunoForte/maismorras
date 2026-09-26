package overlayaccess

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"vtt-backend/internal/apperror"
	"vtt-backend/internal/auth"
	"vtt-backend/internal/config"
)

const pairingLifetime = 10 * time.Minute
const sessionLifetime = 30 * 24 * time.Hour

type Handler struct {
	pool *pgxpool.Pool
	cfg  config.Config
}

func NewHandler(pool *pgxpool.Pool, cfg config.Config) *Handler {
	return &Handler{pool: pool, cfg: cfg}
}

func (h *Handler) CreatePairing(w http.ResponseWriter, r *http.Request) error {
	principal, _ := auth.FromContext(r.Context())
	campaignID := r.PathValue("campaignID")
	var allowed bool
	if err := h.pool.QueryRow(r.Context(), `select exists(
		select 1 from campaigns c
		left join campaign_members m on m.campaign_id=c.id and m.user_id=$2
		left join profiles p on p.id=$2
		where c.id=$1 and (c.owner_id=$2 or (m.user_id=$2 and m.role='gm'::public.campaign_role) or coalesce(p.is_admin,false))
	)`, campaignID, principal.UserID).Scan(&allowed); err != nil {
		return apperror.Internal(err)
	}
	if !allowed {
		return apperror.Forbidden("Somente o narrador pode parear a overlay.")
	}
	var in struct {
		SceneID string `json:"sceneId"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 2<<10)).Decode(&in); err != nil || strings.TrimSpace(in.SceneID) == "" {
		return apperror.BadRequest("INVALID_SCENE", "Selecione uma cena para a overlay.")
	}
	var sceneAllowed bool
	if err := h.pool.QueryRow(r.Context(), `select exists(select 1 from scenes where id=$1 and campaign_id=$2)`, in.SceneID, campaignID).Scan(&sceneAllowed); err != nil {
		return apperror.Internal(err)
	}
	if !sceneAllowed {
		return apperror.Forbidden("A cena não pertence a esta campanha.")
	}
	var enabledForScene bool
	if err := h.pool.QueryRow(r.Context(), `select exists(select 1 from campaign_overlay_settings where campaign_id=$1 and enabled and active_scene_id=$2)`, campaignID, in.SceneID).Scan(&enabledForScene); err != nil {
		return apperror.Internal(err)
	}
	if !enabledForScene {
		return apperror.Forbidden("Ative a overlay e publique a cena selecionada antes de gerar o link do OBS.")
	}
	_, _ = h.pool.Exec(r.Context(), `delete from overlay_pairing_codes where campaign_id=$1 and expires_at<now()-interval '1 day'`, campaignID)
	_, _ = h.pool.Exec(r.Context(), `delete from overlay_access_sessions where campaign_id=$1 and (expires_at<now()-interval '1 day' or revoked_at<now()-interval '1 day')`, campaignID)
	code, err := randomToken("obs_pair_", 32)
	if err != nil {
		return apperror.Internal(err)
	}
	expiresAt := time.Now().UTC().Add(pairingLifetime)
	if _, err := h.pool.Exec(r.Context(), `insert into overlay_pairing_codes(code_hash,campaign_id,created_by,expires_at) values($1,$2,$3,$4)`, digest(code), campaignID, principal.UserID, expiresAt); err != nil {
		return apperror.Internal(err)
	}
	return write(w, http.StatusCreated, map[string]any{"code": code, "expiresAt": expiresAt.Unix()})
}

func (h *Handler) ExchangePairing(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Code string `json:"code"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 2<<10)).Decode(&in); err != nil || !strings.HasPrefix(in.Code, "obs_pair_") {
		return apperror.BadRequest("INVALID_PAIRING", "O código de pareamento é inválido ou expirou.")
	}
	token, err := randomToken("obs_access_", 32)
	if err != nil {
		return apperror.Internal(err)
	}
	tx, err := h.pool.Begin(r.Context())
	if err != nil {
		return apperror.Internal(err)
	}
	defer func() { _ = tx.Rollback(context.Background()) }()
	var campaignID, userID string
	err = tx.QueryRow(r.Context(), `update overlay_pairing_codes set consumed_at=now()
		where code_hash=$1 and consumed_at is null and expires_at>now()
		returning campaign_id::text,created_by::text`, digest(in.Code)).Scan(&campaignID, &userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return apperror.Unauthorized("Este link já foi usado, expirou ou foi revogado. Gere um novo na mesa.")
	}
	if err != nil {
		return apperror.Internal(err)
	}
	expiresAt := time.Now().UTC().Add(sessionLifetime)
	if _, err := tx.Exec(r.Context(), `insert into overlay_access_sessions(token_hash,campaign_id,created_by,expires_at) values($1,$2,$3,$4)`, digest(token), campaignID, userID, expiresAt); err != nil {
		return apperror.Internal(err)
	}
	if err := tx.Commit(r.Context()); err != nil {
		return apperror.Internal(err)
	}
	return write(w, http.StatusCreated, map[string]any{"accessToken": token, "expiresAt": expiresAt.Unix()})
}

func (h *Handler) RevokeCampaign(w http.ResponseWriter, r *http.Request) error {
	principal, _ := auth.FromContext(r.Context())
	campaignID := r.PathValue("campaignID")
	var allowed bool
	if err := h.pool.QueryRow(r.Context(), `select exists(
		select 1 from campaigns c
		left join campaign_members m on m.campaign_id=c.id and m.user_id=$2
		left join profiles p on p.id=$2
		where c.id=$1 and (c.owner_id=$2 or (m.user_id=$2 and m.role='gm'::public.campaign_role) or coalesce(p.is_admin,false))
	)`, campaignID, principal.UserID).Scan(&allowed); err != nil {
		return apperror.Internal(err)
	}
	if !allowed {
		return apperror.Forbidden("Somente o narrador pode revogar o acesso da overlay.")
	}
	_, err := h.pool.Exec(r.Context(), `update overlay_access_sessions set revoked_at=coalesce(revoked_at,now()) where campaign_id=$1 and revoked_at is null`, campaignID)
	if err != nil {
		return apperror.Internal(err)
	}
	_, err = h.pool.Exec(r.Context(), `update overlay_pairing_codes set consumed_at=coalesce(consumed_at,now()) where campaign_id=$1 and consumed_at is null`, campaignID)
	if err != nil {
		return apperror.Internal(err)
	}
	return write(w, http.StatusOK, map[string]bool{"ok": true})
}

// AuthenticateOrOverlay accepts normal Supabase sessions, or an opaque,
// revocable overlay grant. This wrapper is attached only to explicit read
// endpoints used by the OBS overlay.
func (h *Handler) AuthenticateOrOverlay(next func(http.ResponseWriter, *http.Request) error) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		if !strings.HasPrefix(raw, "obs_access_") {
			auth.Authenticate(h.cfg.SupabaseURL, h.cfg.SupabaseJWTSecret, next).ServeHTTP(w, r)
			return
		}
		principal, campaignID, err := validateToken(r.Context(), h.pool, raw)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "OVERLAY_ACCESS_INVALID", "O acesso da overlay expirou ou foi revogado. Gere um novo link na mesa.")
			return
		}
		if err := validateRequestScope(r, h.pool, campaignID); err != nil {
			writeError(w, http.StatusForbidden, "OVERLAY_SCOPE_DENIED", "Este recurso não pertence à campanha pareada.")
			return
		}
		principal.OverlayOnly = true
		principal.OverlayCampaign = campaignID
		if err := next(w, r.WithContext(auth.WithPrincipal(r.Context(), principal))); err != nil {
			apperror.Write(w, err)
		}
	})
}

func ValidateWebSocketToken(ctx context.Context, pool *pgxpool.Pool, token, sceneID string) (auth.Principal, bool, error) {
	if !strings.HasPrefix(token, "obs_access_") {
		return auth.Principal{}, false, nil
	}
	principal, campaignID, err := validateToken(ctx, pool, token)
	if err != nil {
		return auth.Principal{}, true, err
	}
	var belongs bool
	if err := pool.QueryRow(ctx, `select exists(select 1 from scenes where id=$1 and campaign_id=$2)`, sceneID, campaignID).Scan(&belongs); err != nil {
		return auth.Principal{}, true, err
	}
	if !belongs {
		return auth.Principal{}, true, errors.New("scene outside overlay scope")
	}
	principal.OverlayOnly = true
	principal.OverlayCampaign = campaignID
	return principal, true, nil
}

func validateToken(ctx context.Context, pool *pgxpool.Pool, token string) (auth.Principal, string, error) {
	var p auth.Principal
	var campaignID string
	err := pool.QueryRow(ctx, `select s.campaign_id::text,s.created_by::text from overlay_access_sessions s
		join campaign_overlay_settings os on os.campaign_id=s.campaign_id and os.enabled
		where s.token_hash=$1 and s.expires_at>now() and s.revoked_at is null`, digest(token)).Scan(&campaignID, &p.UserID)
	if err != nil {
		return auth.Principal{}, "", err
	}
	return p, campaignID, nil
}

func validateRequestScope(r *http.Request, pool *pgxpool.Pool, campaignID string) error {
	if requested := r.PathValue("campaignID"); requested != "" && requested != campaignID {
		return errors.New("campaign mismatch")
	}
	if sceneID := r.PathValue("sceneID"); sceneID != "" {
		var belongs bool
		if err := pool.QueryRow(r.Context(), `select exists(select 1 from scenes where id=$1 and campaign_id=$2)`, sceneID, campaignID).Scan(&belongs); err != nil || !belongs {
			return errors.New("scene mismatch")
		}
	}
	if characterID := r.PathValue("characterID"); characterID != "" {
		var active bool
		err := pool.QueryRow(r.Context(), `select exists(
			select 1 from campaigns c
			join campaign_overlay_settings os on os.campaign_id=c.id
			join scenes s on s.id=os.active_scene_id and s.campaign_id=c.id
			join scene_tokens st on st.id=s.active_token_id and st.scene_id=s.id
			where c.id=$1 and st.actor_id=$2
		)`, campaignID, characterID).Scan(&active)
		if err != nil || !active {
			return errors.New("character is not the active overlay combatant")
		}
	}
	return nil
}

func IsOverlayToken(token string) bool { return strings.HasPrefix(token, "obs_access_") }

func randomToken(prefix string, bytesCount int) (string, error) {
	raw := make([]byte, bytesCount)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	return prefix + hex.EncodeToString(raw), nil
}

func digest(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}

func write(w http.ResponseWriter, status int, value any) error {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	return json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	_ = write(w, status, map[string]any{"error": map[string]string{"code": code, "message": message}})
}
