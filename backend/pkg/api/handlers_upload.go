package api

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
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

type coverArtRequest struct {
	Prompt string `json:"prompt"`
	Title  string `json:"title"`
	Author string `json:"author"`
}

// handleCoverArt generates a front-cover image and stores it as a regular
// media asset. It deliberately asks for no readable text because title/author
// are composited by the cover editor and can be hidden separately.
func (s *Server) handleCoverArt(w http.ResponseWriter, r *http.Request) {
	uid, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	if s.forge == nil {
		writeError(w, http.StatusServiceUnavailable, "OPENAI_API_KEY is not configured")
		return
	}

	var req coverArtRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request")
		return
	}

	prompt := coverArtPrompt(req)
	png, err := s.forge.GenerateCoverImage(r.Context(), prompt, "1024x1536")
	if err != nil {
		writeError(w, http.StatusBadGateway, "could not generate cover art")
		return
	}
	if len(png) == 0 {
		writeError(w, http.StatusBadGateway, "empty image response")
		return
	}

	rnd := make([]byte, 8)
	if _, err := rand.Read(rnd); err != nil {
		writeError(w, http.StatusInternalServerError, "could not store cover art")
		return
	}
	name := uid.String() + "-" + hex.EncodeToString(rnd) + ".png"
	dir := filepath.Join(s.cfg.MediaDir, "covers")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		writeError(w, http.StatusInternalServerError, "could not store cover art")
		return
	}
	if err := os.WriteFile(filepath.Join(dir, name), png, 0o644); err != nil {
		writeError(w, http.StatusInternalServerError, "could not store cover art")
		return
	}

	url := strings.TrimRight(s.cfg.MediaBaseURL, "/") + "/covers/" + name
	writeJSON(w, http.StatusOK, map[string]string{"url": url})
}

func coverArtPrompt(req coverArtRequest) string {
	userPrompt := strings.TrimSpace(req.Prompt)
	title := strings.TrimSpace(req.Title)
	author := strings.TrimSpace(req.Author)
	if userPrompt == "" {
		if title != "" {
			userPrompt = fmt.Sprintf("fantasy manuscript book cover art for %q", title)
		} else {
			userPrompt = "ancient fantasy manuscript book cover art"
		}
	}

	var b strings.Builder
	b.WriteString("Create a vertical full-bleed front cover artwork for an ancient fantasy manuscript book. ")
	b.WriteString("Rich illuminated-manuscript mood, tactile parchment or painted leather, ornate but readable negative space near the lower third. ")
	b.WriteString("No readable text, no letters, no title, no author name, no mockup, no book object, no UI, no border frame that implies a physical page edge. ")
	b.WriteString("Artwork prompt: ")
	b.WriteString(userPrompt)
	if title != "" {
		b.WriteString(". Book title context: ")
		b.WriteString(title)
	}
	if author != "" {
		b.WriteString(". Author context: ")
		b.WriteString(author)
	}
	return b.String()
}
