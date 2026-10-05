CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(254) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'editor' CHECK (role IN ('editor', 'admin')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS articles (
    id UUID PRIMARY KEY,
    source_kind VARCHAR(20) NOT NULL CHECK (source_kind IN ('editorial', 'rss')),
    source_key TEXT UNIQUE,
    title VARCHAR(180) NOT NULL,
    summary VARCHAR(600) NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    category VARCHAR(40) NOT NULL,
    image_url TEXT,
    source_name VARCHAR(120) NOT NULL,
    source_url TEXT NOT NULL,
    author_id UUID REFERENCES users(id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'published', 'rejected')),
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS articles_published_at_idx
    ON articles (published_at DESC)
    WHERE status = 'published';
CREATE INDEX IF NOT EXISTS articles_pending_idx
    ON articles (created_at DESC)
    WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS articles_author_idx
    ON articles (author_id, created_at DESC);

CREATE TABLE IF NOT EXISTS app_state (
    key VARCHAR(80) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
