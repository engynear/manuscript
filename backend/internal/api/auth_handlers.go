package api

import (
	"errors"
	"net/http"
	"strings"

	"github.com/engynear/manuscript/backend/internal/auth"
	"github.com/engynear/manuscript/backend/internal/store"
)

type authRequest struct {
	Email       string `json:"email"`
	Password    string `json:"password"`
	DisplayName string `json:"displayName"`
}

type authResponse struct {
	Token string      `json:"token"`
	User  *store.User `json:"user"`
}

func (s *Server) handleRegister(w http.ResponseWriter, r *http.Request) {
	var req authRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	if !strings.Contains(req.Email, "@") {
		writeError(w, http.StatusBadRequest, "a valid email is required")
		return
	}
	if len(req.Password) < 8 {
		writeError(w, http.StatusBadRequest, "password must be at least 8 characters")
		return
	}

	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not secure password")
		return
	}

	displayName := strings.TrimSpace(req.DisplayName)
	if displayName == "" {
		displayName = strings.SplitN(req.Email, "@", 2)[0]
	}

	user, err := s.store.CreateUser(r.Context(), req.Email, hash, displayName)
	if err != nil {
		if errors.Is(err, store.ErrEmailTaken) {
			writeError(w, http.StatusConflict, "that email is already registered")
			return
		}
		writeError(w, http.StatusInternalServerError, "could not create account")
		return
	}

	s.issueAndRespond(w, user, http.StatusCreated)
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req authRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.Email = strings.TrimSpace(strings.ToLower(req.Email))

	user, err := s.store.GetUserByEmail(r.Context(), req.Email)
	if err != nil || !auth.CheckPassword(user.PasswordHash, req.Password) {
		// Same response whether the email is unknown or the password is wrong.
		writeError(w, http.StatusUnauthorized, "invalid email or password")
		return
	}

	s.issueAndRespond(w, user, http.StatusOK)
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	id, ok := auth.UserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	user, err := s.store.GetUserByID(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	writeJSON(w, http.StatusOK, user)
}

// issueAndRespond mints a JWT, sets it as a cookie (for SSR) and returns the token + user.
func (s *Server) issueAndRespond(w http.ResponseWriter, user *store.User, status int) {
	token, err := s.auth.Issue(user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not issue token")
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     "mf_token",
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int(auth.TokenTTL.Seconds()),
	})
	writeJSON(w, status, authResponse{Token: token, User: user})
}
