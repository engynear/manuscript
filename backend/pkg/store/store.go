package store

import "github.com/jackc/pgx/v5/pgxpool"

// Store wraps the database pool and provides typed data-access methods.
type Store struct {
	pool *pgxpool.Pool
}

func New(pool *pgxpool.Pool) *Store {
	return &Store{pool: pool}
}
