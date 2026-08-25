'use strict';

// ─────────────────────────────────────────────────────────────────────────
// Outbound transactional email — one choke point, Mailgun transport.
//
// The same shape the rest of the family uses (JubileeInspire, Jubilujah,
// TorahSings): dependency-free, POSTing to the Mailgun HTTP API with the global
// fetch, so there is no SMTP client and no SDK to keep current.
//
// Provider is chosen from the environment:
//   MAILGUN_API_KEY + MAILGUN_DOMAIN set  → Mailgun
//   otherwise                             → dev transport, which LOGS the
//                                           message and returns success
// so a box with no keys still runs every code path end to end.
//
// ── Two things about kjubilee.com specifically ──────────────────────────
//
// 1. `from` MUST be on the Mailgun sending domain. kjubilee.com publishes
//    DMARC `p=reject`, so a message from any other domain is not merely
//    unaligned — receivers are being told to throw it away. DEFAULT_FROM below
//    is the aligned address and should not be overridden with a
//    @jubileeinspire.com sender, which is the mistake TorahSings shipped.
//
// 2. Click tracking is forced OFF on every send. Mailgun rewrites tracked
//    links through its own host, and a one-time password-reset link that has
//    been rewritten is a one-time link someone else's infrastructure can see
//    and replay.
// ─────────────────────────────────────────────────────────────────────────

const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY || '';
const MAILGUN_DOMAIN  = process.env.MAILGUN_DOMAIN || 'kjubilee.com';
const MAILGUN_BASE    = process.env.MAILGUN_API_BASE || 'https://api.mailgun.net';

const DEFAULT_FROM = process.env.EMAIL_FROM || `kJubilee <noreply@${MAILGUN_DOMAIN}>`;

const SITE_DOMAIN = process.env.SITE_DOMAIN || 'kjubilee.com';
const SITE_URL = (process.env.PUBLIC_SITE_URL || `https://${SITE_DOMAIN}`).replace(/\/+$/, '');

const TIMEOUT_MS = parseInt(process.env.EMAIL_TIMEOUT_MS || '15000', 10);

// Mailgun's test mode: the message is authenticated, validated and logged, and
// then delivered to NOBODY. It is how the reset flow gets exercised end to end
// on a staging box without mailing real people, and how the credentials were
// checked without sending anything.
const TEST_MODE = process.env.EMAIL_TEST_MODE === 'true';

function provider() {
    if (process.env.EMAIL_PROVIDER === 'dev') return 'dev';
    return MAILGUN_API_KEY && MAILGUN_DOMAIN ? 'mailgun' : 'dev';
}

function isConfigured() {
    return provider() === 'mailgun';
}

async function sendViaMailgun({ to, subject, text, html, from }) {
    const body = new URLSearchParams({
        from: from || DEFAULT_FROM,
        to,
        subject,
        text,
        // Never let a one-time link be rewritten through a click tracker.
        'o:tracking': 'no',
        'o:tracking-clicks': 'no',
        'o:tracking-opens': 'no',
    });
    if (html) body.set('html', html);
    if (TEST_MODE) body.set('o:testmode', 'yes');

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
        const res = await fetch(`${MAILGUN_BASE}/v3/${MAILGUN_DOMAIN}/messages`, {
            method: 'POST',
            headers: {
                Authorization: 'Basic ' + Buffer.from(`api:${MAILGUN_API_KEY}`).toString('base64'),
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body,
            signal: ctrl.signal,
        });
        const payload = await res.text();
        if (!res.ok) {
            console.error('[email] mailgun rejected the message:', res.status, payload.slice(0, 300));
            return { success: false, provider: 'mailgun', status: res.status };
        }
        let id = null;
        try { id = JSON.parse(payload).id || null; } catch { /* Mailgun always sends JSON, but do not depend on it */ }
        return { success: true, provider: 'mailgun', id, testMode: TEST_MODE || undefined };
    } catch (e) {
        console.error('[email] mailgun unreachable:', e && e.message);
        return { success: false, provider: 'mailgun', status: 0 };
    } finally {
        clearTimeout(timer);
    }
}

// No keys — say what would have been sent and carry on. This is what lets the
// reset flow be exercised on a box that cannot send.
function sendViaDev({ to, subject, text }) {
    console.log(`[email:dev] to=${to} subject=${JSON.stringify(subject)}\n${text}\n`);
    return { success: true, provider: 'dev' };
}

async function sendEmail(message) {
    if (!message || !message.to || !message.subject) {
        return { success: false, provider: provider(), error: 'to and subject are required' };
    }
    return provider() === 'mailgun' ? sendViaMailgun(message) : sendViaDev(message);
}

// ── Templates ────────────────────────────────────────────────────────────
// Plain text is the message; the HTML is the same words with the site's colours
// on them. Both carry the link verbatim so a client that mangles one still
// leaves the other usable.

const BRAND_GOLD = '#f0ad4e';
const BRAND_INK = '#1f2937';

function layout(bodyHtml) {
    return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f4f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;padding:32px;font-family:'Segoe UI',Helvetica,Arial,sans-serif;color:${BRAND_INK};">
<tr><td style="font-family:'Trebuchet MS',Helvetica,Arial,sans-serif;font-size:24px;font-weight:700;padding-bottom:20px;">
<span style="color:${BRAND_INK};">k</span><span style="color:#3DA5FF;">Jubilee</span><span style="color:${BRAND_INK};">.com</span>
</td></tr>
${bodyHtml}
<tr><td style="padding-top:28px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.6;">
You are receiving this because someone asked to reset the password for this address on kJubilee.com.
If that was not you, nothing has changed and you can ignore this message.
</td></tr>
</table></td></tr></table></body></html>`;
}

function passwordResetEmail({ to, resetUrl, minutes }) {
    const subject = 'Reset your kJubilee password';
    const text = [
        'Someone asked to reset the password for your Jubilee ID on kJubilee.com.',
        '',
        'Open this link to choose a new one:',
        resetUrl,
        '',
        `The link works once and expires in ${minutes} minutes.`,
        '',
        'If you did not ask for this, you can ignore this email — your password has not changed.',
    ].join('\n');

    const html = layout(`
<tr><td style="font-size:19px;font-weight:600;padding-bottom:12px;">Reset your password</td></tr>
<tr><td style="font-size:15px;line-height:1.65;padding-bottom:24px;">
Someone asked to reset the password for your Jubilee ID on kJubilee.com. Choose a new one below &mdash;
the link works once and expires in ${minutes} minutes.
</td></tr>
<tr><td style="padding-bottom:24px;">
<a href="${resetUrl}" style="display:inline-block;background:${BRAND_GOLD};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:13px 26px;border-radius:8px;">Choose a new password</a>
</td></tr>
<tr><td style="font-size:13px;line-height:1.6;color:#6b7280;padding-bottom:4px;">
If the button does not work, paste this into your browser:
</td></tr>
<tr><td style="font-size:13px;line-height:1.6;word-break:break-all;">
<a href="${resetUrl}" style="color:${BRAND_GOLD};">${resetUrl}</a>
</td></tr>`);

    return { to, subject, text, html };
}

function sendPasswordResetEmail({ to, token, minutes }) {
    const resetUrl = `${SITE_URL}/reset-password?token=${encodeURIComponent(token)}`;
    return sendEmail(passwordResetEmail({ to, resetUrl, minutes }));
}

module.exports = {
    provider, isConfigured, sendEmail, TEST_MODE,
    sendPasswordResetEmail, passwordResetEmail,
    DEFAULT_FROM, SITE_URL, MAILGUN_DOMAIN,
};
