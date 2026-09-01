-- ─────────────────────────────────────────────────────────────────────────
-- 007 — where a station's picture sits in its frame.
--
-- Every large rendering of a station's artwork (the home hero, the station
-- article's hero) crops a 16:9 image into a much wider, much shorter box with
-- object-fit:cover, anchored to the top. That anchor is right for most of the
-- dial and wrong for some of it: a composition whose subject sits low loses
-- its subject, and one whose sky is tall wastes the frame on sky.
--
-- Until now the only fix was to re-render the artwork. This records a vertical
-- nudge instead — a number of pixels, applied to object-position wherever that
-- station's picture is shown large. Negative moves the picture up (revealing
-- what is below the current crop), positive moves it down.
--
-- ONE ROW PER STATION, NOT PER SURFACE. The home hero and the article hero
-- show the same artwork in near enough the same aspect, so an offset that
-- fixes one fixes the other; two settings would be two things to keep in step.
--
-- WHY THE DATABASE AND NOT A FILE. The obvious alternative was a JSON file
-- under public/. A deploy extracts a tarball over public/, so the next release
-- would silently revert every adjustment an operator had made. This outlives
-- deploys.
--
-- Idempotent, like every file here — the runner re-applies them all.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS kj_image_offsets (
    -- The station slug, as build-home-data emits it. No foreign key: the
    -- station list lives in a JS file, not in this database.
    slug        TEXT PRIMARY KEY,

    -- Pixels. Clamped by the API to a range that cannot push a picture out of
    -- its own frame; stored as written so a bad value is visible rather than
    -- silently folded into a good one.
    offset_y    INTEGER NOT NULL DEFAULT 0,

    -- Who last moved it, for the same reason the image queue records it: this
    -- is a shared setting and a surprising crop should be answerable.
    updated_by  TEXT,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The public read is "give me every offset" on page load, which is a full scan
-- of a table with at most one row per station. No index earns its keep here;
-- the primary key covers the admin's single-row upsert.
