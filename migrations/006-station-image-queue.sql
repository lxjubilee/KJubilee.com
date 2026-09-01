-- ─────────────────────────────────────────────────────────────────────────
-- Station image requeue — "this cover is wrong, make it again".
--
-- WHY THIS EXISTS AT ALL, GIVEN THE STUDIO'S RULE.
--
-- tools/StationImageStudio is explicit that done-ness is the file:
-- public/images/stations/<slug>.webp IS the record, delete it and the station
-- requeues on the next Refresh, and the README says inventing a second place to
-- write "done" would create a second answer to a question the disk already
-- answers. That rule is right and this table does not break it.
--
-- This answers a DIFFERENT question. Not "has this station got an image" — the
-- disk still owns that — but "somebody has looked at the image this station has
-- got, and wants another one". The disk cannot hold that: the only way to say
-- it in the filesystem is to delete the cover, which blanks the card on a live
-- site until a human happens to run the Studio. A request to redo is not the
-- same fact as an absence, and it is the one fact that had nowhere to live.
--
-- WHY A TABLE AND NOT A FILE. The console runs on the VPS and the Studio runs
-- on a workstation; they share a database and not a disk. A JSON file under the
-- app directory would also be inside the deploy tarball's blast radius — every
-- `tar xzf` over public/ is a chance to lose the queue silently.
--
-- ONE ROW PER STATION, NOT ONE PER CLICK. Pressing the button twice means the
-- same thing as pressing it once, so the slug is the key and a second request
-- refreshes the reason and the timestamp rather than queueing a duplicate.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS kj_station_image_queue (
    slug         TEXT        PRIMARY KEY,
    -- Who asked, kept for the same reason the permissions table keeps a name:
    -- a queued job with nobody's name on it is one nobody can ask about.
    requested_by TEXT,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Free text, optional. "hands are wrong", "wrong city". The Studio shows it
    -- next to the station so whoever regenerates knows what to fix.
    reason       TEXT,
    -- Set when the Studio has rendered a replacement. The row is KEPT rather
    -- than deleted so the console can show that a request was acted on, and so
    -- a station whose cover is queued twice in a month is visible as such.
    done_at      TIMESTAMPTZ
);

-- The Studio's only query: what is outstanding, oldest first.
CREATE INDEX IF NOT EXISTS idx_kj_station_image_queue_open
    ON kj_station_image_queue(requested_at)
    WHERE done_at IS NULL;
