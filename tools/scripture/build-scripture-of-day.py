# -*- coding: utf-8 -*-
"""Rebuild setup/scripture-of-day.md from the JSV translation tree.

    python tools/scripture/build-scripture-of-day.py

WHY THIS IS A SCRIPT AND NOT A HAND-WRITTEN LIST.

The Jubilee Standard Version at W:\ZevInspire.com\translation is a translation
in progress. Parts of it still carry the translator's working alternatives inside
the verse -- "love; covenant love; covenant love; covenant love" -- which are
margin notes and cannot go on air. A hundred verses cannot be eyeballed reliably
every time the translation moves, so the check is written down instead.

Three things about that tree cost real debugging, and are the reason this file
is longer than it looks like it should be:

  1. THE LAYOUT VARIES BY CHAPTER, NOT BY BOOK. Philippians has both the
     "**Php 4:13** text" form and run-in superscript verse numbers. Genesis has
     a third shape again. Anything assuming one shape per book silently drops
     half a letter and reports success.

  2. A VERSE DOES NOT END AT ITS LINE. Poetry runs on to the next line with no
     marker. Reading only the marker line truncated a third of Proverbs
     mid-clause -- and a verse that stops on a comma is worse on air than one
     that was never picked.

  3. FILES HOLD MORE THAN ONE TRANSLATION. The same chapter often carries JSV,
     MJV and commentary under separate headings. Taking the wrong section puts a
     translation on air that nobody chose.
"""
import io, os, re, unicodedata

NL = chr(10)

ROOT = r'W:\ZevInspire.com\translation'

SUP = {'\u2070': '0', '\u00b9': '1', '\u00b2': '2', '\u00b3': '3', '\u2074': '4',
       '\u2075': '5', '\u2076': '6', '\u2077': '7', '\u2078': '8', '\u2079': '9'}
SUPCLASS = ''.join(SUP)

RE_A = re.compile(r'^\*\*([1-3]?\s?[A-Za-z]{2,5})\s+(\d+):(\d+)\*\*\s+(.*)$')
RE_C = re.compile(r'([' + SUPCLASS + r']+)\u02d0([' + SUPCLASS + r']+)\s*')
RE_B = re.compile(r'([' + SUPCLASS + r']+)\s*')
RE_CH = re.compile(r'Chapter\s+(\d+)', re.I)

def _num(s):
    return int(''.join(SUP[c] for c in s))

def _jsv_only(text):
    """The JSV slice of a file. Everything from a JSV heading up to the next
    version heading (MJV / JSE / KJV...) or a study section."""
    lines = text.split('\n')
    out, keep = [], False
    for ln in lines:
        h = ln.strip()
        if h.startswith('#'):
            up = h.upper()
            if 'JSV' in up or 'JUBILEE STANDARD' in up:
                keep = True
                continue
            if re.search(r'\b(MJV|JSE|KJV|MESSIANIC JUBILEE|COMMENTARY|NOTES|ANALYSIS|COMPARISON)\b', up):
                keep = False
                continue
            # a plain "# Book Chapter N" title does not close the JSV section
            if RE_CH.search(h):
                continue
            keep = False
            continue
        if keep:
            out.append(ln)
    # A file with no JSV heading at all but obvious verse lines is format A.
    return '\n'.join(out) if out else text

def _clean(t):
    # Genesis marks its glosses with *asterisks*; they are notes, not the reading.
    t = re.sub(r'\*([^*]{1,80})\*', '', t)
    t = t.replace('**', ' ')
    t = re.sub(r'\s+([,.;:!?])', r'\1', t)
    return re.sub(r'\s{2,}', ' ', t).strip(' -\u2014')

def load():
    books = {}
    for entry in sorted(os.listdir(ROOT)):
        d = os.path.join(ROOT, entry)
        if not os.path.isdir(d) or not entry[0].isdigit() or entry.endswith(' RO') or entry.startswith('00'):
            continue
        name = re.sub(r'^\d+\s+', '', entry).strip()
        if not name:
            continue
        verses = books.setdefault(name, {})
        for fn in sorted(os.listdir(d)):
            if not fn.lower().endswith('.md') or 'LOCK_STATUS' in fn.upper():
                continue
            if re.search(r'REPORT|SUMMARY|REGISTRY|ISSUES|INDEX|TRACKER|STATUS|QA', fn, re.I):
                continue
            try:
                raw = io.open(os.path.join(d, fn), encoding='utf-8', errors='replace').read()
            except OSError:
                continue
            body = _jsv_only(raw)

            # --- A ---
            # A verse does NOT end at its line. Poetry runs on:
            #
            #   **Pro 3:6** In all your ways acknowledge him,
            #   and he will make straight your paths.
            #
            # Taking only the marker line truncated a third of Proverbs and most
            # of Isaiah mid-clause, and a verse that stops on a comma is worse on
            # air than one that was never selected. So the text runs on to the
            # next marker or the next heading.
            hits = 0
            cur, buf = None, []
            for ln in body.split(chr(10)):
                st = ln.strip()
                m = RE_A.match(st)
                if m:
                    if cur and buf:
                        verses.setdefault(cur, _clean(' '.join(buf)))
                    cur, buf = (int(m.group(2)), int(m.group(3))), [m.group(4)]
                    hits += 1
                elif cur is not None:
                    if not st or st[:1] == '#' or st[:3] == '---' or st[:1] == '|':
                        verses.setdefault(cur, _clean(' '.join(buf)))
                        cur, buf = None, []
                    else:
                        buf.append(st)
            if cur and buf:
                verses.setdefault(cur, _clean(' '.join(buf)))
            if hits:
                continue

            # --- C: chapter\u02d0verse pairs ---
            pairs = list(RE_C.finditer(body))
            if pairs:
                for i, m in enumerate(pairs):
                    end = pairs[i + 1].start() if i + 1 < len(pairs) else len(body)
                    txt = _clean(body[m.end():end])
                    if txt:
                        verses.setdefault((_num(m.group(1)), _num(m.group(2))), txt)
                continue

            # --- B: bare superscript verse numbers, chapter from the heading ---
            mch = RE_CH.search(raw)
            if not mch:
                mch = re.search(r'(\d+)', fn)
            if not mch:
                continue
            ch = int(mch.group(1))
            marks = list(RE_B.finditer(body))
            for i, m in enumerate(marks):
                end = marks[i + 1].start() if i + 1 < len(marks) else len(body)
                txt = _clean(body[m.end():end])
                if txt and len(txt) > 3:
                    verses.setdefault((ch, _num(m.group(1))), txt)
    return {b: v for b, v in books.items() if v}


# ---- is this fit to read aloud? -----------------------------------------
#
# The defect to catch is NOT repetition. Hebrew poetry repeats on purpose --
# "I will be exalted among the nations, I will be exalted in the land" is the
# verse, not a fault -- and a generic repeated-phrase test throws out Psalm
# 46:10 and Isaiah 41:10 along with the broken ones.
#
# What is actually broken is an unresolved GLOSS: a word left standing beside
# the alternatives the translator was choosing between, semicolon-separated and
# usually duplicated.
#
#     love; covenant love; covenant love; covenant love
#     the drenched with oil; saturated with Ruach One      (i.e. Messiah)
#     your heart; your discerning sight; the ability to distinguish
#     pardon; pardon; forgive
#     receive tender tender compassion
#
# Read aloud, those are not scripture, they are an editor's margin. So the test
# is: a segment that repeats between semicolons, an immediately doubled word, or
# one of the known unresolved glosses.
import re as _re

KNOWN_GLOSS = (
    'drenched with oil; saturated',
    'covenant love; covenant love',
    'discerning sight; the ability to distinguish',
    'wholeness; peace of',
    'pardon; pardon',
)

def _norm(x):
    return _re.sub(r"[^a-z' ]", ' ', x.lower()).strip()

# Gloss tails that appear ONCE rather than repeated. The duplicate test below
# cannot see these: "a strong tower; the wholesome one" has one semicolon and no
# repetition, but read aloud it is still the translator's alternative sitting in
# the middle of the verse. Collected from what this text actually contains.
GLOSS_TAIL = (
    'emergency protection in the storm', 'the strength of judgment',
    'the covenant path', 'rock-solid foundation', 'immovable bedrock',
    'unmovable foundation', 'in a position of empowerment',
    'the ability to distinguish', 'saturated with ruach one',
    'discerning sight', 'covenant love', 'substance; presence',
    'wholeness; peace', 'drenched with oil', 'my immovable',
)


def gloss_defect(t):
    low = t.lower()
    for g in GLOSS_TAIL:
        if g in low:
            return 'gloss tail: "%s"' % g
    for g in KNOWN_GLOSS:
        if g in low:
            return 'unresolved gloss: "%s"' % g
    # a segment repeated between semicolons
    segs = [_norm(x) for x in t.split(';')]
    segs = [x for x in segs if x]
    for i in range(1, len(segs)):
        a, b = segs[i - 1].split(), segs[i].split()
        if not a or not b:
            continue
        n = min(len(a), len(b), 4)
        if n >= 2 and a[-n:] == b[:n]:
            return 'gloss repeats "%s"' % ' '.join(b[:n])
        if segs[i] == segs[i - 1]:
            return 'gloss repeats "%s"' % segs[i]
    # A TRANSLITERATION FOLLOWED BY ITS OWN TRANSLATION.
    #
    #   'For the davar of Yahuah; the word of Yahuah is upright'
    #
    # The duplicate test above cannot see this: the two segments are not equal
    # and their heads differ ('the davar of' vs 'the word of'). What gives it
    # away is that the words just BEFORE the semicolon turn up again a moment
    # after it. Hebrew parallelism does not do that inside a single clause --
    # 'renew their strength; they shall mount up' shares nothing across the
    # break -- so this catches glosses without catching poetry.
    parts = low.split(';')
    for a, b in zip(parts, parts[1:]):
        aw = [x for x in _re.split("[^a-z']+", a) if x]
        bw = [x for x in _re.split("[^a-z']+", b) if x][:6]
        if len(aw) >= 2 and len(bw) >= 2:
            pair = aw[-2:]
            for i in range(len(bw) - 1):
                if bw[i:i + 2] == pair:
                    return 'gloss echo: "%s"' % ' '.join(pair)

    # An immediately doubled word ("tender tender"). Done by comparing adjacent
    # words rather than with a backreference: this file is written through a
    # shell heredoc, and backslash escapes have not survived that trip four
    # times today. No escapes, no problem.
    w = [x for x in _re.split("[^a-z']+", low) if len(x) >= 3]
    for i in range(1, len(w)):
        if w[i] == w[i - 1]:
            return 'doubled word "%s"' % w[i]
    return None

def problems(t):
    out = []
    g = gloss_defect(t)
    if g:
        out.append(g)
    if _re.search(r'[\[\]{}<>]', t):
        out.append('brackets')
    if len(t) > 320:
        out.append('long (%d chars)' % len(t))
    if len(t) < 25:
        out.append('short (%d chars)' % len(t))
    if t.rstrip()[-1:] in (',', ';', ':', chr(8212), '-'):
        out.append('truncated')
    # MUST STAND ALONE. A verse read between two songs is the whole utterance,
    # so it has to begin and end like one.
    #
    # Ephesians 2:8 ends 'it is the gift of Elohim' with no stop, and 2:9 is the
    # bare tail 'not from works, so that no one may boast.' Both are correct
    # verse divisions and neither is a sentence; on air the first sounds cut off
    # and the second sounds like the start was missed.
    if t.rstrip()[-1:] not in ('.', '!', '?', chr(34), chr(8221), ')'):
        out.append('no terminal punctuation')
    # The give-away is a LOWERCASE opening, which is how this text marks a verse
    # that continues the previous one. Capitalised conjunctions are ordinary
    # scripture openings and must survive: 'For Elohim so poured out...' is
    # John 3:16, and 'But those who wait on Yahuah' is Isaiah 40:31.
    head = t.lstrip('"' + chr(8220))
    first = (head.split() or [''])[0].lower()
    if head[:1].islower() and first in ('not', 'but', 'and', 'or', 'nor', 'so',
                                        'yet', 'that', 'which', 'who'):
        out.append('opens mid-sentence ("%s")' % first)
    return out

THEMES = [
 ('Who God Is', [
   'Psalms 23:1', 'Psalms 46:1', 'Psalms 91:1', 'Psalms 103:8', 'Psalms 145:8',
   'Psalms 100:5', 'Psalms 34:8', 'Lamentations 3:22', 'Lamentations 3:23',
   'Isaiah 40:28', 'Malachi 3:6', 'Deuteronomy 32:4', 'Nahum 1:7',
   'Psalms 18:2', 'Psalms 62:1', 'Psalms 62:2', 'Exodus 34:6',
 ]),
 ('The Good News', [
   'John 3:16', 'John 3:17', 'John 14:6', 'John 10:10', 'Romans 6:23',
   'Romans 10:9', 'Romans 10:13', 'Ephesians 2:8', 'Ephesians 2:9',
   'Acts 4:12', 'Titus 3:5', '1 Timothy 1:15', 'Isaiah 53:5', 'Isaiah 53:6',
   '2 Corinthians 5:17', '1 Peter 3:18', 'John 1:12', 'Luke 19:10',
 ]),
 ('When You Are Afraid', [
   'Isaiah 41:10', 'Isaiah 43:1', 'Isaiah 43:2', 'Deuteronomy 31:6',
   'Psalms 27:1', 'Psalms 56:3', 'Psalms 118:6', '2 Timothy 1:7',
   'Matthew 10:31', 'Luke 12:32', 'John 14:27', 'Psalms 34:4',
   'Zephaniah 3:17', 'Psalms 121:1', 'Psalms 121:2',
 ]),
 ('When You Are Tired', [
   'Matthew 11:28', 'Matthew 11:29', 'Isaiah 40:29', 'Isaiah 40:31',
   'Psalms 55:22', '1 Peter 5:7', 'Psalms 46:10', 'Psalms 62:5',
   'Galatians 6:9', 'Hebrews 12:1', 'Psalms 3:5', 'Psalms 4:8',
 ]),
 ('Hope and What Is Coming', [
   'Jeremiah 29:11', 'Romans 15:13', 'Romans 8:18', 'Romans 8:28',
   'Revelation 21:4', 'Revelation 21:5', '1 Corinthians 2:9',
   'Isaiah 43:19', 'Psalms 30:5', 'Habakkuk 2:3', 'Titus 2:13',
   'Hebrews 6:19', 'Psalms 27:13', 'Psalms 27:14',
 ]),
 ('Trust and Faith', [
   'Proverbs 3:5', 'Proverbs 3:6', 'Hebrews 11:1', 'Hebrews 11:6',
   '2 Corinthians 5:7', 'Mark 9:23', 'Matthew 17:20', 'Psalms 37:5',
   'Psalms 9:10', 'Isaiah 26:3', 'Jeremiah 17:7', 'Psalms 56:4',
   'Romans 10:17', 'James 1:6',
 ]),
 ('Strength for Today', [
   'Philippians 4:13', 'Isaiah 41:13', 'Psalms 28:7', 'Psalms 73:26',
   'Ephesians 6:10', '2 Corinthians 12:9', 'Psalms 138:3', 'Nehemiah 8:10',
   'Habakkuk 3:19', 'Psalms 29:11', 'Joel 3:10', 'Deuteronomy 20:4',
 ]),
 ('Wisdom and the Way to Go', [
   'Proverbs 16:3', 'Proverbs 16:9', 'Proverbs 18:10', 'Proverbs 4:23',
   'James 1:5', 'Psalms 32:8', 'Psalms 119:105', 'Proverbs 11:2',
   'Proverbs 27:17', 'Ecclesiastes 3:1', 'Micah 6:8', 'Proverbs 15:1',
   'Proverbs 12:25', 'Proverbs 19:21',
 ]),
 ('Love One Another', [
   'John 13:34', 'John 13:35', '1 John 4:19', '1 Corinthians 13:4',
   '1 Corinthians 13:13', 'Romans 12:10', 'Proverbs 17:17', 'Luke 6:31',
   'Ephesians 4:32', 'Colossians 3:13', '1 Peter 4:8', 'Galatians 6:2',
   'Matthew 22:39', 'Romans 13:10',
 ]),
 ('Forgiveness and a Clean Start', [
   '1 John 1:9', 'Psalms 103:12', 'Isaiah 1:18', 'Psalms 51:10',
   'Micah 7:19', 'Isaiah 43:25', 'Acts 3:19', 'Ezekiel 36:26',
   'Joel 2:25', 'Romans 8:1', 'Colossians 1:14', 'Psalms 32:1',
 ]),
 ('Peace and Rest', [
   'Philippians 4:6', 'Philippians 4:7', 'John 16:33', 'Psalms 4:8',
   'Isaiah 26:12', 'Colossians 3:15', 'Numbers 6:24', 'Numbers 6:25',
   'Numbers 6:26', 'Psalms 23:2', 'Psalms 23:3', 'Matthew 5:9',
 ]),
 ('Praise and Thanks', [
   'Psalms 118:24', 'Psalms 100:1', 'Psalms 100:4', 'Psalms 34:1',
   'Psalms 150:6', 'Psalms 103:1', 'Psalms 19:1', 'Psalms 139:14',
   '1 Thessalonians 5:16', '1 Thessalonians 5:18', 'Psalms 95:1',
   'Psalms 96:1', 'Ephesians 5:19', 'Psalms 147:1',
 ]),
 ('Purpose and Work', [
   'Ephesians 2:10', 'Colossians 3:23', 'Matthew 5:16', 'Jeremiah 1:5',
   'Philippians 1:6', 'Romans 12:2', '1 Corinthians 10:31', 'Esther 4:14',
   'Matthew 6:33', 'Proverbs 16:2', 'Genesis 50:20', 'Acts 1:8',
 ]),
 ('Provision', [
   'Philippians 4:19', 'Matthew 6:26', 'Psalms 37:25', 'Psalms 34:10',
   'Malachi 3:10', '2 Corinthians 9:8', 'Matthew 7:11', 'Psalms 84:11',
   'Luke 12:24', 'Deuteronomy 8:18',
 ]),
 ('The Word Itself', [
   'Isaiah 40:8', 'Psalms 119:11', '2 Timothy 3:16', 'Hebrews 4:12',
   'Joshua 1:8', 'Matthew 4:4', 'John 8:32', 'Psalms 12:6',
   'Isaiah 55:11', 'Luke 21:33',
 ]),
 ('Nothing Is Impossible', [
   'Luke 1:37', 'Matthew 19:26', 'Mark 10:27', 'Jeremiah 32:17',
   'Ephesians 3:20', 'Genesis 18:14', 'Jeremiah 33:3', 'Isaiah 55:8',
   'Isaiah 55:9', 'Romans 8:31', 'Romans 8:38', 'Romans 8:39',
 ]),
]

# A second pass, added after the first scoring run came in at 95. Weighted
# towards the books that parse cleanest -- Psalms, Proverbs, Isaiah, the
# Gospels -- rather than towards more famous references in books whose text is
# still full of unresolved glosses.
THEMES += [
 ('Who God Is', ['Psalms 36:5', 'Psalms 145:18', 'Psalms 33:4', 'Isaiah 40:11',
                 'Isaiah 49:15', 'Isaiah 54:10', 'Psalms 116:1', 'Malachi 4:2',
                 'Psalms 68:19', 'Isaiah 64:8']),
 ('The Good News', ['Acts 2:38', 'Acts 16:31', 'John 15:5', 'John 17:3',
                    'Revelation 3:20', 'Romans 5:1', 'Isaiah 44:22', 'Isaiah 1:18']),
 ('When You Are Afraid', ['Psalms 31:24', 'Isaiah 12:2', 'Isaiah 35:4',
                          'Psalms 94:19', 'Psalms 143:8', 'Psalms 3:3']),
 ('When You Are Tired', ['Psalms 42:1', 'Psalms 40:1', 'Psalms 130:5',
                         'Isaiah 58:11', 'Matthew 5:4', 'Psalms 126:3']),
 ('Hope and What Is Coming', ['Psalms 71:5', 'Psalms 146:5', 'Micah 7:7',
                              'Jeremiah 31:3', 'Revelation 22:13', 'Romans 12:12']),
 ('Trust and Faith', ['Psalms 25:4', 'Psalms 33:20', 'Proverbs 29:25',
                      'James 1:22', 'James 2:17', 'Daniel 3:17']),
 ('Strength for Today', ['Psalms 27:4', 'Psalms 16:11', 'Isaiah 6:8',
                         'Psalms 90:12', 'Proverbs 24:16']),
 ('Wisdom and the Way to Go', ['Proverbs 1:7', 'Proverbs 2:6', 'Proverbs 13:20',
                               'Proverbs 14:29', 'Proverbs 28:13', 'Isaiah 30:21',
                               'Proverbs 21:21', 'Proverbs 31:25']),
 ('Love One Another', ['Matthew 7:12', 'Matthew 22:37', 'Matthew 25:40',
                       'Luke 10:27', 'John 15:12', 'John 15:13',
                       'Proverbs 10:12', 'Ecclesiastes 4:9', 'Ecclesiastes 4:12',
                       'Matthew 5:14', 'Deuteronomy 6:5']),
 ('Forgiveness and a Clean Start', ['Matthew 6:14', 'James 5:16', 'James 4:10',
                                    'Isaiah 61:1', 'Psalms 51:12']),
 ('Peace and Rest', ['Psalms 133:1', 'Romans 14:17', 'Psalms 119:114',
                     'Matthew 18:20', 'Psalms 62:8']),
 ('Praise and Thanks', ['Psalms 136:1', 'Psalms 92:1', 'Psalms 66:1',
                        'Psalms 8:3', 'Psalms 19:14', 'James 1:17',
                        'Psalms 63:1', 'Psalms 1:1']),
 ('Purpose and Work', ['Matthew 9:37', 'Luke 12:34', 'Proverbs 3:9',
                       'Genesis 1:27', 'Isaiah 1:17', 'Psalms 20:4']),
 ('Provision', ['Luke 6:38', 'Matthew 7:7', 'Luke 11:9', 'Acts 20:35']),
 ('Nothing Is Impossible', ['Luke 18:27', 'Romans 12:21']),
]

# A third pass. The standalone checks (terminal punctuation, no mid-sentence
# opening) took two themes below quota, so those two get more candidates rather
# than a relaxed rule -- the rule is the point.
THEMES += [
 ('Love One Another', ['Romans 12:9', 'Colossians 3:14', 'Hebrews 13:1',
                       'Philippians 2:3', 'Galatians 5:13', 'Romans 15:7',
                       'Proverbs 27:9', '1 Peter 3:8']),
 ('The Word Itself', ['Psalms 119:130', 'Psalms 119:160', 'Proverbs 30:5',
                      'Psalms 18:30', 'Jeremiah 15:16', 'Isaiah 55:10',
                      'Deuteronomy 8:3', 'Revelation 1:3']),
]


# How many from each theme. Sums to 100. The Word Itself is deliberately small:
# only three of its candidates survive the check today.
QUOTA = __import__('collections').OrderedDict([
    ('Who God Is', 7), ('The Good News', 8), ('When You Are Afraid', 8),
    ('When You Are Tired', 7), ('Hope and What Is Coming', 6),
    ('Trust and Faith', 7), ('Strength for Today', 6),
    ('Wisdom and the Way to Go', 7), ('Love One Another', 6),
    ('Forgiveness and a Clean Start', 6), ('Peace and Rest', 6),
    ('Praise and Thanks', 6), ('Purpose and Work', 6), ('Provision', 6),
    ('The Word Itself', 3), ('Nothing Is Impossible', 5),
])


# --------------------------------------------------------------------------
# Output
# --------------------------------------------------------------------------

def build():
    from collections import OrderedDict
    B = load()
    agg = OrderedDict()
    for th, refs in THEMES:
        for r in refs:
            agg.setdefault(th, [])
            if r not in agg[th]:
                agg[th].append(r)

    chosen, short = OrderedDict(), []
    for th, want in QUOTA.items():
        got = []
        for r in agg.get(th, []):
            if len(got) >= want:
                break
            bk, cv = r.rsplit(' ', 1)
            ch, vs = cv.split(':')
            t = B.get(bk, {}).get((int(ch), int(vs)))
            if t and not problems(t):
                got.append((r, tidy(t)))
        if len(got) < want:
            short.append('%s (%d of %d)' % (th, len(got), want))
        chosen[th] = got
    return chosen, short


def tidy(t):
    # A verse lifted out of a longer quotation can open a quote it never closes.
    # Unbalanced marks read as an error on the page, so drop them.
    if t.count(chr(34)) % 2 == 1:
        t = t.replace(chr(34), '')
    return ' '.join(t.split()).strip()


OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                   '..', '..', 'setup', 'scripture-of-day.md')

EM = chr(8212)
BS = chr(92)


def write_md(chosen):
    H = []
    A = H.append
    A('# Scripture of the Day')
    A('')
    A('One hundred verses cleared for reading on air, in the **Jubilee Standard Version (JSV)**.')
    A('')
    A('Source: `W:' + BS + 'ZevInspire.com' + BS + 'translation` ' + EM + ' one folder per book, one file per')
    A('chapter. That tree is the authority for the wording here. If it changes, this file is')
    A('regenerated from it rather than edited:')
    A('')
    A('```')
    A('python tools/scripture/build-scripture-of-day.py')
    A('```')
    A('')
    A('---')
    A('')
    A('## Before anyone reads one of these out')
    A('')
    A('**The JSV is a translation in progress, and not all of it is fit to broadcast.** That is')
    A('why this is a fixed list rather than an instruction to open the Bible and pick something.')
    A('')
    A('Parts of the text still carry the translator' + chr(8217) + 's working alternatives inside the verse,')
    A('semicolon-separated and often duplicated. They are margin notes, not readings:')
    A('')
    A('```')
    A('  1 John 4:19    We love; covenant love; covenant love; covenant love because He')
    A('                 first loved us.')
    A('  Hebrews 13:8   Yeshua the drenched with oil; saturated with Ruach One is the same')
    A('                 yesterday and today and forever.')
    A('  Proverbs 3:5   Trust in Yahuah with all your heart; your discerning sight; the')
    A('                 ability to distinguish; your discerning sight ...')
    A('  Psalms 33:4    For the davar of Yahuah; the word of Yahuah is upright ...')
    A('```')
    A('')
    A('Every verse below was checked against seven faults and carries none of them:')
    A('')
    A('| Fault | What it looks like |')
    A('|---|---|')
    A('| Duplicated gloss | `love; covenant love; covenant love` |')
    A('| Gloss tail | `a strong tower; the wholesome one` |')
    A('| Gloss echo | `the davar of Yahuah; the word of Yahuah` |')
    A('| Doubled word | `receive tender tender compassion` |')
    A('| Truncated verse | text that stops on a comma |')
    A('| No terminal punctuation | Ephesians 2:8 stops mid-sentence |')
    A('| Opens mid-sentence | Ephesians 2:9 is the bare tail `not from works...` |')
    A('')
    A('Hebrew parallelism is **not** treated as a fault. ' + chr(8220) + 'I will be exalted among the nations,')
    A('I will be exalted in the land' + chr(8221) + ' repeats on purpose, and so does ' + chr(8220) + 'they are new every')
    A('morning; great is Your faithfulness.' + chr(8221) + ' Those are the verse, not an error in it.')
    A('')
    A('Some very familiar references are missing, and it is worth knowing why rather than')
    A('assuming they were overlooked. **Romans 5:8, 1 Corinthians 13:4, Galatians 5:22,')
    A('Ephesians 2:8, Ephesians 2:10, Philippians 4:6, Jeremiah 29:11 and 1 John 1:9** are all')
    A('unreadable in the JSV as it stands. **Joshua 1:9** is absent because Joshua has no JSV')
    A('text in the tree yet, and neither does Job. They belong here the day that changes.')
    A('')
    A('### The names, so nobody is caught out mid-sentence')
    A('')
    A('The JSV uses Hebraic naming throughout:')
    A('')
    A('| In the JSV | What other versions render |')
    A('|---|---|')
    A('| **Yahuah** | the LORD |')
    A('| **Elohim** | God |')
    A('| **Yeshua** | Jesus |')
    A('| **Ruach** | Spirit, breath |')
    A('| **shalom** | peace, wholeness |')
    A('| **Yisra' + chr(8217) + 'el**, **Ya' + chr(8217) + 'aqov**, **Yochanan** | Israel, Jacob, John |')
    A('')
    A('Read them as written. Substituting the familiar word halfway through is what makes a')
    A('reading sound uncertain, and a fixed list exists so nothing has to be improvised.')
    A('')
    A('### Using them on air')
    A('')
    A('- One a day, in order, is a little over three months without a repeat.')
    A('- The themes are the useful handle, not the numbering: reach for **When You Are Afraid**')
    A('  on a hard news day, **Praise and Thanks** on a Sunday morning.')
    A('- Each is short enough to read between tracks without a talk-up, and self-contained')
    A('  enough to make sense to somebody who has just tuned in.')
    A('- Give the reference first and the verse second. Anyone who wants to find it later')
    A('  needs the address before the words.')
    A('')
    A('---')
    A('')
    n = 0
    for th, items in chosen.items():
        A('## ' + th)
        A('')
        for ref, txt in items:
            n += 1
            A('**%d. %s**' % (n, ref))
            A('')
            A('> ' + txt)
            A('')
        A('---')
        A('')
    A('## If you extend it')
    A('')
    A('Add references to `THEMES` in the build script and re-run it. Do not add a verse to')
    A('this file by hand: the check is what the file is for, and a hand-added verse has not')
    A('been through it.')
    A('')
    A('If a theme comes up short, the script says so by name. Widen that theme' + chr(8217) + 's candidates')
    A('rather than relaxing a rule.')
    io.open(os.path.abspath(OUT), 'w', encoding='utf-8', newline='').write(NL.join(H) + NL)
    return n


if __name__ == '__main__':
    chosen, short = build()
    total = sum(len(v) for v in chosen.values())
    print('selected %d verse(s) across %d theme(s)' % (total, len(chosen)))
    for s in short:
        print('  SHORT: %s -- widen the candidate pool for that theme' % s)
    for th, v in chosen.items():
        print('   %-32s %d' % (th, len(v)))
    print('')
    n = write_md(chosen)
    print('')
    print('wrote %s  (%d verses)' % (os.path.normpath(OUT), n))
