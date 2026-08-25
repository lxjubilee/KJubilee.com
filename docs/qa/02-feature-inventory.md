# Feature Inventory — JubileeVerse.com (consolidated)

Complete catalog of every visitor-facing feature, the page or endpoint
that delivers it, and the dependencies between them. This document is
the **map** — open it when you need to find the right test case, scope a
PR, or understand what depends on what.

All file:line refs are in `C:\Websites\JubileeVerse.com\` unless noted.

---

## Architecture summary

```
                                    ┌─────────────────────────────┐
                                    │  Cloudflare (CDN + WAF)     │
                                    └──────────────┬──────────────┘
                                                   │
                                    ┌──────────────▼──────────────┐
                                    │   Express server.js         │  port 3107
                                    │   (21,031 lines, monolith)  │
                                    └──────┬──────────────┬───────┘
                                           │              │
            ┌─────────────────┐           │              │           ┌────────────────┐
            │  Postgres       │◄──────────┘              └──────────►│  External APIs │
            │  (jv_articles,  │                                      │  - InspireCodex│
            │   jv_users,     │           ┌──────────────┐           │  - Anthropic   │
            │   jv_cms_…)     │           │  S3 (images) │◄──────────│  - OpenAI      │
            └─────────────────┘           └──────────────┘           │  - Leonardo    │
                                                                      │  - RSS sources │
                                                                      │  - Email/SMTP  │
                                                                      └────────────────┘

   Visitor browser ─► fetches public/*.html (static)
                  └── inline JS calls /api/* (CSRF-token-gated for /api/)
```

### Stack

| Layer | Tech |
|---|---|
| HTTP server | Node 20 LTS + Express 4.21 |
| Static files | `public/` served by Express static middleware |
| Auth | Cookie-based session + JWT, OTP (otplib), QR (qrcode) |
| Security middleware | Helmet, CORS, rate-limit (login + back-office), CSRF (custom: `jv-csrf` cookie + `x-csrf-token` header) |
| Database | Postgres 13+ via `pg` (`pgPool`) — table prefix `jv_*` |
| Email | Nodemailer (optional — `SMTP_HOST` env) |
| Image storage | AWS S3 (`@aws-sdk/client-s3`, `s3-request-presigner`) |
| External APIs | InspireCodex (content), Anthropic, OpenAI, Leonardo (image gen), Grok |
| WebSocket | `ws` library — admin / monitoring channel |
| Logging | Morgan (HTTP), console (everywhere else) |
| HTML sanitisation | `sanitize-html` for any user-generated rich text |

---

## 1. Public pages (in scope)

### 1.1 Homepage — `public/index.html`

The MSN-style bento landing page.

- Renders article cards from `/api/v1/content` and recent current events.
- Daily verse strip — `/api/daily-verse`.
- Newsletter signup form — POSTs to `/api/newsletter/subscribe`.
- Top navigation: links to article topics (Music, Prayer, Radio, Music, Weather, Sports, Finance, etc.).
- Theme: dark MSN-style (CSS vars: `--bg-primary`, `--accent-gold`).
- CSP enforced via `<meta http-equiv="Content-Security-Policy">` at top of file.
- **Dependencies:** `/api/v1/content`, `/api/daily-verse`, `/api/newsletter/subscribe`.

### 1.2 Article view — `public/article.html`

Single-article display. URL pattern: `/article.html?id=<articleId>` or `/article.html?slug=<slug>`.

- Fetches article by id/slug from `/api/v1/content/:slug` or `/api/current-events/article/:id`.
- Renders title, hero image, body, author bio, related articles.
- Comment / share buttons (if implemented).
- **Dependencies:** `/api/v1/content/:slug`, `/api/current-events/article/:id`.

### 1.3 Scanner — `public/scanner.html`

News scanner dashboard. Fetches RSS feeds from major sources via the proxy.

- Source toggle (CNN / NYT / Fox News / Yahoo / MSN).
- Calls `/api/scanner/rss/:source`.
- Displays parsed articles with thumbnails.
- "Run topic pipeline" admin action posts to `/api/scanner/run-topic-pipeline` (admin-gated).
- **Dependencies:** `/api/scanner/rss/:source`, optional `/api/scanner/run-topic-pipeline`.

### 1.4 Search — `public/search.html`

Full-text search across articles + content.

- Calls `/api/v1/search?q=<query>` for keyword search.
- Optional semantic search via `POST /api/v1/search/semantic`.
- **Dependencies:** `/api/v1/search`, `/api/v1/search/semantic`.

### 1.5 Prayer — `public/prayer.html`

Prayer submission and prayer wall.

- Submit form posts a prayer (auth-gated).
- Crisis-keyword detection (matches the radio page's prayer modal logic).
- **Dependencies:** Likely shares prayer endpoints with `radio.html`'s modal; verify in code.

### 1.6 Radio — `public/radio.html`

The Jubilee Radio listener.

- **Covered separately** in the Radio QA suite at
  `C:\Websites\JubileeVerse.com-Radio\radio\qa\`.
- This consolidated suite includes only smoke-level checks (page loads,
  default station tunes, no console errors).
- See [`07-radio-cross-reference.md`](07-radio-cross-reference.md).

### 1.7 Music — `public/music.html`

Music discovery / featured albums (separate from radio listener).

### 1.8 Weather — `public/weather.html`

Weather page — likely an integrated widget, may or may not have a dedicated API endpoint.

### 1.9 Sports — `public/sports.html`

Sports content. Hits `/api/sports`.

### 1.10 Finance — `public/finance.html`

Finance content.

### 1.11 Hope Restored — `public/hope-restored.html`

Themed content area / landing page.

### 1.12 Sign In — `public/signin.html` / `public/login.html`

Two entry points to login. Either is the canonical login page; both should redirect users into the auth flow.

- Submits via `POST /api/auth/login` or `POST /auth/local-login`.
- Login is rate-limited via `loginLimiter` (radio.html:1186).
- Sets `jv-csrf` cookie + `jv-session` (or similar) cookie on success.

### 1.13 Sign Up — `public/signup.html`

Account registration.

- Posts to `POST /api/auth/register`.
- Likely sends a verification email (depends on `SMTP_HOST`).

### 1.14 Forgot Password — `public/forgot-password.html`

Password reset request.

- Posts an email address; server sends a reset token email.
- Token-clicked URL lands on a reset form (specific route TBD in code).

### 1.15 Settings — `public/settings.html`

Authenticated user settings page.

- Profile fields, notification preferences, MFA setup/disable.
- Hits `/api/auth/me`, `/api/auth/mfa/setup`, plus profile-update endpoints.

### 1.16 Privacy — `public/privacy.html`

Static privacy policy.

### 1.17 Terms — `public/terms.html`

Static terms of service.

### 1.18 Welcome — `public/welcome/index.html` + `public/welcome.mp4`

Welcome / onboarding page with intro video.

### 1.19 Chat — `public/chat/index.html`

Chat interface (likely AI-assistant chat or community chat — confirm in code).

### 1.20 Admin pages — `public/admin/*.html`

- `dashboard.html` — admin landing.
- `articles.html` — article management.
- `article.html` — single-article admin edit view.

These are **public files** but should be auth-gated server-side.
Test cases include both auth-gate enforcement and (with admin login) the
positive flows.

### 1.21 Reviewer activity — `public/reviewer-activity.html`

Likely an admin dashboard for content reviewers. Hits `/api/admin/reviewer-activity`.

---

## 2. Public APIs (in scope)

### 2.1 Health / status

| Endpoint | Method | Purpose | Auth |
|---|---|---|---|
| `/health` | GET | Liveness probe | No |
| `/status/connection` | GET | Connection / DB / SSH-tunnel status | No |
| `/api/metrics` | GET | Server metrics | No (verify) |

### 2.2 Content

| Endpoint | Method | Purpose | Auth |
|---|---|---|---|
| `/api/v1/content` | GET | List content (filters: `category_id`, `content_type`, `limit`, `offset`) | No |
| `/api/v1/content/:slug` | GET | Single content item | No |
| `/api/v1/taxonomy/:type` | GET | List taxonomy entries | No |
| `/api/v1/taxonomy/:type/:slug` | GET | Single taxonomy item | No |
| `/api/v1/sites/:domain/nav` | GET | Site navigation menu | No |
| `/api/v1/sites/:domain/feed` | GET | Site feed (RSS / JSON) | No |
| `/api/v1/portal/public/:portalId` | GET | Public portal page data | No |

### 2.3 Devotionals & Series (referenced in legacy README)

| Endpoint | Method | Purpose | Auth |
|---|---|---|---|
| `/api/devotionals` | GET | List devotionals | No |
| `/api/devotionals/:id/days` | GET | Days in a devotional | No |
| `/api/series` | GET | List sermon series | No |
| `/api/knowledge` | GET | Knowledge-base search | No |
| `/api/categories` | GET | Categories list | No |

### 2.4 Daily content

| Endpoint | Method | Purpose | Auth |
|---|---|---|---|
| `/api/daily-verse` | GET | Today's scripture verse | No |
| `/api/sports` | GET | Sports content | No |

### 2.5 Scanner / RSS

| Endpoint | Method | Purpose | Auth |
|---|---|---|---|
| `/api/scanner/rss/:source` | GET | Proxy + parse RSS | No (read) |
| `/api/scanner/rss-topic/:topic` | GET | Topic-filtered RSS | No |
| `/api/scanner/images` | GET | List downloaded images | Admin |
| `/api/scanner/download-image` | POST | Download an image from RSS | Admin |
| `/api/scanner/images/:filename` | DELETE | Remove a downloaded image | Admin |

### 2.6 Search

| Endpoint | Method | Purpose | Auth |
|---|---|---|---|
| `/api/v1/search` | GET | Keyword search | No |
| `/api/v1/search/semantic` | POST | Semantic / vector search via Qdrant | No |

### 2.7 Newsletter

| Endpoint | Method | Purpose | Auth |
|---|---|---|---|
| `/api/newsletter/subscribe` | POST | Subscribe email | No |
| `/api/newsletter/unsubscribe` | POST | Unsubscribe (token-based) | No |

### 2.8 Radio (covered in Radio QA)

| Endpoint | Method | Purpose | Auth |
|---|---|---|---|
| `/api/radio/favorites` | GET / POST | List / add favorite | Yes |
| `/api/radio/favorites/:stationId` | DELETE | Remove favorite | Yes |
| `/api/radio/favorites/check/:stationId` | GET | Is station favorited? | Yes |
| `/api/radio/follows` | GET / POST | List / add follow | Yes |
| `/api/radio/follows/:stationId` | DELETE | Remove follow | Yes |

### 2.9 Auth

| Endpoint | Method | Purpose | Notes |
|---|---|---|---|
| `/api/auth/register` | POST | Create account | Sends verification email if SMTP configured |
| `/auth/login` | GET | Login page (server-rendered) | |
| `/auth/local-login` | POST | Local credential login | URL-encoded body |
| `/auth/callback` | GET | OAuth callback | |
| `/auth/logout` | POST | Logout | |
| `/api/auth/login` | POST | API login | **Rate-limited** (`loginLimiter`) |
| `/api/auth/me` | GET | Current user | Cookie-based |
| `/api/auth/logout` | POST | API logout | |
| `/api/auth/refresh` | POST | Refresh session | |
| `/api/auth/mfa/setup` | POST | TOTP enrol | Returns QR-code + secret |

### 2.10 Site config (for the homepage shell)

| Endpoint | Method | Purpose | Auth |
|---|---|---|---|
| `/api/v1/sites/:domain/config` | GET | Site-level config (theme, nav, branding) | No |
| `/api/v1/sites/:domain/portal` | GET | Portal data | No |
| `/api/v1/sites/:domain/pages` | GET | List pages on the site | No |
| `/api/v1/sites/:domain/pages/:slug` | GET | Single page data | No |
| `/api/v1/sites/:domain/taxonomy` | GET | Site taxonomy | No |

---

## 3. Cross-cutting concerns

### 3.1 Security middleware (already in code — to test)

| Mechanism | Where | Test |
|---|---|---|
| **Helmet** | `app.use(helmet({...}))` at server.js:1067 | Confirm response headers contain `x-content-type-options`, `x-frame-options`, etc. |
| **CSP** | Each `public/*.html` declares its own `<meta http-equiv="Content-Security-Policy">` | Lighthouse / browser console — no CSP violations |
| **HSTS** | Helmet default | `strict-transport-security: max-age=31536000` on responses |
| **CORS** | `cors()` middleware | Cross-origin requests from approved origins succeed; others rejected |
| **CSRF** | Custom: `jv-csrf` cookie + `x-csrf-token` header. `app.use('/api/', requireCsrf)` at server.js:1164 | POST/DELETE without matching cookie+header → 403 |
| **Rate limit (login)** | `loginLimiter` at server.js:1186 | After ~10 rapid login attempts → 429 |
| **Rate limit (back-office)** | `backOfficeLimiter` at server.js:1194 / applied 1202 | Burst on /api/* → 429 eventually |
| **Crash protection** | `process.on('uncaughtException', ...)` at server.js:8 | Server stays alive on errors |

### 3.2 Static assets

- `public/images/jubilee-profile.png` — favicon (referenced as `/favicon.svg` and `/favicon.ico` redirect to it).
- `public/welcome.mp4` — onboarding video.
- `public/js/site-translate.js` — site-wide translation utility (loaded by all pages).

### 3.3 Responsive breakpoints (varies by page)

Most pages share these CSS-var-driven breakpoints:

| Width | Behaviour |
|---|---|
| ≥ 1280 px | Full desktop bento layout |
| 768 – 1279 px | Tablet — narrowed columns |
| ≤ 767 px | Mobile — single-column |

Radio page has its own breakpoints (1024 / 768 / 720 / 640 / 600 px) — see Radio QA.

---

## 4. Existing automated tests

The repo already has Jest tests (`npm test`):

| Path | Count | Purpose |
|---|---|---|
| `tests/stubs/` | 41 files | Stubs for spec sections (taxonomy navigation, AI generation, multi-object publishing, role enforcement, search, revision history, SSO, MFA, permissions, prompt tree, automation tree, etc.) |
| `tests/integration/` | 9 files | Integration tests: `auth.test.js`, `image-regeneration.test.js`, `security.test.js`, `workflow.test.js`, `section13-acceptance.test.js`, plus helpers and setup |
| `tests/load/` | 1 file | Artillery load test (`load-test.yml`) |

These run via `npm test` / `npm run test:unit` / `npm run test:integration`.
The QA suite documented here **complements** these — manual + cross-browser + visual + visitor flows that automated unit tests don't cover.

---

## 5. Out-of-scope (catalogued only)

These exist in the codebase and are inventoried here for awareness, but
are NOT covered by the test cases in `03-test-cases.csv`. They each
deserve their own focused test plan.

### 5.1 Cockpit admin SPA (`cockpit/`)

Separate React + Vite TypeScript app. Component areas: content, dashboard,
editor, layout, shell, taxonomy, workspace, ui. Hooks: `useImages`, etc.
Pages and routes inside the SPA need their own QA pass.

### 5.2 Image-generation pipeline (`/api/v1/images/*`)

50+ endpoints across counts, queue, generate, webhook, checkout, approve,
reject, requeue, archive, prompt edit, regenerate, diagnostics, plus an
async setup-real-tests endpoint. Drives Leonardo / OpenAI / Anthropic
image providers; routes through Postgres queues.

### 5.3 Automation engine (`/api/v1/automation-*`, `workers/automation-queue.js`)

Automation tree CRUD, automation jobs (run/pause/cancel/retry), templates,
dashboard. Scheduled by worker processes.

### 5.4 Prompt tree (`/api/v1/prompt-tree`)

Hierarchical prompt management. Used by content team for AI-assisted writing.

### 5.5 Multi-site / satellite syncing

`/api/v1/sites/:siteId/*`, `/api/v1/admin/satellite/*`. Drives content
distribution to satellite domains.

### 5.6 OAuth integrations (`/api/v1/oauth-tokens`, `/api/v1/oauth/*`)

Provider-specific OAuth (Google / Microsoft / etc.) for back-office connections.

### 5.7 Newsletter admin (`/api/newsletter/subscribers`, `/api/newsletter/export`)

Subscriber CSV export. Visitor signup is in scope; admin export is out.

### 5.8 Author / persona / generation

`/api/authors/*`, `/api/persona/*`, `/api/generate/*`. Editorial tools.

### 5.9 Worker processes

`workers/automation-queue.js`, `workers/bulk-markdown-generation.js`,
`workers/bulk-subcategory-generation.js`. Run as Windows services via
WinSW (`daemon/`).

### 5.10 The 1 MB monolith server.js

Refactoring concern, not a QA concern. The QA assumes the routes work as
documented; it doesn't audit the file structure.

---

## 6. Dependencies map

```
                  ┌─────────────────────────────────────────┐
                  │              Visitor pages              │
                  └───────────────────┬─────────────────────┘
                                      │
        ┌─────────────────────────────┼─────────────────────────────┐
        │                             │                             │
        ▼                             ▼                             ▼
   ┌─────────────┐            ┌─────────────┐            ┌─────────────────┐
   │  /api/v1/*  │            │  /api/auth/*│            │  External APIs  │
   │  content    │            │  register   │            │  (RSS, sports,  │
   │  search     │            │  login/MFA  │            │   InspireCodex) │
   │  taxonomy   │            │  refresh    │            │                 │
   └──────┬──────┘            └──────┬──────┘            └────────┬────────┘
          │                          │                             │
          │                          │                             │
          ▼                          ▼                             ▼
   ┌─────────────┐            ┌─────────────┐            ┌─────────────────┐
   │  Postgres   │            │  Postgres   │            │  upstream HTTP  │
   │  (content   │            │  (sessions, │            │  rate-limited / │
   │   tables)   │            │   users)    │            │  retried        │
   └─────────────┘            └─────────────┘            └─────────────────┘

   The Radio page (radio.html) uses /api/radio/favorites + /api/radio/follows
   and 5 Icecast streams at radio.jubileeverse.com/stream/{adult,kids-3-5,
   kids-6-8,gospel,celestial}. Full Radio coverage in the dedicated suite.
```
