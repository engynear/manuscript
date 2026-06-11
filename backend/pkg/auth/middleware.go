package auth

import (
	"context"
	"net/http"
	"strings"

	"github.com/google/uuid"
)

type ctxKey string

const userIDKey ctxKey = "userID"

// Middleware validates the Bearer token and stores the user id in the request context.
// Requests without a valid token are rejected with 401.
func (m *Manager) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, ok := m.userFromRequest(r)
		if !ok {
			http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
			return
		}
		ctx := context.WithValue(r.Context(), userIDKey, id)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (m *Manager) userFromRequest(r *http.Request) (uuid.UUID, bool) {
	header := r.Header.Get("Authorization")
	if header == "" {
		// Fall back to a cookie so SvelteKit SSR can forward credentials.
		if c, err := r.Cookie("mf_token"); err == nil {
			header = "Bearer " + c.Value
		}
	}
	parts := strings.SplitN(header, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		return uuid.Nil, false
	}
	id, err := m.Verify(strings.TrimSpace(parts[1]))
	if err != nil {
		return uuid.Nil, false
	}
	return id, true
}

// UserID extracts the authenticated user id placed by Middleware.
func UserID(ctx context.Context) (uuid.UUID, bool) {
	id, ok := ctx.Value(userIDKey).(uuid.UUID)
	return id, ok
}
