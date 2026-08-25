'use client';

/* ─────────────────────────────────────────────────────────────────────────
   The password input, and the two things that go under it.

   Shared because there are now three screens that set a password — create a
   Jubilee ID, and both halves of a reset — and the eye toggle, the strength
   meter and the match line had started being written out once per screen.

   ── Where a confirm field belongs, and where it does not ──
   Only on screens that SET a password. Those are write-only: nothing reads the
   value back, and a typo is discovered later, by being locked out. Screens that
   CHECK a password — sign in, confirm it's you — need no confirm field, because
   a typo there simply fails and is retried in the next five seconds.
   ───────────────────────────────────────────────────────────────────────── */

import { useState } from 'react';

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

export function calcStrength(pw) {
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

export const STRENGTH_LABEL = { weak: 'Weak password', fair: 'Fair password', strong: 'Strong password' };

/** The bar and its label, or the plain hint before anything has been typed. */
export function PasswordStrength({ value }) {
    if (!value) return <div className="password-hint">At least 8 characters</div>;
    const s = calcStrength(value);
    return (
        <div className="password-strength">
            <div className="strength-bar"><div className={`strength-fill ${s}`} /></div>
            <div className={`strength-text ${s}`}>{STRENGTH_LABEL[s]}</div>
        </div>
    );
}

/** Shown only once the confirm field has something in it — silent until then. */
export function PasswordMatch({ password, confirm }) {
    if (!confirm) return null;
    const match = password === confirm;
    return (
        <div className={`password-match ${match ? 'is-match' : 'is-mismatch'}`}>
            {match ? 'Passwords match' : 'Passwords do not match'}
        </div>
    );
}

export default function PasswordField({
    id, label, value, onChange, autoComplete = 'current-password',
    autoFocus = false, minLength, children,
}) {
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
                    minLength={minLength}
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
