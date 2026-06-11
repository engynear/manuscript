package api

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/engynear/manuscript/backend/pkg/store"
)

func (s *Server) handleCreateShare(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	id, ok := pathUUID(w, r, "id")
	if !ok {
		return
	}
	share, err := s.store.UpsertShare(r.Context(), userID, id)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "shelf not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not create share")
		return
	}
	writeJSON(w, http.StatusOK, share)
}

func (s *Server) handleGetShare(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	id, ok := pathUUID(w, r, "id")
	if !ok {
		return
	}
	share, err := s.store.GetShareByShelf(r.Context(), userID, id)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "no share for this shelf")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load share")
		return
	}
	writeJSON(w, http.StatusOK, share)
}

type updateShareInput struct {
	AllowDownloads bool `json:"allowDownloads"`
	Revoked        bool `json:"revoked"`
}

func (s *Server) handleUpdateShare(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	id, ok := pathUUID(w, r, "id")
	if !ok {
		return
	}
	var in updateShareInput
	if err := decodeJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	share, err := s.store.UpdateShare(r.Context(), userID, id, in.AllowDownloads, in.Revoked)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "no share for this shelf")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not update share")
		return
	}
	writeJSON(w, http.StatusOK, share)
}

func (s *Server) handleRegenerateShare(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	id, ok := pathUUID(w, r, "id")
	if !ok {
		return
	}
	share, err := s.store.RegenerateShareToken(r.Context(), userID, id)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "no share for this shelf")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not regenerate share")
		return
	}
	writeJSON(w, http.StatusOK, share)
}

// handlePublicShelf is unauthenticated — resolves a share token to its shelf+books.
func (s *Server) handlePublicShelf(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")
	public, err := s.store.GetPublicShelf(r.Context(), token)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "this collection is not shared")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load collection")
		return
	}
	writeJSON(w, http.StatusOK, public)
}
