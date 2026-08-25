-- ─────────────────────────────────────────────────────────────────────────
-- Sessions — refresh tokens, and the ability to end one.
--
-- Until now a sign-in minted a single stateless HS256 token good for 30 days.
-- Nothing recorded it and nothing could withdraw it: signing out cleared
-- localStorage, and the token itself stayed valid for the rest of the month in
-- anyone else's hands. There was no revocation of any kind.
--
-- A refresh token only earns its keep alongside a SHORT access token, and that
-- is the pair this table makes possible:
--
--   access token   ~15 minutes, stateless, never stored — a stolen one dies on
--                  its own, quickly, without a database round trip per request
--   refresh token  long-lived, stored HERE as a hash, and therefore revocable
--
-- The refresh token is never stored in the clear, exactly as the reset tokens
-- are not: a leaked backup of this table cannot be used to mint an access token
-- for anybody.
--
-- Rotation: every refresh issues a NEW refresh token and retires the one used.
-- A refresh token that is presented twice is therefore either a bug or a theft,
-- and the second use finds a revoked row.
--
-- Idempotent — safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS kj_sessions (
    id            SERIAL PRIMARY KEY,
    user_id       INTEGER     NOT NULL REFERENCES kj_users(id) ON DELETE CASCADE,
    email         TEXT        NOT NULL,
    refresh_hash  TEXT        NOT NULL UNIQUE,
    -- Set when this token is rotated away or signed out. NULL means live.
    revoked_at    TIMESTAMPTZ,
    -- What replaced it, so a reused token can be traced to the chain it came
    -- from rather than just failing anonymously.
    rotated_to    TEXT,
    expires_at    TIMESTAMPTZ NOT NULL,
    last_used_at  TIMESTAMPTZ,
    user_agent    TEXT,
    ip            TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The refresh call looks a session up by hash, and it is the hot path.
CREATE INDEX IF NOT EXISTS idx_kj_sessions_live
    ON kj_sessions (refresh_hash) WHERE revoked_at IS NULL;

-- "Sign me out everywhere", and the sweep of what has expired.
CREATE INDEX IF NOT EXISTS idx_kj_sessions_user
    ON kj_sessions (user_id, created_at DESC);
