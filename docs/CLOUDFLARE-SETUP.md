# Cloudflare Setup — `kjubilee.com`

DNS records, R2 access, and proxy settings the operator needs to configure on
the Cloudflare dashboard for kJubilee to go live.

> ⚠️ I (the assistant) **cannot** execute Cloudflare API calls from this
> sandbox — that requires a Cloudflare API token I don't have. The steps below
> are what to click / what to set, plus optional API equivalents if you prefer
> the `cloudflared` CLI.

---

## 1. DNS records (zone: `kjubilee.com`)

Create the kJubilee zone in Cloudflare first if it doesn't exist
(*Dashboard → Add a site*).

| Type | Name | Content | Proxy | TTL | What it's for |
|---|---|---|---|---|---|
| `A` (or `CNAME`) | `kjubilee.com` (root) | the Node app host IP | **Proxied** ✓ | Auto | the player site + API |
| `A` (or `CNAME`) | `radio` | the Icecast host IP | **Proxied** ✓ | Auto | streams: `radio.kjubilee.com/stream/<format>` |
| `CNAME` | `www` | `kjubilee.com` | **Proxied** ✓ | Auto | canonical alias |

> `cdn.kjubilee.com` is **not** needed — kJubilee reuses the existing
> `cdn.jubileeverse.com` bucket. The player URLs already point at it (see
> [`../public/radio.html`](../public/radio.html) `localizeCdnUrl`).

### 1.1 SSL / TLS

- **Edge Certificates** → enable.
- **SSL/TLS encryption mode** → **Full** (the Node app runs HTTP on the origin
  behind Cloudflare; the Icecast box too — Cloudflare terminates TLS).
- **Always Use HTTPS** → ON.
- **Automatic HTTPS Rewrites** → ON.

### 1.2 Rules

Add these in the **Rules → Cache Rules** UI:

| Rule name | If URL matches | Action |
|---|---|---|
| **Bypass cache for streams** | `(http.host eq "radio.kjubilee.com")` | **Bypass cache** |
| **Long-cache audio** | `(http.host eq "cdn.jubileeverse.com" and http.request.uri.path matches "\\.(mp3\|m4a\|ogg\|webm)$")` | **Cache eligible**, edge TTL **1 month**, browser TTL **7 days** |

(The audio cache rule is on the jubileeverse.com zone, not kjubilee.com — set
it there.)

---

## 2. R2 access — share `cdn.jubileeverse.com`

kJubilee reads audio from the existing JubileeVerse R2 bucket
(`cdn.jubileeverse.com`). No new bucket is required, but the streaming host
needs **read** credentials.

1. Cloudflare dashboard → **R2** → the existing bucket (call it `<bucket>`).
2. **R2 → Manage R2 API tokens → Create API token**:
   - Permissions: **Object Read only**
   - Specify bucket: `<bucket>` only (least privilege)
   - TTL: long-lived (rotate annually)
3. Capture the credentials and store them on the streaming host (and in this
   project's `.env` for the `r2-sync-music.js` script):
   ```env
   R2_ACCOUNT_ID=<from R2 dashboard → Overview>
   R2_ACCESS_KEY_ID=<the new token>
   R2_SECRET_ACCESS_KEY=<the secret shown once>
   R2_BUCKET=<bucket>
   PUBLIC_CDN_URL=https://cdn.jubileeverse.com
   ```
4. On the streaming host, mount the bucket via `rclone mount` so Liquidsoap
   reads tracks as local files — see
   [`RADIO-ENGINE-INSTALL.md`](RADIO-ENGINE-INSTALL.md) §3.1.

### 2.1 Service token (alternative to API tokens) — if you already use them

The JubileeVerse stack uses **Cloudflare Access service tokens** for the
InspireCortex API ([`CLOUDFLARE_SERVICE_TOKEN_GUIDE.md`](CLOUDFLARE_SERVICE_TOKEN_GUIDE.md)).
kJubilee does **not** call any Cloudflare-Access-protected APIs, so no service
token is required *for the radio engine*. Reuse the JubileeVerse one only if
kJubilee adds Access-protected endpoints later.

---

## 3. Bot / abuse protections

- **Security → Bots → Bot Fight Mode** → ON (free tier; upgrades if needed).
- **WAF → Rate-limiting rule** on `radio.kjubilee.com/stream/*`:
  Block when more than **30 requests / 1 minute / per IP** hit the stream
  paths. Streams open a long-lived connection — anything making 30 fresh
  HTTP requests per minute is almost certainly a scraper.

---

## 4. Verification

After the records propagate (usually a minute or two):

```bash
# Player site reaches the Node app
curl -sI https://kjubilee.com/health     | head -1     # HTTP/2 200
curl -s  https://kjubilee.com/health | jq .

# Streams reach Icecast
curl -sI https://radio.kjubilee.com/stream/gospel | head -3
# HTTP/2 200
# Content-Type: audio/mpeg

# Shared CDN reaches R2
curl -sI https://cdn.jubileeverse.com/<a known mp3 path> | head -3
# HTTP/2 200
# Content-Type: audio/mpeg
```

A 200 from each of those three URLs means DNS + proxy + TLS + origin are all
healthy and kJubilee is wired up correctly.

---

## 5. Caveats

- Cloudflare **does not** stream proxying with caching — the **Bypass cache**
  rule for `radio.kjubilee.com` is mandatory or listeners get stuck on the
  first second.
- The `cdn.jubileeverse.com` zone is owned by JubileeVerse — kJubilee changes
  the **client of** the bucket, not the **owner of** the zone. Coordinate
  any cache-rule changes on that zone with whoever runs JubileeVerse.
- If you later split kJubilee onto its own `cdn.kjubilee.com` bucket, see
  [`Radio-Engine-Spec.md`](Radio-Engine-Spec.md) §4 — the migration is one
  rclone sync + a `PUBLIC_CDN_URL` flip.
