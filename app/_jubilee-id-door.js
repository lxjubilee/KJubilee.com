'use client';

/* ─────────────────────────────────────────────────────────────────────────
   The Jubilee ID door — one email-first screen behind /login, /signin and
   /signup.

   Screen 1 asks for an email and nothing else. The email is looked up at the
   Jubilee ID authority and the person is routed to one of three outcomes:

     A  welcome       has a Jubilee ID and already uses kJubilee
                      → password → signed in.
     B  confirm       has a Jubilee ID but is new to kJubilee
        createlinked  → confirm the Jubilee ID password, then a VISIBLE
                      Create Account screen. We never link silently: a person
                      who owns a Jubilee ID still watches their kJubilee
                      account get created, which is what pairs with the
                      in-app deletion path the app stores require.
     C  form          no Jubilee ID at all → create the Jubilee ID and the
                      kJubilee account together, in one motion.

   A Jubilee ID *is* a verified email address, so nothing in this flow asks
   anyone to check their inbox.

   This is a real component, not markup with a script rendering into it: the
   screen is a function of `step`, every field is controlled, and the browser's
   back button is wired to the step rather than to the page. Server side:
   app/api/sso/**. Look: public/css/jubilee-id.css.
   ───────────────────────────────────────────────────────────────────────── */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import AuthShell from './_auth-shell';
import Turnstile from './_turnstile';
import { apiUrl } from '@/lib/api-base';

const SITE_NAME = 'kJubilee';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// The reset is kJubilee's own (app/forgot-password): the authority stores a
// code but deliberately does not email it, so the site that asked has to send
// the message and then set the new password through the service API. This used
// to point at www.jubileeinspire.com, which handed people to another domain in
// the middle of signing in here.
const FORGOT_URL = '/forgot-password';
// Terms and Privacy live at the family help pages, because kJubilee has no
// pages of its own and a CONSENT link must not 404 — the sign-up screen asks
// people to agree to these before it will create an account, and being unable
// to read what you are agreeing to is the one failure that is not cosmetic.
//
// Replace both with /terms and /privacy the moment kJubilee publishes its own.
const TERMS_URL = 'https://www.jubileeinspire.com/help/terms';
const PRIVACY_URL = 'https://www.jubileeinspire.com/help/privacy';

// ── Icons ────────────────────────────────────────────────────────────────
const EyeOpen = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
    </svg>
);
const EyeClosed = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
        <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
);

// ── Password strength ────────────────────────────────────────────────────
function calcStrength(pw) {
    let score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^a-zA-Z0-9]/.test(pw)) score++;
    if (score <= 2) return 'weak';
    if (score <= 4) return 'fair';
    return 'strong';
}
const STRENGTH_LABEL = { weak: 'Weak password', fair: 'Fair password', strong: 'Strong password' };

// Mirrored server-side in app/api/sso/**, so this is a courtesy, not the gate.
function validateDob(dob) {
    if (!dob) return 'Please enter your date of birth.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return 'Date of birth must be a valid date.';
    const d = new Date(dob + 'T00:00:00Z');
    if (Number.isNaN(d.getTime())) return 'Date of birth is not a valid date.';
    const now = new Date();
    if (d > now) return 'Date of birth cannot be in the future.';
    const thirteen = new Date(Date.UTC(now.getUTCFullYear() - 13, now.getUTCMonth(), now.getUTCDate()));
    if (d > thirteen) return 'Accounts require a minimum age of 13.';
    return null;
}

// ── Session storage ──────────────────────────────────────────────────────
// The rest of the site reads `jubileeVerseAuth` (radio, music) and `jv_auth`
// (home) out of localStorage, so both are written there whatever the toggle
// says — writing to sessionStorage instead would leave someone signed in on
// this page and signed out on every other one.
//
// "Keep me signed in on this device" is enforced where it actually counts: the
// server mints a 30-day token when it is on and a short one when it is off
// (see issueSession in lib/local-account.js).
function storeAuth(data) {
    try {
        // The refresh token goes in too: the access token is ~15 minutes now,
        // and app/_session-keeper.js needs this to get the next one.
        localStorage.setItem('jv_auth', JSON.stringify({
            token: data.token, user: data.user, ts: Date.now(),
            expiresAt: data.expiresAt, refreshToken: data.refreshToken,
        }));
        localStorage.setItem('jubileeVerseAuth', JSON.stringify({
            authenticated: true, token: data.token, user: data.user,
            expiresAt: data.expiresAt, refreshToken: data.refreshToken,
        }));
    } catch (e) {
        // Private mode with storage blocked. The person is signed in for this
        // page load; do not fail the sign-in over where it could not be kept.
        console.warn('[jubilee-id] could not persist the session:', e && e.message);
    }
}

async function postJson(url, body) {
    let res;
    try {
        res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
    } catch {
        return { status: 0, ok: false, data: {} };
    }
    let data = {};
    try { data = await res.json(); } catch { /* empty body */ }
    return { status: res.status, ok: res.ok, data };
}

// ── Small presentational pieces ──────────────────────────────────────────

function Field({ id, label, type = 'text', value, onChange, className = '', ...rest }) {
    return (
        <div className={`input-group ${className}`}>
            <input id={id} type={type} placeholder=" " value={value} onChange={(e) => onChange(e.target.value)} {...rest} />
            <label htmlFor={id}>{label}</label>
        </div>
    );
}

function PasswordField({ id, label, value, onChange, autoComplete, autoFocus, children }) {
    const [shown, setShown] = useState(false);
    return (
        <div className="input-group">
            <div className="password-wrapper">
                <input
                    id={id}
                    type={shown ? 'text' : 'password'}
                    placeholder=" "
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    autoComplete={autoComplete}
                    autoFocus={autoFocus}
                    required
                />
                <label htmlFor={id}>{label}</label>
                <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShown((v) => !v)}
                    aria-label={shown ? 'Hide password' : 'Show password'}
                    tabIndex={-1}
                >
                    {shown ? <EyeClosed /> : <EyeOpen />}
                </button>
            </div>
            {children}
        </div>
    );
}

function SubmitButton({ loading, busyLabel, children }) {
    return (
        <button type="submit" className="btn-primary" disabled={loading}>
            {loading && <span className="spinner" />}
            {loading ? busyLabel : children}
        </button>
    );
}

// The read-only email plus "Use a different email". On EVERY screen past the
// first, so the address being signed in or signed up for is always on the
// screen that acts on it — including Create Account, which showed it only as
// a link at the very bottom.
function AccountRow({ email, onChangeEmail }) {
    return (
        <div className="account-row">
            <span className="account-email" title={email}>{email}</span>
            <button type="button" className="use-different" onClick={onChangeEmail}>Use a different email</button>
        </div>
    );
}

function ErrorAlert({ message }) {
    if (!message) return null;
    return <div className="auth-alert auth-alert--error" role="alert">{message}</div>;
}

function ForgotRow({ email }) {
    return (
        <div className="forgot-row">
            <a
                className="forgot-link"
                href={`${FORGOT_URL}?email=${encodeURIComponent(email)}`}
            >
                Forgot your password?
            </a>
        </div>
    );
}

// Module level, so it can see nothing declared inside JubileeIdDoor. The
// setters arrive already wrapped by the parent — referencing a closure from
// there is a ReferenceError at RENDER time, which compiles cleanly and then
// takes the whole screen down.
function NameFields({ firstName, lastName, setFirstName, setLastName }) {
    return (
        <div className="form-row">
            <Field id="firstName" label="First name" value={firstName} onChange={setFirstName}
                   maxLength={50} autoComplete="given-name" />
            <Field id="lastName" label="Last name" value={lastName} onChange={setLastName}
                   maxLength={50} autoComplete="family-name" />
        </div>
    );
}

// A date input never shows a placeholder, so its label is parked in the raised
// position from the start (.label-up).
function DobField({ dob, setDob }) {
    return (
        <Field id="dob" label="Date of birth" type="date" value={dob} onChange={setDob}
               className="date-field label-up" autoComplete="bday" max="9999-12-31" />
    );
}

function RememberRow({ checked, onChange }) {
    return (
        <div className="remember-row">
            <label className="checkbox-wrapper">
                <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
                <span>Keep me signed in on this device</span>
            </label>
        </div>
    );
}

// ── The door ─────────────────────────────────────────────────────────────
// The query string is parsed on the server (lib/door-params.js) and arrives as
// props, so the first response already contains the sign-in screen rather than
// an empty shell for the client to fill in.
export default function JubileeIdDoor({ returnUrl = '/', initialEmail = '', initialError = '', turnstileSiteKey = '' }) {
    const router = useRouter();

    const [step, setStep] = useState('email');   // email | welcome | confirm | createlinked | form | success
    const [email, setEmail] = useState(initialEmail);
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [dob, setDob] = useState('');
    const [password, setPassword] = useState('');                 // Outcome C
    const [confirmPassword, setConfirmPassword] = useState('');   // Outcome C
    const [existingPassword, setExistingPassword] = useState(''); // the Jubilee ID password (2A / 2B-1)
    const [rememberMe, setRememberMe] = useState(true);
    const [error, setError] = useState(initialError);
    const [loading, setLoading] = useState(false);

    // Cloudflare Turnstile, on Screen 1 only. The token is verified server-side
    // in app/api/sso/signup/lookup, so this is a real gate rather than the
    // decorative one the rest of the family renders.
    const [tnToken, setTnToken] = useState('');
    const [tnBroken, setTnBroken] = useState(false);   // the widget could not render
    const [tnNonce, setTnNonce] = useState(0);         // bumped to demand a fresh challenge

    // Screens 2A–2C are steps, not documents, so Back has to be taught what a
    // step is or it would leave the site from the middle of a sign-up.
    const pushedState = useRef(false);
    useEffect(() => {
        if (step === 'email' || step === 'success') return;
        if (!pushedState.current) {
            window.history.pushState({ kjDoorStep: step }, '');
            pushedState.current = true;
        }
        const onPop = () => { pushedState.current = false; useDifferentEmail(); };
        window.addEventListener('popstate', onPop);
        return () => window.removeEventListener('popstate', onPop);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [step]);

    const goto = useCallback((next) => { setError(''); setStep(next); }, []);

    // Editing a field answers the complaint about it. Leaving the old message
    // up contradicts what the person is now looking at.
    const edit = (set) => (v) => { set(v); if (error) setError(''); };

    // A token is spent the moment it is checked, so any outcome other than
    // leaving Screen 1 needs a fresh challenge before the next attempt.
    function resetTurnstile() {
        setTnToken('');
        setTnNonce((n) => n + 1);
    }

    function useDifferentEmail() {
        setExistingPassword('');
        setPassword('');
        setConfirmPassword('');
        setFirstName('');
        setLastName('');
        setDob('');
        goto('email');
    }

    function signedIn(data) {
        storeAuth(data);
        router.push(returnUrl);
    }

    // Whatever the Jubilee ID already knows is pre-filled and stays editable,
    // so nobody retypes what we have on file.
    function applyPrefill(data) {
        if (data.first_name) setFirstName(data.first_name);
        if (data.last_name) setLastName(data.last_name);
        if (data.date_of_birth) setDob(String(data.date_of_birth).slice(0, 10));
        goto('createlinked');
    }

    // ── Screen 1 → look the email up, then route to A, B or C ────────────
    async function handleEmailContinue(e) {
        e.preventDefault();
        const addr = email.trim();
        if (!addr) return setError('Please enter your email address to continue.');
        if (!EMAIL_RE.test(addr)) return setError('That does not look like a complete email address. Please check it.');

        if (turnstileSiteKey && !tnToken && !tnBroken) {
            return setError('Please complete the human verification.');
        }

        setEmail(addr);
        setError('');
        setLoading(true);
        const r = await postJson(apiUrl('/api/sso/signup/lookup'), { email: addr, turnstileToken: tnToken });
        setLoading(false);

        if (!r.ok || !r.data.success) {
            resetTurnstile();
            return setError(r.data.error || 'We are having trouble reaching your account right now. Please try again in a moment.');
        }
        if (r.data.existsLocally) return goto('welcome');   // Outcome A
        if (r.data.existsInSso) return goto('confirm');     // Outcome B
        return goto('form');                                // Outcome C
    }

    // ── Outcome A — verify the password and sign in ──────────────────────
    async function handleWelcomePassword(e) {
        e.preventDefault();
        if (!existingPassword) return setError('Please enter your password.');
        setError('');
        setLoading(true);
        const r = await postJson(apiUrl('/api/sso/login'), { email, password: existingPassword, rememberMe });
        setLoading(false);

        if (r.data.success && r.data.token) return signedIn(r.data);
        // An account that turns out to be new here after all — carry on to
        // 2B-2 rather than dead-ending on a password that was in fact correct.
        if (r.data.redirect === 'signup-existing') return applyPrefill(r.data);
        setError(r.data.error || 'That password does not match. Try again, or reset it below.');
    }

    // ── Outcome B, first screen — confirm the Jubilee ID password ────────
    // On success the password stays in memory only, so the Create Account
    // screen can prove ownership again when it actually creates the row.
    async function handleConfirmPassword(e) {
        e.preventDefault();
        if (!existingPassword) return setError('Please enter your password.');
        setError('');
        setLoading(true);
        const r = await postJson(apiUrl('/api/sso/login'), { email, password: existingPassword, rememberMe });
        setLoading(false);

        if (r.data.redirect === 'signup-existing') return applyPrefill(r.data);
        // Edge: an account here already exists, so just sign in.
        if (r.data.success && r.data.token) return signedIn(r.data);
        setError(r.data.error || 'That password does not match. Try again, or reset it below.');
    }

    // ── Outcome B, second screen — the visible account creation ──────────
    async function handleCreateLinked(e) {
        e.preventDefault();
        if (!firstName.trim() || !lastName.trim()) return setError('Please enter your first and last name.');
        if (dob) {
            const dobErr = validateDob(dob);
            if (dobErr) return setError(dobErr);
        }
        setError('');
        setLoading(true);
        const r = await postJson(apiUrl('/api/sso/signup/verify'), {
            email,
            password: existingPassword,
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            date_of_birth: dob || undefined,
            rememberMe,
        });
        setLoading(false);

        if (r.data.success && r.data.token) {
            storeAuth(r.data);
            return goto('success');
        }
        // The confirm screen's password no longer works — send them back to it
        // rather than leaving them on a form that cannot submit.
        if (r.status === 401) {
            setExistingPassword('');
            setStep('confirm');
            return setError(r.data.error || "That password doesn't match. Try again.");
        }
        setError(r.data.error || 'Could not create your account. Please try again.');
    }

    // ── Outcome C — create the Jubilee ID and the kJubilee account ───────
    async function handleCreateJubileeId(e) {
        e.preventDefault();
        if (!firstName.trim() || !lastName.trim()) return setError('Please enter your first and last name.');
        const dobErr = validateDob(dob);
        if (dobErr) return setError(dobErr);
        if (!password || password.length < 8) return setError('Password must be at least 8 characters.');
        // Creating a Jubilee ID is the one screen where a typo is expensive: it
        // becomes the password for every Jubilee site, and nothing here reads it
        // back to confirm. Everywhere else the password is being CHECKED, so a
        // typo just fails and is retried.
        if (password !== confirmPassword) return setError('Those passwords do not match.');

        setError('');
        setLoading(true);
        const r = await postJson(apiUrl('/api/sso/signup/register'), {
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            email,
            date_of_birth: dob,
            password,
            rememberMe,
        });
        setLoading(false);

        if (r.data.success && r.data.token) {
            storeAuth(r.data);
            return goto('success');
        }
        if (r.status === 409) {
            // The email gained an account between Screen 1 and here. Send them
            // to the password screen with the address they already typed.
            setPassword('');
            setConfirmPassword('');
            setStep('welcome');
            return setError('An account already exists for this email — please sign in.');
        }
        setError(r.data.error || 'Could not create your account. Please try again.');
    }

    const strength = password ? calcStrength(password) : null;

    return (
        <AuthShell>
                {/* ── Screen 1: the one door — email only ── */}
                {step === 'email' && (
                    <>
                        <h1 className="door-heading">Sign in with your Jubilee ID</h1>
                        <p className="door-helper">One Jubilee ID works across all our sites</p>
                        <ErrorAlert message={error} />
                        <form onSubmit={handleEmailContinue} noValidate>
                            <Field id="email" label="Email address" type="email" value={email}
                                   onChange={setEmail} required maxLength={254}
                                   autoComplete="email" autoFocus />
                            <Turnstile
                                siteKey={turnstileSiteKey}
                                onToken={(t) => { setTnToken(t); if (t) setTnBroken(false); }}
                                onUnavailable={() => { setTnToken(''); setTnBroken(true); }}
                                resetNonce={tnNonce}
                            />
                            {tnBroken && (
                                <p className="auth-alert auth-alert--notice" role="status">
                                    Human verification could not load. Please refresh the page and try again.
                                </p>
                            )}
                            <SubmitButton loading={loading} busyLabel="Checking…">Continue</SubmitButton>
                            <p className="door-disclaimer">No account yet? We&rsquo;ll set one up for you.</p>
                        </form>
                    </>
                )}

                {/* ── Screen 2A: Welcome back ── */}
                {step === 'welcome' && (
                    <>
                        <h1 className="door-heading">Welcome back</h1>
                        <ErrorAlert message={error} />
                        <AccountRow email={email} onChangeEmail={useDifferentEmail} />
                        <form onSubmit={handleWelcomePassword} noValidate>
                            <PasswordField id="existingPassword" label="Password"
                                           value={existingPassword} onChange={edit(setExistingPassword)}
                                           autoComplete="current-password" autoFocus />
                            <ForgotRow email={email} />
                            <SubmitButton loading={loading} busyLabel="Signing in…">Continue</SubmitButton>
                        </form>
                    </>
                )}

                {/* ── Screen 2B-1: Confirm it's you ── */}
                {step === 'confirm' && (
                    <>
                        <h1 className="door-heading">Confirm it&rsquo;s you</h1>
                        <p className="door-subtext">
                            This email already has a Jubilee ID. Enter your password to continue
                            and create your account on {SITE_NAME}.
                        </p>
                        <ErrorAlert message={error} />
                        <AccountRow email={email} onChangeEmail={useDifferentEmail} />
                        <form onSubmit={handleConfirmPassword} noValidate>
                            <PasswordField id="existingPassword" label="Jubilee ID password"
                                           value={existingPassword} onChange={edit(setExistingPassword)}
                                           autoComplete="current-password" autoFocus />
                            <ForgotRow email={email} />
                            <SubmitButton loading={loading} busyLabel="Checking…">Continue</SubmitButton>
                        </form>
                    </>
                )}

                {/* ── Screen 2B-2: Create your kJubilee account (no password) ── */}
                {step === 'createlinked' && (
                    <>
                        <h1 className="door-heading">Create your {SITE_NAME} account</h1>
                        <p className="door-subtext">
                            Your Jubilee ID is confirmed. Add a few details to finish creating
                            your account here.
                        </p>
                        <ErrorAlert message={error} />
                        {/* Which address this account is being created for. It was two screens
                            ago and only repeated at the very bottom, so the one question this
                            screen has to answer — whose account is this? — went unanswered. */}
                        <AccountRow email={email} onChangeEmail={useDifferentEmail} />
                        <form onSubmit={handleCreateLinked} noValidate>
                            <NameFields firstName={firstName} lastName={lastName}
                                        setFirstName={edit(setFirstName)} setLastName={edit(setLastName)} />
                            <DobField dob={dob} setDob={edit(setDob)} />
                            <RememberRow checked={rememberMe} onChange={setRememberMe} />
                            <SubmitButton loading={loading} busyLabel="Creating…">Create Account</SubmitButton>
                        </form>
                    </>
                )}

                {/* ── Screen 2C: Let's create your Jubilee ID ── */}
                {step === 'form' && (
                    <>
                        <h1 className="door-heading">Let&rsquo;s create your Jubilee ID</h1>
                        <p className="door-subtext">
                            One account gives you access to {SITE_NAME} and everything else
                            across Jubilee. It only takes a moment.
                        </p>
                        <ErrorAlert message={error} />
                        <AccountRow email={email} onChangeEmail={useDifferentEmail} />
                        <form onSubmit={handleCreateJubileeId} noValidate>
                            <NameFields firstName={firstName} lastName={lastName}
                                        setFirstName={edit(setFirstName)} setLastName={edit(setLastName)} />
                            <DobField dob={dob} setDob={edit(setDob)} />
                            <PasswordField id="password" label="Create a password"
                                           value={password} onChange={edit(setPassword)}
                                           autoComplete="new-password">
                                {strength ? (
                                    <div className="password-strength">
                                        <div className="strength-bar">
                                            <div className={`strength-fill ${strength}`} />
                                        </div>
                                        <div className={`strength-text ${strength}`}>{STRENGTH_LABEL[strength]}</div>
                                    </div>
                                ) : (
                                    <div className="password-hint">At least 8 characters</div>
                                )}
                            </PasswordField>
                            <PasswordField id="confirmPassword" label="Confirm password"
                                           value={confirmPassword} onChange={edit(setConfirmPassword)}
                                           autoComplete="new-password">
                                {confirmPassword && (
                                    <div className={`password-match ${password === confirmPassword ? 'is-match' : 'is-mismatch'}`}>
                                        {password === confirmPassword ? 'Passwords match' : 'Passwords do not match'}
                                    </div>
                                )}
                            </PasswordField>
                            <RememberRow checked={rememberMe} onChange={setRememberMe} />
                            <p className="consent-line">
                                By continuing, you agree to our{' '}
                                <a href={TERMS_URL} target="_blank" rel="noopener noreferrer">Terms of Service</a>
                                {' '}and{' '}
                                <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer">Privacy Policy</a>.
                            </p>
                            <SubmitButton loading={loading} busyLabel="Creating…">Create my Jubilee ID</SubmitButton>
                        </form>
                    </>
                )}

                {/* ── Success ── */}
                {step === 'success' && (
                    <div className="success-state">
                        <div className="success-icon-circle">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                                 strokeLinecap="round" strokeLinejoin="round">
                                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                <polyline points="22 4 12 14.01 9 11.01" />
                            </svg>
                        </div>
                        <h2>You&rsquo;re all set!</h2>
                        <p>Welcome to {SITE_NAME}. Your account is ready &mdash; the dial is waiting.</p>
                        <button type="button" className="btn-primary" onClick={() => router.push(returnUrl)}>
                            Start listening
                        </button>
                    </div>
                )}
        </AuthShell>
    );
}
