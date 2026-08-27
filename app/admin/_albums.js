'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, num, when, ApiError } from './_api';

/*
 * Albums — the kj_albums catalogue.
 *
 * THIS IS THE EDITORIAL LAYER, NOT THE MUSIC. The SongID ledger owns what
 * exists; these rows decide what the site presents and under which persona and
 * theme. Nothing typed here moves a byte of audio, and a row set to `published`
 * is a claim that a CDN folder already exists — the slug doubles as that folder
 * name (001-initial-schema.sql), which is why editing one is not a cosmetic
 * change and the field says so.
 *
 * DELETE ASKS FOR THE SLUG IN WORDS. kj_album_follows rows point at these ids,
 * so a mistyped id removes something listeners saved. The typed word is the
 * same lock the account page puts on deleting an account.
 */

const STATUSES = ['draft', 'published', 'archived'];

/* Published is the only status that means the row is live, so it is the only
   one that gets a colour. Draft and archived are both "not on the site" and
   reading them as equally quiet is correct. */
const STATUS_TONE = { published: 'green', draft: 'neutral', archived: 'neutral' };

const BLANK = {
    title: '', slug: '', persona_slug: '', theme_slug: '',
    category_id: '', sort_order: 0, status: 'draft',
    artist_name: '', cover_image: '', description: '', track_count: 0,
};

/** Title → slug, in the shape the API's SLUG_RE will accept. */
function slugify(s) {
    return String(s).toLowerCase().trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function Field({ label, hint, children }) {
    return (
        <label className="adm-field">
            <span className="adm-field-label">{label}</span>
            {children}
            {hint && <span className="adm-field-hint">{hint}</span>}
        </label>
    );
}

function AlbumForm({ initial, onCancel, onDone }) {
    const [form, setForm] = useState({ ...BLANK, ...(initial || {}) });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const editing = Boolean(initial?.id);

    // Only auto-fill the slug while creating, and only while it still matches
    // the title it was derived from. Rewriting an existing slug from the title
    // would rename a CDN folder because somebody fixed a typo in a display name.
    const [slugTouched, setSlugTouched] = useState(editing);

    function set(key, value) {
        setForm(prev => {
            const next = { ...prev, [key]: value };
            if (key === 'title' && !slugTouched) next.slug = slugify(value);
            return next;
        });
    }

    async function submit(e) {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const body = { ...form };
            if (editing) body.id = initial.id;
            const result = await api('/api/admin/albums', { method: editing ? 'PATCH' : 'POST', body });
            onDone(result.album);
        } catch (err) {
            setError(err.message || 'Could not save the album.');
        } finally {
            setBusy(false);
        }
    }

    return (
        <form className="adm-form" onSubmit={submit}>
            <h3 className="adm-h3">{editing ? 'Edit “' + initial.title + '”' : 'New album'}</h3>

            <div className="adm-form-grid">
                <Field label="Title">
                    <input className="adm-input" required maxLength={300}
                           value={form.title} onChange={e => set('title', e.target.value)} />
                </Field>

                <Field label="Slug" hint="Lowercase words joined by hyphens. This is the folder name in the CDN audio tree — changing it renames that folder too.">
                    <input className="adm-input" required maxLength={200}
                           pattern="[a-z0-9]+(-[a-z0-9]+)*"
                           value={form.slug}
                           onChange={e => { setSlugTouched(true); set('slug', e.target.value); }} />
                </Field>

                <Field label="Artist">
                    <input className="adm-input" maxLength={300}
                           value={form.artist_name || ''} onChange={e => set('artist_name', e.target.value)} />
                </Field>

                <Field label="Status" hint="Published claims the CDN folder already exists.">
                    <select className="adm-select" value={form.status}
                            onChange={e => set('status', e.target.value)}>
                        {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </Field>

                <Field label="Persona slug">
                    <input className="adm-input" maxLength={200}
                           value={form.persona_slug || ''} onChange={e => set('persona_slug', e.target.value)} />
                </Field>

                <Field label="Theme slug">
                    <input className="adm-input" maxLength={200}
                           value={form.theme_slug || ''} onChange={e => set('theme_slug', e.target.value)} />
                </Field>

                <Field label="Category id">
                    <input className="adm-input" type="number"
                           value={form.category_id ?? ''} onChange={e => set('category_id', e.target.value)} />
                </Field>

                <Field label="Sort order" hint="Lower sorts first within a category.">
                    <input className="adm-input" type="number"
                           value={form.sort_order ?? 0} onChange={e => set('sort_order', e.target.value)} />
                </Field>

                <Field label="Track count">
                    <input className="adm-input" type="number" min={0}
                           value={form.track_count ?? 0} onChange={e => set('track_count', e.target.value)} />
                </Field>

                <Field label="Cover image">
                    <input className="adm-input" maxLength={500} placeholder="/images/albums/…"
                           value={form.cover_image || ''} onChange={e => set('cover_image', e.target.value)} />
                </Field>
            </div>

            <Field label="Description">
                <textarea className="adm-input adm-textarea" rows={3} maxLength={4000}
                          value={form.description || ''} onChange={e => set('description', e.target.value)} />
            </Field>

            {error && <p className="adm-notice adm-notice--stop"><strong>{error}</strong></p>}

            <div className="adm-form-actions">
                <button type="submit" className="adm-btn adm-btn--primary" disabled={busy}>
                    {busy ? 'Saving…' : editing ? 'Save changes' : 'Create album'}
                </button>
                <button type="button" className="adm-btn" onClick={onCancel} disabled={busy}>Cancel</button>
            </div>
        </form>
    );
}

/** Delete, gated on the operator typing the row's own slug. */
function DeleteRow({ album, onCancel, onDone }) {
    const [typed, setTyped] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    async function go() {
        setBusy(true);
        setError(null);
        try {
            await api('/api/admin/albums?id=' + album.id + '&confirm=' + encodeURIComponent(typed), { method: 'DELETE' });
            onDone(album.id);
        } catch (err) {
            setError(err.message || 'Could not delete.');
            setBusy(false);
        }
    }

    return (
        <div className="adm-danger">
            <strong>Delete “{album.title}” permanently?</strong>
            <p>
                Listeners who saved this album keep a row pointing at id {album.id}.
                Type <code>{album.slug}</code> to confirm.
            </p>
            <div className="adm-form-actions">
                <input className="adm-input" value={typed} onChange={e => setTyped(e.target.value)}
                       placeholder={album.slug} aria-label="Type the slug to confirm" autoComplete="off" />
                <button type="button" className="adm-btn adm-btn--danger"
                        disabled={busy || typed !== album.slug} onClick={go}>
                    {busy ? 'Deleting…' : 'Delete'}
                </button>
                <button type="button" className="adm-btn" onClick={onCancel} disabled={busy}>Cancel</button>
            </div>
            {error && <p className="adm-notice adm-notice--stop"><strong>{error}</strong></p>}
        </div>
    );
}

export default function Albums() {
    const [data, setData] = useState(null);
    const [state, setState] = useState('loading');
    const [error, setError] = useState(null);
    const [status, setStatus] = useState('');
    const [query, setQuery] = useState('');
    const [editing, setEditing] = useState(null);     // album row, or 'new'
    const [deleting, setDeleting] = useState(null);

    const load = useCallback(async () => {
        setState('loading');
        try {
            const params = new URLSearchParams();
            if (status) params.set('status', status);
            if (query.trim()) params.set('q', query.trim());
            const result = await api('/api/admin/albums' + (params.toString() ? '?' + params : ''));
            setData(result);
            setState('ready');
        } catch (e) {
            setError(e instanceof ApiError && e.status === 403
                ? 'Your account no longer has administrator rights.'
                : (e.message || 'The catalogue could not be loaded.'));
            setState('error');
        }
    }, [status, query]);

    // Debounced so typing in the search box is one request at the end of a
    // word rather than one per keystroke against the database.
    useEffect(() => {
        const t = setTimeout(load, query ? 300 : 0);
        return () => clearTimeout(t);
    }, [load, query]);

    if (state === 'error') {
        return (
            <div className="adm-content">
                <div className="adm-notice adm-notice--stop"><strong>{error}</strong></div>
            </div>
        );
    }

    const albums = data?.albums || [];

    return (
        <div className="adm-content">
            <div className="adm-toolbar">
                <input type="search" className="adm-input" placeholder="Search title, slug or artist…"
                       value={query} onChange={e => setQuery(e.target.value)} />
                <select className="adm-select" value={status} onChange={e => setStatus(e.target.value)}>
                    <option value="">All statuses</option>
                    {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <span className="adm-count">
                    {state === 'loading' ? 'Loading…' : num(albums.length) + ' shown'}
                    {data?.total ? ' · ' + num(data.total) + ' in the catalogue' : ''}
                </span>
                <button type="button" className="adm-btn adm-btn--primary"
                        onClick={() => { setDeleting(null); setEditing('new'); }}>New album</button>
            </div>

            {editing === 'new' && (
                <AlbumForm onCancel={() => setEditing(null)}
                           onDone={() => { setEditing(null); load(); }} />
            )}

            {data?.truncated && (
                <p className="adm-fine">Showing the first {num(data.limit)} rows — narrow the search to reach the rest.</p>
            )}

            <div className="adm-table-wrap">
            <table className="adm-table">
                <thead>
                    <tr>
                        <th scope="col">Album</th>
                        <th scope="col">Persona / theme</th>
                        <th scope="col">Status</th>
                        <th scope="col" className="adm-num">Tracks</th>
                        <th scope="col" className="adm-num">Order</th>
                        <th scope="col">Updated</th>
                        <th scope="col"><span className="adm-sr">Actions</span></th>
                    </tr>
                </thead>
                <tbody>
                    {albums.map(a => [
                        <tr key={a.id}>
                            <td>
                                <span className="adm-cell-primary">{a.title}</span>
                                <span className="adm-cell-dim"><code>{a.slug}</code>{a.artist_name ? ' · ' + a.artist_name : ''}</span>
                            </td>
                            <td>
                                <span className="adm-cell-dim">{a.persona_slug || '—'}</span>
                                <span className="adm-cell-dim adm-cell-dim--faint">{a.theme_slug || '—'}</span>
                            </td>
                            <td><span className={'adm-badge adm-tone-' + (STATUS_TONE[a.status] || 'neutral')}>{a.status}</span></td>
                            <td className="adm-num">{num(a.track_count)}</td>
                            <td className="adm-num">{num(a.sort_order)}</td>
                            <td><span className="adm-cell-dim">{when(a.updated_at)}</span></td>
                            <td className="adm-actions">
                                <button type="button" className="adm-btn adm-btn--sm"
                                        onClick={() => { setDeleting(null); setEditing(a); }}>Edit</button>
                                <button type="button" className="adm-btn adm-btn--quiet adm-btn--sm"
                                        onClick={() => { setEditing(null); setDeleting(a); }}>Delete</button>
                            </td>
                        </tr>,
                        editing?.id === a.id && (
                            <tr key={a.id + '-edit'} className="adm-row-open"><td colSpan={7}>
                                <AlbumForm initial={a} onCancel={() => setEditing(null)}
                                           onDone={() => { setEditing(null); load(); }} />
                            </td></tr>
                        ),
                        deleting?.id === a.id && (
                            <tr key={a.id + '-del'} className="adm-row-open"><td colSpan={7}>
                                <DeleteRow album={a} onCancel={() => setDeleting(null)}
                                           onDone={() => { setDeleting(null); load(); }} />
                            </td></tr>
                        ),
                    ])}
                    {!albums.length && state === 'ready' && (
                        <tr><td colSpan={7} className="adm-empty">
                            {query || status
                                ? 'No album matches that search.'
                                : 'The catalogue is empty. “New album” adds the first row.'}
                        </td></tr>
                    )}
                </tbody>
            </table>
            </div>
        </div>
    );
}
