package config

import (
	"fmt"
	"os"
	"strings"
)

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
	CORSOrigins  []string
}

func get(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

// Load reads configuration from the environment and validates required values.
func Load() (*Config, error) {
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
