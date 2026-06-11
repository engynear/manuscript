package api

import (
	"errors"
	"net/http"

	"github.com/google/uuid"

	"github.com/engynear/manuscript/backend/pkg/store"
)

func (s *Server) handleListShelves(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	shelves, err := s.store.ListShelves(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load shelves")
		return
	}
	writeJSON(w, http.StatusOK, shelves)
}

type shelfInput struct {
	Name   string `json:"name"`
	NameRu string `json:"nameRu"`
}

func (s *Server) handleCreateShelf(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	var in shelfInput
	if err := decodeJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if in.Name == "" {
		in.Name = "New shelf"
	}
	if in.NameRu == "" {
		in.NameRu = in.Name
	}
	shelf, err := s.store.CreateShelf(r.Context(), userID, in.Name, in.NameRu)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not create shelf")
		return
	}
	writeJSON(w, http.StatusCreated, shelf)
}

func (s *Server) handleRenameShelf(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	id, ok := pathUUID(w, r, "id")
	if !ok {
		return
	}
	var in shelfInput
	if err := decodeJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if in.NameRu == "" {
		in.NameRu = in.Name
	}
	shelf, err := s.store.RenameShelf(r.Context(), userID, id, in.Name, in.NameRu)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "shelf not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not rename shelf")
		return
	}
	writeJSON(w, http.StatusOK, shelf)
}

func (s *Server) handleDeleteShelf(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	id, ok := pathUUID(w, r, "id")
	if !ok {
		return
	}
	err := s.store.DeleteShelf(r.Context(), userID, id)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "shelf not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not delete shelf")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type setBooksInput struct {
	Books []uuid.UUID `json:"books"`
}

func (s *Server) handleSetShelfBooks(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	id, ok := pathUUID(w, r, "id")
	if !ok {
		return
	}
	var in setBooksInput
	if err := decodeJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	shelf, err := s.store.SetShelfBooks(r.Context(), userID, id, in.Books)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "shelf not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not update shelf")
		return
	}
	writeJSON(w, http.StatusOK, shelf)
}
