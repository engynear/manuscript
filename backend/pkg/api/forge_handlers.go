package api

import (
	"encoding/json"
	"net/http"

	"github.com/engynear/manuscript/backend/pkg/forge"
)

// ndjsonStream wraps a ResponseWriter for line-delimited JSON progress events,
// matching the frontend streamNDJSON reader (frontend/src/lib/api.ts:66).
type ndjsonStream struct {
	w       http.ResponseWriter
	flusher http.Flusher
	enc     *json.Encoder
}

func newNDJSONStream(w http.ResponseWriter) (*ndjsonStream, bool) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		return nil, false
	}
	w.Header().Set("Content-Type", "application/x-ndjson; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache, no-transform")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	return &ndjsonStream{w: w, flusher: flusher, enc: json.NewEncoder(w)}, true
}

type progressEvent struct {
	Type     string `json:"type"` // progress | done | error
	Step     string `json:"step,omitempty"`
	Message  string `json:"message,omitempty"`
	Progress int    `json:"progress,omitempty"`
	Result   any    `json:"result,omitempty"`
}

func (s *ndjsonStream) send(ev progressEvent) {
	_ = s.enc.Encode(ev) // Encoder appends '\n'
	s.flusher.Flush()
}

// --- POST /api/plan ------------------------------------------------------

type planRequest struct {
	Markdown   string `json:"markdown"`
	ImageLimit int    `json:"imageLimit"`
}

func (s *Server) handlePlan(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireUser(w, r); !ok {
		return
	}
	if s.forge == nil {
		writeError(w, http.StatusServiceUnavailable, "generation is not configured (missing OPENAI_API_KEY)")
		return
	}
	var req planRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	stream, ok := newNDJSONStream(w)
	if !ok {
		writeError(w, http.StatusInternalServerError, "streaming unsupported")
		return
	}
	ctx := r.Context()

	stream.send(progressEvent{Type: "progress", Step: "read", Message: "Reading source Markdown", Progress: 4})

	norm, err := forge.NormalizeMarkdown(req.Markdown)
	if err != nil {
		stream.send(progressEvent{Type: "error", Message: err.Error()})
		return
	}
	stream.send(progressEvent{Type: "progress", Step: "normalize", Message: "Parsing and normalizing Markdown", Progress: 10})

	hash := forge.ContentHash(norm.Source)

	stream.send(progressEvent{Type: "progress", Step: "plan", Message: "Preparing manuscript plan", Progress: 18})

	var raw forge.Plan
	if cached, err := s.store.GetCachedPlan(ctx, hash); err == nil && cached != nil {
		if uerr := json.Unmarshal(cached, &raw); uerr != nil {
			cached = nil // fall through to regeneration on corrupt cache
		}
	}
	if len(raw.Sections) == 0 {
		raw, err = forge.GenerateRawPlan(ctx, s.forge, norm)
		if err != nil {
			stream.send(progressEvent{Type: "error", Message: err.Error()})
			return
		}
		if rawJSON, mErr := json.Marshal(raw); mErr == nil {
			_ = s.store.PutCachedPlan(ctx, hash, rawJSON)
		}
	}

	final := forge.FinalizePlan(raw, req.ImageLimit)

	stream.send(progressEvent{
		Type:     "done",
		Step:     "plan",
		Message:  "Manuscript plan ready",
		Progress: 100,
		Result:   map[string]any{"hash": hash, "plan": final},
	})
}

// --- POST /api/images ----------------------------------------------------

type imagesRequest struct {
	Hash       string     `json:"hash"`
	Plan       forge.Plan `json:"plan"`
	ImageLimit int        `json:"imageLimit"`
}

func (s *Server) handleImages(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireUser(w, r); !ok {
		return
	}
	if s.forge == nil {
		writeError(w, http.StatusServiceUnavailable, "generation is not configured (missing OPENAI_API_KEY)")
		return
	}
	var req imagesRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Hash == "" || len(req.Plan.Sections) == 0 {
		writeError(w, http.StatusBadRequest, "hash and plan are required")
		return
	}

	stream, ok := newNDJSONStream(w)
	if !ok {
		writeError(w, http.StatusInternalServerError, "streaming unsupported")
		return
	}
	ctx := r.Context()

	limit := req.ImageLimit
	total := 0
	for _, sec := range req.Plan.Sections {
		if sec.Illustration != nil && total < limit {
			total++
		}
	}
	if total == 0 {
		stream.send(progressEvent{Type: "done", Step: "images", Message: "No illustrations requested", Progress: 100,
			Result: map[string]any{"images": []forge.GeneratedImage{}}})
		return
	}

	stream.send(progressEvent{Type: "progress", Step: "images", Message: "Preparing illustrations", Progress: 5})

	images, err := forge.GenerateImages(ctx, s.forge, req.Plan, req.Hash,
		s.cfg.MediaDir, s.cfg.MediaBaseURL, limit,
		func(ev forge.ImageProgressEvent) {
			pct := 5 + int(float64(ev.Index)/float64(total)*90.0)
			msgs := map[string]string{
				"image-cache":    "Illustration loaded from cache",
				"image-start":    "Generating illustration",
				"image-complete": "Illustration complete",
				"image-failed":   "Illustration failed; using fallback",
			}
			stream.send(progressEvent{
				Type:     "progress",
				Step:     ev.Type,
				Message:  msgs[ev.Type],
				Progress: pct,
			})
		})
	if err != nil {
		stream.send(progressEvent{Type: "error", Message: err.Error()})
		return
	}

	stream.send(progressEvent{
		Type:     "done",
		Step:     "images",
		Message:  "Illustrations ready",
		Progress: 100,
		Result:   map[string]any{"images": images},
	})
}
