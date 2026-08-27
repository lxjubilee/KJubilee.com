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
    { id: 'executive', label: 'Executives' },
    { id: 'user', label: 'Members' },
];

const ROLES = ['user', 'executive', 'admin'];
const ROLE_LABEL = { user: 'Member', executive: 'Executive', admin: 'Administrator' };
const ROLE_TONE = { user: 'neutral', executive: 'amber', admin: 'indigo' };

/* What each role means, said once at the bottom of the table rather than in a
   tooltip nobody opens. */
const ROLE_NOTE = {
    user: 'No console access.',
    executive: 'Opens only the console sections granted in Roles & permissions.',
    admin: 'The whole console, always — including who may open it.',
};

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
 * Three roles means there is no single "the other one", so the sentence is
 * built from where the account is going rather than from a promote/demote
 * pair. What each one says is what that role can actually reach — an operator
 * confirming a change should not have to remember the matrix.
 */
function ConfirmRole({ user, to, onCancel, onDone }) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const from = String(user.role || 'user').toLowerCase();

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

    const consequence = {
        admin: <>
            <code>{user.email}</code> will be able to open this console and everything in it —
            including <strong>Users &amp; roles</strong>, so they will be able to set anyone&rsquo;s
            role, and <strong>Roles &amp; permissions</strong>. This is the role that cannot be
            limited.
        </>,
        executive: <>
            <code>{user.email}</code> will be able to open this console, but only the sections the
            Executive role has been granted in <strong>Roles &amp; permissions</strong>. Change what
            that includes there, not here — it applies to every Executive at once.
        </>,
        user: <>
            <code>{user.email}</code> keeps their account and loses this console entirely. Anything
            they already promoted stays promoted, with their name still on it.
        </>,
    }[to];

    return (
        <div className="adm-danger">
            <strong>
                Change {displayName(user)} from {ROLE_LABEL[from] || from} to {ROLE_LABEL[to] || to}?
            </strong>
            <p>{consequence}</p>
            <div className="adm-form-actions">
                <button type="button"
                        className={'adm-btn ' + (to === 'user' ? 'adm-btn--danger' : 'adm-btn--primary')}
                        disabled={busy} onClick={go}>
                    {busy ? 'Saving…' : 'Make ' + (ROLE_LABEL[to] || to)}
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
                            <th scope="col">Role</th>
                            <th scope="col">Status</th>
                            <th scope="col">Joined</th>
                            <th scope="col">Last seen</th>
                            <th scope="col"><span className="adm-sr">Actions</span></th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map(u => {
                            const role = String(u.role || 'user').toLowerCase();
                            const isAdmin = role === 'admin';
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
                                    <td>
                                        <span className={'adm-badge adm-tone-' + (ROLE_TONE[role] || 'neutral')}>
                                            {ROLE_LABEL[role] || role}
                                        </span>
                                    </td>
                                    <td><span className={'adm-badge adm-tone-' + status.tone}>{status.label}</span></td>
                                    <td><span className="adm-cell-dim">{when(u.created_at)}</span></td>
                                    <td><span className="adm-cell-dim">{u.last_login_at ? ago(u.last_login_at) : 'never'}</span></td>
                                    <td className="adm-actions">
                                        {/* A dropdown rather than a toggle: with
                                            three roles there is no single "other"
                                            to flip to. Choosing does not save —
                                            it opens the confirm row beneath. */}
                                        <select
                                            className="adm-select adm-select--sm"
                                            value={role}
                                            disabled={Boolean(why)}
                                            title={why || undefined}
                                            onChange={e => {
                                                const to = e.target.value;
                                                if (to !== role) setConfirming({ user: u, to });
                                            }}
                                            aria-label={'Role for ' + displayName(u)}
                                        >
                                            {ROLES.map(r => (
                                                <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                                            ))}
                                        </select>
                                    </td>
                                </tr>,
                                confirming?.user?.id === u.id && (
                                    <tr key={u.id + '-confirm'} className="adm-row-open">
                                        <td colSpan={6}>
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
                            <tr><td colSpan={6} className="adm-empty">
                                {query || role ? 'No account matches that search.' : 'No accounts yet.'}
                            </td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            <div className="adm-cols2">
                {ROLES.map(r => (
                    <p key={r} className="adm-fine">
                        <strong>{ROLE_LABEL[r]}</strong> — {ROLE_NOTE[r]}
                    </p>
                ))}
            </div>

            <p className="adm-fine">
                Accounts are created by signing up, not from here — this console changes what an existing
                account may reach. A role change is read from the database on every request, so it takes
                effect immediately and does not wait for the person to sign in again. What an Executive
                can actually open is set in <strong>Roles &amp; permissions</strong>.
            </p>
        </div>
    );
}
