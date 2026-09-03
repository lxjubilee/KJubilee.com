import { json, NO_STORE } from '@/lib/api';
import { requireSection } from '@/lib/access';
import { pool } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────
// /api/todo/lyrics — corrections to the words, made from the /todo consoles.
//
// THE CONSOLE READS THE WORDS FROM SOMEWHERE ELSE. /cdn/lyrics/<CODE>.json is
// the album's sheet as tools/build-todo-index.js last parsed it out of the
// authoring trees, and that file is rewritten whenever the trees are re-read.
// So this route does not serve lyrics; it serves the OVERLAY — the tracks
// somebody has since corrected — and public/js/pages/todo.js lays it over the
// bundle as it renders. An edit therefore survives an index rebuild, which is
// the whole reason it is not simply written into the bundle.
//
// ── THE READ IS PUBLIC, THE WRITE IS NOT ────────────────────────────────
// A correction that only its author could see would be pointless: the point of
// fixing a lyric is that the next person to open the page reads the fixed one.
// The bundles themselves are already served to anyone who asks (/cdn is static
// and unauthenticated), so the overlay is no more open than the thing it
// overlays. Only `?history=1` is gated on the read side, because that is the
// one part that names people and times rather than words.
//
// The write is gated on the 'albums' section — the same permission that governs
// the album side of the admin console, which is the same job: an operator
// looking at a record and correcting what it says. GATED AGAINST THE DATABASE,
// not against what the browser believes: todo.js paints its Edit buttons from
// /api/auth/me, and a browser that lies to itself about that gains a textarea
// and a 403 from here.
//
// ── WHAT IS NOT EDITABLE, AND WHY ───────────────────────────────────────
// Only `lyrics`. Not the title, not the `Styles:` prompt, not the metadata
// trailer. The title is the SongID's human name and is carried into the ledger
// and the filename (docs/MUSIC-REPOSITORY-SPEC.md — the SongID is a permanent
// primary key, and its title travels with it); the styles prompt is the brief a
// render was made against, and changing it after the fact would describe an
// mp3 that does not exist. The words are the one part of a sheet that can be
// corrected without making anything else on the page a lie.
// ─────────────────────────────────────────────────────────────────────────

/* Album codes are the bundle filenames — ANSMX01001EN and its like. Validated
   rather than trusted even though nothing here touches the filesystem: the code
   goes into a query and comes back out into a page, and a closed shape is
   cheaper to reason about than the two escapes it would otherwise depend on. */
const CODE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/* Long enough for the longest sheet in the catalogue with room to spare — the
   biggest lyric body across the nine trees is a few kilobytes. A cap at all is
   what stops a single POST putting a megabyte of anything into the table. */
const MAX_LYRICS = 64 * 1024;

function badCode(code) { return !CODE_RE.test(code); }

function trackNo(raw) {
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 && n <= 999 ? n : null;
}

/** Who to record. The email is what survives the account being deleted. */
function who(access) {
    return {
        id: Number(access.id) || null,
        email: access.email || null,
        name: access.name || null,
    };
}

/* CRLF in, LF out. The textarea hands back whatever line ending the browser
   uses, and tools/apply-lyric-edits.js compares this text against what was
   parsed out of a sheet on the J: share — a body differing only in its line
   endings would read as a change on every save and apply as a no-op every
   time. Trailing whitespace goes for the same reason. */
function normalise(text) {
    return String(text).replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').replace(/\s+$/, '');
}

// ── GET ?album=CODE ──────────────────────────────────────────────────────
// The overlay for one album: every track that has been corrected, at its
// current revision. `?track=N&history=1` asks instead for one track's whole
// history, which is gated.
export async function GET(request) {
    const url = new URL(request.url);
    const code = String(url.searchParams.get('album') || '').trim();
    if (badCode(code)) return json({ error: 'Bad album code' }, 400, NO_STORE);

    if (url.searchParams.get('history') === '1') {
        const n = trackNo(url.searchParams.get('track'));
        if (!n) return json({ error: 'Bad track' }, 400, NO_STORE);

        // Gated: the words are public, but who changed them and when is a
        // record of people's work and belongs to the console.
        const access = await requireSection(request, 'albums');
        if (!access) return json({ error: 'Forbidden' }, 403, NO_STORE);

        try {
            const { rows } = await pool.query(
                `SELECT revision, lyrics, prev_lyrics AS "prevLyrics",
                        edited_by_email AS "editedByEmail",
                        edited_by_name  AS "editedByName",
                        edited_at       AS "editedAt",
                        applied_at      AS "appliedAt"
                   FROM kj_lyric_edits
                  WHERE album_code = $1 AND track_no = $2
                  ORDER BY revision DESC`,
                [code, n]
            );
            return json({ code, track: n, revisions: rows }, 200, NO_STORE);
        } catch (e) {
            console.error('[todo-lyrics] history failed:', e.message);
            return json({ error: 'Unavailable' }, 503, NO_STORE);
        }
    }

    try {
        /* One row per track — the highest revision. DISTINCT ON is the shape
           Postgres answers in a single scan of idx_kj_lyric_edits_album, which
           is ordered to match. */
        const { rows } = await pool.query(
            `SELECT DISTINCT ON (track_no)
                    track_no AS "track", revision, lyrics,
                    edited_by_email AS "editedByEmail",
                    edited_by_name  AS "editedByName",
                    edited_at       AS "editedAt"
               FROM kj_lyric_edits
              WHERE album_code = $1
              ORDER BY track_no, revision DESC`,
            [code]
        );
        const edits = {};
        for (const r of rows) edits[String(r.track)] = r;
        return json({ code, edits }, 200, NO_STORE);
    } catch (e) {
        /* A console that refused to open an album because the overlay could not
           be read would be a worse console than one showing the sheet as built.
           An empty overlay is what todo.js treats as "no corrections", and the
           503 is what makes it say so rather than imply the sheet is current. */
        console.error('[todo-lyrics] read failed:', e.message);
        return json({ error: 'Unavailable', edits: {} }, 503, NO_STORE);
    }
}

// ── POST {album, track, lyrics, baseLyrics} ─────────────────────────────
// Save a correction. `baseLyrics` is what the editor had on screen — the
// bundle's own words on a first correction — and becomes this revision's
// `prev_lyrics` only when there is no earlier revision to take it from.
export async function POST(request) {
    const access = await requireSection(request, 'albums');
    if (!access) return json({ error: 'Forbidden' }, 403, NO_STORE);

    let body;
    try { body = await request.json(); }
    catch { return json({ error: 'Bad JSON' }, 400, NO_STORE); }

    const code = String(body?.album || '').trim();
    if (badCode(code)) return json({ error: 'Bad album code' }, 400, NO_STORE);

    const n = trackNo(body?.track);
    if (!n) return json({ error: 'Bad track' }, 400, NO_STORE);

    if (typeof body?.lyrics !== 'string') return json({ error: 'Bad lyrics' }, 400, NO_STORE);
    const lyrics = normalise(body.lyrics);
    if (!lyrics) return json({ error: 'Empty lyrics' }, 400, NO_STORE);
    if (lyrics.length > MAX_LYRICS) {
        return json({ error: `Too long — ${MAX_LYRICS} characters is the limit` }, 413, NO_STORE);
    }

    const base = typeof body?.baseLyrics === 'string' ? normalise(body.baseLyrics) : null;
    const w = who(access);

    /* ONE STATEMENT, so the revision number is picked and taken in the same
       breath. Reading MAX(revision) and inserting it back separately is the
       race two admins on one track actually hit; the unique index turns what is
       left of it into a 23505 rather than two rows claiming one revision. */
    const sql = `
        INSERT INTO kj_lyric_edits
               (album_code, track_no, revision, lyrics, prev_lyrics,
                edited_by, edited_by_email, edited_by_name)
        SELECT $1, $2,
               COALESCE(MAX(revision), 0) + 1,
               $3,
               COALESCE(
                   (SELECT lyrics FROM kj_lyric_edits
                     WHERE album_code = $1 AND track_no = $2
                     ORDER BY revision DESC LIMIT 1),
                   $4),
               $5, $6, $7
          FROM kj_lyric_edits
         WHERE album_code = $1 AND track_no = $2
        RETURNING revision, lyrics,
                  edited_by_email AS "editedByEmail",
                  edited_by_name  AS "editedByName",
                  edited_at       AS "editedAt"`;
    const args = [code, n, lyrics, base, w.id, w.email, w.name];

    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const { rows: [row] } = await pool.query(sql, args);
            return json({ code, track: n, edit: row }, 200, NO_STORE);
        } catch (e) {
            // 23505 — the other admin took this revision number. Ours is still
            // a save somebody asked for, so take the next one rather than
            // making them press the button again.
            if (e.code === '23505' && attempt === 0) continue;
            console.error('[todo-lyrics] save failed:', e.message);
            return json({ error: 'Could not save' }, 503, NO_STORE);
        }
    }
    return json({ error: 'Could not save' }, 503, NO_STORE);
}
