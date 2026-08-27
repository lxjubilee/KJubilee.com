-- ─────────────────────────────────────────────────────────────────────────
-- Role permissions — which sections of /admin a role may open.
--
-- THREE ROLES, AND ONLY ONE OF THEM IS CONFIGURABLE.
--
--   user       a member. No console, ever. Not stored here.
--   admin      the whole console. Implicit, not stored here either — see below.
--   executive  console access, limited to the sections granted in this table.
--
-- ADMIN IS DELIBERATELY NOT A ROW. If admin's access were data, an admin could
-- untick admin's own access to the Roles & permissions section and there would
-- be no way back into the console for anyone — the fix would be a psql session
-- on the production box. Admin is answered in code (lib/access.js) as "yes, to
-- everything", so the console cannot be locked shut by editing it.
--
-- USER IS NOT A ROW EITHER. A member with a console section granted would just
-- be an executive under another name, and the distinction the site actually
-- draws is "may open the console at all".
--
-- A ROW MEANS GRANTED. There is no `allowed` column: absence is denial, the
-- same shape the ratings store uses, and it keeps the table to the short list
-- of decisions somebody actually made rather than a full matrix of mostly-no.
--
-- The section keys are the ids in app/admin/client.js SECTIONS and the strings
-- lib/access.js checks. They are a closed set in code, not a foreign key, so
-- renaming a section is a code change and a data migration — grep for the id.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS kj_role_permissions (
    role        TEXT        NOT NULL,
    section     TEXT        NOT NULL,
    granted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Who widened the console, kept for the same reason the ratings store keeps
    -- a name: a permission with nobody's name on it is one nobody can ask about.
    granted_by  TEXT,
    PRIMARY KEY (role, section)
);

CREATE INDEX IF NOT EXISTS idx_kj_role_permissions_role
    ON kj_role_permissions(role);

-- The executive role starts with the read-only half of the console: the
-- dashboard and the listener inbox. Neither changes what goes on air and
-- neither can grant anybody anything, so it is a safe floor for a role that
-- exists before anyone has decided what it is for. An admin widens it from
-- the Roles & permissions section.
--
-- ON CONFLICT DO NOTHING so re-running never re-grants a section an admin has
-- since taken away — this file is applied on every deploy.
INSERT INTO kj_role_permissions (role, section, granted_by)
VALUES ('executive', 'dashboard', 'migration 005'),
       ('executive', 'feedback',  'migration 005')
ON CONFLICT (role, section) DO NOTHING;

-- kj_users.role is a plain TEXT column with no constraint (001-initial-schema).
-- The three valid values are enforced in app/api/admin/users/route.js rather
-- than here on purpose: a CHECK constraint would turn a typo in the API into a
-- 500 from the database instead of a 400 naming the field, and the column is
-- also written by the SSO link path, which predates this table.
