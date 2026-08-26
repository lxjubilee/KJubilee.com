'use client';

import { useEffect, useState } from 'react';
import { apiUrl } from '@/lib/api-base';
import PasswordField, { PasswordStrength, PasswordMatch } from '../_password-field';
import { authToken, patchAuth, clearAuth } from '../_session-store';

/*
 * /account — profile settings.
 *
 * The header could say who was signed in and offer the way out, and that was
 * the whole of it: no way to correct the name it was greeting you by, no way to
 * change the password, no way to leave. This is the screen those three belong
 * on.
 *
 * ── Three cards, in ascending order of consequence ──
 * A name is a typo away from wrong and is fixed by typing over it. A password
 * is a credential, so it asks for the current one and, for a Jubilee ID
 * account, says out loud that the change reaches every Jubilee site. Deleting
 * is irreversible, so it stays folded shut until asked for, wants the password
 * AND the word DELETE, and lists what will go with it.
 *
 * ── What this screen may NOT do ──
 * Change the email. It is the join between this account and the Jubilee ID and
 * the key every session and reset token is filed under; it is changed at the
 * identity, not here. The card says so rather than showing a field that quietly
 * does nothing.
 *
 * THE GATE HERE IS NOT THE SECURITY, exactly as on /admin: /api/account asks the
 * database who is calling before it answers, and the two destructive routes ask
 * for the password on top of that. Everything below is about showing a human the
 * right thing — a signed-out visitor gets a way in rather than a dead form.
 */

async function api(path, { method = 'GET', body, token } = {}) {
    let res;
    try {
        res = await fetch(apiUrl(path), {
            method,
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: body ? JSON.stringify(body) : undefined,
            cache: 'no-store',
        });
    } catch {
        // Offline, or the API host is unreachable. Status 0 is the caller's cue
        // to say so rather than to report whatever the last state was.
        return { ok: false, status: 0, data: {} };
    }
    let data = {};
    try { data = await res.json(); } catch { /* empty or non-JSON body */ }
    return { ok: res.ok, status: res.status, data };
}

const OFFLINE = 'The server could not be reached. Check your connection and try again.';

function longDate(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

/** The result line under a form. Silent until there is something to say. */
function Note({ note }) {
    if (!note || !note.text) return null;
    return <p className={`acct-note acct-note--${note.kind}`} role={note.kind === 'stop' ? 'alert' : 'status'}>{note.text}</p>;
}

function Fact({ label, value }) {
    if (!value) return null;
    return (
        <div className="acct-fact">
            <dt>{label}</dt>
            <dd>{value}</dd>
        </div>
    );
}

function Card({ title, blurb, children, tone = '' }) {
    return (
        <section className={`acct-card${tone ? ' acct-card--' + tone : ''}`}>
            <h2 className="acct-card-title">{title}</h2>
            {blurb && <p className="acct-card-blurb">{blurb}</p>}
            {children}
        </section>
    );
}

function Field({ id, label, value, onChange, ...rest }) {
    return (
        <div className="input-group">
            <input id={id} type="text" placeholder=" " value={value} onChange={(e) => onChange(e.target.value)} {...rest} />
            <label htmlFor={id}>{label}</label>
        </div>
    );
}

function Submit({ busy, busyLabel, tone = '', disabled = false, children }) {
    return (
        <button type="submit" className={`acct-btn${tone ? ' acct-btn--' + tone : ''}`} disabled={busy || disabled}>
            {busy ? busyLabel : children}
        </button>
    );
}

/* The identity strip: who this is, and the three facts a settings page owes
   someone about their own account. The address is here rather than in an
   editable field because it is exactly the thing that cannot be edited. */
function Identity({ account }) {
    const initial = (account.name || account.email || '?').trim().charAt(0).toUpperCase();
    return (
        <section className="acct-id">
            <span className="acct-avatar" aria-hidden="true">{initial}</span>
            <div className="acct-who">
                <p className="acct-who-name">{account.name || 'No name set'}</p>
                <p className="acct-who-email">{account.email}</p>
                {account.role === 'admin' && <span className="acct-badge">Administrator</span>}
            </div>
            <dl className="acct-facts">
                <Fact label="Member since" value={longDate(account.created_at)} />
                <Fact label="Last signed in" value={longDate(account.last_login_at)} />
                <Fact
                    label="Sign-in"
                    value={account.password_kind === 'jubilee-id' ? 'Jubilee ID' : 'kJubilee password'}
                />
            </dl>
        </section>
    );
}

function LibraryLine({ library }) {
    if (!library) return null;
    const parts = [];
    if (library.stations_favorited) parts.push(`${library.stations_favorited} favourite station${library.stations_favorited === 1 ? '' : 's'}`);
    if (library.stations_followed) parts.push(`${library.stations_followed} followed station${library.stations_followed === 1 ? '' : 's'}`);
    if (library.albums_followed) parts.push(`${library.albums_followed} followed album${library.albums_followed === 1 ? '' : 's'}`);
    if (!parts.length) return <p className="acct-card-blurb">You have nothing saved on kJubilee yet.</p>;
    return (
        <p className="acct-card-blurb">
            Deleting takes your library with it — {parts.join(', ')}.
        </p>
    );
}

export default function AccountClient() {
    const [state, setState] = useState('checking');   // checking | anon | ready | error | gone
    const [account, setAccount] = useState(null);
    const [library, setLibrary] = useState(null);
    const [keptJubileeId, setKeptJubileeId] = useState(false);

    const [first, setFirst] = useState('');
    const [last, setLast] = useState('');
    const [nameBusy, setNameBusy] = useState(false);
    const [nameNote, setNameNote] = useState(null);

    const [currentPw, setCurrentPw] = useState('');
    const [newPw, setNewPw] = useState('');
    const [confirmPw, setConfirmPw] = useState('');
    const [pwBusy, setPwBusy] = useState(false);
    const [pwNote, setPwNote] = useState(null);

    const [dangerOpen, setDangerOpen] = useState(false);
    const [delPw, setDelPw] = useState('');
    const [delWord, setDelWord] = useState('');
    const [delBusy, setDelBusy] = useState(false);
    const [delNote, setDelNote] = useState(null);

    useEffect(() => {
        const token = authToken();
        if (!token) { setState('anon'); return; }

        let cancelled = false;
        (async () => {
            const r = await api('/api/account', { token });
            if (cancelled) return;
            if (r.status === 401) { setState('anon'); return; }
            if (!r.ok || !r.data.user) { setState('error'); return; }
            setAccount(r.data.user);
            setLibrary(r.data.library || null);
            setFirst(r.data.user.first_name || '');
            setLast(r.data.user.last_name || '');
            setState('ready');
        })();
        return () => { cancelled = true; };
    }, []);

    async function saveName(e) {
        e.preventDefault();
        setNameNote(null);
        setNameBusy(true);
        const r = await api('/api/account', {
            method: 'PATCH',
            token: authToken(),
            body: { first_name: first, last_name: last },
        });
        setNameBusy(false);

        if (!r.ok || !r.data.success) {
            setNameNote({ kind: 'stop', text: r.status === 0 ? OFFLINE : (r.data.error || 'Your name could not be saved.') });
            return;
        }
        setAccount(r.data.user);
        // The header greets people by this name and is reading the copy in
        // localStorage, not the database. Without this it keeps the old one
        // until the next sign-in.
        patchAuth({
            user: {
                name: r.data.user.name,
                first_name: r.data.user.first_name,
                last_name: r.data.user.last_name,
            },
        });
        setNameNote({ kind: 'ok', text: 'Saved.' });
    }

    async function savePassword(e) {
        e.preventDefault();
        setPwNote(null);

        if (newPw !== confirmPw) {
            setPwNote({ kind: 'stop', text: 'The two new passwords do not match.' });
            return;
        }

        setPwBusy(true);
        const r = await api('/api/account/password', {
            method: 'POST',
            token: authToken(),
            body: { currentPassword: currentPw, newPassword: newPw },
        });
        setPwBusy(false);

        if (!r.ok || !r.data.success) {
            setPwNote({ kind: 'stop', text: r.status === 0 ? OFFLINE : (r.data.error || 'Your password could not be changed.') });
            return;
        }

        setCurrentPw(''); setNewPw(''); setConfirmPw('');

        // The change revoked every session, this tab's included. The server sent
        // back a replacement; storing it is what keeps this page signed in.
        if (r.data.token) {
            patchAuth({ token: r.data.token, refreshToken: r.data.refreshToken, expiresAt: r.data.expiresAt });
        } else if (r.data.reauthenticate) {
            clearAuth();
            setPwNote({ kind: 'ok', text: 'Password changed. Please sign in again.' });
            setTimeout(() => { window.location.href = '/signin'; }, 1500);
            return;
        }

        setPwNote({
            kind: 'ok',
            text: r.data.scope === 'jubilee-id'
                ? 'Your Jubilee ID password has been changed. Every other device has been signed out.'
                : 'Your password has been changed. Every other device has been signed out.',
        });
    }

    async function deleteAccount(e) {
        e.preventDefault();
        setDelNote(null);
        setDelBusy(true);
        const r = await api('/api/account/delete', {
            method: 'POST',
            token: authToken(),
            body: { password: delPw, confirm: delWord },
        });
        setDelBusy(false);

        if (!r.ok || !r.data.success) {
            setDelNote({ kind: 'stop', text: r.status === 0 ? OFFLINE : (r.data.error || 'Your account could not be deleted.') });
            return;
        }
        setKeptJubileeId(Boolean(r.data.kept_jubilee_id));
        clearAuth();
        setState('gone');
    }

    const styles = <link rel="stylesheet" href="/css/pages/account.css" precedence="kj-page" />;

    if (state === 'gone') {
        return (
            <main className="acct">
                {styles}
                <div className="acct-farewell">
                    <h1>Your kJubilee account has been deleted.</h1>
                    <p>
                        Your favourites, followed stations and followed albums are gone with it, and every
                        device has been signed out.
                        {keptJubileeId && ' Your Jubilee ID is untouched — it still signs you in everywhere else in the family, and you are welcome back here any time.'}
                    </p>
                    <p><a href="/">Back to the dial</a></p>
                </div>
            </main>
        );
    }

    return (
        <main className="acct">
            {styles}

            <header className="acct-head">
                <div>
                    <p className="acct-eyebrow">Your account</p>
                    <h1 className="acct-title">Profile settings</h1>
                </div>
                <a className="acct-back" href="/">Back to the dial</a>
            </header>

            {state === 'checking' && <p className="acct-status">Loading your account…</p>}

            {state === 'anon' && (
                <div className="acct-status acct-status--stop">
                    <strong>You are not signed in.</strong>
                    <p>These are your own account settings. <a href="/signin">Sign in</a> and come back.</p>
                </div>
            )}

            {state === 'error' && (
                <div className="acct-status acct-status--stop">
                    <strong>Your account could not be loaded.</strong>
                    <p>The server did not answer. Try again in a moment.</p>
                </div>
            )}

            {state === 'ready' && account && (
                <>
                    <Identity account={account} />

                    <Card
                        title="Your name"
                        blurb={account.linked_to_jubilee_id
                            ? 'This is the name every Jubilee site greets you by, so changing it here changes it there too.'
                            : 'The name kJubilee greets you by.'}
                    >
                        <form className="acct-form" onSubmit={saveName}>
                            <div className="acct-pair">
                                <Field id="acct-first" label="First name" value={first} onChange={setFirst} autoComplete="given-name" maxLength={80} required />
                                <Field id="acct-last" label="Last name" value={last} onChange={setLast} autoComplete="family-name" maxLength={80} />
                            </div>
                            <div className="acct-actions">
                                <Submit busy={nameBusy} busyLabel="Saving…">Save name</Submit>
                                <Note note={nameNote} />
                            </div>
                        </form>
                    </Card>

                    <Card
                        title="Email address"
                        blurb={account.linked_to_jubilee_id
                            ? 'Your address is your Jubilee ID, and it is what your account, your library and every sign-in are filed under. It is changed at your Jubilee ID rather than here.'
                            : 'Your address is what your account and your library are filed under, so it is not changed from this page. Ask an administrator if it needs to move.'}
                    >
                        <p className="acct-readonly">{account.email}</p>
                    </Card>

                    <Card
                        title="Password"
                        blurb={account.password_kind === 'jubilee-id'
                            ? 'Your password lives with your Jubilee ID, so this changes the password you use on every Jubilee site. Changing it signs you out on every other device.'
                            : 'Changing your password signs you out on every other device.'}
                    >
                        <form className="acct-form" onSubmit={savePassword}>
                            <PasswordField
                                id="acct-current"
                                label={account.password_kind === 'jubilee-id' ? 'Current Jubilee ID password' : 'Current password'}
                                value={currentPw}
                                onChange={setCurrentPw}
                                autoComplete="current-password"
                            >
                                <p className="acct-hint">
                                    Don&rsquo;t remember it? <a href="/forgot-password">Get a reset link by email.</a>
                                </p>
                            </PasswordField>

                            <div className="acct-pair">
                                <PasswordField
                                    id="acct-new"
                                    label="New password"
                                    value={newPw}
                                    onChange={setNewPw}
                                    autoComplete="new-password"
                                    minLength={8}
                                >
                                    <PasswordStrength value={newPw} />
                                </PasswordField>

                                <PasswordField
                                    id="acct-confirm"
                                    label="Confirm new password"
                                    value={confirmPw}
                                    onChange={setConfirmPw}
                                    autoComplete="new-password"
                                    minLength={8}
                                >
                                    <PasswordMatch password={newPw} confirm={confirmPw} />
                                </PasswordField>
                            </div>

                            <div className="acct-actions">
                                <Submit busy={pwBusy} busyLabel="Changing…">Change password</Submit>
                                <Note note={pwNote} />
                            </div>
                        </form>
                    </Card>

                    <Card
                        title="Delete account"
                        tone="stop"
                        blurb="This removes your kJubilee membership. It cannot be undone."
                    >
                        <LibraryLine library={library} />

                        {account.linked_to_jubilee_id && (
                            <p className="acct-card-blurb">
                                <strong>Your Jubilee ID is not deleted.</strong> It is your identity across every
                                Jubilee site, and kJubilee has no business closing it — you would keep signing in
                                elsewhere exactly as before, and could join kJubilee again whenever you liked.
                            </p>
                        )}

                        {!dangerOpen && (
                            <button type="button" className="acct-btn acct-btn--stop" onClick={() => setDangerOpen(true)}>
                                Delete my kJubilee account
                            </button>
                        )}

                        {dangerOpen && (
                            <form className="acct-form" onSubmit={deleteAccount}>
                                <PasswordField
                                    id="acct-del-password"
                                    label={account.password_kind === 'jubilee-id' ? 'Your Jubilee ID password' : 'Your password'}
                                    value={delPw}
                                    onChange={setDelPw}
                                    autoComplete="current-password"
                                />
                                <Field
                                    id="acct-del-confirm"
                                    label="Type DELETE to confirm"
                                    value={delWord}
                                    onChange={setDelWord}
                                    autoComplete="off"
                                    spellCheck="false"
                                    required
                                />
                                <div className="acct-actions">
                                    <Submit
                                        busy={delBusy}
                                        busyLabel="Deleting…"
                                        tone="stop"
                                        disabled={delWord.trim().toUpperCase() !== 'DELETE' || !delPw}
                                    >
                                        Delete my account permanently
                                    </Submit>
                                    <button
                                        type="button"
                                        className="acct-btn acct-btn--quiet"
                                        onClick={() => { setDangerOpen(false); setDelPw(''); setDelWord(''); setDelNote(null); }}
                                    >
                                        Keep my account
                                    </button>
                                    <Note note={delNote} />
                                </div>
                            </form>
                        )}
                    </Card>
                </>
            )}
        </main>
    );
}
