package realtime

import (
	"context"
	"encoding/json"
	"log/slog"
	"math"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"nhooyr.io/websocket"
	"vtt-backend/internal/auth"
	"vtt-backend/internal/config"
	"vtt-backend/internal/overlayaccess"
)

// Hub isolates every WebSocket room by scene ID. Clients never write directly to
// PostgreSQL through this channel: they persist through REST first, then publish
// a small room event. Keeping token data out of WebSocket messages guarantees
// each browser receives the visibility-filtered representation from REST.
type Hub struct {
	mu          sync.RWMutex
	rooms       map[string]map[*peer]struct{}
	peersByUser map[string]int
	peersByIP   map[string]int
	totalPeers  int
}
type peer struct {
	conn        *websocket.Conn
	mu          sync.Mutex
	rateMu      sync.Mutex
	messageLog  []time.Time
	userID      string
	ip          string
	canControl  bool
	overlayOnly bool
}

type audioRealtimeState struct {
	Path      string  `json:"path"`
	Playing   bool    `json:"playing"`
	Volume    float64 `json:"volume"`
	Position  int64   `json:"positionMs"`
	StartedAt int64   `json:"startedAt"`
	Revision  int64   `json:"revision"`
}

func validAudioRealtimeState(state *audioRealtimeState) bool {
	return state != nil && len(state.Path) <= 500 && state.Volume >= 0 && state.Volume <= 1 && state.Position >= 0 && state.Position <= 24*60*60*1000 && state.StartedAt >= 0
}

const maxPeersPerRoom = 100
const maxTotalPeers = 1000
const maxPeersPerUser = 10
const maxPeersPerIP = 20
const maxMessagesPerMinute = 120

func NewHub() *Hub {
	return &Hub{rooms: map[string]map[*peer]struct{}{}, peersByUser: map[string]int{}, peersByIP: map[string]int{}}
}

// BroadcastAudioState relays a server-persisted path change to every client in
// the scene. The handler only supplies state read back from the database.
func (h *Hub) BroadcastAudioState(sceneID, path string, playing bool, volume float64, positionMs, startedAt, revision int64, effects bool) {
	eventType := "audio.state"
	if effects {
		eventType = "audio.effects"
	}
	payload, err := json.Marshal(struct {
		Type  string             `json:"type"`
		State audioRealtimeState `json:"state"`
	}{Type: eventType, State: audioRealtimeState{Path: path, Playing: playing, Volume: volume, Position: positionMs, StartedAt: startedAt, Revision: revision}})
	if err == nil {
		h.broadcast(sceneID, payload)
	}
}

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
	if overlayaccess.IsOverlayToken(token) {
		principal, _, err := overlayaccess.ValidateWebSocketToken(r.Context(), h.pool, token, strings.TrimSpace(r.URL.Query().Get("sceneId")))
		if err != nil {
			http.Error(w, "overlay access expired or outside campaign", http.StatusForbidden)
			return
		}
		h.connect(w, r.WithContext(auth.WithPrincipal(r.Context(), principal)))
		return
	}
	r.Header.Set("Authorization", "Bearer "+token)
	auth.Authenticate(h.cfg.SupabaseURL, h.cfg.SupabaseJWTSecret, h.connect).ServeHTTP(w, r)
}
func (h *Handler) connect(w http.ResponseWriter, r *http.Request) error {
	sceneID := strings.TrimSpace(r.URL.Query().Get("sceneId"))
	if sceneID == "" {
		http.Error(w, "sceneId required", http.StatusBadRequest)
		return nil
	}
	p, _ := auth.FromContext(r.Context())
	var allowed, canControl bool
	if err := h.pool.QueryRow(r.Context(), `select
		exists(select 1 from scenes s join campaigns c on c.id=s.campaign_id left join campaign_members m on m.campaign_id=s.campaign_id and m.user_id=$2 left join profiles pr on pr.id=$2 where s.id=$1 and (m.user_id is not null or c.owner_id=$2 or coalesce(pr.is_admin,false))),
		exists(select 1 from scenes s join campaigns c on c.id=s.campaign_id left join campaign_members m on m.campaign_id=s.campaign_id and m.user_id=$2 left join profiles pr on pr.id=$2 where s.id=$1 and (c.owner_id=$2 or (m.user_id=$2 and m.role='gm'::public.campaign_role) or coalesce(pr.is_admin,false)))`, sceneID, p.UserID).Scan(&allowed, &canControl); err != nil {
		// Do not turn a database outage into a misleading authorization failure.
		// The client can retry a 503, while a genuine 403 remains actionable.
		slog.Error("realtime authorization lookup failed", "scene_id", sceneID, "error", err)
		http.Error(w, "realtime unavailable", http.StatusServiceUnavailable)
		return nil
	}
	if !allowed {
		slog.Warn("realtime authorization denied", "scene_id", sceneID)
		http.Error(w, "forbidden", http.StatusForbidden)
		return nil
	}
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		CompressionMode: websocket.CompressionContextTakeover,
		Subprotocols:    []string{"maismorras-auth"},
		OriginPatterns:  originPatterns(h.cfg.CORSOrigin),
	})
	if err != nil {
		slog.Error("websocket accept failed", "scene_id", sceneID, "error", err)
		return nil
	}
	peer := &peer{conn: conn, userID: p.UserID, ip: clientIP(r.RemoteAddr), canControl: canControl}
	peer.overlayOnly = p.OverlayOnly
	if peer.overlayOnly {
		peer.canControl = false
	}
	conn.SetReadLimit(32 << 10)
	if !h.hub.join(sceneID, peer) {
		_ = conn.Close(websocket.StatusPolicyViolation, "room connection limit reached")
		return nil
	}
	defer h.hub.leave(sceneID, peer)
	defer conn.Close(websocket.StatusNormalClosure, "bye")
	for {
		readCtx, cancel := context.WithTimeout(r.Context(), 10*time.Minute)
		_, raw, err := conn.Read(readCtx)
		cancel()
		if err != nil {
			slog.Error("websocket accept failed", "scene_id", sceneID, "error", err)
			return nil
		}
		if len(raw) > 32<<10 {
			continue
		}
		if !peer.allowMessage() {
			_ = conn.Close(websocket.StatusPolicyViolation, "message rate limit reached")
			return nil
		}
		if peer.overlayOnly {
			// A paired OBS connection is view-only: it can subscribe to room events
			// but cannot publish actions back into the game.
			continue
		}
		var event struct {
			Type  string              `json:"type"`
			X     float64             `json:"x"`
			Y     float64             `json:"y"`
			Color int                 `json:"color"`
			Data  json.RawMessage     `json:"data"`
			State *audioRealtimeState `json:"state"`
		}
		if json.Unmarshal(raw, &event) != nil {
			continue
		}
		switch event.Type {
		case "scene.refresh":
			h.hub.broadcast(sceneID, []byte(`{"type":"scene.refresh"}`))
		case "presentation.updated":
			// Presentation content is fetched through the caller's permission-filtered
			// REST endpoint. Realtime only invalidates the view, so item paths and
			// titles are never disclosed to unauthorized campaign members.
			if canPublishPresentationUpdate(peer.canControl, event.Data) {
				h.hub.broadcast(sceneID, []byte(`{"type":"presentation.updated"}`))
			}
		case "overlay.layout.updated":
			if peer.canControl {
				h.hub.broadcast(sceneID, eventBroadcast(event.Type, event.Data))
			}

		case "token.updated":
			// Treat this as an invalidation signal only. Never rebroadcast client-provided
			// token fields; every recipient fetches its own visibility-filtered REST view.
			var signal struct {
				TokenID string `json:"tokenId"`
				Deleted bool   `json:"deleted"`
			}
			if json.Unmarshal(event.Data, &signal) != nil || len(signal.TokenID) != 36 {
				continue
			}
			if signal.Deleted && !peer.canControl {
				continue
			}
			h.hub.broadcast(sceneID, tokenUpdateBroadcast(signal.TokenID, signal.Deleted))
		case "combat.updated":
			if peer.canControl {
				h.hub.broadcast(sceneID, eventBroadcast(event.Type, event.Data))
			}
		case "scene.delta":
			if !peer.canControl {
				continue
			}
			var delta struct {
				Kind   string          `json:"kind"`
				Action string          `json:"action"`
				ID     string          `json:"id"`
				Item   json.RawMessage `json:"item"`
			}
			if json.Unmarshal(event.Data, &delta) != nil || (delta.Kind != "area" && delta.Kind != "wall" && delta.Kind != "effect") {
				continue
			}
			if delta.Action == "upsert" && (len(delta.Item) == 0 || len(delta.Item) > 16<<10) {
				continue
			}
			if delta.Action == "delete" && (len(delta.ID) != 36 || len(delta.Item) != 0) {
				continue
			}
			if delta.Action != "upsert" && delta.Action != "delete" {
				continue
			}
			h.hub.broadcast(sceneID, eventBroadcast(event.Type, event.Data))
		case "chat.updated":
			h.hub.broadcast(sceneID, []byte(`{"type":"chat.updated"}`))
		case "audio.state":
			if !peer.canControl || !validAudioRealtimeState(event.State) {
				continue
			}
			payload, _ := json.Marshal(struct {
				Type  string `json:"type"`
				State any    `json:"state"`
			}{Type: "audio.state", State: event.State})
			h.hub.broadcast(sceneID, payload)
		case "audio.effects":
			if !peer.canControl || !validAudioRealtimeState(event.State) {
				continue
			}
			payload, _ := json.Marshal(struct {
				Type  string `json:"type"`
				State any    `json:"state"`
			}{Type: "audio.effects", State: event.State})
			h.hub.broadcast(sceneID, payload)
		case "map.ping":
			// Pings are transient UI hints, never database commands. Keep their
			// payload strictly numeric and bounded before relaying to the room.
			if math.IsNaN(event.X) || math.IsNaN(event.Y) || math.IsInf(event.X, 0) || math.IsInf(event.Y, 0) || math.Abs(event.X) > 100000 || math.Abs(event.Y) > 100000 || event.Color < 0 || event.Color > 16777215 {
				continue
			}
			payload, _ := json.Marshal(struct {
				Type  string          `json:"type"`
				X     float64         `json:"x"`
				Y     float64         `json:"y"`
				Color int             `json:"color"`
				Data  json.RawMessage `json:"data"`
			}{Type: "map.ping", X: event.X, Y: event.Y, Color: event.Color})
			h.hub.broadcast(sceneID, payload)
		}
	}
}

func canPublishPresentationUpdate(canControl bool, data json.RawMessage) bool {
	if canControl {
		return true
	}
	value := strings.TrimSpace(string(data))
	return value == "" || value == "null"
}

func tokenUpdateBroadcast(tokenID string, deleted bool) []byte {
	payload, err := json.Marshal(struct {
		Type string `json:"type"`
		Data any    `json:"data"`
	}{Type: "token.updated", Data: struct {
		TokenID string `json:"tokenId"`
		Deleted bool   `json:"deleted"`
	}{TokenID: tokenID, Deleted: deleted}})
	if err != nil {
		return []byte(`{"type":"scene.refresh"}`)
	}
	return payload
}

// originPatterns converts the same explicit origins used by HTTP CORS into
// host patterns accepted by nhooyr's WebSocket origin check. Cloud Run and
// Vercel are different hosts, so relying on the default same-origin rule
// would reject every browser handshake with 403.
func originPatterns(raw string) []string {
	patterns := make([]string, 0, 2)
	for _, item := range strings.Split(raw, ",") {
		value := strings.TrimSpace(item)
		if value == "" {
			continue
		}
		if parsed, err := url.Parse(value); err == nil && parsed.Hostname() != "" {
			patterns = append(patterns, parsed.Host)
			continue
		}
		patterns = append(patterns, value)
	}
	return patterns
}
func eventBroadcast(eventType string, data json.RawMessage) []byte {
	if len(data) == 0 || len(data) > 24<<10 {
		data = []byte("null")
	}
	payload, err := json.Marshal(struct {
		Type string          `json:"type"`
		Data json.RawMessage `json:"data,omitempty"`
	}{Type: eventType, Data: data})
	if err != nil {
		return []byte(`{"type":"scene.refresh"}`)
	}
	return payload
}
func (h *Hub) join(room string, p *peer) bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.rooms[room] == nil {
		h.rooms[room] = map[*peer]struct{}{}
	}
	if len(h.rooms[room]) >= maxPeersPerRoom {
		return false
	}
	if h.totalPeers >= maxTotalPeers || h.peersByUser[p.userID] >= maxPeersPerUser || h.peersByIP[p.ip] >= maxPeersPerIP {
		return false
	}
	h.rooms[room][p] = struct{}{}
	h.totalPeers++
	h.peersByUser[p.userID]++
	h.peersByIP[p.ip]++
	return true
}
func (h *Hub) leave(room string, p *peer) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.rooms[room], p)
	if h.totalPeers > 0 {
		h.totalPeers--
	}
	if h.peersByUser[p.userID] > 0 {
		h.peersByUser[p.userID]--
	}
	if h.peersByIP[p.ip] > 0 {
		h.peersByIP[p.ip]--
	}
	if len(h.rooms[room]) == 0 {
		delete(h.rooms, room)
	}
}

func (p *peer) allowMessage() bool {
	now := time.Now()
	cutoff := now.Add(-time.Minute)
	p.rateMu.Lock()
	defer p.rateMu.Unlock()
	kept := p.messageLog[:0]
	for _, t := range p.messageLog {
		if t.After(cutoff) {
			kept = append(kept, t)
		}
	}
	if len(kept) >= maxMessagesPerMinute {
		p.messageLog = kept
		return false
	}
	p.messageLog = append(kept, now)
	return true
}

func clientIP(remote string) string {
	host, _, err := net.SplitHostPort(remote)
	if err != nil || host == "" {
		return remote
	}
	return host
}
func (h *Hub) broadcast(room string, raw []byte) {
	h.mu.RLock()
	peers := make([]*peer, 0, len(h.rooms[room]))
	for p := range h.rooms[room] {
		if p.overlayOnly && !safeOverlayEvent(raw) {
			continue
		}
		peers = append(peers, p)
	}
	h.mu.RUnlock()
	for _, p := range peers {
		go func(p *peer) {
			p.mu.Lock()
			defer p.mu.Unlock()
			ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
			defer cancel()
			if err := p.conn.Write(ctx, websocket.MessageText, raw); err != nil {
				slog.Warn("realtime write failed", "user_id", p.userID, "error", err)
			}
		}(p)
	}
}

func safeOverlayEvent(raw []byte) bool {
	var event struct {
		Type string `json:"type"`
	}
	if json.Unmarshal(raw, &event) != nil {
		return false
	}
	switch event.Type {
	case "scene.refresh", "presentation.updated", "overlay.layout.updated", "token.updated", "combat.updated", "chat.updated", "audio.state", "audio.effects":
		return true
	default:
		return false
	}
}
