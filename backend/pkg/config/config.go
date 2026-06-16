package config

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

// loadDotEnv reads a .env file and sets any key not already present in the
// environment. Silently skips missing files so production (real env vars) works
// without a .env file.
func loadDotEnv(path string) {
	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		k, v, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		k = strings.TrimSpace(k)
		v = strings.TrimSpace(v)
		if os.Getenv(k) == "" {
			_ = os.Setenv(k, v)
		}
	}
}

// findRepoRoot walks up from the current file's source directory (or CWD at
// runtime) looking for a .env file, stopping at the filesystem root.
func findDotEnv() string {
	// Try CWD first (works when running from repo root or backend/).
	candidates := []string{".env", "../.env"}
	for _, c := range candidates {
		if abs, err := filepath.Abs(c); err == nil {
			if _, err := os.Stat(abs); err == nil {
				return abs
			}
		}
	}
	// Fall back to the source-file directory (dev with go run).
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		return ""
	}
	dir := filepath.Dir(file)
	for {
		candidate := filepath.Join(dir, ".env")
		if _, err := os.Stat(candidate); err == nil {
			return candidate
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return ""
}

// Config holds all runtime configuration, sourced from environment variables.
type Config struct {
	Port         string
	DatabaseURL  string
	JWTSecret    string
	OpenAIKey    string
	PlanModel    string
	ImageModel   string
	ImageQuality string
	MediaDir     string
	MediaBaseURL string
	AssetsDir    string
	CORSOrigins  []string
}

// resolveAssetsDir picks the manuscript assets directory: ASSETS_DIR if set,
// otherwise the first existing of the Docker path and the repo's public/assets
// (so `go run ./cmd/server` from backend/ or the repo root also works).
func resolveAssetsDir() string {
	if v := strings.TrimSpace(os.Getenv("ASSETS_DIR")); v != "" {
		return v
	}
	for _, c := range []string{"/app/assets", "public/assets", "../public/assets"} {
		if abs, err := filepath.Abs(c); err == nil {
			if info, err := os.Stat(abs); err == nil && info.IsDir() {
				return abs
			}
		}
	}
	return "/app/assets"
}

func get(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

// Load reads configuration from the environment and validates required values.
// It first loads a .env file from the repo root so `go run ./cmd/server` works
// without manually exporting every variable.
func Load() (*Config, error) {
	if p := findDotEnv(); p != "" {
		loadDotEnv(p)
	}
	cfg := &Config{
		Port:         get("PORT", "8080"),
		DatabaseURL:  get("DATABASE_URL", ""),
		JWTSecret:    get("JWT_SECRET", ""),
		OpenAIKey:    get("OPENAI_API_KEY", ""),
		PlanModel:    get("OPENAI_PLAN_MODEL", "gpt-4.1"),
		ImageModel:   get("OPENAI_IMAGE_MODEL", "gpt-image-1"),
		ImageQuality: get("OPENAI_IMAGE_QUALITY", "medium"),
		MediaDir:     get("MEDIA_DIR", "/data/media"),
		MediaBaseURL: get("MEDIA_BASE_URL", "/media"),
		// Manuscript static assets (papers, dropcaps, ornaments, fonts) served at
		// /assets/. The server-side preview/PDF renderer references them via a
		// <base href> pointing back at this server, so the backend must serve them.
		AssetsDir: resolveAssetsDir(),
	}

	if origins := get("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000"); origins != "" {
		for _, o := range strings.Split(origins, ",") {
			if o = strings.TrimSpace(o); o != "" {
				cfg.CORSOrigins = append(cfg.CORSOrigins, o)
			}
		}
	}

	if cfg.DatabaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}
	if cfg.JWTSecret == "" {
		return nil, fmt.Errorf("JWT_SECRET is required")
	}

	return cfg, nil
}
