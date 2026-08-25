'use strict';

// ─────────────────────────────────────────────────────────────────────────
// kJubilee — Kingdom Jubilee Radio + Music streaming server.
// Radio spinoff of JubileeVerse.com. Routes:
//   GET  /             → landing page
//   GET  /radio        → radio player
//   GET  /music        → music page
//   GET  /login, /signup
//   GET  /cdn/*        → audio assets (byte-range), serves CDN_LOCAL_ROOT
//   /api/auth/*        → register / login / me
//   /api/radio/*       → feedback, voicemail, favorites, follows
//   /api/music/*       → album follows
//   /api/admin/albums  → admin album list
// ─────────────────────────────────────────────────────────────────────────

require('dotenv').config();

const express = require('express');
const helmet  = require('helmet');
const cors    = require('cors');
const morgan  = require('morgan');
const rateLimit = require('express-rate-limit');
const path    = require('path');
const crypto  = require('crypto');
const fsp     = require('fs').promises;

const { pool: pgPool } = require('./lib/db');
const { hashPassword, createSalt, signJWT, getUserIdFromAuth } = require('./lib/auth');

const PORT = parseInt(process.env.PORT || '3210', 10);
const NODE_ENV = process.env.NODE_ENV || 'development';
const CDN_LOCAL_ROOT = process.env.CDN_LOCAL_ROOT
    || path.join(__dirname, '..', 'cdn.kjubilee.com');

// ── Production safety guard ───────────────────────────────────────────────
// Refuse to boot in production with placeholder/empty secrets. A forgeable
// JWT secret or missing DB password silently shipping to prod is a real risk.
if (NODE_ENV === 'production') {
    const placeholders = ['change-me-in-production', 'kjubilee-jwt-secret-CHANGE-ME', ''];
    const problems = [];
    if (!process.env.JWT_SECRET || placeholders.includes(process.env.JWT_SECRET) || process.env.JWT_SECRET.length < 32) {
        problems.push('JWT_SECRET is missing, a placeholder, or too short (need ≥32 chars — `openssl rand -hex 64`)');
    }
    if (!process.env.DB_PASSWORD) {
        problems.push('DB_PASSWORD is empty');
    }
    if (problems.length) {
        console.error('\n✗ Refusing to start in production:\n  - ' + problems.join('\n  - ') + '\n');
        process.exit(1);
    }
}

const app = express();
app.set('trust proxy', 1);

// ── Middleware ──────────────────────────────────────────────────────────
app.use(helmet({
    contentSecurityPolicy: false, // the player HTML inlines styles + scripts
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(cors({ origin: true, credentials: true }));
app.use(morgan(NODE_ENV === 'production' ? 'combined' : 'dev'));

app.use(rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    max:      parseInt(process.env.RATE_LIMIT_MAX || '300', 10),
    standardHeaders: true,
    legacyHeaders: false,
}));

// Static — the player + assets.
app.use(express.static(path.join(__dirname, 'public'), {
    etag: false, lastModified: false,
    setHeaders: (res) => {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    },
}));

// CDN — audio assets with byte-range support (Express static does range natively).
app.use('/cdn', express.static(CDN_LOCAL_ROOT, {
    etag: false, lastModified: false,
    setHeaders: (res, filePath) => {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Access-Control-Allow-Origin', '*');
        if (filePath.toLowerCase().endsWith('.mp3')) {
            res.setHeader('Accept-Ranges', 'bytes');
            res.setHeader('Content-Type', 'audio/mpeg');
        }
    },
}));

// JSON body — global limit (per-route raw parsers can override, e.g. voicemail).
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Page routes ─────────────────────────────────────────────────────────
app.get('/',         (_, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/radio',    (_, res) => res.sendFile(path.join(__dirname, 'public', 'radio.html')));
app.get('/music',    (_, res) => res.sendFile(path.join(__dirname, 'public', 'music.html')));
// The dial: a tuner rather than a directory. /player and /dial both reach it,
// because people ask for it by both names.
app.get('/player',   (_, res) => res.sendFile(path.join(__dirname, 'public', 'player.html')));
app.get('/dial',     (_, res) => res.sendFile(path.join(__dirname, 'public', 'player.html')));
app.get('/login',    (_, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/signup',   (_, res) => res.sendFile(path.join(__dirname, 'public', 'signup.html')));

// ── Time ────────────────────────────────────────────────────────────────
//
// streaming-services.md §4.3 — the one thing a synchronized broadcast cannot do
// without. The device clock may be minutes off, manually wrong, or reset after
// sleep, and a listener whose clock is out is not slightly off the beat: they
// are in a different song.
//
// MINIMAL BY DESIGN. The response carries a UTC instant and nothing else,
// because the client measures the round trip around this request and halves it
// (§4.3 step 4). Every byte of body and every millisecond of server work is
// error in that estimate, so there is no database call and no auth, and the
// payload is under fifty bytes.
//
// The player used to take its correction from the Date header of the day file,
// which is whole seconds and only arrives when a schedule is fetched. This is
// milliseconds and can be asked for at any moment.
app.get('/api/time', (_, res) => {
    // no-store rather than no-cache: a revalidated cached time is still a stale
    // time, and an intermediary serving this from cache would hand every
    // listener behind it the same wrong instant.
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.json({ now: Date.now() });
});

// ── Health ──────────────────────────────────────────────────────────────
app.get('/health', async (req, res) => {
    let db = 'unknown';
    try { await pgPool.query('SELECT 1'); db = 'ok'; } catch (e) { db = 'down: ' + e.message; }
    res.json({ ok: true, env: NODE_ENV, db, time: new Date().toISOString() });
});

// ────────────────────────────────────────────────────────────────────────
// AUTH — local JWT (register / login / me)
// ────────────────────────────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
    const { email, password, name } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const salt = createSalt();
    const hash = hashPassword(password, salt);
    try {
        const { rows: [u] } = await pgPool.query(
            `INSERT INTO kj_users (email, password_hash, password_salt, name) VALUES ($1,$2,$3,$4) RETURNING id`,
            [email.toLowerCase().trim(), hash, salt, name || '']
        );
        const token = signJWT({ sub: u.id, email: email.toLowerCase().trim() });
        res.json({ ok: true, token, user: { id: u.id, email: email.toLowerCase().trim(), name: name || '' } });
    } catch (e) {
        if (e.code === '23505') return res.status(409).json({ error: 'Email already registered' });
        console.error('[register]', e.message);
        res.status(500).json({ error: 'Registration failed' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    try {
        const { rows: [u] } = await pgPool.query(
            `SELECT id, email, name, password_hash, password_salt FROM kj_users WHERE email=$1`,
            [email.toLowerCase().trim()]
        );
        if (!u) return res.status(401).json({ error: 'Invalid credentials' });
        if (hashPassword(password, u.password_salt) !== u.password_hash) return res.status(401).json({ error: 'Invalid credentials' });
        const token = signJWT({ sub: u.id, email: u.email });
        res.json({ ok: true, token, user: { id: u.id, email: u.email, name: u.name } });
    } catch (e) {
        console.error('[login]', e.message);
        res.status(500).json({ error: 'Login failed' });
    }
});

app.get('/api/auth/me', async (req, res) => {
    const userId = getUserIdFromAuth(req);
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    try {
        const { rows: [u] } = await pgPool.query(`SELECT id, email, name FROM kj_users WHERE id=$1`, [userId]);
        if (!u) return res.status(404).json({ error: 'User not found' });
        res.json({ user: u });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ────────────────────────────────────────────────────────────────────────
// RADIO — feedback, voicemail (ported from JubileeVerse BR-I1 / BR-I2)
// ────────────────────────────────────────────────────────────────────────

// POST /api/radio/feedback — listener engagement events. Stored as JSONL on
// the CDN — one file per station per UTC day — not in the database.
app.post('/api/radio/feedback', async (req, res) => {
    const ALLOWED = ['thumb_up', 'thumb_down', 'thumb_clear', 'comment', 'favorite', 'skip'];
    const { station_id, station_name, segment_id, segment_type, event_type, comment, session_id, timestamp } = req.body || {};
    if (!station_id || !event_type) return res.status(400).json({ success: false, error: 'station_id and event_type are required' });
    if (!ALLOWED.includes(event_type)) return res.status(400).json({ success: false, error: 'unknown event_type' });

    // Path-traversal-safe station id (folder name).
    const safe = String(station_id).toLowerCase().replace(/[^a-z0-9._-]/g, '');
    if (!safe || !/^[a-z0-9][a-z0-9._-]*$/.test(safe) || safe.includes('..')) return res.status(400).json({ success: false, error: 'invalid station_id' });

    const record = {
        event_type, station_id: safe,
        station_name: typeof station_name === 'string' ? station_name.slice(0, 200) : null,
        segment_id:   typeof segment_id   === 'string' ? segment_id.slice(0, 200)   : null,
        segment_type: typeof segment_type === 'string' ? segment_type.slice(0, 40)  : null,
        comment: event_type === 'comment' && typeof comment === 'string' ? comment.trim().slice(0, 400) : null,
        session_id: typeof session_id === 'string' ? session_id.slice(0, 80) : null,
        user_id: getUserIdFromAuth(req) || null,
        client_timestamp: typeof timestamp === 'string' ? timestamp.slice(0, 40) : null,
        received_at: new Date().toISOString(),
    };
    if (event_type === 'comment' && (!record.comment || record.comment.length < 3)) return res.status(400).json({ success: false, error: 'comment too short' });

    try {
        const day = new Date().toISOString().slice(0, 10);
        const dir = path.join(CDN_LOCAL_ROOT, 'radio', '_feedback', safe);
        await fsp.mkdir(dir, { recursive: true });
        await fsp.appendFile(path.join(dir, day + '.jsonl'), JSON.stringify(record) + '\n', 'utf8');
        res.json({ success: true });
    } catch (err) {
        console.error('[radio/feedback]', err.message);
        res.status(500).json({ success: false, error: 'Failed to record feedback' });
    }
});

// POST /api/radio/request-day — a player could not find today's programming.
//
// The tenant day files are published three days ahead by a nightly job, so a
// 404 in the player means that job has been failing for long enough to burn
// through the buffer and nobody noticed. The browser is the first thing to find
// out, so it tells us.
//
// This RECORDS the miss; it does not build the file. Generating a day needs the
// track pool, which lives where the music is and not on this host, and a web
// request must never block on a build. The record is what the operator and the
// next cron run read.
//
// Rate-limited per tenant+date by simple de-duplication: ten thousand listeners
// hitting a missing day would otherwise write ten thousand identical lines.
const requestedDays = new Map();   // 'tenant|date' -> firstSeen ms
app.post('/api/radio/request-day', async (req, res) => {
    const { tenant, date } = req.body || {};
    if (!tenant || !date) return res.status(400).json({ success: false, error: 'tenant and date are required' });

    // Tenant ids look like HM332.16-RO; dates like 20260822. Anything else is
    // not from our player and must never reach a filesystem path.
    if (!/^HM[0-9]{3}\.[0-9]{2}-[A-Z]{2}$/.test(String(tenant))) {
        return res.status(400).json({ success: false, error: 'invalid tenant id' });
    }
    if (!/^[0-9]{8}$/.test(String(date))) {
        return res.status(400).json({ success: false, error: 'invalid date' });
    }

    const key = tenant + '|' + date;
    const seen = requestedDays.get(key);
    const firstReport = !seen;
    if (firstReport) requestedDays.set(key, Date.now());

    // Bound the map so a long-running process cannot grow it without limit.
    if (requestedDays.size > 500) {
        const cutoff = Date.now() - 24 * 60 * 60 * 1000;
        for (const [k, t] of requestedDays) if (t < cutoff) requestedDays.delete(k);
    }

    if (firstReport) {
        try {
            const dir = path.join(CDN_LOCAL_ROOT, 'radio', '_requests');
            await fsp.mkdir(dir, { recursive: true });
            await fsp.appendFile(
                path.join(dir, new Date().toISOString().slice(0, 10) + '.jsonl'),
                JSON.stringify({ tenant, date, first_seen: new Date().toISOString() }) + '\n', 'utf8');
            console.warn('[radio/request-day] MISSING programming: ' + tenant + ' ' + date);
        } catch (err) {
            console.error('[radio/request-day]', err.message);
        }
    }
    res.json({ success: true, tenant, date, recorded: firstReport });
});

// POST /api/radio/voicemail — listener voice message, stored "pending" for
// human moderation. Octet-stream body up to 8MB; metadata in query string.
app.post('/api/radio/voicemail', express.raw({ type: () => true, limit: '8mb' }), async (req, res) => {
    const audio = req.body;
    const { station_id, station_name, session_id, duration_s, mime } = req.query;
    if (!station_id) return res.status(400).json({ success: false, error: 'station_id is required' });
    if (!Buffer.isBuffer(audio) || audio.length === 0) return res.status(400).json({ success: false, error: 'audio body is required' });

    const safe = String(station_id).toLowerCase().replace(/[^a-z0-9._-]/g, '');
    if (!safe || !/^[a-z0-9][a-z0-9._-]*$/.test(safe) || safe.includes('..')) return res.status(400).json({ success: false, error: 'invalid station_id' });

    const mimeStr = typeof mime === 'string' ? mime.toLowerCase() : 'audio/webm';
    const ext = mimeStr.includes('ogg') ? 'ogg'
              : (mimeStr.includes('mp4') || mimeStr.includes('m4a')) ? 'm4a'
              : (mimeStr.includes('mpeg') || mimeStr.includes('mp3')) ? 'mp3' : 'webm';

    try {
        const id = crypto.randomUUID();
        const dir = path.join(CDN_LOCAL_ROOT, 'radio', '_voicemail', safe, 'pending');
        await fsp.mkdir(dir, { recursive: true });
        await fsp.writeFile(path.join(dir, id + '.' + ext), audio);
        const meta = {
            id, station_id: safe,
            station_name: typeof station_name === 'string' ? station_name.slice(0, 200) : null,
            session_id:   typeof session_id   === 'string' ? session_id.slice(0, 80)    : null,
            user_id: getUserIdFromAuth(req) || null,
            duration_s: duration_s ? (parseInt(duration_s, 10) || null) : null,
            mime_type: mimeStr.slice(0, 60),
            audio_file: id + '.' + ext,
            bytes: audio.length,
            status: 'pending',
            received_at: new Date().toISOString(),
        };
        await fsp.writeFile(path.join(dir, id + '.json'), JSON.stringify(meta, null, 2));
        console.log(`[radio/voicemail] pending ${id} for ${safe} (${audio.length} bytes)`);
        res.json({ success: true, id });
    } catch (err) {
        console.error('[radio/voicemail]', err.message);
        res.status(500).json({ success: false, error: 'Failed to store voice message' });
    }
});

// ── Radio favorites ─────────────────────────────────────────────────────
app.get('/api/radio/favorites', async (req, res) => {
    const userId = getUserIdFromAuth(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required' });
    try {
        const { rows: favorites } = await pgPool.query(
            `SELECT id, station_id, station_name, station_category, station_image, favorited_at
             FROM kj_radio_favorites WHERE user_id = $1 ORDER BY favorited_at DESC`, [userId]);
        res.json({ success: true, count: favorites.length, favorites });
    } catch (err) { console.error('[radio/favorites GET]', err.message); res.status(500).json({ success: false, error: 'Failed to fetch favorites' }); }
});

app.post('/api/radio/favorites', async (req, res) => {
    const userId = getUserIdFromAuth(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required' });
    const { station_id, station_name, station_category, station_image } = req.body || {};
    if (!station_id || !station_name) return res.status(400).json({ success: false, error: 'station_id and station_name are required' });
    try {
        await pgPool.query(
            `INSERT INTO kj_radio_favorites (user_id, station_id, station_name, station_category, station_image)
             VALUES ($1,$2,$3,$4,$5) ON CONFLICT (user_id, station_id) DO NOTHING`,
            [userId, station_id, station_name, station_category || '', station_image || '']);
        res.json({ success: true, message: 'Station added to favorites' });
    } catch (err) {
        if (err.code === '23505') return res.json({ success: true, message: 'Station already in favorites' });
        console.error('[radio/favorites POST]', err.message); res.status(500).json({ success: false, error: 'Failed to add favorite' });
    }
});

app.delete('/api/radio/favorites/:stationId', async (req, res) => {
    const userId = getUserIdFromAuth(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required' });
    try {
        const r = await pgPool.query(`DELETE FROM kj_radio_favorites WHERE user_id=$1 AND station_id=$2`, [userId, req.params.stationId]);
        if (r.rowCount > 0) return res.json({ success: true, message: 'Station removed from favorites' });
        res.status(404).json({ success: false, error: 'Favorite not found' });
    } catch (err) { console.error('[radio/favorites DELETE]', err.message); res.status(500).json({ success: false, error: 'Failed to remove favorite' }); }
});

app.get('/api/radio/favorites/check/:stationId', async (req, res) => {
    const userId = getUserIdFromAuth(req);
    if (!userId) return res.json({ success: true, isFavorited: false });
    try {
        const { rows: [favorite] } = await pgPool.query(
            `SELECT id FROM kj_radio_favorites WHERE user_id=$1 AND station_id=$2`, [userId, req.params.stationId]);
        res.json({ success: true, isFavorited: !!favorite });
    } catch (err) { console.error('[radio/favorites/check]', err.message); res.status(500).json({ success: false, error: 'Failed to check favorite status' }); }
});

// ── Radio follows ───────────────────────────────────────────────────────
app.get('/api/radio/follows', async (req, res) => {
    const userId = getUserIdFromAuth(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required' });
    try {
        const { rows: follows } = await pgPool.query(
            `SELECT id, station_id, station_name, station_category, station_image, followed_at
             FROM kj_radio_follows WHERE user_id=$1 ORDER BY followed_at DESC`, [userId]);
        res.json({ success: true, count: follows.length, follows });
    } catch (err) { console.error('[radio/follows GET]', err.message); res.status(500).json({ success: false, error: 'Failed to fetch follows' }); }
});

app.post('/api/radio/follows', async (req, res) => {
    const userId = getUserIdFromAuth(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required' });
    const { station_id, station_name, station_category, station_image } = req.body || {};
    if (!station_id || !station_name) return res.status(400).json({ success: false, error: 'station_id and station_name are required' });
    try {
        await pgPool.query(
            `INSERT INTO kj_radio_follows (user_id, station_id, station_name, station_category, station_image)
             VALUES ($1,$2,$3,$4,$5) ON CONFLICT (user_id, station_id) DO NOTHING`,
            [userId, station_id, station_name, station_category || '', station_image || '']);
        res.json({ success: true, message: 'Station followed' });
    } catch (err) {
        if (err.code === '23505') return res.json({ success: true, message: 'Station already followed' });
        console.error('[radio/follows POST]', err.message); res.status(500).json({ success: false, error: 'Failed to follow station' });
    }
});

app.delete('/api/radio/follows/:stationId', async (req, res) => {
    const userId = getUserIdFromAuth(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required' });
    try {
        const r = await pgPool.query(`DELETE FROM kj_radio_follows WHERE user_id=$1 AND station_id=$2`, [userId, req.params.stationId]);
        if (r.rowCount > 0) return res.json({ success: true, message: 'Station unfollowed' });
        res.status(404).json({ success: false, error: 'Follow not found' });
    } catch (err) { console.error('[radio/follows DELETE]', err.message); res.status(500).json({ success: false, error: 'Failed to unfollow station' }); }
});

// ── Music album follows ─────────────────────────────────────────────────
app.get('/api/music/follows', async (req, res) => {
    const userId = getUserIdFromAuth(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required' });
    try {
        const { rows: follows } = await pgPool.query(
            `SELECT album_id, album_name, album_artist, album_image, followed_at
             FROM kj_album_follows WHERE user_id=$1 ORDER BY followed_at DESC`, [userId]);
        res.json({ success: true, count: follows.length, follows });
    } catch (err) { console.error('[music/follows GET]', err.message); res.status(500).json({ success: false, error: 'Failed to fetch follows' }); }
});

app.post('/api/music/follows', async (req, res) => {
    const userId = getUserIdFromAuth(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required' });
    const { album_id, album_name, album_artist, album_image } = req.body || {};
    if (!album_id || !album_name) return res.status(400).json({ success: false, error: 'album_id and album_name are required' });
    try {
        await pgPool.query(
            `INSERT INTO kj_album_follows (user_id, album_id, album_name, album_artist, album_image)
             VALUES ($1,$2,$3,$4,$5) ON CONFLICT (user_id, album_id) DO NOTHING`,
            [userId, album_id, album_name, album_artist || '', album_image || '']);
        res.json({ success: true, message: 'Album followed' });
    } catch (err) {
        if (err.code === '23505') return res.json({ success: true, message: 'Album already followed' });
        console.error('[music/follows POST]', err.message); res.status(500).json({ success: false, error: 'Failed to follow album' });
    }
});

app.delete('/api/music/follows/:albumId', async (req, res) => {
    const userId = getUserIdFromAuth(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required' });
    try {
        const r = await pgPool.query(`DELETE FROM kj_album_follows WHERE user_id=$1 AND album_id=$2`, [userId, req.params.albumId]);
        if (r.rowCount > 0) return res.json({ success: true, message: 'Album unfollowed' });
        res.status(404).json({ success: false, error: 'Follow not found' });
    } catch (err) { console.error('[music/follows DELETE]', err.message); res.status(500).json({ success: false, error: 'Failed to unfollow album' }); }
});

// ── Admin: album list ───────────────────────────────────────────────────
app.get('/api/admin/albums', async (req, res) => {
    const { category_id } = req.query;
    if (!category_id) return res.status(400).json({ error: 'category_id is required' });
    try {
        const r = await pgPool.query(
            `SELECT id, title, slug, persona_slug, theme_slug, sort_order, status, created_at
             FROM kj_albums WHERE category_id=$1 ORDER BY sort_order ASC, title ASC`, [category_id]);
        res.json(r.rows);
    } catch (err) { console.error('[admin/albums]', err.message); res.status(500).json({ error: 'Failed to fetch albums', message: err.message }); }
});

// ── Startup ─────────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
    console.log(`\n╔════════════════════════════════════════════════════════════╗`);
    console.log(`║          kJubilee — Kingdom Jubilee Radio                  ║`);
    console.log(`╠════════════════════════════════════════════════════════════╣`);
    console.log(`║  Listening on  http://localhost:${PORT}                       ║`);
    console.log(`║  Environment   ${NODE_ENV.padEnd(44)}║`);
    console.log(`║  CDN root      ${String(CDN_LOCAL_ROOT).slice(-44).padEnd(44)}║`);
    console.log(`╚════════════════════════════════════════════════════════════╝\n`);
});

process.on('SIGINT',  () => server.close(() => process.exit(0)));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
