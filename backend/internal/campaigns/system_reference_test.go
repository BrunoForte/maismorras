package campaigns

import (
	"context"
	"errors"
	"net/http/httptest"
	"strings"
	"testing"

	"vtt-backend/internal/apperror"
	"vtt-backend/internal/systems"
)

func TestCreateRejectsUnknownSystemReferencesBeforePersistence(t *testing.T) {
	tests := []struct {
		name string
		body string
	}{
		{name: "unregistered system", body: `{"name":"Test","systemId":"melted-lands","systemVersion":"1.0.0"}`},
		{name: "unregistered version", body: `{"name":"Test","systemId":"dnd2024","systemVersion":"2.0.0"}`},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			handler := NewHandler(nil)
			request := httptest.NewRequest("POST", "/api/v1/campaigns", strings.NewReader(test.body))
			response := httptest.NewRecorder()
			err := handler.Create(response, request)
			appErr, ok := err.(*apperror.Error)
			if !ok || appErr.Code != "INVALID_SYSTEM" {
				t.Fatalf("Create error = %#v, want INVALID_SYSTEM before repository access", err)
			}
			if response.Code != 200 {
				t.Fatalf("handler wrote status %d before returning validation error", response.Code)
			}
		})
	}
}

func TestRepositoryRejectsUnregisteredSystemReferenceBeforeDatabaseAccess(t *testing.T) {
	repository := NewRepository(nil)
	_, err := repository.Create(context.Background(), "user-id", "Test", systems.Ref{
		ID:      "melted-lands",
		Version: "1.0.0",
	})
	if !errors.Is(err, ErrUnsupportedSystem) {
		t.Fatalf("Create error = %v, want ErrUnsupportedSystem", err)
	}
}
