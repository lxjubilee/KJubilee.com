# kJubilee — Production Deployment Runbook

End-to-end steps to take this repo from a fresh clone to a live, publishable
`kjubilee.com`. Several layers are **external services** (DB, Icecast, R2, DNS)
that the operator provisions — the Node app cannot stand them up on its own.
Read this whole document before going live.

---

## 1. Pre-flight (one-time)

- A Linux host (≥ 4 GB RAM, Node ≥ 20).
- A domain you own: `kjubilee.com` + DNS-editable.
- A Cloudflare account (for R2 and proxied DNS).
- An ops email for monitoring + Let's Encrypt.

---

## 2. Postgres — dedicated `kjubilee` database

kJubilee uses its **own** Postgres, separate from JubileeVerse's shared
multi-tenant DB.

```bash
# On the DB host (Ubuntu 22 example)
sudo apt-get install -y postgresql
sudo -u postgres createuser --pwprompt kjubilee
sudo -u postgres createdb --owner kjubilee kjubilee
```

Fill `.env`:
```env
DB_HOST=<db host>
DB_PORT=5432
DB_NAME=kjubilee
DB_USER=kjubilee
DB_PASSWORD=<the password you set>
```

Run the migrations:
```bash
npm install
npm run migrate
# Expect: ✓ 001-initial-schema.sql
```

Sanity:
```bash
psql "host=$DB_HOST user=$DB_USER dbname=$DB_NAME" -c "\dt kj_*"
# Expect: kj_users, kj_radio_favorites, kj_radio_follows, kj_album_follows, kj_albums, kj_radio_episodes
```

---

## 3. Streaming engine — Icecast-KH + Liquidsoap

The radio player streams from `https://radio.kjubilee.com/stream/<format>`. The
Node app **does not** run the streaming engine. Stand it up per
`docs/Radio-Engine-Spec.md` (sections 6–8 in particular):

- **Icecast-KH** as the streaming server (`apt-get install icecast2` + the KH fork).
- **Liquidsoap** as the playlist engine, with the dual-playlist hot-swap pattern
  (Spec §8.3) — this is what lets you reload schedules without an audio glitch.
- One mountpoint per station/format (e.g. `/stream/adult`, `/stream/gospel`,
  `/stream/celestial`, `/stream/kids-3-5`, `/stream/kids-6-8`).
- Terminate TLS at Cloudflare; origin can be `:8000`.

Quick sanity check from a laptop:
```bash
curl -sI https://radio.kjubilee.com/stream/gospel | head -3
# Expect: HTTP/2 200, Content-Type: audio/mpeg
```

---

## 4. Audio storage — Cloudflare R2 (`cdn.kjubilee.com`)

The player loads album art, sample tracks, voicemail blobs, and feedback files
from `cdn.kjubilee.com`. In production, this is a Cloudflare R2 bucket fronted
by a custom domain.

```bash
# Cloudflare dashboard → R2 → Create bucket: kjubilee-music
# Settings → Public access → enable
# Custom domain → cdn.kjubilee.com
```

Fill `.env`:
```env
PUBLIC_CDN_URL=https://cdn.kjubilee.com
R2_ACCOUNT_ID=<from R2 settings>
R2_ACCESS_KEY_ID=<API token>
R2_SECRET_ACCESS_KEY=<API token secret>
R2_BUCKET=kjubilee-music
```

Upload music with the sync script (extracted from JubileeVerse, see
[scripts/r2-sync-music.js](../scripts/r2-sync-music.js)):
```bash
node scripts/r2-sync-music.js
```

In dev you can skip R2 entirely — `server.js` serves `/cdn/*` from
`CDN_LOCAL_ROOT` (sibling directory `../cdn.kjubilee.com` by default) with
byte-range support, so the player works locally.

---

## 5. DNS

Point three subdomains at the right origins (all proxied through Cloudflare):

| Subdomain | Type | Target | Purpose |
|---|---|---|---|
| `kjubilee.com` | A / CNAME | Node app host | the player site + API |
| `radio.kjubilee.com` | CNAME | Icecast host | the stream mountpoints |
| `cdn.kjubilee.com` | CNAME | R2 custom domain | audio storage |

Cloudflare TLS mode: Full (Strict).

---

## 6. Secrets

- `JWT_SECRET` — generate fresh: `openssl rand -hex 64`. Do **not** ship the
  default placeholder to production.
- `DB_PASSWORD`, `R2_*` — store in your secret manager (1Password / SSM / Vault),
  not in git. `.env` is gitignored.

---

## 7. Run the app

```bash
# As a systemd service (recommended)
sudo nano /etc/systemd/system/kjubilee.service
# ── paste a [Service] block: WorkingDirectory=/var/www/kjubilee.com
#    ExecStart=/usr/bin/node server.js, Restart=on-failure
sudo systemctl enable --now kjubilee
journalctl -u kjubilee -f          # tail the log

# Or pm2:
pm2 start server.js --name kjubilee
pm2 logs kjubilee --lines 50 --nostream
```

Front-of-rack with nginx → `localhost:3210`. Terminate TLS at Cloudflare,
keep the origin on HTTP, set `trust proxy` (already done in `server.js`).

---

## 8. Smoke tests after deploy

```bash
curl -s https://kjubilee.com/health | jq .
# { ok: true, env: "production", db: "ok", time: "…" }

# Player + page routes
curl -sI https://kjubilee.com/radio   | head -1   # 200
curl -sI https://kjubilee.com/music   | head -1   # 200

# Register + use the API
TOKEN=$(curl -s -X POST https://kjubilee.com/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"smoke@kjubilee.com","password":"a-strong-pw"}' | jq -r .token)
curl -s -H "Authorization: Bearer $TOKEN" https://kjubilee.com/api/radio/favorites
# { success: true, count: 0, favorites: [] }

# Streams (separate service)
curl -sI https://radio.kjubilee.com/stream/gospel | head -3   # 200 audio/mpeg
```

---

## 9. Monitoring

- App: `journalctl -u kjubilee -f` or `pm2 logs`. Alert on repeated 500s and on
  the `/health` endpoint going non-`ok`.
- Postgres: connection count + slow queries (`pg_stat_statements`).
- Icecast: listener counts and source bitrate via Icecast's own admin UI.
- CDN: Cloudflare's R2 metrics + cache hit ratio.

---

## 10. Rollback

The Node app is stateless beyond `kj_users` / `kj_radio_*` rows. To roll back a
deploy:
```bash
git checkout <previous tag>
npm install
sudo systemctl restart kjubilee
```
Schema changes are additive (CREATE IF NOT EXISTS), so a code rollback does
not need a DB rollback.

---

## 11. What's *not* in this repo (operator action)

- Provisioning the Postgres / Icecast / R2 infra (§2–4 above).
- DNS records and TLS certs (§5).
- Production secrets (§6).
- Album content (audio files in the R2 bucket + rows in `kj_albums`).
- Liquidsoap programming logic — see `docs/Radio-Engine-Spec.md` §5
  (Sabbath / Feast scheduling) and §8 (engine layer).

When all 11 sections are green, kJubilee.com is live.
