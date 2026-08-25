# Station Image Studio (WPF + WebView2)

A Windows app that hosts a **real browser** (WebView2 / Edge-Chromium) so you can
log in to ChatGPT by hand — the human check passes normally, because it is a
genuine browser, not an automation-flagged one — and then drives *your own
logged-in session* to generate one cover image for every station on the kJubilee
dial.

Ported from `InspireManna.com/tools/ArticleImageStudio`. The browser half is
unchanged; the data half is entirely new — see [What changed coming to
kJubilee](#what-changed-coming-to-kjubilee).

## The picture this studio makes

Four rules, every one of the hundred and two times:

- **One to four people wear white over-ear headphones. Nobody else does.** They
  are the only headphones in the frame, clean matte white with no branding, and
  everyone else in the shot is going about an ordinary day without them —
  serving customers, loading crates, hurrying past, deep in their own
  conversations. That contrast is the whole idea: the headphones mark a few
  people out inside a place that is busy with something else.
- **A golden glow.** Every image is bathed in warm yellow light — golden hour
  raking across the frame, deep amber from one side, a shaft breaking through
  overhead, strings of warm bulbs against the blue hour. The source varies so a
  hundred images are not one lighting setup repeated; the key never does.
- **Movement.** Nobody stands still. Every listener is caught mid-action —
  spinning, jumping, mid-stride laughing, drumming a railing, swinging round a
  lamp post, cycling past standing on the pedals — and the camera is chosen to
  carry it, panned or slow-shuttered or one step too close.
- **The station's assigned Inspire Family host is one of those few**, in the
  movement with them rather than watching it, and never the subject of the shot.

### The four rules replaced three failures

Worth writing down, because each was a whole regeneration of the dial:

| It came back as | Because | Now |
|---|---|---|
| a uniformed crowd | the whole group wore matching white headphones, so every station read as a flash mob and the one constant object read as a uniform | one to four wearers, everyone else headphone-free and busy |
| people standing still with headphones on | the tables described postures and moods, and a posture renders as a pose | every entry in `ActionFor` is a verb already in progress |
| the same photograph twice | thirty international stations hashed into two scenes per region | scenes are **rotated**, not hashed, so no two can collide |

## There is no prompt on disk, so this tool writes one

This is the difference that matters coming from the article studios. An article
carried its own `image_prompt` in frontmatter and the tool only had to read it. A
station carries nothing of the kind: it has a name, a frequency, a programming
type, a language, a region and a host, and not one field that reads like a scene.

`StationPrompt()` composes the scene from six tables — the place, who is wearing
the headphones, what they are doing, what everyone else is doing, the golden
light, and the camera.

**Five of the six are hashed off the slug; the place is rotated.** That split is
the fix for the duplicate-photograph failure and is worth understanding before
editing:

- `Pick()` hashes the station's slug (FNV-1a, salted per axis so two axes never
  move together) to choose the light, the camera, the action and the rest. A
  hash can collide, and on those axes a collision is invisible.
- `Scene()` indexes by `SceneIndex` — the station's **position among the stations
  sharing its pool** — so a pool at least as long as its group makes a collision
  impossible. Every pool below is sized against its group for exactly that
  reason, and the mainstream pool has twenty entries because twenty stations draw
  from it.

Both are deterministic: same station, same picture, every build. That matters on
a regeneration — pressing **Regenerate this image** after a bad render should get
another attempt at *the same picture*, not a draw from a fresh lottery, or
comparing the two tells you nothing.

### The place is chosen by language, not by region

A station broadcasting in Mandarin has to be standing somewhere Mandarin is
spoken. Keyed by region, the pools mixed a continent together and the Mandarin
station drew a Tokyo crossing — "Asia" is not a place. `ScenePoolKey` keys
international stations on their **language**, so Korean gets Seoul and Busan,
Bengali gets Kolkata and Dhaka, Yoruba gets Lagos. No language on the dial
carries more than two stations, so four scenes each is room to spare.

A language with no pool of its own falls back to its region's — every language
the catalog currently carries has one, so that is a note for whoever adds the
thirty-first international station rather than a live problem.

The tables live at the top of the prompt section in `MainWindow.xaml.cs`. If a
whole programming type comes back looking wrong, that is where to fix it — not in
the individual prompts, which are not stored anywhere.

### A few stations are written out by hand

Most stations want a backdrop, not a brief: the six tables give a hundred of them
a hundred different pictures and nobody writes a prompt. A handful are the other
way round — the picture *is* the point — and those are in `BespokeStations`,
keyed by slug, in the same file as the tables.

A bespoke entry replaces the parts it names and inherits the rest:

| Field | Replaces |
|---|---|
| `Scene` | the backdrop the rotation would have picked |
| `Pose` | the movement hashed off the slug |
| `Company` | **the solo rule** — the standard prompt insists the host is alone, and a station that needs a choir, a dance ring or a crowd has to remove that sentence rather than argue with it |
| `Subject` | "a single figure, X, alone and filling the frame" |
| `Who` | what the later sentences call the subject ("Each girl") |
| `Wardrobe` | the garments `WardrobeFor` would name for that persona |
| `StyleFrom`, `NoPortrait` | which catalogue the style reference comes from; whether a likeness is attached at all |

**The light and the camera are NOT overridable**, and that is the trap. Both are
hashed off the slug, so a bespoke scene has to be written to agree with whatever
light that slug already draws — a station whose light is "sunset gold flooding in
from behind the skyline" cannot be set indoors without the prompt arguing with
itself about whether there is a sky.

#### The two first-century stations

`yes-and-amen` and `jubilee-ccm` are one idea in two halves: the host stands in a
first-century village wearing the white headphones, and **the headphones are the
only modern object in the frame**. Everything else — clothing, tools, vessels,
surfaces, light — is of the period, and both entries carry the exclusion list
that keeps it that way.

That is also why `Wardrobe` exists. The persona table is canonical and modern (a
dark jacket and trousers for Elias, a floor length dress and shoes for Jubilee);
left in place beside a first-century scene it is a second instruction about the
same clothes, and on these two cards it would put a second modern object in a
picture whose whole force comes from there being exactly one. The modesty
sentence that follows it is untouched — an override changes the century, never
the standard, and Jubilee is still white head to foot, in linen instead of a
dress.

The two differ only in what the village is doing about it. Elias is met with
**bewilderment** — faces puzzled, a boy pointing at his head, people tilting to
listen for what he is hearing and finding nothing. Jubilee is met with
**delight** — the same villagers smiling, clapping in time, children pressing in
at the front. Confusion and celebration, which is the difference between a
declaration and a party, carried entirely by the crowd's faces.

## Every station has a host, and the host is in the picture

`public/js/stations-data.js` already assigns one of the twelve to every station
in its `host` field: `tools/build-home-data.js` derives it from a per-format rota
plus a few deliberate overrides (Nova fronts the flagship). All 102 stations
carry one.

This studio takes that as the **default and never as the last word**:

| | Where it lives | Who owns it |
|---|---|---|
| the catalog's `host` | `public/js/stations-data.js` | `build-home-data.js`, regenerated wholesale each build |
| an override set here | `station-hosts.json`, beside the tool | you |

The override file exists because the catalog is answering "who presents this
station" and the studio is answering "whose face is in this picture", and those
can legitimately differ for one station without the rota being rewritten. An
override written back into `stations-data.js` would survive exactly until the
next build of the home page.

Change it on the **Host** picker under the preview. Setting it back to what the
catalog says deletes the override rather than pinning it, so a future rota change
still reaches that station.

### The reference portraits are stylised, and that is the whole problem the prompt solves

The twelve portraits in `personas/` are neon-lit studio pieces: glowing hexagon
costume, circuit background, head-and-shoulders crop, subject looking straight
down the lens. Attached without instruction, the host walks into a family kitchen
in glowing armour.

So `HostClause` is explicit in both directions:

| Taken from the portrait | Discarded |
|---|---|
| Facial features, skin tone | The costume and its glowing trim |
| Hair colour and texture, facial hair | Headwear and jewellery |
| Approximate age, general build | The neon / circuit background |
| | The studio lighting and the crop |

and the wardrobe decision is handed back to the scene: **ordinary real-world
clothing that suits the setting, its climate and its season**, plain enough to
draw no attention.

#### Jubilee is the one exception, and her clause is fixed

She is in **white only, head to toe, and modest**, and the modesty is spelled out
as tightly as the colour because a scene full of movement is exactly where a
loose description drifts:

| | |
|---|---|
| Neckline | high, closed at the collarbone |
| Sleeves | covering the arms — long to the wrist, or three-quarter |
| Hem | well below the knee, to mid-calf |
| Shape | a long modest white dress, or a white blouse buttoned high over a long white skirt |
| Shoes | white. Never trousers, never another colour on her |

The clause adds that the fabric moves with her and the neckline, sleeves and hem
stay exactly as described **no matter how much movement there is** — without
that, the same prompt that asks for a spin asks for the dress to go with it. The
render check (`VerifyHostRender`) carries the same wording, so a correction round
cannot quietly drop it.

Her white is hers alone: everyone else wears ordinary colours, and the headphones
stay white regardless of what anyone is wearing.

### What actually gets attached

Not the 2.4 MB original. The portrait is cropped to its centred square and
downscaled to 768x768 JPEG, which comes out between 139 and 217 KB of base64
across the twelve — small enough to hand to the page in a single injected script,
and cached so a sweep of the dial encodes each portrait once rather than nine
times.

The crop is not just compression. The originals are 16:9 with the subject centred
and the head inside the middle third, so a straight 16:9 downscale spends most of
its pixels on empty neon background and leaves the face about 250px tall.
Cropping first throws away only background and leaves the face nearer 450px — the
same bytes, spent on the only part of the picture being referenced.

### When the portrait is missing

The station is **skipped**, loudly, and stays pending so a later run picks it up.
Nothing is sent.

That is deliberate. Generating without the reference would produce a perfectly
good image of the wrong thing and then write the file, so the station would count
as done and never be regenerated: the miss would be permanent and silent.

Startup reports which of the twelve portraits it can see, so an absent voice shows
up once rather than nine stations later. Untick **Put the station's host persona
in the image** to turn the whole path off.

## Done-ness is the file, not a field

An article could be marked done in its own frontmatter. A station has nowhere to
write that, and inventing a place would create a second answer to a question the
disk already answers.

`public/images/stations/<slug>.webp` **is** the record. Delete it and the station
requeues on the next Refresh. The tool also writes a sidecar manifest —
`stations-images.json` in the same folder — but that is provenance, not truth:

```json
{
  "schema": "kj.station.images/1",
  "stations": {
    "jubilee-radio": {
      "file": "jubilee-radio.webp",
      "name": "Jubilee Radio",
      "hm": "088.70",
      "host": "nova",
      "hostName": "Nova Inspire",
      "rendered": "2026-08-21 01:14:02",
      "prompt": "A warm, photorealistic documentary photograph…"
    }
  }
}
```

Six months from now "why is Zev on the Swahili station" is a question only that
file can answer, and a prompt that produced a good render is worth keeping even
though the composer would rebuild it from the tables.

## Publishing: local disk is done, the CDN is live

A render sitting on `W:` is finished but not published. Every image is copied to
the production CDN as soon as it is written:

```
public/images/stations/<slug>.webp      the record that the station is done
        |  scp, key already trusted by the host
        v
/var/www/kjubilee.com/cdn-local/stations/<slug>.webp
        |  the node app serves the CDN root as /cdn/*
        v
https://www.kjubilee.com/cdn/stations/<slug>.webp
```

The copy runs **after** the local write and the manifest entry, so a publish that
fails leaves a complete local record to retry from rather than losing the render.
A host that cannot be reached turns publishing off for the rest of the run and
says so once, rather than failing a hundred and two times in a row.

`scp`/`ssh` are shelled out to rather than pulling in an SSH library: the key is
already on the machine and already trusted by the host, Windows ships OpenSSH, and
there is no second copy of the credentials to keep in step. Settings carries the
host, key path and destination folder, plus **Publish every image now** for images
rendered before publishing was switched on, or to retry after a failure - that
button sends the sidecar manifest too, so the CDN carries its own provenance.

> **The website does not read these images yet.** The station cards on the home
> page draw their ident from the gradient in `stations-data.js`. Pointing the
> cards at `/cdn/stations/<slug>.webp` is a website change and is deliberately
> not part of this tool.

## The window

```
+--------------------------------------+---+----------------+----+
|                                      | | |                | 🖼 |  Stations
|   the real browser (ChatGPT)         |<->|  the panel:    |    |
|                                      | | |  one of two    |    |
+--------------------------------------+ | |  views         |    |
|=============== splitter =============| | |                | ⚙  |  Settings
|  log: full window width, no heading  | | |                |    |
+--------------------------------------+---+----------------+----+
```

### The header band

**Website is gone.** The InspireManna studio carried a picker over sixty tenant
corpora; this one is pointed at kjubilee.com and nothing else, so the band spends
its width on the two scopes that actually vary here:

| Control | Narrows by |
|---|---|
| **Find** | station name, slug, HM frequency, format or language — `088.70`, `praise` and `hindi` all work |
| **Persona** | the host — one of the twelve, or All |

Both apply to **what a run processes** as well as to what is shown. Filtering only
the display would leave Generate quietly working on stations the user had just
filtered out of sight.

### The tabs

**All** first, then one tab per programming type, built in code from the catalog
itself — so a format added to the dial appears without a code change here. That
is the lesson from the InspireManna build, whose seven categories were hardcoded
and which reported an empty site the first time it met a corpus with different
ones.

| Tab | Stations |
|---|---|
| Music | 11 |
| Devos | 3 |
| Bible | 13 |
| Church | 12 |
| Prayer | 2 |
| Kids | 3 |
| Sleep | 3 |
| Talk | 1 |
| Hebrew | 3 |
| Theater | 1 |
| World | 30 |
| AI | 20 |

Headers are one word because a dozen of them share one strip inside a 344px
panel; the full label is in the tooltip.

### Green ticks are this session's work

As each image finishes, its station gets a green `✓` and **stays on the list**, so
a long run shows what it has done rather than only what is left. Press **Refresh**
and the ticked rows drop away.

| Tick | Means |
|---|---|
| green `✓` | rendered **in this session**, still listed until you Refresh |
| grey `✓` | rendered in an earlier session, only visible with **show stations with images** |
| none | still pending |

**Refresh** and **Rescan stations** are the only things that clear the session
ticks, and they also release the "already done this session" lock. That lock stops
a run looping on one station, but it must not outlive the truth on disk: once an
image has been generated, deleting the file has to make the station pending again.
Refresh means "re-read the drive", so the drive wins.

### The preview

Between the worklist and the button, at the panel's full width. Whatever row is
selected shows its rendered image, the station's frequency, format and host, and
the image's true pixel size. It is a 16:9 box because that is the ratio every
station image is generated at, so the panel width alone decides how tall it gets,
and the worklist above carries a MinHeight so a wide panel cannot squeeze it away.

During a run the preview follows each image as it lands: on a long sweep the
picture arriving is the thing worth watching.

Two things inherited from the article studio that it took a bug each to learn:

**Rows carry their Station.** Selection resolved by ListBox index plus a
re-derived visible list is the same filter written twice and kept in step by hand;
any drift points the preview at a different station than the one on screen.

**WebP is decoded through ImageSharp, not WPF.** `BitmapImage` cannot read WebP
here: WIC has no registered decoder, and `EndInit` fails with
`ArgumentNullException: Key cannot be null`, which is an unhelpfully generic way
of saying "no codec". ImageSharp wrote these files, so it is guaranteed to read
them, and it downscales on the way through.

Both splitters are draggable and **both remembered**. The sizes are written to
`studio.config.json` when the window closes, and again whenever you press **Save
settings**:

```json
"layout": { "panelWidth": 344, "logHeight": 170 }
```

A close while minimised measures every element at zero. Those values are refused
rather than saved, so a minimised exit cannot reopen with the panel and the log
collapsed to nothing. Minimums (260px panel, 52px log) stop a drag doing the same.

## Build & run

Double-click **`Build-And-Run.cmd`**, or:

```
dotnet build -c Release -o bin\Release\net8.0-windows-v2
bin\Release\net8.0-windows-v2\StationImageStudio.exe
```

Requires the **.NET 8 SDK** and the **WebView2 Runtime** (already present with
Edge on Windows 11).

Output goes to `net8.0-windows-v2`, not the default `net8.0-windows`, because W:
is a mapped share and an exe written there can start answering "access is denied"
to every subsequent build even with an elevated shell and no process holding it.
Building beside it costs a folder and sidesteps the problem entirely.

## Use it

1. Launch. The browser opens to ChatGPT. No server and no database are needed.
2. Check **Settings**: the site root (defaults to this repo), the images folder
   (`public/images/stations`) and the host portraits (`personas/`). **Save
   settings** writes `studio.config.json` next to the tool; it is git-ignored.
3. **Log in** to ChatGPT (click into the browser). Solve the human check once —
   your session is then remembered in `%LOCALAPPDATA%\kJubilee\StationImageStudio`.
4. Optionally set the **generation location** to your ChatGPT Images project, so
   every conversation this tool opens is created inside it.
5. Pick a **tab**. It shows that programming type's stations still missing an
   image; tick **show stations with images** to see the rest.
6. **Generate Images** sweeps whatever the tab covers, narrowed by the two header
   filters. **Stop** halts after the current image.
7. Watch the log, then **look at the images**. Nothing here is reviewed
   automatically.

A run starts a new conversation every 10 images, pauses 20–45s between them, backs
off 60s / 150s / 240s after a failure, and stops entirely after three failures in
a row — which is almost always an image quota or a capacity problem rather than
bad luck, and grinding on would burn every remaining station against the same wall.

## What changed coming to kJubilee

| | InspireManna | Now |
|---|---|---|
| Unit of work | an article `.md` on the article drive | a **station** in the catalog |
| Where the list comes from | seven category folders under `J:\inspiremanna.com\articles` | `public/js/stations-data.js`, **102 stations** |
| The prompt | read from the article's own `image_prompt` | **composed here**, seeded off the HM frequency |
| Who is in the picture | the article's `author_slug` | the station's **host**, override-able per station |
| What the picture is | the reader's own life, any subject | **listening on white radio equipment**, always |
| Done-ness | `image_file` written into frontmatter | **the file on disk** |
| Output | `<category>/images/<slug>.webp` | `public/images/stations/<slug>.webp` |
| Views | Images, Music, Deploy, Settings | **Stations, Settings** |
| Site picker | 60+ tenants | **removed** — one site |
| WebView2 profile | `%LOCALAPPDATA%\InspireManna\…` | `%LOCALAPPDATA%\kJubilee\…` |
| Repo marker | `runner/article-stats.js` | `tools/build-station-manifest.js` |

**Music and Deploy are gone.** The music view read article lyrics files and filed
mp3s against them, and kJubilee has no lyrics corpus — its audio is the SongID
repository at `J:\kjubilee.com\music`, which `tools/music-ingest` already owns. The
deploy view shelled out to `deploy/publish.sh`, which this repo does not have; the
publish runbook is `docs/DEPLOYMENT.md` and it is a runbook, not a button.

One inherited safeguard worth calling out: the JubiLujah original defaulted its
repo root to a hardcoded path when it could not find its marker, so a stray copy
would have written into *that* repo. There is no such fallback here. A missing
catalog refuses to run and says which path it looked at.

## ⚠ Honest caveat

Automating the ChatGPT web UI (submitting prompts, attaching files, pulling the
generated image) may conflict with **OpenAI's Terms of Use**. This app does **not**
defeat the bot / human check — *you* pass that yourself in a real browser — but
the attachment and prompt submission afterward are automated, against your own
session, at your direction.

## If ChatGPT changes its layout

The DOM selectors live in one place — the `*Script()` methods at the bottom of
`MainWindow.xaml.cs`. If a run stops finding the chat box, the attachment or the
image, adjust them there. The ones that matter most:

| Script | Breaks as |
|---|---|
| `ComposerPresentScript` | "Chat box never appeared — are you logged in?" |
| `AttachScript` | "Could not hand the host portrait to the page" |
| `AttachmentStateScript` | "The page never showed the attached portrait" |
| `ListImagesScript` | no image detected, or the wrong image saved |

`ListImagesScript` carries one filter that is easy to remove by accident and
expensive to lose: it **excludes images inside user turns and inside the
composer**. Every turn carries an attached host portrait, and once sent it renders
again inside the user's own message bubble under a fresh URL. Without that filter
it is the newest unseen large image on the page for as long as the real one takes
to render, holds still across two polls, and gets saved as the station's cover —
a station illustrated with a neon studio portrait of its own host. The filter
fails *open*: if the attribute it keys off disappears, detection reverts to the
old behaviour rather than finding nothing at all.
