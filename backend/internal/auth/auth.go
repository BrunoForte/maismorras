package auth

import (
	"context"
	"crypto/ecdsa"
	"crypto/ed25519"
	"crypto/elliptic"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"log/slog"
	"math/big"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"vtt-backend/internal/apperror"
)

type Principal struct{ UserID, Email string }
type contextKey struct{}

func FromContext(ctx context.Context) (Principal, bool) {
	p, ok := ctx.Value(contextKey{}).(Principal)
	return p, ok
}

var cache struct {
	sync.Mutex
	keys    map[string]any
	expires time.Time
}

func Authenticate(baseURL, secret string, next func(http.ResponseWriter, *http.Request) error) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		if raw == "" || raw == r.Header.Get("Authorization") {
			apperror.Write(w, apperror.Unauthorized("Token de acesso ausente."))
			return
		}
		claims := jwt.MapClaims{}
		token, err := jwt.ParseWithClaims(raw, claims, func(t *jwt.Token) (any, error) {
			if _, isHMAC := t.Method.(*jwt.SigningMethodHMAC); isHMAC {
				if secret == "" {
					return nil, jwt.ErrTokenSignatureInvalid
				}
				return []byte(secret), nil
			}
			if kid, ok := t.Header["kid"].(string); ok && baseURL != "" {
				return key(r.Context(), baseURL, kid)
			}
			if baseURL == "" {
				return nil, jwt.ErrTokenSignatureInvalid
			}
			return nil, jwt.ErrTokenSignatureInvalid
		})
		if err != nil || !token.Valid {
			alg, kid := "", ""
			if token != nil {
				alg = token.Method.Alg()
				kid, _ = token.Header["kid"].(string)
			}
			slog.Warn("JWT validation failed", "error", err, "alg", alg, "kid", kid, "supabase_url_configured", baseURL != "")
			apperror.Write(w, apperror.Unauthorized("Token de acesso inválido ou expirado."))
			return
		}
		id, _ := claims.GetSubject()
		if id == "" {
			apperror.Write(w, apperror.Unauthorized("Token sem identificador de usuário."))
			return
		}
		email, _ := claims["email"].(string)
		if err := next(w, r.WithContext(context.WithValue(r.Context(), contextKey{}, Principal{id, email}))); err != nil {
			apperror.Write(w, err)
		}
	})
}

func key(ctx context.Context, base, kid string) (any, error) {
	cache.Lock()
	defer cache.Unlock()
	if time.Now().After(cache.expires) {
		req, e := http.NewRequestWithContext(ctx, http.MethodGet, base+"/auth/v1/.well-known/jwks.json", nil)
		if e != nil {
			return nil, e
		}
		res, e := http.DefaultClient.Do(req)
		if e != nil {
			return nil, e
		}
		defer res.Body.Close()
		var body struct {
			Keys []map[string]any `json:"keys"`
		}
		if e = json.NewDecoder(res.Body).Decode(&body); e != nil {
			return nil, e
		}
		cache.keys = map[string]any{}
		for _, rawKey := range body.Keys {
			j := map[string]string{}
			for _, field := range []string{"kid", "kty", "crv", "n", "e", "x", "y"} {
				if value, ok := rawKey[field].(string); ok {
					j[field] = value
				}
			}
			if p, e := parse(j); e == nil {
				cache.keys[j["kid"]] = p
			}
		}
		cache.expires = time.Now().Add(time.Hour)
	}
	p, ok := cache.keys[kid]
	if !ok {
		return nil, jwt.ErrTokenSignatureInvalid
	}
	return p, nil
}
func parse(j map[string]string) (any, error) {
	d := func(s string) []byte { b, _ := base64.RawURLEncoding.DecodeString(s); return b }
	if j["kty"] == "RSA" {
		return &rsa.PublicKey{N: new(big.Int).SetBytes(d(j["n"])), E: int(new(big.Int).SetBytes(d(j["e"])).Int64())}, nil
	}
	if j["kty"] == "EC" {
		c := elliptic.P256()
		return &ecdsa.PublicKey{Curve: c, X: new(big.Int).SetBytes(d(j["x"])), Y: new(big.Int).SetBytes(d(j["y"]))}, nil
	}
	if j["kty"] == "OKP" && j["crv"] == "Ed25519" {
		return ed25519.PublicKey(d(j["x"])), nil
	}
	return nil, jwt.ErrTokenSignatureInvalid
}
