-- ─────────────────────────────────────────────────────────────────────────
-- kJubilee initial schema. Dedicated database (NOT the shared JubileeVerse DB).
-- Tables use the kj_ prefix; ported from JubileeVerse's jv_radio_* model.
-- Idempotent — safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────

-- Users (local JWT auth, no external service)
CREATE TABLE IF NOT EXISTS kj_users (
    id              SERIAL PRIMARY KEY,
    email           TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    password_salt   TEXT NOT NULL,
    name            TEXT,
    role            TEXT NOT NULL DEFAULT 'user',
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    is_locked       BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_kj_users_email ON kj_users(email);

-- Radio favorites — one row per (user, station)
CREATE TABLE IF NOT EXISTS kj_radio_favorites (
    id                SERIAL PRIMARY KEY,
    user_id           INTEGER NOT NULL REFERENCES kj_users(id) ON DELETE CASCADE,
    station_id        TEXT NOT NULL,
    station_name      TEXT NOT NULL,
    station_category  TEXT,
    station_image     TEXT,
    favorited_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, station_id)
);
CREATE INDEX IF NOT EXISTS idx_kj_radio_favorites_user ON kj_radio_favorites(user_id, favorited_at DESC);

-- Radio follows — one row per (user, station). Used for show/episode notifications.
CREATE TABLE IF NOT EXISTS kj_radio_follows (
    id                SERIAL PRIMARY KEY,
    user_id           INTEGER NOT NULL REFERENCES kj_users(id) ON DELETE CASCADE,
    station_id        TEXT NOT NULL,
    station_name      TEXT NOT NULL,
    station_category  TEXT,
    station_image     TEXT,
    followed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, station_id)
);
CREATE INDEX IF NOT EXISTS idx_kj_radio_follows_user ON kj_radio_follows(user_id, followed_at DESC);

-- Album follows — same model as radio_follows, keyed by album slug.
CREATE TABLE IF NOT EXISTS kj_album_follows (
    id            SERIAL PRIMARY KEY,
    user_id       INTEGER NOT NULL REFERENCES kj_users(id) ON DELETE CASCADE,
    album_id      TEXT NOT NULL,
    album_name    TEXT NOT NULL,
    album_artist  TEXT,
    album_image   TEXT,
    followed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, album_id)
);
CREATE INDEX IF NOT EXISTS idx_kj_album_follows_user ON kj_album_follows(user_id, followed_at DESC);

-- Albums catalog — production content (curated, not user data).
-- The album_id slug doubles as a folder name in the CDN's audio tree.
CREATE TABLE IF NOT EXISTS kj_albums (
    id            SERIAL PRIMARY KEY,
    title         TEXT NOT NULL,
    slug          TEXT NOT NULL UNIQUE,
    persona_slug  TEXT,
    theme_slug    TEXT,
    category_id   INTEGER,
    sort_order    INTEGER NOT NULL DEFAULT 0,
    status        TEXT NOT NULL DEFAULT 'draft',  -- draft | published | archived
    artist_name   TEXT,
    cover_image   TEXT,
    description   TEXT,
    track_count   INTEGER NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_kj_albums_category ON kj_albums(category_id, sort_order, title);
CREATE INDEX IF NOT EXISTS idx_kj_albums_status ON kj_albums(status);

-- Radio episodes — for non-live programming (shows, podcasts, archives).
CREATE TABLE IF NOT EXISTS kj_radio_episodes (
    id            SERIAL PRIMARY KEY,
    station_id    TEXT NOT NULL,
    title         TEXT NOT NULL,
    slug          TEXT,
    description   TEXT,
    audio_url     TEXT,
    duration_s    INTEGER,
    published_at  TIMESTAMPTZ,
    cover_image   TEXT,
    persona_slug  TEXT,
    status        TEXT NOT NULL DEFAULT 'draft',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (station_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_kj_radio_episodes_station_published ON kj_radio_episodes(station_id, published_at DESC);
