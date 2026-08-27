'use client';

/*
 * The panel's one way of talking to the server.
 *
 * Every section needs the same three things — find the token, attach it, and
 * turn a 403 into the panel's shared "no" rather than a section-shaped error.
 * Keeping that in one file is what lets the shell decide access once and the
 * sections assume it, instead of each re-implementing the gate slightly
 * differently.
 */

/** The access token, from wherever the session keeper last wrote it. */
export function authToken() {
    for (const key of ['jv_auth', 'jubileeVerseAuth']) {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) continue;
            const t = (JSON.parse(raw) || {}).token;
            if (t) return t;
        } catch (e) { /* malformed entry — try the other key */ }
    }
    return null;
}

/**
 * Thrown for any non-2xx. `status` is carried so a caller can tell the panel's
 * shared 403 apart from a 409 that belongs in the form it came from.
 */
export class ApiError extends Error {
    constructor(message, status) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
    }
}

/**
 * fetch, with the token attached and the error shape normalised.
 *
 * `cache: 'no-store'` on every call, not just the writes: an admin view served
 * from the bfcache after a role change would be showing data the server would
 * no longer hand over.
 */
export async function api(url, options = {}) {
    const token = authToken();
    if (!token) throw new ApiError('Not signed in', 401);

    const headers = { Authorization: 'Bearer ' + token, ...(options.headers || {}) };
    if (options.body !== undefined && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(url, {
        ...options,
        headers,
        cache: 'no-store',
        body: options.body !== undefined && typeof options.body !== 'string'
            ? JSON.stringify(options.body)
            : options.body,
    });

    if (res.status === 204) return null;

    const type = res.headers.get('content-type') || '';
    if (!type.includes('application/json')) {
        const text = await res.text();
        if (!res.ok) throw new ApiError(text.slice(0, 200) || res.statusText, res.status);
        return text;
    }

    let payload = null;
    // A body that is not the JSON its own header promised is a server fault,
    // and reporting the parse failure is more useful than reporting "undefined".
    try { payload = await res.json(); } catch (e) { payload = null; }
    if (!res.ok) {
        throw new ApiError((payload && (payload.error || payload.message)) || res.statusText, res.status);
    }
    return payload;
}

// ── formatting ──────────────────────────────────────────────────────────
// Shared so a count reads the same in a dashboard tile and a table cell.

export function num(n) {
    return Number.isFinite(Number(n)) ? Number(n).toLocaleString() : '—';
}

/** Seconds as the operator thinks of them: 594h, or 12h 30m under a day. */
export function hours(seconds) {
    const s = Number(seconds);
    if (!Number.isFinite(s) || s <= 0) return '—';
    const h = Math.floor(s / 3600);
    if (h >= 24) return num(h) + 'h';
    return h + 'h ' + Math.floor((s % 3600) / 60) + 'm';
}

/** An ISO timestamp as "3h ago", falling back to the date past a week. */
export function ago(iso) {
    if (!iso) return 'never';
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return 'never';
    const mins = Math.round((Date.now() - t) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    if (mins < 1440) return Math.round(mins / 60) + 'h ago';
    if (mins < 10080) return Math.round(mins / 1440) + 'd ago';
    return new Date(t).toLocaleDateString();
}

export function when(iso) {
    if (!iso) return '—';
    const t = Date.parse(iso);
    return Number.isFinite(t) ? new Date(t).toLocaleString() : '—';
}
