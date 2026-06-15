package store

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// BookImage is one generated illustration tied to a book section.
type BookImage struct {
	SectionID string `json:"sectionId"`
	URL       string `json:"url"`
	Caption   string `json:"caption"`
	Failed    bool   `json:"failed"`
}

// GetCachedPlan returns the cached plan JSON for a content hash, or nil if absent.
func (s *Store) GetCachedPlan(ctx context.Context, hash string) (json.RawMessage, error) {
	var plan json.RawMessage
	err := s.pool.QueryRow(ctx, `SELECT plan FROM plan_cache WHERE hash = $1`, hash).Scan(&plan)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return plan, nil
}

// PutCachedPlan upserts a plan into the cache keyed by content hash.
func (s *Store) PutCachedPlan(ctx context.Context, hash string, plan json.RawMessage) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO plan_cache (hash, plan) VALUES ($1, $2)
		ON CONFLICT (hash) DO UPDATE SET plan = EXCLUDED.plan`,
		hash, plan)
	return err
}

// ListBookImages returns all illustrations stored for a book.
func (s *Store) ListBookImages(ctx context.Context, bookID uuid.UUID) ([]BookImage, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT section_id, url, caption, failed FROM book_images WHERE book_id = $1`, bookID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []BookImage{}
	for rows.Next() {
		var img BookImage
		if err := rows.Scan(&img.SectionID, &img.URL, &img.Caption, &img.Failed); err != nil {
			return nil, err
		}
		out = append(out, img)
	}
	return out, rows.Err()
}

// ReplaceBookImages atomically replaces all illustrations for a book.
func (s *Store) ReplaceBookImages(ctx context.Context, bookID uuid.UUID, images []BookImage) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `DELETE FROM book_images WHERE book_id = $1`, bookID); err != nil {
		return err
	}
	for _, img := range images {
		if _, err := tx.Exec(ctx, `
			INSERT INTO book_images (book_id, section_id, url, caption, failed)
			VALUES ($1, $2, $3, $4, $5)
			ON CONFLICT (book_id, section_id) DO UPDATE
			SET url = EXCLUDED.url, caption = EXCLUDED.caption, failed = EXCLUDED.failed`,
			bookID, img.SectionID, img.URL, img.Caption, img.Failed); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}
