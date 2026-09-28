package realtime

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
	"sync/atomic"
	"time"
)

const (
	realtimeProtocolVersion  = 1
	maxRealtimePayloadBytes  = 6_000
	maxRealtimeEnvelopeBytes = 7_000
)

var fallbackEventSequence atomic.Uint64

type requestIDContextKey struct{}

func withRequestID(ctx context.Context, requestID string) context.Context {
	if ctx == nil || requestID == "" {
		return ctx
	}
	return context.WithValue(ctx, requestIDContextKey{}, requestID)
}

func requestIDFromContext(ctx context.Context) string {
	if ctx == nil {
		return ""
	}
	requestID, _ := ctx.Value(requestIDContextKey{}).(string)
	return requestID
}

type Envelope struct {
	ProtocolVersion int             `json:"protocolVersion"`
	EventID         string          `json:"eventId"`
	OriginInstance  string          `json:"originInstanceId"`
	SceneID         string          `json:"sceneId"`
	Payload         json.RawMessage `json:"payload"`
}

// Broker distributes already-authorized, data-minimized room events between
// API instances. Listen implementations must stop promptly when ctx is canceled.
type Broker interface {
	Mode() string
	Publish(context.Context, Envelope) error
	// Listen calls onConnected whenever the listener establishes a connection,
	// allowing the Hub to reconcile rooms after startup or a missed interval.
	Listen(context.Context, func(Envelope), func()) error
}

func newRealtimeID() string {
	var id [16]byte
	if _, err := rand.Read(id[:]); err == nil {
		return hex.EncodeToString(id[:])
	}
	return fmt.Sprintf("fallback-%d-%d", time.Now().UnixNano(), fallbackEventSequence.Add(1))
}

func boundedRealtimePayload(payload []byte) []byte {
	if len(payload) == 0 || len(payload) > maxRealtimePayloadBytes || !json.Valid(payload) {
		return []byte(`{"type":"scene.refresh"}`)
	}
	return payload
}

func eventType(payload []byte) string {
	var event struct {
		Type string `json:"type"`
	}
	if json.Unmarshal(payload, &event) != nil {
		return ""
	}
	return strings.TrimSpace(event.Type)
}
