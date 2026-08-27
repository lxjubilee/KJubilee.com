'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, num, ApiError } from './_api';

/*
 * Roles & permissions — which sections of this console each role may open.
 *
 * ONLY `executive` IS EDITABLE, and that is not a limitation to work around.
 * `admin` is answered in code as "everything" and `user` as "nothing"; if
 * admin's access were data, an admin could untick admin's own access to this
 * very screen and there would be no way back for anyone. Both fixed columns
 * are still SHOWN, because a permissions matrix that hides two thirds of the
 * rule is not a picture of the rule.
 *
 * TWO OF THESE TICKS HAND OVER THE CONSOLE ITSELF. Granting `users` lets an
 * executive set anybody's role — including their own, up to admin. Granting
 * `roles` lets them edit this matrix, which reaches the same place by one more
 * step. That is deliberate: the admin decides here. What this screen owes the
 * person ticking is that they know it before they click, not after — hence the
 * warning on those two rows rather than a silent checkbox like the others.
 */

const SECTION_LABEL = {
    dashboard: 'Dashboard',
    stations: 'Stations & ratings',
    albums: 'Albums',
    feedback: 'Listener inbox',
    users: 'Users & roles',
    roles: 'Roles & permissions',
};

const SECTION_BLURB = {
    dashboard: 'The network figures, listener counts and runtime.',
    stations: 'The dial, and promoting songs to A or B on a frequency.',
    albums: 'Creating, editing and deleting rows in the album catalogue.',
    feedback: 'Listener comments, voicemail and missing day files.',
    users: 'Setting anyone’s role.',
    roles: 'Editing this matrix.',
};

/* The two that lead back to privilege. Flagged rather than blocked. */
const ESCALATES = {
    users: 'An executive with this can make themselves an administrator.',
    roles: 'An executive with this can grant their own role anything, including Users & roles.',
};

const ROLE_LABEL = { user: 'Member', admin: 'Administrator', executive: 'Executive' };
const ROLE_NOTE = {
    user: 'Never has console access.',
    admin: 'Always has everything. Fixed so the console cannot be locked shut.',
    executive: 'Exactly what is ticked below.',
};

export default function Roles() {
    const [data, setData] = useState(null);
    const [state, setState] = useState('loading');
    const [error, setError] = useState(null);
    const [saving, setSaving] = useState(null);     // "role:section" in flight
    const [notice, setNotice] = useState(null);

    const load = useCallback(async () => {
        setState('loading');
        try {
            setData(await api('/api/admin/roles'));
            setState('ready');
        } catch (e) {
            setError(e instanceof ApiError && e.status === 403
                ? 'Your role does not include Roles & permissions.'
                : (e.message || 'Permissions could not be loaded.'));
            setState('error');
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    async function toggle(role, section, granted) {
        const key = role + ':' + section;
        setSaving(key);
        setNotice(null);
        try {
            const res = await api('/api/admin/roles', {
                method: 'PATCH',
                body: { role, section, granted },
            });
            // The server returns the role's whole list after the write, so the
            // matrix is redrawn from its answer rather than an optimistic guess.
            setData(prev => ({ ...prev, granted: { ...prev.granted, [role]: res.sections } }));
            setNotice((granted ? 'Granted ' : 'Revoked ') + SECTION_LABEL[section] + ' for ' + ROLE_LABEL[role] + '.');
        } catch (e) {
            setNotice(e.message || 'That change could not be saved.');
        } finally {
            setSaving(null);
        }
    }

    if (state === 'loading') {
        return (
            <div className="adm-content">
                <div className="adm-state"><span className="adm-spinner" />Loading permissions…</div>
            </div>
        );
    }
    if (state === 'error') {
        return (
            <div className="adm-content">
                <div className="adm-notice adm-notice--stop"><strong>{error}</strong></div>
            </div>
        );
    }

    const roles = data?.roles || [];
    const sections = data?.sections || [];
    const editable = data?.editable || [];
    const granted = data?.granted || {};
    const holders = data?.holders || {};

    return (
        <div className="adm-content">
            <div className="adm-stat-grid">
                {roles.map(r => (
                    <div key={r} className={'adm-stat-card' + (r === 'admin' ? ' adm-stat-card--green' : '')}>
                        <span className="adm-stat-label">{ROLE_LABEL[r]}</span>
                        <strong className="adm-stat-value">{num(holders[r] || 0)}</strong>
                        <span className="adm-stat-hint">
                            {(holders[r] || 0) === 1 ? 'account · ' : 'accounts · '}
                            {r === 'admin' ? 'all ' + sections.length + ' sections'
                                : r === 'user' ? 'no console'
                                : (granted.executive || []).length + ' of ' + sections.length + ' sections'}
                        </span>
                    </div>
                ))}
            </div>

            {notice && (
                <div className="adm-notice"><strong>{notice}</strong></div>
            )}

            <div className="adm-table-wrap">
                <table className="adm-table adm-table--perms">
                    <thead>
                        <tr>
                            <th scope="col">Console section</th>
                            {roles.map(r => (
                                <th key={r} scope="col" className="adm-perm-col">
                                    {ROLE_LABEL[r]}
                                    <span className="adm-perm-note">
                                        {editable.includes(r) ? 'editable' : 'fixed'}
                                    </span>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {sections.map(sec => (
                            <tr key={sec}>
                                <td>
                                    <span className="adm-cell-primary">{SECTION_LABEL[sec] || sec}</span>
                                    <span className="adm-cell-dim">{SECTION_BLURB[sec] || ''}</span>
                                    {ESCALATES[sec] && (
                                        <span className="adm-perm-warn">⚠ {ESCALATES[sec]}</span>
                                    )}
                                </td>
                                {roles.map(r => {
                                    const on = (granted[r] || []).includes(sec);
                                    const fixed = !editable.includes(r);
                                    const key = r + ':' + sec;
                                    return (
                                        <td key={r} className="adm-perm-col">
                                            <label className={'adm-perm' + (fixed ? ' is-fixed' : '')}>
                                                <input
                                                    type="checkbox"
                                                    checked={on}
                                                    disabled={fixed || saving === key}
                                                    onChange={e => toggle(r, sec, e.target.checked)}
                                                    aria-label={
                                                        (on ? 'Revoke ' : 'Grant ') + (SECTION_LABEL[sec] || sec)
                                                        + ' for ' + ROLE_LABEL[r]
                                                    }
                                                />
                                                <span className="adm-perm-mark" aria-hidden="true" />
                                            </label>
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="adm-cols2">
                {roles.map(r => (
                    <p key={r} className="adm-fine">
                        <strong>{ROLE_LABEL[r]}</strong> — {ROLE_NOTE[r]}
                    </p>
                ))}
            </div>

            <p className="adm-fine">
                A change here takes effect on that role&rsquo;s next request. Nobody has to sign in again,
                in either direction — the role and its sections are read from the database on every call,
                which is also why a revoked section stops working immediately rather than when a token expires.
            </p>
        </div>
    );
}
