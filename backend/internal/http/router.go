package apphttp

import (
	"bufio"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strings"
	"time"

	"vtt-backend/internal/apperror"
	"vtt-backend/internal/auth"
	"vtt-backend/internal/campaigns"
	"vtt-backend/internal/characters"
	"vtt-backend/internal/compendium"
	"vtt-backend/internal/config"
	"vtt-backend/internal/events"
	"vtt-backend/internal/library"
	"vtt-backend/internal/notes"
	"vtt-backend/internal/npcs"
	"vtt-backend/internal/observability"
	"vtt-backend/internal/overlayaccess"
	"vtt-backend/internal/realtime"
	"vtt-backend/internal/scenes"
	"vtt-backend/internal/tokens"
)

type errorHandler func(http.ResponseWriter, *http.Request) error

func NewRouter(cfg config.Config, logger *slog.Logger, tokenHandler *tokens.Handler, campaignHandler *campaigns.Handler, sceneHandler *scenes.Handler, characterHandler *characters.Handler, compendiumHandler *compendium.Handler, noteHandler *notes.Handler, npcHandler *npcs.Handler, eventHandler *events.Handler, libraryHandler *library.Handler, realtimeHandler http.Handler, overlayHandler *overlayaccess.Handler, readiness ...realtime.ReadinessProvider) http.Handler {
	mux := http.NewServeMux()
	var readinessProvider realtime.ReadinessProvider
	if len(readiness) > 0 {
		readinessProvider = readiness[0]
	}
	mux.Handle("GET /api/v1/tokens/gerar", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, tokenHandler.Generate))
	mux.Handle("GET /api/v1/campaigns/{campaignID}/scenes/generate-background", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, tokenHandler.GenerateMap))
	mux.Handle("GET /api/v1/ws", realtimeHandler)
	mux.Handle("POST /api/v1/overlay/pair", withError(overlayHandler.ExchangePairing))
	mux.Handle("POST /api/v1/campaigns/{campaignID}/overlay-pairings", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, overlayHandler.CreatePairing))
	mux.Handle("DELETE /api/v1/campaigns/{campaignID}/overlay-pairings", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, overlayHandler.RevokeCampaign))
	mux.Handle("GET /api/v1/campaigns", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, campaignHandler.List))
	mux.Handle("POST /api/v1/campaigns", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, campaignHandler.Create))
	mux.Handle("PATCH /api/v1/campaigns/{campaignID}", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, campaignHandler.Rename))
	mux.Handle("DELETE /api/v1/campaigns/{campaignID}", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, campaignHandler.Delete))
	mux.Handle("POST /api/v1/campaigns/{campaignID}/invites", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, campaignHandler.CreateInvite))
	mux.Handle("POST /api/v1/invites/{code}/accept", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, campaignHandler.AcceptInvite))
	mux.Handle("DELETE /api/v1/campaigns/{campaignID}/members/{userID}", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, campaignHandler.RemoveMember))
	mux.Handle("GET /api/v1/campaigns/{campaignID}/character", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, characterHandler.GetMine))
	mux.Handle("PUT /api/v1/campaigns/{campaignID}/character", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, characterHandler.SaveMine))
	mux.Handle("POST /api/v1/campaigns/{campaignID}/character/roll", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, characterHandler.RollMine))
	mux.Handle("POST /api/v1/campaigns/{campaignID}/character/rest", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, characterHandler.Rest))
	mux.Handle("POST /api/v1/campaigns/{campaignID}/characters/{characterID}/rest", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, characterHandler.Rest))
	mux.Handle("POST /api/v1/campaigns/{campaignID}/character/cast-spell", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, characterHandler.CastMineSpell))
	mux.Handle("GET /api/v1/campaigns/{campaignID}/participants", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, characterHandler.ListForGM))
	mux.Handle("GET /api/v1/campaigns/{campaignID}/characters/{characterID}", overlayHandler.AuthenticateOrOverlay(characterHandler.GetForGM))
	mux.Handle("PUT /api/v1/campaigns/{campaignID}/characters/{characterID}", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, characterHandler.SaveForGM))
	mux.Handle("PATCH /api/v1/campaigns/{campaignID}/characters/{characterID}/initiative-advantage", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, characterHandler.SetInitiativeAdvantage))
	mux.Handle("DELETE /api/v1/campaigns/{campaignID}/characters/{characterID}", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, characterHandler.DeleteForGM))
	mux.Handle("POST /api/v1/campaigns/{campaignID}/characters", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, characterHandler.CreateForGM))
	mux.Handle("GET /api/v1/campaigns/{campaignID}/compendium", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, compendiumHandler.List))
	mux.Handle("POST /api/v1/campaigns/{campaignID}/compendium/entries", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, compendiumHandler.CreateEntry))
	mux.Handle("PUT /api/v1/campaigns/{campaignID}/compendium/entries/{entryID}", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, compendiumHandler.UpdateEntry))
	mux.Handle("DELETE /api/v1/campaigns/{campaignID}/compendium/entries/{entryID}", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, compendiumHandler.DeleteEntry))
	mux.Handle("POST /api/v1/campaigns/{campaignID}/compendium/import", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, compendiumHandler.ImportEntries))
	mux.Handle("POST /api/v1/campaigns/{campaignID}/compendium/entries/{entryID}/translate", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, compendiumHandler.TranslateMissing))
	mux.Handle("GET /api/v1/campaigns/{campaignID}/overlay-settings", overlayHandler.AuthenticateOrOverlay(sceneHandler.GetOverlaySettings))
	mux.Handle("PUT /api/v1/campaigns/{campaignID}/overlay-settings", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, sceneHandler.SaveOverlaySettings))
	mux.Handle("GET /api/v1/campaigns/{campaignID}/notes", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, noteHandler.List))
	mux.Handle("POST /api/v1/campaigns/{campaignID}/assets/signed-url", overlayHandler.AuthenticateOrOverlay(libraryHandler.SignedURL))
	mux.Handle("PUT /api/v1/campaigns/{campaignID}/assets/audio-kind", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, libraryHandler.SetAudioKind))
	mux.Handle("GET /api/v1/campaigns/{campaignID}/library-permissions", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, libraryHandler.ListPermissions))
	mux.Handle("PUT /api/v1/campaigns/{campaignID}/library-permissions", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, libraryHandler.SavePermissions))
	mux.Handle("POST /api/v1/campaigns/{campaignID}/notes", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, noteHandler.Create))
	mux.Handle("PUT /api/v1/campaigns/{campaignID}/notes/{noteID}", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, noteHandler.Update))
	mux.Handle("DELETE /api/v1/campaigns/{campaignID}/notes/{noteID}", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, noteHandler.Delete))
	mux.Handle("GET /api/v1/campaigns/{campaignID}/npcs", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, npcHandler.List))
	mux.Handle("POST /api/v1/campaigns/{campaignID}/npcs", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, npcHandler.Create))
	mux.Handle("PUT /api/v1/campaigns/{campaignID}/npcs/{npcID}", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, npcHandler.Update))
	mux.Handle("DELETE /api/v1/campaigns/{campaignID}/npcs/{npcID}", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, npcHandler.Delete))
	mux.Handle("GET /api/v1/campaigns/{campaignID}/events", overlayHandler.AuthenticateOrOverlay(eventHandler.List))
	mux.Handle("POST /api/v1/campaigns/{campaignID}/events", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, eventHandler.Create))
	mux.Handle("GET /api/v1/campaigns/{campaignID}/scenes", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, sceneHandler.List))
	mux.Handle("POST /api/v1/campaigns/{campaignID}/scenes", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, sceneHandler.Create))
	mux.Handle("GET /api/v1/scenes/{sceneID}", overlayHandler.AuthenticateOrOverlay(sceneHandler.Detail))
	mux.Handle("GET /api/v1/scenes/{sceneID}/tokens/{tokenID}", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, sceneHandler.TokenDetail))
	mux.Handle("GET /api/v1/scenes/{sceneID}/overlay-layout", overlayHandler.AuthenticateOrOverlay(sceneHandler.GetOverlayLayout))
	mux.Handle("PUT /api/v1/scenes/{sceneID}/overlay-layout", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, sceneHandler.SaveOverlayLayout))
	mux.Handle("GET /api/v1/scenes/{sceneID}/presentation", overlayHandler.AuthenticateOrOverlay(sceneHandler.GetPresentation))
	mux.Handle("PUT /api/v1/scenes/{sceneID}/presentation", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, sceneHandler.SavePresentation))
	mux.Handle("PATCH /api/v1/scenes/{sceneID}", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, sceneHandler.UpdateScene))
	mux.Handle("PUT /api/v1/scenes/{sceneID}/audio", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, sceneHandler.UpdateAudioState))
	mux.Handle("GET /api/v1/scenes/{sceneID}/combat", overlayHandler.AuthenticateOrOverlay(sceneHandler.Combat))
	mux.Handle("GET /api/v1/scenes/{sceneID}/effects", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, sceneHandler.Effects))
	mux.Handle("GET /api/v1/scenes/{sceneID}/effect-definitions", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, sceneHandler.EffectDefinitions))
	mux.Handle("PATCH /api/v1/scenes/{sceneID}/fog", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, sceneHandler.UpdateFog))
	mux.Handle("POST /api/v1/scenes/{sceneID}/areas", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, sceneHandler.CreateArea))
	mux.Handle("DELETE /api/v1/scenes/{sceneID}/areas/{areaID}", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, sceneHandler.DeleteArea))
	mux.Handle("POST /api/v1/scenes/{sceneID}/walls", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, sceneHandler.CreateWall))
	mux.Handle("PATCH /api/v1/scenes/{sceneID}/walls/{wallID}", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, sceneHandler.SetWallOpen))
	mux.Handle("POST /api/v1/scenes/{sceneID}/doors/interact", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, sceneHandler.InteractDoor))
	mux.Handle("DELETE /api/v1/scenes/{sceneID}/walls/{wallID}", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, sceneHandler.DeleteWall))
	mux.Handle("POST /api/v1/scenes/{sceneID}/effects", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, sceneHandler.AddEffect))
	mux.Handle("DELETE /api/v1/scenes/{sceneID}/effects/{effectID}", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, sceneHandler.RemoveEffect))
	mux.Handle("PATCH /api/v1/scenes/{sceneID}/combat", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, sceneHandler.SetCombat))
	mux.Handle("POST /api/v1/scenes/{sceneID}/combat/roll-initiative", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, sceneHandler.RollInitiative))
	mux.Handle("POST /api/v1/scenes/{sceneID}/tokens/{tokenID}/roll-initiative", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, sceneHandler.RollTokenInitiative))
	mux.Handle("PATCH /api/v1/scenes/{sceneID}/tokens/{tokenID}/initiative", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, sceneHandler.SetTokenInitiative))
	mux.Handle("POST /api/v1/scenes/{sceneID}/tokens", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, sceneHandler.CreateToken))
	mux.Handle("POST /api/v1/scenes/{sceneID}/tokens/from-character", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, sceneHandler.CreateTokenFromCharacter))
	mux.Handle("POST /api/v1/scenes/{sceneID}/tokens/from-npc", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, sceneHandler.CreateTokenFromNPC))
	mux.Handle("POST /api/v1/scenes/{sceneID}/tokens/from-compendium-monster", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, sceneHandler.CreateTokenFromCompendiumMonster))
	mux.Handle("PATCH /api/v1/scenes/{sceneID}/tokens/{tokenID}", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, sceneHandler.UpdateToken))
	mux.Handle("PATCH /api/v1/scenes/{sceneID}/tokens/{tokenID}/hit-points", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, sceneHandler.UpdateTokenHitPoints))
	mux.Handle("PATCH /api/v1/scenes/{sceneID}/tokens/{tokenID}/appearance", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, sceneHandler.UpdateTokenAppearance))
	mux.Handle("DELETE /api/v1/scenes/{sceneID}/tokens/{tokenID}", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, sceneHandler.DeleteToken))
	mux.Handle("PATCH /api/v1/scenes/{sceneID}/tokens/{tokenID}/position", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, sceneHandler.MoveToken))
	// Cloud Run's public frontend can reserve/intercept /healthz and return
	// its own 404 before the request reaches the container. Use /health for
	// the externally reachable liveness endpoint instead.
	mux.HandleFunc("GET /health", health)
	mux.Handle("GET /health/ready", readinessHandler(readinessProvider))

	return requestLogger(logger)(apiNoStore(recoverer(logger)(securityHeaders(cors(cfg.CORSOrigin)(mux)))))
}

// apiNoStore prevents browsers and intermediary caches from serving stale
// authenticated state after realtime invalidations. Keep it outside the API
// handlers so auth errors and all response paths receive the same policy.
func apiNoStore(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/v1/") {
			w.Header().Set("Cache-Control", "no-store")
		}
		next.ServeHTTP(w, r)
	})
}

func health(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_, _ = w.Write([]byte(`{"status":"ok"}`))
}

func readinessHandler(provider realtime.ReadinessProvider) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		ready, state := true, "local"
		if provider != nil {
			ready, state = provider.Readiness()
		}
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		if !ready {
			w.WriteHeader(http.StatusServiceUnavailable)
			_, _ = fmt.Fprintf(w, `{"status":"not_ready","realtime":%q}`, state)
			return
		}
		_, _ = fmt.Fprintf(w, `{"status":"ok","realtime":%q}`, state)
	})
}

func withError(next errorHandler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := next(w, r); err != nil {
			apperror.Write(w, err)
		}
	})
}

func cors(origin string) func(http.Handler) http.Handler {
	allowedOrigins := map[string]struct{}{}
	for _, item := range strings.Split(origin, ",") {
		if value := strings.TrimSpace(item); value != "" {
			allowedOrigins[value] = struct{}{}
		}
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			requestOrigin := r.Header.Get("Origin")
			if requestOrigin != "" {
				if _, ok := allowedOrigins[requestOrigin]; !ok {
					http.Error(w, "origin not allowed", http.StatusForbidden)
					return
				}
				w.Header().Set("Access-Control-Allow-Origin", requestOrigin)
				w.Header().Set("Vary", "Origin")
			}
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Request-ID")
			w.Header().Set("Access-Control-Expose-Headers", "X-Request-ID, Retry-After")
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func validOrigin(origin string) bool {
	u, err := url.Parse(origin)
	return err == nil && (u.Scheme == "http" || u.Scheme == "https") && u.Host != "" && !strings.ContainsAny(origin, "\r\n")
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		w.Header().Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
		if r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https" {
			w.Header().Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		}
		next.ServeHTTP(w, r)
	})
}

func recoverer(logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			defer func() {
				if recovered := recover(); recovered != nil {
					logger.Error("panic recovered", "event", "http.panic_recovered", "request_id", requestIDFromHeader(r), "panic_type", fmt.Sprintf("%T", recovered))
					apperror.Write(w, apperror.Internal(nil))
				}
			}()
			next.ServeHTTP(w, r)
		})
	}
}

func requestLogger(logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			started := time.Now()
			requestID := strings.TrimSpace(r.Header.Get("X-Request-ID"))
			if !validRequestID(requestID) {
				requestID = newRequestID()
			}
			r.Header.Set("X-Request-ID", requestID)
			w.Header().Set("X-Request-ID", requestID)
			recorder := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
			next.ServeHTTP(recorder, r)
			route := r.Pattern
			if route == "" {
				route = "unmatched"
			}
			attrs := []any{"event", "http.request.completed", "request_id", requestID, "method", r.Method, "route", route, "status", recorder.status, "response_bytes", recorder.bytes, "duration_ms", time.Since(started).Milliseconds()}
			if campaignID := r.PathValue("campaignID"); validUUID(campaignID) {
				attrs = append(attrs, "campaign_id", campaignID)
			}
			if sceneID := r.PathValue("sceneID"); !validUUID(sceneID) && route == "GET /api/v1/ws" {
				sceneID = r.URL.Query().Get("sceneId")
				if validUUID(sceneID) {
					attrs = append(attrs, "scene_id", sceneID)
				}
			} else if validUUID(sceneID) {
				attrs = append(attrs, "scene_id", sceneID)
			}
			attrs = append(attrs, cloudTraceAttrs(r)...)
			switch {
			case recorder.status >= http.StatusInternalServerError:
				logger.Error("request completed", attrs...)
			case recorder.status >= http.StatusBadRequest:
				logger.Warn("request completed", attrs...)
			default:
				logger.Info("request completed", attrs...)
			}
		})
	}
}

func validRequestID(value string) bool { return observability.IsUUID(value) }
func validUUID(value string) bool      { return observability.IsUUID(value) }

func requestIDFromHeader(r *http.Request) string { return r.Header.Get("X-Request-ID") }

var cloudTracePattern = regexp.MustCompile(`^[0-9a-fA-F]{32}$`)

func cloudTraceAttrs(r *http.Request) []any {
	projectID := strings.TrimSpace(firstNonEmpty(os.Getenv("GOOGLE_CLOUD_PROJECT"), os.Getenv("GCP_PROJECT")))
	if projectID == "" {
		return nil
	}
	traceID, _, _ := strings.Cut(r.Header.Get("X-Cloud-Trace-Context"), "/")
	if !cloudTracePattern.MatchString(traceID) {
		return nil
	}
	return []any{"logging.googleapis.com/trace", "projects/" + projectID + "/traces/" + traceID}
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}

type statusRecorder struct {
	http.ResponseWriter
	status, bytes int
	wroteHeader   bool
}

func (w *statusRecorder) Unwrap() http.ResponseWriter { return w.ResponseWriter }

// Hijack must be forwarded so WebSocket handlers can upgrade the connection.
func (w *statusRecorder) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	hijacker, ok := w.ResponseWriter.(http.Hijacker)
	if !ok {
		return nil, nil, fmt.Errorf("underlying response writer does not support hijacking")
	}
	conn, rw, err := hijacker.Hijack()
	if err == nil {
		w.status = http.StatusSwitchingProtocols
		w.wroteHeader = true
	}
	return conn, rw, err
}

func (w *statusRecorder) Flush() {
	if flusher, ok := w.ResponseWriter.(http.Flusher); ok {
		flusher.Flush()
	}
}
func (w *statusRecorder) WriteHeader(status int) {
	if w.wroteHeader {
		return
	}
	w.wroteHeader = true
	w.status = status
	w.ResponseWriter.WriteHeader(status)
}
func (w *statusRecorder) Write(body []byte) (int, error) {
	if !w.wroteHeader {
		w.wroteHeader = true
		w.status = http.StatusOK
	}
	n, err := w.ResponseWriter.Write(body)
	w.bytes += n
	return n, err
}
func newRequestID() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return fmt.Sprintf("00000000-0000-4000-8000-%012x", uint64(time.Now().UnixNano())&0xffffffffffff)
	}
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	encoded := hex.EncodeToString(b[:])
	return encoded[:8] + "-" + encoded[8:12] + "-" + encoded[12:16] + "-" + encoded[16:20] + "-" + encoded[20:]
}
