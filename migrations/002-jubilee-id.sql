-- ─────────────────────────────────────────────────────────────────────────
-- Jubilee ID sign-in — kj_users becomes the LOCAL account for a family-wide
-- identity held at sso.jubileeinspire.com.
--
-- Two things change:
--   1. Identity fields arrive from the authority (jubilee_id, first/last name,
--      date of birth) so this site can show and pre-fill them.
--   2. The password columns become nullable. An account created through the
--      Jubilee ID door stores NO password here — the authority is the sole
--      credential store. Rows created by the older /api/auth/register still
--      carry their local hash and keep signing in exactly as before.
--
-- Idempotent — safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────

-- UUID, not TEXT: the authority's users.id is a uuid primary key, and this is
-- the type JubileeInspire uses for the same link (its migration 103). Matching
-- it means a malformed id is rejected at the column rather than stored.
ALTER TABLE kj_users ADD COLUMN IF NOT EXISTS jubilee_id     UUID;
ALTER TABLE kj_users ADD COLUMN IF NOT EXISTS first_name     TEXT;
ALTER TABLE kj_users ADD COLUMN IF NOT EXISTS last_name      TEXT;
ALTER TABLE kj_users ADD COLUMN IF NOT EXISTS date_of_birth  DATE;

-- TRUE by default: every existing row predates the door, and every path through
-- the door but one proves the address before the row is created. The brand-new
-- Jubilee ID path (Outcome C) writes FALSE explicitly.
ALTER TABLE kj_users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE kj_users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE kj_users ALTER COLUMN password_salt DROP NOT NULL;

-- One local account per Jubilee ID. Partial, because legacy rows have none.
CREATE UNIQUE INDEX IF NOT EXISTS idx_kj_users_jubilee_id
    ON kj_users (jubilee_id) WHERE jubilee_id IS NOT NULL;

-- Backfill first/last from the single `name` column so accounts that existed
-- before the door still pre-fill their name on the Create Account screen.
UPDATE kj_users
   SET first_name = NULLIF(split_part(TRIM(name), ' ', 1), ''),
       -- A one-word name has no space, and SUBSTRING(… FROM 1) would copy the
       -- whole thing into last_name. Leave last_name NULL in that case.
       last_name  = CASE WHEN POSITION(' ' IN TRIM(name)) > 0
                         THEN NULLIF(TRIM(SUBSTRING(TRIM(name) FROM POSITION(' ' IN TRIM(name)) + 1)), '')
                    END
 WHERE first_name IS NULL
   AND name IS NOT NULL
   AND TRIM(name) <> '';
