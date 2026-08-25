-- ─────────────────────────────────────────────────────────────────────────
-- Password reset — kJubilee's own one-time links.
--
-- Why this table exists rather than the authority's password_otps: the Jubilee
-- ID authority stores a reset code but DELIBERATELY does not email it ("the
-- requesting SITE owns the reset UX" — JubileeSSO routes/auth.js), and outside
-- development it does not hand the code back either. So a site that leaned on
-- it sent nothing at all, which is exactly the bug JubileeInspire shipped and
-- then fixed by owning the reset itself.
--
-- kJubilee therefore issues its own token, emails it from noreply@kjubilee.com,
-- and on completion sets the new password at the authority via
-- POST /api/auth/service/password. The authority stays the credential store;
-- this table is only the proof that the person reached the mailbox.
--
-- The token itself is NEVER stored — only its SHA-256. A leaked backup of this
-- table cannot be used to reset anyone's password.
--
-- Idempotent — safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS kj_password_resets (
    id           SERIAL PRIMARY KEY,
    email        TEXT        NOT NULL,
    token_hash   TEXT        NOT NULL UNIQUE,
    expires_at   TIMESTAMPTZ NOT NULL,
    used_at      TIMESTAMPTZ,
    requested_ip TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The lookup on completion is by hash; the burn-the-rest sweep is by email.
CREATE INDEX IF NOT EXISTS idx_kj_password_resets_email
    ON kj_password_resets (email, created_at DESC);

-- Only outstanding tokens are ever scanned, so the index that matters is the
-- partial one over the unused rows.
CREATE INDEX IF NOT EXISTS idx_kj_password_resets_live
    ON kj_password_resets (email) WHERE used_at IS NULL;
