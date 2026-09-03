-- ─────────────────────────────────────────────────────────────────────────
-- Lyric corrections made from the /todo consoles.
--
-- WHY A TABLE RATHER THAN THE LYRIC BUNDLE ITSELF.
--
-- The words a console shows come from <CDN_LOCAL_ROOT>/lyrics/<CODE>.json,
-- which is DERIVED: tools/build-todo-index.js reads the authoring trees on the
-- J: share and rewrites every bundle whose bytes changed. An edit written into
-- a bundle would therefore survive exactly until the next index build, and
-- disappear without anything reporting it. The correction has to live somewhere
-- the builder does not own, and the console has to lay it over the bundle when
-- it renders. This is that somewhere.
--
-- The console runs on the VPS and the authoring trees are on a workstation the
-- VPS cannot see, which is the same split that put the station image queue in a
-- table (migration 006): the two machines share a database, not a disk.
-- tools/apply-lyric-edits.js is the other half — it runs where J: is visible
-- and writes accepted corrections back into the source sheet, which is the only
-- way an edit made here ever reaches a re-render.
--
-- APPEND-ONLY. One row per SAVE, not one row per track. The current text is the
-- highest revision for a (album, track) pair and the history is every row below
-- it, so "what does it say now" and "what did it used to say" are answered from
-- one table and cannot disagree with each other. A separate `current` table
-- alongside a `history` table is two places to write and one of them eventually
-- does not get written.
--
-- `prev_lyrics` is the text that was on screen when the editor pressed Save —
-- the bundle's own words on the first correction, and the previous revision
-- after that. Kept per row so a diff can be shown without having to reconstruct
-- what the bundle said on some earlier day.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS kj_lyric_edits (
    id          BIGSERIAL   PRIMARY KEY,
    -- The album's catalogue code, e.g. ANSMX01001EN. The bundle's filename.
    album_code  TEXT        NOT NULL,
    -- The track number inside the sheet, the same `n` the console renders.
    track_no    INTEGER     NOT NULL,
    -- 1 for the first correction to this track, 2 for the next, and so on.
    revision    INTEGER     NOT NULL,
    lyrics      TEXT        NOT NULL,
    prev_lyrics TEXT,
    -- NOT a foreign key, and deliberately: a deleted account must not take the
    -- record of what it changed with it. The id is kept for joining while the
    -- account exists, the email so the row still names somebody after it does not.
    edited_by       INTEGER,
    edited_by_email TEXT,
    edited_by_name  TEXT,
    edited_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Set by tools/apply-lyric-edits.js when this revision has been written back
    -- into the sheet on the J: share. NULL means the correction is live on the
    -- console and has not reached the source the renderer reads from.
    applied_at  TIMESTAMPTZ,
    applied_by  TEXT,
    -- Two admins pressing Save on the same track at the same moment would
    -- otherwise both write revision N and the console would show whichever one
    -- happened to be read back first. The unique index turns that into a
    -- conflict the API can retry.
    UNIQUE (album_code, track_no, revision)
);

-- The console's read is "every correction for this album", once per album open.
CREATE INDEX IF NOT EXISTS idx_kj_lyric_edits_album
    ON kj_lyric_edits (album_code, track_no, revision DESC);

-- tools/apply-lyric-edits.js asks for everything not yet written back.
CREATE INDEX IF NOT EXISTS idx_kj_lyric_edits_unapplied
    ON kj_lyric_edits (edited_at) WHERE applied_at IS NULL;
