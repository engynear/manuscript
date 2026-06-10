-- Manuscript Forge — initial schema.
-- Extensions: citext for case-insensitive emails; gen_random_uuid() is core (PG13+).
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         CITEXT NOT NULL UNIQUE,
    password_hash TEXT   NOT NULL,
    display_name  TEXT   NOT NULL DEFAULT '',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cache of AI manuscript plans keyed by normalized-source content hash.
CREATE TABLE plan_cache (
    hash       TEXT PRIMARY KEY,
    plan       JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE books (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title           TEXT NOT NULL DEFAULT 'Untitled',
    title_ru        TEXT NOT NULL DEFAULT '',
    author          TEXT NOT NULL DEFAULT '',
    subtitle        TEXT NOT NULL DEFAULT '',
    year            INTEGER,
    settings        JSONB NOT NULL DEFAULT '{}'::jsonb,
    cover           JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {palette, spineText, artUrl}
    source_markdown TEXT NOT NULL DEFAULT '',
    plan            JSONB,
    content_hash    TEXT NOT NULL DEFAULT '',
    page_count      INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX books_user_id_idx ON books(user_id, created_at DESC);

CREATE TABLE book_images (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    book_id    UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    section_id TEXT NOT NULL,
    url        TEXT NOT NULL DEFAULT '',
    caption    TEXT NOT NULL DEFAULT '',
    failed     BOOLEAN NOT NULL DEFAULT false,
    UNIQUE (book_id, section_id)
);

CREATE TABLE shelves (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT NOT NULL DEFAULT 'New shelf',
    name_ru    TEXT NOT NULL DEFAULT '',
    position   INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX shelves_user_id_idx ON shelves(user_id, position);

CREATE TABLE shelf_books (
    shelf_id UUID NOT NULL REFERENCES shelves(id) ON DELETE CASCADE,
    book_id  UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (shelf_id, book_id)
);
CREATE INDEX shelf_books_shelf_idx ON shelf_books(shelf_id, position);

CREATE TABLE shares (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shelf_id       UUID NOT NULL REFERENCES shelves(id) ON DELETE CASCADE,
    token          TEXT NOT NULL UNIQUE,
    allow_downloads BOOLEAN NOT NULL DEFAULT false,
    revoked        BOOLEAN NOT NULL DEFAULT false,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (shelf_id)
);

CREATE TABLE reading_state (
    user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    book_id  UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    page     INTEGER NOT NULL DEFAULT 0,
    bookmark INTEGER,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, book_id)
);
