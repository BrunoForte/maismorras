package apperror

import (
	"encoding/json"
	"errors"
	"net/http"
)

// Error é o formato único de erro exposto pela API.
type Error struct {
	Status  int
	Code    string
	Message string
	Err     error
}

func (e *Error) Error() string { return e.Message }
func (e *Error) Unwrap() error { return e.Err }

func BadRequest(code, message string) *Error {
	return &Error{Status: http.StatusBadRequest, Code: code, Message: message}
}

func Unauthorized(message string) *Error {
	return &Error{Status: http.StatusUnauthorized, Code: "UNAUTHORIZED", Message: message}
}

func Forbidden(message string) *Error {
	return &Error{Status: http.StatusForbidden, Code: "FORBIDDEN", Message: message}
}

func Conflict(code, message string) *Error {
	return &Error{Status: http.StatusConflict, Code: code, Message: message}
}

func TooManyRequests(code, message string) *Error {
	return &Error{Status: http.StatusTooManyRequests, Code: code, Message: message}
}

func ImagePolicyBlocked() *Error {
	return &Error{Status: http.StatusUnprocessableEntity, Code: "IMAGE_POLICY_BLOCKED", Message: "O provedor bloqueou este pedido por política de conteúdo. Reformule o prompt e tente novamente."}
}

func NotFound(code, message string) *Error {
	return &Error{Status: http.StatusNotFound, Code: code, Message: message}
}

func ServiceUnavailable(message string) *Error {
	return &Error{Status: http.StatusServiceUnavailable, Code: "SERVICE_UNAVAILABLE", Message: message}
}

func BadGateway(err error) *Error {
	return &Error{Status: http.StatusBadGateway, Code: "UPSTREAM_IMAGE_ERROR", Message: "Não foi possível gerar a imagem no provedor externo.", Err: err}
}

func TranslationProvider(err error) *Error {
	return &Error{Status: http.StatusBadGateway, Code: "TRANSLATION_PROVIDER_ERROR", Message: "Não foi possível gerar a tradução no provedor externo.", Err: err}
}

func TranslationNotConfigured() *Error {
	return &Error{Status: http.StatusServiceUnavailable, Code: "TRANSLATION_NOT_CONFIGURED", Message: "A tradução por IA não está configurada no servidor. Peça ao administrador para conferir as credenciais do provedor."}
}

func TranslationUnavailable(err error) *Error {
	return &Error{Status: http.StatusServiceUnavailable, Code: "TRANSLATION_UNAVAILABLE", Message: "O serviço de tradução está temporariamente indisponível. As traduções já salvas foram preservadas; tente novamente mais tarde.", Err: err}
}

func TranslationTimedOut(err error) *Error {
	return &Error{Status: http.StatusGatewayTimeout, Code: "TRANSLATION_TIMEOUT", Message: "A tradução demorou mais que o esperado. As traduções já salvas foram preservadas; tente novamente.", Err: err}
}

func TranslationRateLimited() *Error {
	return &Error{Status: http.StatusTooManyRequests, Code: "TRANSLATION_RATE_LIMITED", Message: "O serviço de tradução recebeu muitas solicitações. Aguarde um instante antes de tentar novamente."}
}

func TranslationQuotaExceeded() *Error {
	return &Error{Status: http.StatusServiceUnavailable, Code: "TRANSLATION_QUOTA_EXCEEDED", Message: "A cota mensal gratuita do serviço de tradução foi atingida."}
}

func Internal(err error) *Error {
	return &Error{Status: http.StatusInternalServerError, Code: "INTERNAL_ERROR", Message: "Ocorreu um erro interno.", Err: err}
}

func Write(w http.ResponseWriter, err error) {
	var appErr *Error
	if !errors.As(err, &appErr) {
		appErr = Internal(err)
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(appErr.Status)
	details := map[string]string{"code": appErr.Code, "message": appErr.Message}
	if requestID := w.Header().Get("X-Request-ID"); requestID != "" {
		details["request_id"] = requestID
	}
	_ = json.NewEncoder(w).Encode(map[string]map[string]string{"error": details})
}
