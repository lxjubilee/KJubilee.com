# The Heavenly Band article template

Derived from **"What Heavenly Modulation Actually Is"** (`what-heavenly-modulation-is`),
which is the reference implementation. Read that article in full before writing
another one. Everything below is a description of what it already does.

**Target: 1,400–1,700 words, 18–22 paragraphs.** Not padding — the length comes
from the two scenes and the honest-cost section, which are what make it land.

---

## The shape

| # | ~words | what it does |
|---|---|---|
| 1 | 90–110 | **Cold open: a scene, not a claim.** A specific person, a specific hour, present tense. No thesis yet. The reader should not know where this is going. |
| 2 | 35–45 | **The turn.** Name what the scene was actually about. Short. |
| 3 | 35–45 | **The plain fact.** State the subject flatly, no rhetoric. This is where a lesser article would have started. |
| 4 | 100–130 | **Deepen it.** Take a word in the title literally, or unpack the mechanism. Earn the definition. |
| 5 | 30–45 | **Concrete specifics.** Numbers, frequencies, counts. Something checkable. |
| 6 | 85–100 | **The costly commitment.** What this costs to do properly, and why it is done anyway. Land the pull-quote line here. |
| 7 | 85–100 | **Widen to the cultural critique.** Why this is strange or rare now. Not a rant — a diagnosis. |
| 8 | 70–85 | **Structural detail.** How the thing is actually arranged, and what skill that teaches. |
| 9 | 15–30 | **Short pivot.** One or two lines. Sets up the argument. |
| 10 | 95–115 | **The case against the alternative.** Be fair to it first, then show what it cannot do. |
| 11 | 5–15 | **One-line hammer.** The thesis in a single sentence, standing alone. |
| 12 | 110–130 | **Second scene — the emotional core.** A different person from ¶1. This is the paragraph the article exists for. Specific, unsentimental, no moral attached. |
| 13 | 20–35 | **Name the mechanism.** What that scene just proved. |
| 14 | 65–80 | **The honest cost.** Concede the real downside plainly. Do not hedge it. |
| 15 | 70–85 | **Turn the cost into the point.** "The irritation is not a defect in the format. It is the format." |
| 16 | 70–85 | **Restate the thesis, now earned.** |
| 17 | 15–25 | **Bridge to the practical.** "All of which is theory until something is actually playing." |
| 18 | 100–130 | **Orientation.** What is on the dial / what the reader is about to meet. |
| 19 | 110–140 | **THE RECOMMENDATION.** Name one specific frequency and station. Say why *that* one, in the terms this article has been arguing. |
| 20 | 100–130 | **Remove the friction.** No app, no card, open it and press play. Then the account ask, framed as how the band improves — never as a demand. |
| 21 | 75–95 | **The landing.** An invitation, not an offer. Use the article's own logic as the call to action. |

---

## The techniques that make it work

**Two scenes, one at each end.** ¶1 opens with a man at 2am turning a dial; ¶12
has a woman putting a station on in her mother's room because the silence had
become the loudest thing in the house. Neither scene is explained while it
happens. Both are ordinary people on ordinary days. Neither has a moral pinned
to it — the paragraph after does that work.

**Short paragraphs between long ones.** ¶9, ¶11, ¶13 and ¶17 are one to three
sentences. They are the load-bearing beats; the long paragraphs are the argument
and the short ones are where it lands.

**Concede the cost, then convert it.** ¶14 admits a dial will play you a song
you would not have chosen, in a language you do not speak. ¶15 does not
apologise for it — it says the irritation *is* the format, and that nobody was
ever argued into the hymn they found themselves singing at a graveside forty
years later. An article that never concedes anything is an advert.

**Land on a specific frequency.** Not "explore the dial" — *start at HM 308.70,
here is why that one, here is what it will do in your kitchen.* The
recommendation must follow from the article's own argument, not be bolted on.

**Close on an invitation.** "Do not evaluate it, and do not explore it — those
are library words, and this is not a library." The last paragraph should take
the thing the article has been arguing and turn it into one small action the
reader can take this afternoon.

---

## Voice

- British spelling: *favourite, recognise, programme, licence* (noun).
- Typographic apostrophes and em dashes: `’` `—`. Never straight quotes.
- No exclamation marks except inside a station name (*Word of Fire!*).
- Plain words. Say the concrete thing. One turn per paragraph.
- Never hype. The article earns its claim or drops it.
- Numbers that can be checked, checked. Never invent a statistic — if a figure
  is not in the catalogue or a cited source, do not use one.

## Things that must stay true

- Every station named must exist, at the frequency given. Check the catalogue.
- Never promise anything is free forever, and **never say an account is not
  required** — an account will be required in time. Frame it as how the band
  gets better.
- The pull quote (`stands`) must appear as, or clearly echo, a line in the body.
- Keep `slug`, `kicker`, `title`, `dek`, `image`, `author` exactly as they are.
  Only `body` is rewritten.

---

## Measured across the finished set

`node tools/check-article-variety.js` compares every article against every
other one. Two numbers came out of it that are worth writing down.

**The argument holds up.** Paragraphs 1–17, scored on shared five-word runs,
peak at about 2.4 per cent between any two articles — and the pairs at the top
are ones that share a subject (courage and marriage; raising children and daily
provision). Twenty-one writers working in parallel from one template did not
converge. That was the risk and it did not happen.

**The endings do rhyme, by design.** Paragraphs 18–21 run 35–39 per cent
identical between arbitrary pairs. That is what the template asks for: every
article orients the reader on the dial, recommends one frequency, removes the
friction and closes on an invitation. ¶19 and ¶21 are genuinely per-article.
¶18 and ¶20 are close to house copy.

Left as it is deliberately — the reference article does this and the brief was
to duplicate its approach, not to improve on it. But it is the one thing a
reader who opens three pieces in a sitting will notice, so if the section is
ever revised, the options are:

1. **Vary the wording.** Same four moves, different sentences. No structural
   change, but it is a rewrite pass over every article.
2. **Lift ¶20 into the page furniture.** The no-app/press-play/account
   paragraph is the same message every time and is honestly boilerplate. Render
   it once beneath the prose column and drop it from the bodies. The articles
   then genuinely end on ¶19 and ¶21, which are the parts that are theirs.

Option 2 is less work and reads better; it also guarantees the account wording
stays consistent, which matters because that paragraph makes a promise about
what an account is for.

## When adding an article

Run both checkers, not just the gate:

    node tools/check-article-bodies.js     # structure, and truth about the dial
    node tools/check-article-variety.js    # whether it reads like the others

The second one has no pass or fail. Read the opening-scene list — if the new
piece opens the way six others already do, that is the finding.

## The opening formula, and why it is measured

`check-article-variety.js` counts how the articles begin. It exists because the
shared-prose metric cannot see this failure at all: fifty-eight pieces can open
*"It is twenty past six on a Tuesday and a man is…"* with fifty-eight different
times and men, share almost no five-word runs, score perfectly on every other
check, and still read as one voice doing one trick.

At the first full measurement, 53 per cent of the section opened `It is …` and a
further 21 per cent opened `A <person> is …` — three quarters of the articles
entering through two sentences.

The scene is the instruction. That sentence is not. Enter on the object, on the
action already underway, on what is in somebody's hands, on the sound in the
room. The hour and the day belong in the paragraph; they do not have to be the
first three words of it. The report flags any formula that reaches 15 per cent.
