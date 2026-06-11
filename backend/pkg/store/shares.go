package store

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type Share struct {
	ID             uuid.UUID `json:"id"`
	ShelfID        uuid.UUID `json:"shelfId"`
	Token          string    `json:"token"`
	AllowDownloads bool      `json:"allowDownloads"`
	Revoked        bool      `json:"revoked"`
}

func newToken() string {
	b := make([]byte, 12)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// UpsertShare creates the shelf's share link or returns the existing one.
func (s *Store) UpsertShare(ctx context.Context, userID, shelfID uuid.UUID) (*Share, error) {
	if _, err := s.GetShelf(ctx, userID, shelfID); err != nil {
		return nil, err
	}
	sh := &Share{}
	err := s.pool.QueryRow(ctx, `
		INSERT INTO shares (shelf_id, token, allow_downloads, revoked)
		VALUES ($1, $2, false, false)
		ON CONFLICT (shelf_id) DO UPDATE SET revoked = false
		RETURNING id, shelf_id, token, allow_downloads, revoked`,
		shelfID, newToken(),
	).Scan(&sh.ID, &sh.ShelfID, &sh.Token, &sh.AllowDownloads, &sh.Revoked)
	return sh, err
}

func (s *Store) GetShareByShelf(ctx context.Context, userID, shelfID uuid.UUID) (*Share, error) {
	if _, err := s.GetShelf(ctx, userID, shelfID); err != nil {
		return nil, err
	}
	sh := &Share{}
	err := s.pool.QueryRow(ctx, `
		SELECT id, shelf_id, token, allow_downloads, revoked FROM shares WHERE shelf_id=$1`, shelfID,
	).Scan(&sh.ID, &sh.ShelfID, &sh.Token, &sh.AllowDownloads, &sh.Revoked)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return sh, err
}

func (s *Store) UpdateShare(ctx context.Context, userID, shelfID uuid.UUID, allowDownloads, revoked bool) (*Share, error) {
	if _, err := s.GetShelf(ctx, userID, shelfID); err != nil {
		return nil, err
	}
	sh := &Share{}
	err := s.pool.QueryRow(ctx, `
		UPDATE shares SET allow_downloads=$2, revoked=$3 WHERE shelf_id=$1
		RETURNING id, shelf_id, token, allow_downloads, revoked`,
		shelfID, allowDownloads, revoked,
	).Scan(&sh.ID, &sh.ShelfID, &sh.Token, &sh.AllowDownloads, &sh.Revoked)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return sh, err
}

func (s *Store) RegenerateShareToken(ctx context.Context, userID, shelfID uuid.UUID) (*Share, error) {
	if _, err := s.GetShelf(ctx, userID, shelfID); err != nil {
		return nil, err
	}
	sh := &Share{}
	err := s.pool.QueryRow(ctx, `
		UPDATE shares SET token=$2, revoked=false WHERE shelf_id=$1
		RETURNING id, shelf_id, token, allow_downloads, revoked`,
		shelfID, newToken(),
	).Scan(&sh.ID, &sh.ShelfID, &sh.Token, &sh.AllowDownloads, &sh.Revoked)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return sh, err
}

// PublicShelf is the read-only view served at /api/s/:token.
type PublicShelf struct {
	Shelf          *Shelf  `json:"shelf"`
	Books          []*Book `json:"books"`
	AllowDownloads bool    `json:"allowDownloads"`
	OwnerName      string  `json:"ownerName"`
}

// GetPublicShelf resolves a share token to its shelf + books (no library exposure).
func (s *Store) GetPublicShelf(ctx context.Context, token string) (*PublicShelf, error) {
	var shelfID, userID uuid.UUID
	var allowDownloads bool
	err := s.pool.QueryRow(ctx, `
		SELECT sh.shelf_id, s.user_id, sh.allow_downloads
		FROM shares sh JOIN shelves s ON s.id = sh.shelf_id
		WHERE sh.token=$1 AND sh.revoked=false`, token,
	).Scan(&shelfID, &userID, &allowDownloads)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}

	shelf, err := s.GetShelf(ctx, userID, shelfID)
	if err != nil {
		return nil, err
	}
	booksByID, err := s.GetBooksByIDs(ctx, userID, shelf.Books)
	if err != nil {
		return nil, err
	}
	ordered := make([]*Book, 0, len(shelf.Books))
	for _, id := range shelf.Books {
		if b := booksByID[id]; b != nil {
			ordered = append(ordered, b)
		}
	}

	var ownerName string
	_ = s.pool.QueryRow(ctx, `SELECT display_name FROM users WHERE id=$1`, userID).Scan(&ownerName)

	return &PublicShelf{Shelf: shelf, Books: ordered, AllowDownloads: allowDownloads, OwnerName: ownerName}, nil
}
