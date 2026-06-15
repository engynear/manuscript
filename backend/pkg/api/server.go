package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"github.com/engynear/manuscript/backend/pkg/auth"
	"github.com/engynear/manuscript/backend/pkg/config"
	"github.com/engynear/manuscript/backend/pkg/store"
)

// Server wires together the configuration, data store and auth manager
// and exposes an http.Handler for the whole API.
type Server struct {
	cfg   *config.Config
	store *store.Store
	auth  *auth.Manager
}

func NewServer(cfg *config.Config, st *store.Store, am *auth.Manager) *Server {
	return &Server{cfg: cfg, store: st, auth: am}
}

// Handler builds the chi router with middleware and all routes mounted.
func (s *Server) Handler() http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   s.cfg.CORSOrigins,
		AllowedMethods:   []string{"GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Authorization", "Content-Type"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	r.Route("/api", func(r chi.Router) {
		// Public endpoints.
		r.Post("/auth/register", s.handleRegister)
		r.Post("/auth/login", s.handleLogin)
		r.Get("/s/{token}", s.handlePublicShelf)

		// Authenticated endpoints.
		r.Group(func(r chi.Router) {
			r.Use(s.auth.Middleware)
			r.Get("/auth/me", s.handleMe)

			r.Get("/books", s.handleListBooks)
			r.Post("/books", s.handleCreateBook)
			r.Get("/books/{id}", s.handleGetBook)
			r.Patch("/books/{id}", s.handleUpdateBook)
			r.Delete("/books/{id}", s.handleDeleteBook)

			r.Get("/shelves", s.handleListShelves)
			r.Post("/shelves", s.handleCreateShelf)
			r.Patch("/shelves/{id}", s.handleRenameShelf)
			r.Delete("/shelves/{id}", s.handleDeleteShelf)
			r.Put("/shelves/{id}/books", s.handleSetShelfBooks)

			r.Get("/shelves/{id}/share", s.handleGetShare)
			r.Post("/shelves/{id}/share", s.handleCreateShare)
			r.Patch("/shelves/{id}/share", s.handleUpdateShare)
			r.Post("/shelves/{id}/share/regenerate", s.handleRegenerateShare)

			r.Post("/generate", s.handleGenerateManuscript)
		})
	})

	// Serve generated illustration assets from the media volume.
	r.Handle(s.cfg.MediaBaseURL+"/*", http.StripPrefix(s.cfg.MediaBaseURL+"/",
		http.FileServer(http.Dir(s.cfg.MediaDir))))

	return r
}
