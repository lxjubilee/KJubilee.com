'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, authToken, num, ApiError } from './_api';
import Dashboard from './_dashboard';
import Stations from './_stations';
import Albums from './_albums';
import Feedback from './_feedback';
import Users from './_users';
import Roles from './_roles';

/*
 * /admin — the administrator's console.
 *
 * THE GATE HERE IS NOT THE SECURITY. What makes this page safe is that every
 * section's data lives behind an /api/admin/* route that asks the database who
 * is calling before it hands over a byte. Everything below is only about
 * showing the right thing to a human: a signed-out visitor gets a sign-in
 * prompt rather than a broken frame, and a signed-in non-admin gets a plain
 * "no" rather than a spinner that never resolves. Someone who defeats this
 * component still gets a 403 from every route it would have called.
 *
 * THE GATE IS ASKED ONCE, BY THE DASHBOARD'S OWN FETCH. /api/admin/overview is
 * both the panel's access check and its first screenful, so the shell does not
 * spend a round trip on a permission question whose answer it then throws away.
 * Sections mounted afterwards assume the answer — and if the role is revoked
 * mid-session their own 403 surfaces in place, which is why each section
 * handles that status itself rather than trusting this one.
 *
 * The layout is JubileeInspire's admin shell: a sticky 248px rail beside a
 * scrolling main column. See public/css/pages/admin.css for what was borrowed
 * and what had to change for plain CSS.
 */

/* 20px stroke icons, sized by .adm-nav-icon. Inline rather than a sprite —
   six glyphs are smaller than the request that would fetch them. */
const Icon = ({ d, circle }) => (
    <svg className="adm-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {circle && <circle cx={circle[0]} cy={circle[1]} r={circle[2]} />}
        {d.map((p, i) => <path key={i} d={p} />)}
    </svg>
);

const SECTIONS = [
    {
        id: 'dashboard',
        label: 'Dashboard',
        title: 'Dashboard',
        subtitle: 'The website at a glance — the dial, the catalogue and who is listening.',
        icon: <Icon d={['M3 13h8V3H3zM13 21h8V11h-8zM13 3v6h8V3zM3 21h8v-6H3z']} />,
    },
    {
        id: 'stations',
        label: 'Stations & ratings',
        title: 'Stations & ratings',
        subtitle: 'Every frequency on the dial, and the A/B/C rotation rating of the songs on it.',
        icon: <Icon d={['M4 12h16', 'M7 8v8', 'M11 5v14', 'M15 8v8', 'M19 10v4']} />,
    },
    {
        id: 'albums',
        label: 'Albums',
        title: 'Albums',
        subtitle: 'The kj_albums catalogue — the editorial layer over the music repository.',
        icon: <Icon circle={[12, 12, 3]} d={['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z']} />,
    },
    {
        id: 'feedback',
        label: 'Listener inbox',
        title: 'Listener inbox',
        subtitle: 'Comments, voicemail, and day files a player asked for and did not get.',
        icon: <Icon d={['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z']} />,
    },
    {
        id: 'users',
        label: 'Users & roles',
        title: 'Users & roles',
        subtitle: 'Who has an account, and who may open this console.',
        icon: <Icon circle={[9, 7, 4]} d={['M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2', 'M17 11h4', 'M19 9v4']} />,
    },
    {
        id: 'roles',
        label: 'Roles & permissions',
        title: 'Roles & permissions',
        subtitle: 'Which sections of this console each role may open.',
        icon: <Icon d={['M12 3 4 6v6c0 4.4 3.4 8.5 8 9.5 4.6-1 8-5.1 8-9.5V6z', 'm9 12 2 2 4-4']} />,
    },
];

/** What the rail calls each role under the person's name. */
const ROLE_LABEL = { admin: 'Administrator', executive: 'Executive', user: 'Member' };

/** The first letter of whatever we can call this person, for the rail avatar. */
function initial(admin) {
    const source = (admin?.name || admin?.email || '?').trim();
    return source.charAt(0).toUpperCase();
}

export default function AdminClient() {
    const [state, setState] = useState('checking');   // checking | anon | denied | ready | error
    const [overview, setOverview] = useState(null);
    const [section, setSection] = useState('dashboard');

    const check = useCallback(async () => {
        if (!authToken()) { setState('anon'); return; }
        setState('checking');
        try {
            setOverview(await api('/api/admin/overview'));
            setState('ready');
        } catch (e) {
            if (e instanceof ApiError && e.status === 403) setState('denied');
            else if (e instanceof ApiError && e.status === 401) setState('anon');
            else setState('error');
        }
    }, []);

    useEffect(() => { check(); }, [check]);

    const styles = <link rel="stylesheet" href="/css/pages/admin.css" precedence="kj-page" />;

    /* Before the gate answers there is no console to frame — a rail full of
       sections a stranger cannot open would be furniture around a locked door.
       This is the same page reduced to its one message. */
    if (state !== 'ready') {
        return (
            <div className="adm-shell adm-shell--bare">
                {styles}
                <main className="adm-main">
                    <header className="adm-page-header">
                        <div>
                            <h1 className="adm-page-title">kJubilee Administration</h1>
                            <p className="adm-page-subtitle">Sign in with an administrator account to continue.</p>
                        </div>
                        <a className="adm-btn" href="/">Back to the dial</a>
                    </header>
                    <div className="adm-content">
                        {state === 'checking' && (
                            <div className="adm-state"><span className="adm-spinner" />Checking your access…</div>
                        )}
                        {state === 'anon' && (
                            <div className="adm-notice adm-notice--stop">
                                <strong>You are not signed in.</strong>
                                <p>This console is for administrators. <a href="/signin">Sign in</a> and come back.</p>
                            </div>
                        )}
                        {state === 'denied' && (
                            <div className="adm-notice adm-notice--stop">
                                <strong>Your account does not have administrator rights.</strong>
                                <p>If that is wrong, ask an administrator to set your role.</p>
                            </div>
                        )}
                        {state === 'error' && (
                            <div className="adm-notice adm-notice--stop">
                                <strong>The console could not be loaded.</strong>
                                <p>The server did not answer. Try again, and if it keeps happening the route or
                                   the database is the place to look.</p>
                                <p style={{ marginTop: 12 }}>
                                    <button type="button" className="adm-btn" onClick={check}>Try again</button>
                                </p>
                            </div>
                        )}
                    </div>
                </main>
            </div>
        );
    }

    /* THE RAIL IS BUILT FROM WHAT THE SERVER SAID, not from SECTIONS. An
       executive sees only the sections their role was granted, and the list
       arrives with the gate's own answer so the navigation and the routes
       cannot disagree. An admin's list is every section. */
    const allowed = overview?.admin?.sections || [];
    const visible = SECTIONS.filter(s => allowed.includes(s.id));
    // Whatever is open must be something this person may open — the default
    // is the first section they have, not necessarily the dashboard.
    const open = visible.find(s => s.id === section) || visible[0] || null;
    const inbox = overview?.inbox;
    // One number for the rail: everything sitting in the inbox that a person
    // has not dealt with. Absent rather than zero when the tree cannot be read.
    const inboxCount = inbox
        ? (inbox.events_7d || 0) + (inbox.requests_7d || 0) + (inbox.voicemail_pending || 0)
        : null;

    return (
        <div className="adm-shell">
            {styles}

            <aside className="adm-sidebar">
                <div className="adm-brand">
                    <a className="adm-brand-link" href="/">
                        <img className="adm-brand-mark" src="/images/members/JubileeInspire-Circle-200.png" alt="" />
                        <span className="adm-brand-text">
                            <span className="adm-brand-title">kJubilee</span>
                            <span className="adm-brand-sub">Administration</span>
                        </span>
                    </a>
                </div>

                <nav className="adm-nav" aria-label="Sections">
                    {visible.map(s => (
                        <button
                            key={s.id}
                            type="button"
                            className={'adm-nav-item' + (s.id === section ? ' is-active' : '')}
                            aria-current={s.id === section ? 'page' : undefined}
                            onClick={() => setSection(s.id)}
                        >
                            {s.icon}
                            <span>{s.label}</span>
                            {s.id === 'feedback' && inboxCount ? (
                                <span className="adm-nav-count">{num(inboxCount)}</span>
                            ) : null}
                        </button>
                    ))}
                </nav>

                <div className="adm-sidebar-foot">
                    {/* Whose promotions are about to be recorded. On a shared
                        screen this is the difference between a decision with a
                        name on it and one without. */}
                    <div className="adm-user-card">
                        <span className="adm-user-avatar" aria-hidden="true">{initial(overview?.admin)}</span>
                        <span className="adm-user-meta">
                            <span className="adm-user-name" title={overview?.admin?.email || ''}>
                                {overview?.admin?.name || overview?.admin?.email || 'Signed in'}
                            </span>
                            {/* The role, as the server reports it — an executive
                                should not be told they are an administrator. */}
                            <span className="adm-user-role">{ROLE_LABEL[overview?.admin?.role] || 'Signed in'}</span>
                        </span>
                    </div>
                    <a className="adm-back-link" href="/">← Back to the dial</a>
                </div>
            </aside>

            <main className="adm-main">
                <header className="adm-page-header">
                    <div>
                        <h1 className="adm-page-title">{open?.title || 'Administration'}</h1>
                        <p className="adm-page-subtitle">{open?.subtitle || ''}</p>
                    </div>
                    <div className="adm-page-actions">
                        <button type="button" className="adm-btn" onClick={check}>Refresh</button>
                    </div>
                </header>

                {/* Each section is unmounted when it is not open, so leaving the
                    stations tab drops its station manifest rather than holding
                    megabytes of JSON for a tab nobody is looking at. */}
                {open?.id === 'dashboard' && <Dashboard data={overview} />}
                {open?.id === 'stations' && <Stations />}
                {open?.id === 'albums' && <Albums />}
                {open?.id === 'feedback' && <Feedback />}
                {open?.id === 'users' && <Users />}
                {open?.id === 'roles' && <Roles />}
            </main>
        </div>
    );
}
