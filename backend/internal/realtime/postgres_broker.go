package realtime

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/url"
	"strings"
	"sync/atomic"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const postgresRealtimeChannel = "maismorras_realtime_v1"

type PostgresBroker struct {
	pool          *pgxpool.Pool
	listenURL     string
	originID      string
	logger        *slog.Logger
	connected     atomic.Bool
	everConnected atomic.Bool
}

func NewPostgresBroker(pool *pgxpool.Pool, listenURL, originID string, logger *slog.Logger) *PostgresBroker {
	if logger == nil {
		logger = slog.Default()
	}
	return &PostgresBroker{pool: pool, listenURL: listenURL, originID: originID, logger: logger}
}

func (*PostgresBroker) Mode() string { return "postgres" }

func (b *PostgresBroker) Readiness() (bool, string) {
	if b.connected.Load() {
		return true, "connected"
	}
	if b.everConnected.Load() {
		return true, "degraded"
	}
	return false, "starting"
}

func (b *PostgresBroker) markConnected() {
	wasConnected := b.everConnected.Swap(true)
	b.connected.Store(true)
	if wasConnected {
		b.logger.Info("realtime broker readiness recovered", "broker_mode", "postgres", "origin_instance_id", b.originID, "readiness", "connected")
		return
	}
	b.logger.Info("realtime broker readiness established", "broker_mode", "postgres", "origin_instance_id", b.originID, "readiness", "connected")
}

func (b *PostgresBroker) markDisconnected() {
	wasConnected := b.connected.Swap(false)
	if wasConnected && b.everConnected.Load() {
		b.logger.Warn("realtime broker readiness degraded", "broker_mode", "postgres", "origin_instance_id", b.originID, "readiness", "degraded")
	}
}

// ListenCompatibleDatabaseURL accepts a direct PostgreSQL connection or a
// session-mode pooler connection (5432). Transaction poolers cannot preserve
// LISTEN state and are intentionally rejected.
func ListenCompatibleDatabaseURL(raw string) bool {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || parsed.Scheme != "postgres" && parsed.Scheme != "postgresql" || parsed.Hostname() == "" {
		return false
	}
	port := parsed.Port()
	if port == "" {
		port = "5432"
	}
	if port != "5432" {
		return false
	}
	query := parsed.Query()
	if strings.EqualFold(query.Get("pool_mode"), "transaction") || strings.EqualFold(query.Get("pooling"), "transaction") {
		return false
	}
	return true
}

func (b *PostgresBroker) Publish(ctx context.Context, envelope Envelope) error {
	if b.pool == nil {
		return errors.New("realtime postgres publisher has no request pool")
	}
	encoded, err := json.Marshal(envelope)
	if err != nil {
		return fmt.Errorf("encode realtime envelope: %w", err)
	}
	if len(encoded) > maxRealtimeEnvelopeBytes {
		envelope.Payload = []byte(`{"type":"scene.refresh"}`)
		encoded, err = json.Marshal(envelope)
		if err != nil {
			return fmt.Errorf("encode realtime refresh envelope: %w", err)
		}
	}
	if _, err := b.pool.Exec(ctx, `select pg_notify($1, $2)`, postgresRealtimeChannel, string(encoded)); err != nil {
		b.logger.Warn("realtime broker publish failed", "request_id", requestIDFromContext(ctx), "broker_mode", "postgres", "origin_instance_id", b.originID, "scene_id", envelope.SceneID, "event_id", envelope.EventID, "outcome", "failed", "error", err)
		return err
	}
	b.logger.Debug("realtime broker publish completed", "request_id", requestIDFromContext(ctx), "broker_mode", "postgres", "origin_instance_id", b.originID, "scene_id", envelope.SceneID, "event_id", envelope.EventID, "outcome", "success")
	return nil
}

func (b *PostgresBroker) Listen(ctx context.Context, receive func(Envelope), onConnected func()) error {
	return b.listen(ctx, receive, onConnected, nil)
}

func (b *PostgresBroker) listen(ctx context.Context, receive func(Envelope), onConnected func(), onListenerEstablished func(uint32)) error {
	delay := 500 * time.Millisecond
	for ctx.Err() == nil {
		conn, err := pgx.Connect(ctx, b.listenURL)
		if err == nil {
			_, err = conn.Exec(ctx, "LISTEN "+postgresRealtimeChannel)
		}
		if err != nil {
			if conn != nil {
				_ = conn.Close(context.Background())
			}
			if ctx.Err() != nil {
				return nil
			}
			b.logger.Warn("realtime broker listener connection failed", "broker_mode", "postgres", "origin_instance_id", b.originID, "outcome", "reconnecting", "retry_ms", delay.Milliseconds(), "error", err)
			if !waitForRetry(ctx, delay) {
				return nil
			}
			delay = nextRetry(delay)
			continue
		}
		b.logger.Info("realtime broker listener connected", "broker_mode", "postgres", "origin_instance_id", b.originID, "outcome", "connected")
		b.markConnected()
		if onConnected != nil {
			onConnected()
		}
		if onListenerEstablished != nil {
			onListenerEstablished(conn.PgConn().PID())
		}
		delay = 500 * time.Millisecond
		for ctx.Err() == nil {
			notification, waitErr := conn.WaitForNotification(ctx)
			if waitErr != nil {
				b.markDisconnected()
				_ = conn.Close(context.Background())
				if ctx.Err() != nil {
					return nil
				}
				b.logger.Warn("realtime broker listener interrupted", "broker_mode", "postgres", "origin_instance_id", b.originID, "outcome", "reconnecting", "retry_ms", delay.Milliseconds(), "error", waitErr)
				break
			}
			if notification == nil || notification.Channel != postgresRealtimeChannel || len(notification.Payload) > maxRealtimeEnvelopeBytes {
				continue
			}
			var envelope Envelope
			if json.Unmarshal([]byte(notification.Payload), &envelope) != nil {
				continue
			}
			receive(envelope)
		}
		if !waitForRetry(ctx, delay) {
			return nil
		}
		delay = nextRetry(delay)
	}
	return nil
}

func nextRetry(delay time.Duration) time.Duration {
	delay *= 2
	if delay > 30*time.Second {
		return 30 * time.Second
	}
	return delay
}

func waitForRetry(ctx context.Context, delay time.Duration) bool {
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-timer.C:
		return true
	}
}
