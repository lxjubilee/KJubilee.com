'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, num, when, ago, ApiError } from './_api';

/*
 * Users & roles.
 *
 * THE ONLY SCREEN HERE THAT GRANTS PRIVILEGE. Making someone an administrator
 * hands them every other section, so the confirm step is not politeness — it is
 * the last place a misread row can be caught.
 *
 * THE GUARDS LIVE ON THE SERVER, NOT HERE. You cannot change your own role, and
 * the last administrator cannot be demoted; both are enforced inside the
 * transaction that does the write (app/api/admin/users/route.js). What this
 * component does is show WHY a button is disabled before it is pressed, so the
 * rule is visible rather than discovered through a 409.
 */

const ROLE_FILTERS = [
    { id: '', label: 'All accounts' },
    { id: 'admin', label: 'Administrators' },
    { id: 'user', label: 'Members' },
];

/** Whatever we can call this person, preferring the parts over the mirror. */
function displayName(u) {
    const joined = [u.first_name, u.last_name].map(p => (p || '').trim()).filter(Boolean).join(' ');
    if (joined) return joined;
    const name = (u.name || '').trim();
    return name || (u.email || '').split('@')[0];
}

/** One or two letters for the row's disc — the same idea as the header's. */
function initialsOf(u) {
    const parts = [u.first_name, u.last_name].map(x => (x || '').trim()).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    const src = (parts[0] || u.name || u.email || '?').trim();
    const words = src.split(/[\s@._-]+/).filter(Boolean);
    if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
    return src.slice(0, 2).toUpperCase();
}

/** The row's state, in the words the operator needs — not raw columns. */
function statusOf(u) {
    if (u.is_locked) return { label: 'locked', tone: 'red' };
    if (u.is_active === false) return { label: 'inactive', tone: 'neutral' };
    if (u.email_verified === false) return { label: 'unverified', tone: 'amber' };
    return { label: 'active', tone: 'green' };
}

/**
 * The confirm step for a role change.
 *
 * A grant and a revocation are not the same act, so they do not get the same
 * sentence. Promoting says what the person will be able to reach; demoting says
 * what they will lose.
 */
function ConfirmRole({ user, to, onCancel, onDone }) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const promoting = to === 'admin';

    async function go() {
        setBusy(true);
        setError(null);
        try {
            await api('/api/admin/users', { method: 'PATCH', body: { id: user.id, role: to } });
            onDone();
        } catch (e) {
            setError(e.message || 'The role could not be changed.');
            setBusy(false);
        }
    }

    return (
        <div className="adm-danger">
            <strong>
                {promoting
                    ? 'Make ' + displayName(user) + ' an administrator?'
                    : 'Remove administrator rights from ' + displayName(user) + '?'}
            </strong>
            <p>
                {promoting
                    ? <>
                        <code>{user.email}</code> will be able to open this console and everything in it —
                        the dial and its ratings, the album catalogue, and the listener inbox. The change
                        takes effect on their next request; they do not need to sign in again.
                      </>
                    : <>
                        <code>{user.email}</code> keeps their account and loses this console. Anything they
                        already promoted stays promoted, with their name still on it.
                      </>}
            </p>
            <div className="adm-form-actions">
                <button type="button"
                        className={'adm-btn ' + (promoting ? 'adm-btn--primary' : 'adm-btn--danger')}
                        disabled={busy} onClick={go}>
                    {busy ? 'Saving…' : promoting ? 'Make administrator' : 'Remove rights'}
                </button>
                <button type="button" className="adm-btn" onClick={onCancel} disabled={busy}>Cancel</button>
            </div>
            {error && <p className="adm-notice adm-notice--stop" style={{ marginTop: 12 }}><strong>{error}</strong></p>}
        </div>
    );
}

export default function Users() {
    const [data, setData] = useState(null);
    const [state, setState] = useState('loading');
    const [error, setError] = useState(null);
    const [query, setQuery] = useState('');
    const [role, setRole] = useState('');
    const [confirming, setConfirming] = useState(null);   // { user, to }

    const load = useCallback(async () => {
        setState('loading');
        try {
            const params = new URLSearchParams();
            if (role) params.set('role', role);
            if (query.trim()) params.set('q', query.trim());
            setData(await api('/api/admin/users' + (params.toString() ? '?' + params : '')));
            setState('ready');
        } catch (e) {
            setError(e instanceof ApiError && e.status === 403
                ? 'Your account no longer has administrator rights.'
                : (e.message || 'The account list could not be loaded.'));
            setState('error');
        }
    }, [role, query]);

    // Debounced so typing in the search box is one request at the end of a word
    // rather than one per keystroke against the database.
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

    const users = data?.users || [];
    const admins = data?.by_role?.admin || 0;
    const meId = data?.me?.id;

    return (
        <div className="adm-content">
            <div className="adm-toolbar">
                <input type="search" className="adm-search" placeholder="Search name, email or Jubilee ID…"
                       value={query} onChange={e => setQuery(e.target.value)} />
                <select className="adm-select" value={role} onChange={e => setRole(e.target.value)}>
                    {ROLE_FILTERS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
                <span className="adm-count">
                    {state === 'loading' ? 'Loading…' : num(users.length) + ' shown'}
                    {data?.total ? ' · ' + num(data.total) + ' accounts · ' + num(admins) + ' admin' : ''}
                </span>
            </div>

            {data?.truncated && (
                <p className="adm-fine">
                    Showing the first {num(data.limit)} accounts — narrow the search to reach the rest.
                </p>
            )}

            <div className="adm-table-wrap">
                <table className="adm-table adm-table--users">
                    <thead>
                        <tr>
                            <th scope="col">Account</th>
                            <th scope="col">Jubilee ID</th>
                            <th scope="col">Role</th>
                            <th scope="col">Status</th>
                            <th scope="col">Joined</th>
                            <th scope="col">Last seen</th>
                            <th scope="col"><span className="adm-sr">Actions</span></th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map(u => {
                            const isAdmin = String(u.role || 'user').toLowerCase() === 'admin';
                            const isMe = u.id === meId;
                            // The two rules the server will enforce anyway, shown
                            // here so the reason is on screen before the click.
                            const lastAdmin = isAdmin && admins <= 1;
                            const why = isMe ? 'You cannot change your own role.'
                                : lastAdmin ? 'The only administrator cannot be demoted.'
                                : null;
                            const status = statusOf(u);
                            return [
                                <tr key={u.id} className={confirming?.user?.id === u.id ? 'is-open' : undefined}>
                                    {/* ONE LINE PER ACCOUNT. Name over address
                                        made every row two lines tall, so six
                                        accounts filled the screen and the roles
                                        column — the reason to be here — was the
                                        hardest thing to scan. */}
                                    <td>
                                        <span className="adm-who">
                                            <span className="adm-who-disc" aria-hidden="true">{initialsOf(u)}</span>
                                            <span className="adm-who-name">
                                                {displayName(u)}{isMe && <span className="adm-who-you"> (you)</span>}
                                            </span>
                                            <span className="adm-who-email" title={u.email}>{u.email}</span>
                                        </span>
                                    </td>
                                    <td><span className="adm-cell-dim">{u.jubilee_id ? <code>{u.jubilee_id}</code> : '—'}</span></td>
                                    <td>
                                        <span className={'adm-badge ' + (isAdmin ? 'adm-tone-indigo' : 'adm-tone-neutral')}>
                                            {isAdmin ? 'administrator' : 'member'}
                                        </span>
                                    </td>
                                    <td><span className={'adm-badge adm-tone-' + status.tone}>{status.label}</span></td>
                                    <td><span className="adm-cell-dim">{when(u.created_at)}</span></td>
                                    <td><span className="adm-cell-dim">{u.last_login_at ? ago(u.last_login_at) : 'never'}</span></td>
                                    <td className="adm-actions">
                                        <button
                                            type="button"
                                            className={'adm-btn adm-btn--sm' + (isAdmin ? '' : ' adm-btn--primary')}
                                            disabled={Boolean(why)}
                                            title={why || undefined}
                                            onClick={() => setConfirming({ user: u, to: isAdmin ? 'user' : 'admin' })}
                                        >
                                            {isAdmin ? 'Remove admin' : 'Make admin'}
                                        </button>
                                    </td>
                                </tr>,
                                confirming?.user?.id === u.id && (
                                    <tr key={u.id + '-confirm'} className="adm-row-open">
                                        <td colSpan={7}>
                                            <ConfirmRole
                                                user={confirming.user}
                                                to={confirming.to}
                                                onCancel={() => setConfirming(null)}
                                                onDone={() => { setConfirming(null); load(); }}
                                            />
                                        </td>
                                    </tr>
                                ),
                            ];
                        })}
                        {!users.length && state === 'ready' && (
                            <tr><td colSpan={7} className="adm-empty">
                                {query || role ? 'No account matches that search.' : 'No accounts yet.'}
                            </td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            <p className="adm-fine">
                Accounts are created by signing up, not from here — this console changes what an existing
                account may reach. A role change is read from the database on every request, so it takes
                effect immediately and does not wait for the person to sign in again.
            </p>
        </div>
    );
}
