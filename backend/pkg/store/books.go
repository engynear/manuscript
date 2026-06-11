package store

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type Book struct {
	ID             uuid.UUID       `json:"id"`
	UserID         uuid.UUID       `json:"userId"`
	Title          string          `json:"title"`
	TitleRu        string          `json:"titleRu"`
	Author         string          `json:"author"`
	Subtitle       string          `json:"subtitle"`
	Year           *int            `json:"year"`
	Settings       json.RawMessage `json:"settings"`
	Cover          json.RawMessage `json:"cover"`
	SourceMarkdown string          `json:"sourceMarkdown"`
	PageCount      int             `json:"pageCount"`
	CreatedAt      time.Time       `json:"createdAt"`
	UpdatedAt      time.Time       `json:"updatedAt"`
}

// BookInput carries the writable fields for create/update.
type BookInput struct {
	Title          string          `json:"title"`
	TitleRu        string          `json:"titleRu"`
	Author         string          `json:"author"`
	Subtitle       string          `json:"subtitle"`
	Year           *int            `json:"year"`
	Settings       json.RawMessage `json:"settings"`
	Cover          json.RawMessage `json:"cover"`
	SourceMarkdown string          `json:"sourceMarkdown"`
	PageCount      int             `json:"pageCount"`
}

func jsonOrEmpty(raw json.RawMessage) []byte {
	if len(raw) == 0 {
		return []byte("{}")
	}
	return raw
}

func scanBook(row pgx.Row) (*Book, error) {
	b := &Book{}
	var settings, cover []byte
	err := row.Scan(&b.ID, &b.UserID, &b.Title, &b.TitleRu, &b.Author, &b.Subtitle, &b.Year,
		&settings, &cover, &b.SourceMarkdown, &b.PageCount, &b.CreatedAt, &b.UpdatedAt)
	if err != nil {
		return nil, err
	}
	b.Settings = settings
	b.Cover = cover
	return b, nil
}

const bookCols = `id, user_id, title, title_ru, author, subtitle, year,
	settings, cover, source_markdown, page_count, created_at, updated_at`

func (s *Store) CreateBook(ctx context.Context, userID uuid.UUID, in BookInput) (*Book, error) {
	return scanBook(s.pool.QueryRow(ctx, `
		INSERT INTO books (user_id, title, title_ru, author, subtitle, year, settings, cover, source_markdown, page_count)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
		RETURNING `+bookCols,
		userID, in.Title, in.TitleRu, in.Author, in.Subtitle, in.Year,
		jsonOrEmpty(in.Settings), jsonOrEmpty(in.Cover), in.SourceMarkdown, in.PageCount))
}

func (s *Store) ListBooks(ctx context.Context, userID uuid.UUID) ([]*Book, error) {
	rows, err := s.pool.Query(ctx, `SELECT `+bookCols+` FROM books WHERE user_id = $1 ORDER BY created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []*Book{}
	for rows.Next() {
		b, err := scanBook(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	return out, rows.Err()
}

func (s *Store) GetBook(ctx context.Context, userID, id uuid.UUID) (*Book, error) {
	b, err := scanBook(s.pool.QueryRow(ctx, `SELECT `+bookCols+` FROM books WHERE id = $1 AND user_id = $2`, id, userID))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return b, err
}

func (s *Store) UpdateBook(ctx context.Context, userID, id uuid.UUID, in BookInput) (*Book, error) {
	b, err := scanBook(s.pool.QueryRow(ctx, `
		UPDATE books SET title=$3, title_ru=$4, author=$5, subtitle=$6, year=$7,
			settings=$8, cover=$9, source_markdown=$10, page_count=$11, updated_at=now()
		WHERE id=$1 AND user_id=$2
		RETURNING `+bookCols,
		id, userID, in.Title, in.TitleRu, in.Author, in.Subtitle, in.Year,
		jsonOrEmpty(in.Settings), jsonOrEmpty(in.Cover), in.SourceMarkdown, in.PageCount))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return b, err
}

func (s *Store) DeleteBook(ctx context.Context, userID, id uuid.UUID) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM books WHERE id=$1 AND user_id=$2`, id, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// GetBooksByIDs returns books for the given ids owned by userID (used by shelf hydration).
func (s *Store) GetBooksByIDs(ctx context.Context, userID uuid.UUID, ids []uuid.UUID) (map[uuid.UUID]*Book, error) {
	out := map[uuid.UUID]*Book{}
	if len(ids) == 0 {
		return out, nil
	}
	rows, err := s.pool.Query(ctx, `SELECT `+bookCols+` FROM books WHERE user_id=$1 AND id = ANY($2)`, userID, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		b, err := scanBook(rows)
		if err != nil {
			return nil, err
		}
		out[b.ID] = b
	}
	return out, rows.Err()
}
