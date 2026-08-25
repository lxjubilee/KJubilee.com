# Radio Engine Install — `radio.kjubilee.com`

Hands-on install guide for the **Icecast-KH + Liquidsoap** stack that runs
behind `radio.kjubilee.com`. This is the **operator runbook** — the design
rationale lives in `Radio-Engine-Spec.md` (sections 6–8). Cross-reference
both before you start.

> ⚠️ I (the assistant) **cannot** install software on a remote host from this
> sandbox. The commands below are designed for you to copy-paste on the
> streaming host once you have shell access.

---

## 0. What you're standing up

```
                   kjubilee.com (Node app, this repo) ─── Cloudflare ─── browsers
                                                                            │
                                                                            ▼ ⟪audio stream⟫
                                       ┌── Liquidsoap ──┐
   album mp3s in R2 (cdn.jubileeverse.com) →            ├── Icecast-KH ── radio.kjubilee.com/stream/<format>
                                       └── playlist ────┘                 (5 mountpoints)
```

Five mountpoints (one per format):
`/stream/adult`, `/stream/gospel`, `/stream/celestial`, `/stream/kids-3-5`, `/stream/kids-6-8`.

---

## 1. Provision the host

- **OS**: Ubuntu 22.04 LTS (cleanest path; commands below assume this).
- **Size**: 2 vCPU / 4 GB RAM is enough for the 5 mountpoints at MP3 128 kbps with ≤ a few hundred concurrent listeners. Scale up before launch if you expect more.
- **Open ports** (in the firewall, not nginx): **22** (ssh), **8000** (Icecast). TLS is terminated at Cloudflare.
- **DNS**: `radio.kjubilee.com` → this host (see `docs/CLOUDFLARE-SETUP.md` §2).

---

## 2. Install Icecast-KH (the KH fork)

The KH (Karl Heyes) fork has critical patches for high listener counts and
stream stability over the upstream `icecast2` package. Install from the
official PPA.

```bash
sudo apt-get update
sudo apt-get install -y software-properties-common
sudo add-apt-repository -y ppa:mscdex/icecast-kh   # community PPA carrying KH builds
sudo apt-get update
sudo apt-get install -y icecast2

# Quick sanity — KH version should be ≥ 2.4.0-kh16
icecast2 -v
```

> If the PPA route is unavailable, build from source: see
> [`Radio-Engine-Spec.md`](Radio-Engine-Spec.md) §8.1 for the configure/make recipe.

### 2.1 Configure Icecast

Edit `/etc/icecast2/icecast.xml`. Set strong passwords:

```xml
<icecast>
  <limits>
    <clients>2000</clients>
    <sources>10</sources>
    <queue-size>524288</queue-size>
    <client-timeout>30</client-timeout>
    <header-timeout>15</header-timeout>
    <source-timeout>10</source-timeout>
    <burst-on-connect>1</burst-on-connect>
    <burst-size>65535</burst-size>
  </limits>

  <authentication>
    <source-password>CHANGE-ME-source</source-password>
    <relay-password>CHANGE-ME-relay</relay-password>
    <admin-user>admin</admin-user>
    <admin-password>CHANGE-ME-admin</admin-password>
  </authentication>

  <hostname>radio.kjubilee.com</hostname>

  <listen-socket>
    <port>8000</port>
  </listen-socket>

  <fileserve>1</fileserve>
  <paths>
    <basedir>/usr/share/icecast2</basedir>
    <logdir>/var/log/icecast2</logdir>
    <webroot>/usr/share/icecast2/web</webroot>
    <adminroot>/usr/share/icecast2/admin</adminroot>
    <pidfile>/var/run/icecast2/icecast.pid</pidfile>
  </paths>

  <logging>
    <accesslog>access.log</accesslog>
    <errorlog>error.log</errorlog>
    <loglevel>3</loglevel>  <!-- 4=DEBUG, 3=INFO, 2=WARN, 1=ERROR -->
    <logsize>10000</logsize>
  </logging>

  <security>
    <chroot>0</chroot>
  </security>
</icecast>
```

Then:

```bash
sudo systemctl enable --now icecast2
sudo systemctl status icecast2 --no-pager
ss -ltnp | grep :8000          # confirm listening
```

---

## 3. Install Liquidsoap (the playlist engine)

```bash
sudo apt-get install -y opam ffmpeg
sudo apt-get install -y liquidsoap
liquidsoap --version            # expect 2.2.x or 2.3.x
```

### 3.1 Pull audio from R2

`cdn.jubileeverse.com` is the shared R2 bucket; mount it on the streaming
host so Liquidsoap can read tracks like local files. Cheapest: `rclone mount`.

```bash
sudo apt-get install -y rclone
rclone config         # add a remote named "r2" pointing at the bucket
                      # (Access Key ID + Secret from Cloudflare R2 → API)

sudo mkdir -p /mnt/cdn
sudo rclone mount r2:jubileeverse-cdn /mnt/cdn \
    --vfs-cache-mode full --buffer-size 32M --dir-cache-time 60m \
    --daemon
```

> If you'd rather not mount: write a 10-minute cron that `rclone copy`'s
> only the album/episode prefixes Liquidsoap needs into `/srv/audio`,
> and point the playlist files there.

### 3.2 The Liquidsoap playlist script

Save as `/etc/liquidsoap/kjubilee.liq` (skeleton — the production version,
including the dual-playlist hot-swap, OHI compliance layer, and Sabbath
programming, is in [`Radio-Engine-Spec.md`](Radio-Engine-Spec.md) §8.2 and §8.3).

```ruby
#!/usr/bin/liquidsoap

settings.log.file.path.set("/var/log/liquidsoap/main.log")
settings.log.level.set(3)
settings.log.stdout.set(true)

ICECAST_HOST    = "127.0.0.1"
ICECAST_PORT    = 8000
ICECAST_SOURCE  = getenv("ICECAST_SOURCE_PASSWORD")

# One playlist file per format, regenerated by the schedule service.
# Path = /etc/liquidsoap/playlists/<format>.txt — one absolute audio path per line.
def make_station(name) =
  pl = playlist(reload_mode="watch", "/etc/liquidsoap/playlists/#{name}.txt")
  s  = mksafe(pl)
  output.icecast(%mp3(bitrate=128, samplerate=44100, stereo=true),
                 mount="/stream/#{name}", host=ICECAST_HOST, port=ICECAST_PORT,
                 password=ICECAST_SOURCE,
                 name="kJubilee — #{name}",
                 url="https://radio.kjubilee.com/stream/#{name}",
                 genre="kingdom-jubilee",
                 description="kJubilee #{name} stream",
                 s)
end

make_station("adult")
make_station("gospel")
make_station("celestial")
make_station("kids-3-5")
make_station("kids-6-8")
```

### 3.3 Run Liquidsoap as a service

```bash
sudo mkdir -p /var/log/liquidsoap /etc/liquidsoap/playlists
sudo touch /etc/liquidsoap/playlists/{adult,gospel,celestial,kids-3-5,kids-6-8}.txt

sudo tee /etc/systemd/system/liquidsoap.service >/dev/null <<'EOF'
[Unit]
Description=kJubilee Liquidsoap playlist engine
After=icecast2.service network-online.target
Wants=network-online.target

[Service]
Environment=ICECAST_SOURCE_PASSWORD=CHANGE-ME-source
ExecStart=/usr/bin/liquidsoap /etc/liquidsoap/kjubilee.liq
Restart=on-failure
User=liquidsoap
Group=liquidsoap

[Install]
WantedBy=multi-user.target
EOF

sudo useradd -r -s /usr/sbin/nologin liquidsoap || true
sudo chown -R liquidsoap:liquidsoap /var/log/liquidsoap /etc/liquidsoap
sudo systemctl daemon-reload
sudo systemctl enable --now liquidsoap
journalctl -u liquidsoap -f --no-pager
```

---

## 4. Cloudflare in front

Edit on the dashboard (`docs/CLOUDFLARE-SETUP.md` walks through it):

- DNS: `radio.kjubilee.com` → this host's IP, **proxied** (orange cloud) ✓.
- Page Rule (or Cache Rule): `radio.kjubilee.com/*` → **Cache Level: Bypass** (audio streams must not be cached).
- SSL/TLS mode: **Full**. The origin doesn't need a cert (Cloudflare terminates).

---

## 5. Smoke tests

From a laptop:

```bash
# Headers — should be HTTP/2 200, Content-Type: audio/mpeg
curl -sI https://radio.kjubilee.com/stream/gospel | head -3

# Audio sanity — first 2 seconds of mp3 (needs ffprobe)
curl -s --range 0-200000 https://radio.kjubilee.com/stream/gospel -o /tmp/clip.mp3
ffprobe -v error -show_entries format=duration -of csv=p=0 /tmp/clip.mp3

# Admin page — should require the admin password
curl -sI https://radio.kjubilee.com/admin/stats -u admin:CHANGE-ME-admin | head -1
```

In the browser, open `https://kjubilee.com/radio` and pick a station — you
should hear audio within ~3 seconds.

---

## 6. Operating cheatsheet

| Need | Command |
|---|---|
| Tail Icecast logs | `sudo journalctl -u icecast2 -f` |
| Tail Liquidsoap logs | `sudo journalctl -u liquidsoap -f` |
| Listener counts (per mount) | https://radio.kjubilee.com/admin/listmounts (admin auth) |
| Reload playlists without restart | overwrite the `.txt` files — Liquidsoap watches them |
| Restart a stream | `sudo systemctl restart liquidsoap` (a few seconds of silence) |
| Hot-swap with **zero** silence | use the dual-playlist pattern in Spec §8.3 |

---

## 7. Production hardening checklist

- [ ] Strong passwords in `icecast.xml` and `liquidsoap.service` (no `CHANGE-ME-` left)
- [ ] `fail2ban` watching Icecast access logs
- [ ] Cloudflare → Bot Fight Mode + a rate-limit rule on `/stream/*`
- [ ] Daily backup of `/etc/icecast2`, `/etc/liquidsoap`, and `/var/log` to R2
- [ ] Status page + alert on stream silence (e.g. `liquidsoap`'s `blank()` operator → Slack webhook)
- [ ] Verified Sabbath/Feast schedule (Spec §5) loaded into the scheduler

When all 7 are checked, `radio.kjubilee.com` is production-ready.
