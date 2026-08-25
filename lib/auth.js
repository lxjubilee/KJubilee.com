'use strict';

// ─────────────────────────────────────────────────────────────────────────
// Local JWT auth (HS256 via Node crypto) — ported from JubileeVerse.
// No external auth service needed. Tokens are 30-day by default.
// ─────────────────────────────────────────────────────────────────────────

const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'kjubilee-jwt-secret-CHANGE-ME';

// Accept either JWT_EXPIRES_DAYS (a plain number) or JWT_EXPIRES_IN (e.g. "30d",
// "12h", "45m") — the latter is what .env / .env.example document.
function resolveExpiresDays() {
    const days = parseInt(process.env.JWT_EXPIRES_DAYS || '', 10);
    if (!Number.isNaN(days)) return days;
    const m = String(process.env.JWT_EXPIRES_IN || '').trim().match(/^(\d+)\s*([dhm])?$/i);
    if (m) {
        const n = parseInt(m[1], 10);
        const unit = (m[2] || 'd').toLowerCase();
        return unit === 'h' ? n / 24 : unit === 'm' ? n / 1440 : n;
    }
    return 30;
}
const DEFAULT_EXPIRES_DAYS = resolveExpiresDays();

function hashPassword(password, salt) {
    return crypto.scryptSync(password, salt, 64).toString('hex');
}

function createSalt() { return crypto.randomBytes(16).toString('hex'); }

function signJWT(claims, expiresInSeconds = DEFAULT_EXPIRES_DAYS * 86400) {
    const header = { alg: 'HS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const payload = { iat: now, exp: now + expiresInSeconds, ...claims };
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const data = `${b64(header)}.${b64(payload)}`;
    const sig = crypto.createHmac('sha256', JWT_SECRET).update(data).digest('base64url');
    return `${data}.${sig}`;
}

function verifyJWT(token) {
    try {
        const [header, body, sig] = token.split('.');
        if (!header || !body || !sig) return null;
        const expected = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
        if (sig !== expected) return null;
        const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
        if (payload.exp < Math.floor(Date.now() / 1000)) return null;
        return payload;
    } catch { return null; }
}

// Extract a user id from a Bearer token, or null if missing/invalid. Used by
// the radio API to attribute favorites/follows. Anonymous access is fine for
// endpoints that allow it.
function getUserIdFromAuth(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    try {
        const token = authHeader.split(' ')[1];
        const payload = verifyJWT(token);
        return payload ? (payload.sub || payload.userId || payload.id || null) : null;
    } catch { return null; }
}

module.exports = { hashPassword, createSalt, signJWT, verifyJWT, getUserIdFromAuth };
