package observability

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"regexp"

	"github.com/jackc/pgx/v5/pgconn"
)

var uuidPattern = regexp.MustCompile(`(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)

// IsUUID reports whether a value is a canonical UUID suitable for use as a
// request correlation identifier or a technical log dimension.
func IsUUID(value string) bool { return uuidPattern.MatchString(value) }

// SafeUUID returns the value only when it is a canonical UUID. This prevents
// untrusted path/query values from becoming arbitrary log content.
func SafeUUID(value string) string {
	if IsUUID(value) {
		return value
	}
	return ""
}

// NewCloudLoggingHandler emits standard slog JSON and adds Cloud Logging's
// special severity field while retaining the original level field for tools
// that consume slog's default schema.
func NewCloudLoggingHandler(output io.Writer, options *slog.HandlerOptions) slog.Handler {
	configured := &slog.HandlerOptions{}
	if options != nil {
		*configured = *options
	}
	previousReplaceAttr := configured.ReplaceAttr
	configured.ReplaceAttr = func(groups []string, attr slog.Attr) slog.Attr {
		if previousReplaceAttr != nil {
			attr = previousReplaceAttr(groups, attr)
		}
		if len(groups) == 0 && attr.Key == slog.MessageKey {
			attr.Key = "message"
		}
		return attr
	}
	return cloudLoggingHandler{Handler: slog.NewJSONHandler(output, configured)}
}

type cloudLoggingHandler struct{ slog.Handler }

func (h cloudLoggingHandler) Handle(ctx context.Context, record slog.Record) error {
	record.AddAttrs(slog.String("severity", cloudSeverity(record.Level)))
	return h.Handler.Handle(ctx, record)
}

func (h cloudLoggingHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	return cloudLoggingHandler{Handler: h.Handler.WithAttrs(attrs)}
}

func (h cloudLoggingHandler) WithGroup(name string) slog.Handler {
	return cloudLoggingHandler{Handler: h.Handler.WithGroup(name)}
}

func cloudSeverity(level slog.Level) string {
	switch {
	case level >= slog.LevelError:
		return "ERROR"
	case level >= slog.LevelWarn:
		return "WARNING"
	case level >= slog.LevelInfo:
		return "INFO"
	default:
		return "DEBUG"
	}
}

// SafeErrorAttrs returns only stable error metadata. Error strings from network,
// database, authentication, and upstream providers can contain credentials,
// URLs, response bodies, or user-provided content and must not be logged.
func SafeErrorAttrs(err error) []any {
	if err == nil {
		return nil
	}
	attrs := []any{"error_type", fmt.Sprintf("%T", err)}
	var postgresErr *pgconn.PgError
	if errors.As(err, &postgresErr) {
		attrs = append(attrs, "postgres_error_code", postgresErr.Code)
	}
	var networkErr net.Error
	if errors.As(err, &networkErr) {
		attrs = append(attrs, "error_category", "network")
	}
	return attrs
}
