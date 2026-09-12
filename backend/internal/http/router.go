package apphttp

import (
	"crypto/rand"
	"encoding/hex"
	"log/slog"
	"net/http"
	"time"

	"vtt-backend/internal/apperror"
	"vtt-backend/internal/auth"
	"vtt-backend/internal/campaigns"
	"vtt-backend/internal/characters"
	"vtt-backend/internal/compendium"
	"vtt-backend/internal/config"
	"vtt-backend/internal/events"
	"vtt-backend/internal/notes"
	"vtt-backend/internal/npcs"
	"vtt-backend/internal/scenes"
	"vtt-backend/internal/tokens"
)

type errorHandler func(http.ResponseWriter, *http.Request) error

func NewRouter(cfg config.Config, logger *slog.Logger, tokenHandler *tokens.Handler, campaignHandler *campaigns.Handler, sceneHandler *scenes.Handler, characterHandler *characters.Handler, compendiumHandler *compendium.Handler, noteHandler *notes.Handler, npcHandler *npcs.Handler, eventHandler *events.Handler, realtimeHandler http.Handler) http.Handler {
	mux := http.NewServeMux()
	mux.Handle("GET /api/v1/tokens/gerar", withError(tokenHandler.Generate))
	mux.Handle("GET /api/v1/scenes/generate-background", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, tokenHandler.GenerateMap))
	mux.Handle("GET /api/v1/ws", realtimeHandler)
	mux.Handle("GET /api/v1/campaigns", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, campaignHandler.List))
	mux.Handle("POST /api/v1/campaigns", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, campaignHandler.Create))
	mux.Handle("POST /api/v1/campaigns/{campaignID}/invites", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, campaignHandler.CreateInvite))
	mux.Handle("POST /api/v1/invites/{code}/accept", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, campaignHandler.AcceptInvite))
	mux.Handle("DELETE /api/v1/campaigns/{campaignID}/members/{userID}", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, campaignHandler.RemoveMember))
	mux.Handle("GET /api/v1/campaigns/{campaignID}/character", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, characterHandler.GetMine))
	mux.Handle("PUT /api/v1/campaigns/{campaignID}/character", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, characterHandler.SaveMine))
	mux.Handle("GET /api/v1/campaigns/{campaignID}/participants", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, characterHandler.ListForGM))
	mux.Handle("GET /api/v1/campaigns/{campaignID}/characters/{characterID}", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, characterHandler.GetForGM))
	mux.Handle("PUT /api/v1/campaigns/{campaignID}/characters/{characterID}", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, characterHandler.SaveForGM))
	mux.Handle("DELETE /api/v1/campaigns/{campaignID}/characters/{characterID}", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, characterHandler.DeleteForGM))
	mux.Handle("POST /api/v1/campaigns/{campaignID}/characters", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, characterHandler.CreateForGM))
	mux.Handle("GET /api/v1/campaigns/{campaignID}/compendium", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, compendiumHandler.List))
	mux.Handle("POST /api/v1/campaigns/{campaignID}/compendium/entries", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, compendiumHandler.CreateEntry))
	mux.Handle("PUT /api/v1/campaigns/{campaignID}/compendium/entries/{entryID}", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, compendiumHandler.UpdateEntry))
	mux.Handle("DELETE /api/v1/campaigns/{campaignID}/compendium/entries/{entryID}", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, compendiumHandler.DeleteEntry))
	mux.Handle("POST /api/v1/campaigns/{campaignID}/compendium/import", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, compendiumHandler.ImportEntries))
	mux.Handle("POST /api/v1/campaigns/{campaignID}/compendium/entries/{entryID}/translate", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, compendiumHandler.TranslateMissing))
	mux.Handle("GET /api/v1/campaigns/{campaignID}/notes", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, noteHandler.List))
	mux.Handle("POST /api/v1/campaigns/{campaignID}/notes", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, noteHandler.Create))
	mux.Handle("PUT /api/v1/campaigns/{campaignID}/notes/{noteID}", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, noteHandler.Update))
	mux.Handle("DELETE /api/v1/campaigns/{campaignID}/notes/{noteID}", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, noteHandler.Delete))
	mux.Handle("GET /api/v1/campaigns/{campaignID}/npcs", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, npcHandler.List))
	mux.Handle("POST /api/v1/campaigns/{campaignID}/npcs", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, npcHandler.Create))
	mux.Handle("PUT /api/v1/campaigns/{campaignID}/npcs/{npcID}", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, npcHandler.Update))
	mux.Handle("DELETE /api/v1/campaigns/{campaignID}/npcs/{npcID}", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, npcHandler.Delete))
	mux.Handle("GET /api/v1/campaigns/{campaignID}/events", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, eventHandler.List))
	mux.Handle("POST /api/v1/campaigns/{campaignID}/events", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, eventHandler.Create))
	mux.Handle("GET /api/v1/campaigns/{campaignID}/scenes", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, sceneHandler.List))
	mux.Handle("POST /api/v1/campaigns/{campaignID}/scenes", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, sceneHandler.Create))
	mux.Handle("GET /api/v1/scenes/{sceneID}", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, sceneHandler.Detail))
	mux.Handle("PATCH /api/v1/scenes/{sceneID}", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, sceneHandler.UpdateScene))
	mux.Handle("GET /api/v1/scenes/{sceneID}/combat", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, sceneHandler.Combat))
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
	mux.Handle("DELETE /api/v1/scenes/{sceneID}/tokens/{tokenID}", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, sceneHandler.DeleteToken))
	mux.Handle("PATCH /api/v1/scenes/{sceneID}/tokens/{tokenID}/position", auth.Authenticate(cfg.SupabaseURL, cfg.SupabaseJWTSecret, sceneHandler.MoveToken))
	// Cloud Run's public frontend can reserve/intercept /healthz and return
	// its own 404 before the request reaches the container. Use /health for
	// the externally reachable liveness endpoint instead.
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})

	return recoverer(logger)(requestLogger(logger)(cors(cfg.CORSOrigin)(mux)))
}

func withError(next errorHandler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := next(w, r); err != nil {
			apperror.Write(w, err)
		}
	})
}

func cors(origin string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func recoverer(logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			defer func() {
				if recovered := recover(); recovered != nil {
					logger.Error("panic recovered", "value", recovered)
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
			requestID := r.Header.Get("X-Request-ID")
			if requestID == "" {
				requestID = newRequestID()
			}
			w.Header().Set("X-Request-ID", requestID)
			recorder := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
			next.ServeHTTP(recorder, r)
			logger.Info("request completed", "request_id", requestID, "method", r.Method, "path", r.URL.Path, "status", recorder.status, "bytes", recorder.bytes, "duration_ms", time.Since(started).Milliseconds())
		})
	}
}

type statusRecorder struct {
	http.ResponseWriter
	status, bytes int
}

func (w *statusRecorder) WriteHeader(status int) {
	w.status = status
	w.ResponseWriter.WriteHeader(status)
}
func (w *statusRecorder) Write(body []byte) (int, error) {
	n, err := w.ResponseWriter.Write(body)
	w.bytes += n
	return n, err
}
func newRequestID() string {
	var b [12]byte
	if _, err := rand.Read(b[:]); err != nil {
		return hex.EncodeToString([]byte(time.Now().Format("150405.000000")))
	}
	return hex.EncodeToString(b[:])
}
