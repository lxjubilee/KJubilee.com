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
// The same shell JubileeInspire sends (api/services/email.js), in kJubilee's
// colours — so the family's mail reads as one family without kJubilee looking
// like a page from another site.
//
// Why this is table-based XHTML with VML inside it: mail clients are not
// browsers. Outlook renders through Word, which ignores flexbox, most
// border-radius and background-image — so the layout is nested tables, the
// button carries a VML fallback behind an MSO conditional, and every colour is
// set as an attribute as well as a style. Markup that looks modern here arrives
// as an unreadable mess in the client a large share of people actually use.
const BRAND = {
    accent: '#3DA5FF',       // the kJubilee blue: card border, wordmark, links
    accentInk: '#06182b',    // text sitting ON the accent
    card: '#2d2d2d',
    page: '#c0c0c0',
    rule: '#404040',
    ink: '#ffffff',
    inkDim: '#cccccc',
    support: 'https://jubileeverse.com/support',
};

const LOGO_URL = () => `${SITE_URL}/images/members/JubileeInspire-Circle-200.png`;

/**
 * The one email shell, ported from JubileeInspire's buildVerificationEmailHtml.
 *
 * Pass `code` and a code box renders; leave it null and the expiry line moves
 * below the button instead. A button needs both buttonText and actionUrl.
 */
function buildEmailHtml({ heading, subheading, code, expiryText, buttonText, actionUrl, footerNote }) {
    const codeBlock = code ? `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td align="center" bgcolor="#1a1a1a" style="background-color:#1a1a1a; padding:24px; border:1px solid ${BRAND.rule}; border-radius:8px;">
              <p style="margin:0 0 12px 0; font-family:Arial,Helvetica,sans-serif; font-size:12px; color:${BRAND.ink}; text-transform:uppercase; letter-spacing:1px;">Your verification code</p>
              <p style="margin:0; font-family:'Courier New',Courier,monospace; font-size:32px; font-weight:700; color:${BRAND.accent}; letter-spacing:8px;">${code}</p>
              ${expiryText ? `<p style="margin:16px 0 0 0; font-family:Arial,Helvetica,sans-serif; font-size:13px; color:${BRAND.ink};">${expiryText}</p>` : ''}
            </td></tr>
          </table>` : '';

    const expiryBelowButton = !code && expiryText ? `
          <p style="margin:20px 0 0 0; font-family:Arial,Helvetica,sans-serif; font-size:13px; color:${BRAND.inkDim};">${expiryText}</p>` : '';

    // The button is the accent rather than JI's black: on a #2d2d2d card a black
    // button is nearly invisible, and this is the one thing the eye should land on.
    const buttonBlock = (buttonText && actionUrl) ? `
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:40px auto 0 auto;">
            <tr><td align="center">
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${actionUrl}" style="height:52px;v-text-anchor:middle;width:300px;" arcsize="16%" stroke="f" fillcolor="${BRAND.accent}">
              <w:anchorlock/>
              <center style="color:${BRAND.accentInk};font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:600;">${buttonText}</center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-- -->
              <a href="${actionUrl}" target="_blank" style="display:inline-block; padding:16px 32px; background-color:${BRAND.accent}; color:${BRAND.accentInk}; font-family:Arial,Helvetica,sans-serif; font-size:16px; font-weight:600; text-decoration:none; border-radius:8px; mso-hide:all;">${buttonText}</a>
              <!--<![endif]-->
            </td></tr>
          </table>` : '';

    // The link in full as well: a button cannot be copy-pasted, and some clients
    // strip them outright.
    const plainUrl = actionUrl ? `
          <p style="margin:24px 0 0 0; font-family:Arial,Helvetica,sans-serif; font-size:12px; color:${BRAND.inkDim}; line-height:1.6; word-break:break-all;">
            Or paste this into your browser:<br />
            <a href="${actionUrl}" style="color:${BRAND.accent}; text-decoration:none;">${actionUrl}</a>
          </p>` : '';

    return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" lang="en">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>kJubilee.com</title>
<!--[if mso]>
<noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
<![endif]-->
<style type="text/css">
  body { margin:0; padding:0; background-color:${BRAND.page}; }
  table { border-collapse:collapse; mso-table-lspace:0pt; mso-table-rspace:0pt; }
  img { border:0; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; display:block; }
  a { text-decoration:none; }
</style>
</head>
<body style="margin:0; padding:0; background-color:${BRAND.page};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BRAND.page}" style="background-color:${BRAND.page};">
    <tr><td align="center" style="padding:40px 20px;">
      <!--[if mso]>
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td>
      <![endif]-->
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="${BRAND.card}" style="width:600px; max-width:600px; background-color:${BRAND.card}; border-radius:16px; border:3px solid ${BRAND.accent}; border-collapse:separate; mso-border-alt:solid ${BRAND.accent} 3px;">
        <tr><td align="center" style="padding:48px 40px;">

          <img src="${LOGO_URL()}" alt="kJubilee" width="72" height="72" style="display:block; border:3px solid ${BRAND.accent}; border-radius:50%;" />

          <div style="font-family:Cambria,Georgia,'Times New Roman',serif; font-size:51px; font-weight:bold; color:${BRAND.ink}; line-height:1; padding-top:12px;">
            <span style="font-size:44px;">k</span><span style="color:${BRAND.accent};">Jubilee</span>.com
          </div>

          <h1 style="margin:32px 0 16px 0; font-family:Arial,Helvetica,sans-serif; font-size:28px; font-weight:600; color:${BRAND.ink}; line-height:1.3;">${heading}</h1>

          <p style="margin:0 0 24px 0; font-family:Arial,Helvetica,sans-serif; font-size:16px; color:${BRAND.ink}; line-height:1.5;">${subheading}</p>
${codeBlock}${buttonBlock}
${expiryBelowButton}${plainUrl}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:40px;">
            <tr><td height="1" style="border-top:1px solid ${BRAND.rule}; font-size:0; line-height:0;">&nbsp;</td></tr>
          </table>

          <p style="margin:24px 0 8px 0; font-family:Arial,Helvetica,sans-serif; font-size:14px; color:${BRAND.ink}; line-height:1.5;">${footerNote}</p>
          <p style="margin:0; font-family:Arial,Helvetica,sans-serif; font-size:14px; color:${BRAND.ink}; line-height:1.5;">Need help? Contact <a href="${BRAND.support}" style="color:${BRAND.accent}; text-decoration:none;">Jubilee Support</a></p>

        </td></tr>
      </table>
      <!--[if mso]>
      </td></tr></table>
      <![endif]-->
    </td></tr>
  </table>
</body>
</html>`;
}

function passwordResetEmail({ to, resetUrl, minutes, firstName }) {
    const hi = firstName || 'there';
    return {
        to,
        subject: 'Reset your kJubilee.com password',
        // Plain text is the message, not an afterthought: it is what a text-only
        // client shows, and what a spam filter reads when it distrusts the HTML.
        text: [
            `Hi ${hi},`,
            '',
            'Someone asked to reset the password for your Jubilee ID on kJubilee.com.',
            '',
            'Open this link to choose a new one:',
            resetUrl,
            '',
            `This link expires in ${minutes} minutes and can be used once.`,
            '',
            "If you didn't request a password reset, you can safely ignore this email and your password will stay the same.",
        ].join('\n'),
        html: buildEmailHtml({
            heading: 'Reset your password',
            subheading: `Hi ${hi}, click the button below to choose a new password.`,
            code: null,
            expiryText: `This link expires in ${minutes} minutes and can be used once.`,
            buttonText: 'Reset password',
            actionUrl: resetUrl,
            footerNote: "If you didn't request a password reset, you can safely ignore this email and your password will stay the same.",
        }),
    };
}

// firstName is optional on purpose: a reset can be issued for a Jubilee ID that
// has no kJubilee account, and the authority's lookup only answers exists/not.
// The greeting falls back to "there" rather than the flow refusing to send.
function sendPasswordResetEmail({ to, token, minutes, firstName }) {
    const resetUrl = `${SITE_URL}/reset-password?token=${encodeURIComponent(token)}`;
    return sendEmail(passwordResetEmail({ to, resetUrl, minutes, firstName }));
}

module.exports = {
    provider, isConfigured, sendEmail, TEST_MODE,
    sendPasswordResetEmail, passwordResetEmail, buildEmailHtml,
    DEFAULT_FROM, SITE_URL, MAILGUN_DOMAIN,
};
