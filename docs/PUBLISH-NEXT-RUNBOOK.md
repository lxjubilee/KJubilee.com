# Publishing the Next.js frontend to kjubilee.com

Written against the **actual** state of the production box, inspected 2026-08-25.
Read all of §1 before running anything: publishing this is a runtime change, not
a file copy.

---

## 1. What production is right now

| | |
|---|---|
| Host | `jubilee-prod` — 94.72.120.231 (`SEAIIS01SERVER`), also runs jubilujah + torahsings |
| Path | `/var/www/kjubilee.com` — **not a git repo**, deployed by file copy |
| Process | systemd unit `kjubilee`, `ExecStart=/usr/bin/node server.js`, `NODE_ENV=production` |
| Runtime | **Express + static HTML.** `package.json` has no `next` and no `react` |
| Pages | `public/*.html` — the pre-door `login.html` / `signup.html` |
| Node | v20.20.0 (Next 16 needs ≥ 20.9 — fine) |
| nginx | `/etc/nginx/sites-enabled/kjubilee.com`, `server_name kjubilee.com www.kjubilee.com` |
| Free RAM | **~1.0 GB of 11.7 GB** — the rest is the other sites and the radio |
| `kj_users` | original columns only; **0 rows** |
| `.env` | no `SSO_*`, no `MAILGUN_*`, no `TURNSTILE_*` |

Two consequences worth having in mind:

- **This is a runtime swap.** Express-serving-HTML becomes Next SSR. The systemd
  unit changes, `node_modules` roughly triples, and a build step appears.
- **`kj_users` is empty.** No one has ever signed up on production, so none of
  this can break an existing account. That is the main reason the sequence below
  is safe to do in one sitting.

Also: someone deployed radio/station content to this box on 2026-08-25
(`_predeploy-20260825{,b,c}`). Coordinate before overwriting `public/`.

---

## 2. Order matters — three things break sign-in if you get it wrong

**a. Migrations first, always.** `lib/local-account.js` selects `first_name`,
`jubilee_id`, `email_verified` and `date_of_birth`. Production has none of them,
so every auth call 503s until 002 runs. 002 and 003 are additive and idempotent,
and safe against the old Express app as well.

**b. Leave `SSO_CLIENT_SECRET` OUT at first.** `sso.isConfigured()` is true the
moment that variable is set, and the production authority currently answers
`401 invalid_client` for the kjubilee pair — so setting it turns every
new-email lookup into a 503. Left empty, the door falls back to kJubilee's own
passwords and works. Add it *after* `npm run check:sso` goes green.

**c. Leave the `TURNSTILE_*` keys OUT at first.** The widget only renders on a
hostname in the site key's Cloudflare allowlist. If `kjubilee.com` is not on it,
the widget never paints, no token is produced, and enforcement refuses every
request — nobody signs in at all. With no keys set, `isEnforced()` is false and
the door simply has no challenge, which is the safe degradation. Add the keys
once you have seen the widget paint on the real domain.

Mailgun is the exception: those keys are verified working, so ship them.

---

## 3. The RAM problem

`next build` on a box with ~1 GB free will likely be OOM-killed. Two ways out:

**Build here, ship the output** (recommended). Add to `next.config.js`:

```js
output: 'standalone',
```

then `npm run build` locally and ship `.next/standalone`, `.next/static` and
`public/`. Roughly 50 MB and no `npm install` on the box.

**Or build on the box with a swapfile:**

```bash
sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
```

Do not skip this and hope. A half-finished build leaves `.next` in a state that
`next start` will not run.

---

## 4. Sequence

```bash
# ── 0. backup ────────────────────────────────────────────────────────────
ssh jubilee-prod 'cd /var/www && tar czf /root/kjubilee-predeploy-$(date +%F-%H%M).tgz \
  --exclude=node_modules --exclude=.next kjubilee.com'
# kj_users was dumped to /root/kj_users-backup-20260825-131635.sql

# ── 1. migrations (safe to run before anything else changes) ─────────────
scp migrations/002-jubilee-id.sql migrations/003-password-resets.sql \
  jubilee-prod:/var/www/kjubilee.com/migrations/
ssh jubilee-prod 'cd /var/www/kjubilee.com && npm run migrate'
# expect: ✓ 001 ✓ 002 ✓ 003

# ── 2. ship the app ──────────────────────────────────────────────────────
rsync -av --delete \
  app/ lib/ public/css/ public/js/ scripts/ tests/ deploy/ \
  middleware.js next.config.js instrumentation.js package.json package-lock.json \
  jubilee-prod:/var/www/kjubilee.com/
# server.js stays: it is the fallback and still holds the same API surface.

# ── 3. env — WITHOUT the two that break things (see §2) ──────────────────
ssh jubilee-prod 'cat >> /var/www/kjubilee.com/.env' <<'ENV'
PUBLIC_SITE_URL=https://kjubilee.com
SESSION_HOURS=12
AUTH_RATE_LIMIT_WINDOW_MS=900000
AUTH_RATE_LIMIT_MAX=30
MAILGUN_API_KEY=<the sending key>
MAILGUN_DOMAIN=kjubilee.com
MAILGUN_API_BASE=https://api.mailgun.net
EMAIL_FROM=kJubilee <noreply@kjubilee.com>
EMAIL_TEST_MODE=false
PASSWORD_RESET_TTL_MINUTES=60
PASSWORD_RESET_MAX_LIVE=3
SSO_BASE=https://sso.jubileeinspire.com
SSO_CLIENT_ID=kjubilee
SSO_SITE=kjubilee
# SSO_CLIENT_SECRET=   ← add only after `npm run check:sso` passes
# TURNSTILE_SITE_KEY=  ← add only after the widget paints on kjubilee.com
# TURNSTILE_SECRET_KEY=
ENV

# ── 4. build ─────────────────────────────────────────────────────────────
ssh jubilee-prod 'cd /var/www/kjubilee.com && npm ci --omit=dev && npm run build'

# ── 5. switch the runtime ────────────────────────────────────────────────
ssh jubilee-prod 'systemctl edit --full kjubilee'
#   ExecStart=/usr/bin/npx next start -p 3210
ssh jubilee-prod 'systemctl daemon-reload && systemctl restart kjubilee && sleep 3 && systemctl status kjubilee --no-pager | head -5'

# ── 6. api.kjubilee.com (currently 502 — no server_name for it) ──────────
scp deploy/nginx/api.kjubilee.com.conf jubilee-prod:/etc/nginx/sites-available/
ssh jubilee-prod 'ln -sf /etc/nginx/sites-available/api.kjubilee.com.conf /etc/nginx/sites-enabled/ \
  && nginx -t && systemctl reload nginx'
```

---

## 5. Verify

```bash
npm run check:api                    # every auth endpoint + the CORS allowlist
npm run check:sso                    # reachable / token / site key / lookup

curl -sI https://kjubilee.com/signin | head -1        # 200
curl -s  https://kjubilee.com/health                  # db: ok
curl -s -X POST https://kjubilee.com/api/sso/signup/lookup \
  -H 'Content-Type: application/json' -d '{"email":"you@example.com"}'
# no Turnstile keys yet -> {"success":true,"existsLocally":false,...}
```

Then in a browser: `/signin`, `/signup`, `/forgot-password`.

## 6. Rollback

```bash
ssh jubilee-prod 'systemctl stop kjubilee \
  && cd /var/www && rm -rf kjubilee.com && tar xzf /root/kjubilee-predeploy-<stamp>.tgz \
  && systemctl edit --full kjubilee    # ExecStart back to /usr/bin/node server.js
  && systemctl daemon-reload && systemctl start kjubilee'
```

The migrations do **not** need rolling back: every column they add is nullable
or defaulted, and the Express app ignores all of them.
