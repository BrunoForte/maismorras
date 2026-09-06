package realtime

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"nhooyr.io/websocket"
	"vtt-backend/internal/auth"
	"vtt-backend/internal/config"
)

// Hub isolates every WebSocket room by scene ID. Clients never write directly to
// PostgreSQL through this channel: they persist through REST first, then publish
// a refresh notification to peers in the same room. Keeping token data out of
// WebSocket messages guarantees each browser receives the visibility-filtered
// representation from the REST endpoint.
type Hub struct {
	mu    sync.RWMutex
	rooms map[string]map[*peer]struct{}
}
type peer struct {
	conn *websocket.Conn
	mu   sync.Mutex
}

func NewHub() *Hub { return &Hub{rooms: map[string]map[*peer]struct{}{}} }

type Handler struct {
	cfg  config.Config
	pool *pgxpool.Pool
	hub  *Hub
}

func NewHandler(cfg config.Config, pool *pgxpool.Pool, hub *Hub) *Handler {
	return &Handler{cfg: cfg, pool: pool, hub: hub}
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	protocols := strings.Split(r.Header.Get("Sec-WebSocket-Protocol"), ",")
	if len(protocols) != 2 || strings.TrimSpace(protocols[0]) != "maismorras-auth" {
		http.Error(w, "token required", http.StatusUnauthorized)
		return
	}
	token := strings.TrimSpace(protocols[1])
	r.Header.Set("Authorization", "Bearer "+token)
	auth.Authenticate(h.cfg.SupabaseURL, h.cfg.SupabaseJWTSecret, h.connect).ServeHTTP(w, r)
}
func (h *Handler) connect(w http.ResponseWriter, r *http.Request) error {
	sceneID := strings.TrimSpace(r.URL.Query().Get("sceneId"))
	p, _ := auth.FromContext(r.Context())
	var allowed bool
	if sceneID == "" || h.pool.QueryRow(r.Context(), `select exists(select 1 from scenes s join campaign_members m on m.campaign_id=s.campaign_id where s.id=$1 and m.user_id=$2)`, sceneID, p.UserID).Scan(&allowed) != nil || !allowed {
		http.Error(w, "forbidden", http.StatusForbidden)
		return nil
	}
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{CompressionMode: websocket.CompressionContextTakeover, Subprotocols: []string{"maismorras-auth"}})
	if err != nil {
		return nil
	}
	peer := &peer{conn: conn}
	h.hub.join(sceneID, peer)
	defer h.hub.leave(sceneID, peer)
	defer conn.Close(websocket.StatusNormalClosure, "bye")
	for {
		_, raw, err := conn.Read(r.Context())
		if err != nil {
			return nil
		}
		if len(raw) > 32<<10 {
			continue
		}
		var event struct {
			Type string `json:"type"`
		}
		if json.Unmarshal(raw, &event) != nil || event.Type != "scene.refresh" {
			continue
		}
		h.hub.broadcast(sceneID, []byte(`{"type":"scene.refresh"}`))
	}
}
func (h *Hub) join(room string, p *peer) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.rooms[room] == nil {
		h.rooms[room] = map[*peer]struct{}{}
	}
	h.rooms[room][p] = struct{}{}
}
func (h *Hub) leave(room string, p *peer) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.rooms[room], p)
	if len(h.rooms[room]) == 0 {
		delete(h.rooms, room)
	}
}
func (h *Hub) broadcast(room string, raw []byte) {
	h.mu.RLock()
	peers := make([]*peer, 0, len(h.rooms[room]))
	for p := range h.rooms[room] {
		peers = append(peers, p)
	}
	h.mu.RUnlock()
	for _, p := range peers {
		go func(p *peer) {
			p.mu.Lock()
			defer p.mu.Unlock()
			ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
			defer cancel()
			_ = p.conn.Write(ctx, websocket.MessageText, raw)
		}(p)
	}
}
