package api

import (
	"crypto/rand"
	"encoding/hex"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

const maxUploadBytes = 8 << 20 // 8 MiB

var allowedUploadExt = map[string]bool{".png": true, ".jpg": true, ".jpeg": true, ".webp": true}

// handleUpload stores a user-provided image (e.g. cover art) under
// mediaDir/uploads/<user>-<random><ext> and returns its public media URL.
func (s *Server) handleUpload(w http.ResponseWriter, r *http.Request) {
	uid, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	if err := r.ParseMultipartForm(maxUploadBytes); err != nil {
		writeError(w, http.StatusBadRequest, "invalid upload")
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "file is required")
		return
	}
	defer file.Close()

	ext := strings.ToLower(filepath.Ext(header.Filename))
	if !allowedUploadExt[ext] {
		writeError(w, http.StatusBadRequest, "unsupported image type")
		return
	}

	rnd := make([]byte, 8)
	if _, err := rand.Read(rnd); err != nil {
		writeError(w, http.StatusInternalServerError, "could not store upload")
		return
	}
	name := uid.String() + "-" + hex.EncodeToString(rnd) + ext

	dir := filepath.Join(s.cfg.MediaDir, "uploads")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		writeError(w, http.StatusInternalServerError, "could not store upload")
		return
	}
	dst, err := os.Create(filepath.Join(dir, name))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not store upload")
		return
	}
	defer dst.Close()
	if _, err := io.Copy(dst, io.LimitReader(file, maxUploadBytes)); err != nil {
		writeError(w, http.StatusInternalServerError, "could not store upload")
		return
	}

	url := strings.TrimRight(s.cfg.MediaBaseURL, "/") + "/uploads/" + name
	writeJSON(w, http.StatusOK, map[string]string{"url": url})
}
