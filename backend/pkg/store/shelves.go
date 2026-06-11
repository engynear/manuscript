package store

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type Shelf struct {
	ID        uuid.UUID   `json:"id"`
	UserID    uuid.UUID   `json:"userId"`
	Name      string      `json:"name"`
	NameRu    string      `json:"nameRu"`
	Position  int         `json:"position"`
	CreatedAt time.Time   `json:"createdAt"`
	Books     []uuid.UUID `json:"books"` // ordered book ids
}

func (s *Store) CreateShelf(ctx context.Context, userID uuid.UUID, name, nameRu string) (*Shelf, error) {
	sh := &Shelf{Books: []uuid.UUID{}}
	err := s.pool.QueryRow(ctx, `
		INSERT INTO shelves (user_id, name, name_ru, position)
		VALUES ($1, $2, $3, COALESCE((SELECT MAX(position)+1 FROM shelves WHERE user_id=$1), 0))
		RETURNING id, user_id, name, name_ru, position, created_at`,
		userID, name, nameRu,
	).Scan(&sh.ID, &sh.UserID, &sh.Name, &sh.NameRu, &sh.Position, &sh.CreatedAt)
	return sh, err
}

// ListShelves returns the user's shelves with ordered book ids hydrated.
func (s *Store) ListShelves(ctx context.Context, userID uuid.UUID) ([]*Shelf, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, user_id, name, name_ru, position, created_at
		FROM shelves WHERE user_id=$1 ORDER BY position, created_at`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	shelves := []*Shelf{}
	byID := map[uuid.UUID]*Shelf{}
	for rows.Next() {
		sh := &Shelf{Books: []uuid.UUID{}}
		if err := rows.Scan(&sh.ID, &sh.UserID, &sh.Name, &sh.NameRu, &sh.Position, &sh.CreatedAt); err != nil {
			return nil, err
		}
		shelves = append(shelves, sh)
		byID[sh.ID] = sh
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	memberRows, err := s.pool.Query(ctx, `
		SELECT sb.shelf_id, sb.book_id
		FROM shelf_books sb JOIN shelves s ON s.id = sb.shelf_id
		WHERE s.user_id=$1 ORDER BY sb.position`, userID)
	if err != nil {
		return nil, err
	}
	defer memberRows.Close()
	for memberRows.Next() {
		var shelfID, bookID uuid.UUID
		if err := memberRows.Scan(&shelfID, &bookID); err != nil {
			return nil, err
		}
		if sh := byID[shelfID]; sh != nil {
			sh.Books = append(sh.Books, bookID)
		}
	}
	return shelves, memberRows.Err()
}

func (s *Store) GetShelf(ctx context.Context, userID, id uuid.UUID) (*Shelf, error) {
	sh := &Shelf{Books: []uuid.UUID{}}
	err := s.pool.QueryRow(ctx, `
		SELECT id, user_id, name, name_ru, position, created_at
		FROM shelves WHERE id=$1 AND user_id=$2`, id, userID,
	).Scan(&sh.ID, &sh.UserID, &sh.Name, &sh.NameRu, &sh.Position, &sh.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	rows, err := s.pool.Query(ctx, `SELECT book_id FROM shelf_books WHERE shelf_id=$1 ORDER BY position`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var bookID uuid.UUID
		if err := rows.Scan(&bookID); err != nil {
			return nil, err
		}
		sh.Books = append(sh.Books, bookID)
	}
	return sh, rows.Err()
}

func (s *Store) RenameShelf(ctx context.Context, userID, id uuid.UUID, name, nameRu string) (*Shelf, error) {
	tag, err := s.pool.Exec(ctx, `UPDATE shelves SET name=$3, name_ru=$4 WHERE id=$1 AND user_id=$2`, id, userID, name, nameRu)
	if err != nil {
		return nil, err
	}
	if tag.RowsAffected() == 0 {
		return nil, ErrNotFound
	}
	return s.GetShelf(ctx, userID, id)
}

func (s *Store) DeleteShelf(ctx context.Context, userID, id uuid.UUID) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM shelves WHERE id=$1 AND user_id=$2`, id, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// SetShelfBooks replaces a shelf's ordered membership in one transaction.
func (s *Store) SetShelfBooks(ctx context.Context, userID, shelfID uuid.UUID, bookIDs []uuid.UUID) (*Shelf, error) {
	if _, err := s.GetShelf(ctx, userID, shelfID); err != nil {
		return nil, err
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `DELETE FROM shelf_books WHERE shelf_id=$1`, shelfID); err != nil {
		return nil, err
	}
	for i, bookID := range bookIDs {
		// Only attach books the user owns.
		if _, err := tx.Exec(ctx, `
			INSERT INTO shelf_books (shelf_id, book_id, position)
			SELECT $1, $2, $3 WHERE EXISTS (SELECT 1 FROM books WHERE id=$2 AND user_id=$4)`,
			shelfID, bookID, i, userID); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return s.GetShelf(ctx, userID, shelfID)
}
