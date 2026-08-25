/* station-articles.js — the written half of every station page.
 *
 * WHAT THIS IS FOR. A station card can say what a station is called and what
 * genre it sits in. It cannot say why anyone would stay. That is what these
 * are: a page per station, on the InspireManna article template — full-bleed
 * hero, prose column, sticky sidebar, a closing call to listen — rather than
 * the popup that used to open over the shelf and told a reader four facts they
 * had already read on the card.
 *
 * NO NUMBERS IN THE PROSE, DELIBERATELY.
 *
 * Every count on a station page — tracks, albums, reach, what is playing right
 * now — is rendered from the catalogue at view time and lives in the sidebar or
 * the meta row. The prose stays qualitative, so a station that gains 357 songs
 * in a morning (God's Little Lambs did, on 2026-08-23) does not leave an
 * article claiming it has none. The one thing this file must never become is a
 * second, staler copy of stations-data.js.
 *
 * A station with no entry here still renders: the view falls back to the
 * catalogue's own description and the sidebar facts. What it loses is the
 * writing, which is the whole point, so new stations should get an entry.
 *
 * `need`    the line under the headline — who this is for, said plainly.
 * `stands`  the callout after the prose: the sentence the station rests on.
 * `sections`  h: heading, p: [paragraphs].
 */
window.KJ_ARTICLES = {

  'jubilee-radio': {
    need: 'For the house that wants one station on all day and no decisions to make.',
    stands: 'The whole family, in one rotation, around the clock.',
    sections: [
      { h: 'What you will hear', p: [
        'The flagship draws on the entire Inspire Family catalogue rather than any one voice, so a single hour can move from a worship anthem to a teaching record to something quiet, and none of it arrives as a jolt. It is the station to leave on when nobody wants to choose.',
        'Because every voice on the dial feeds it, KJubilee is also the fastest way to find out which of them you want to follow. Hear something that stops you, and there is a station on this dial that plays nothing else.',
      ]},
      { h: 'Who it is for', p: [
        'Kitchens, workshops, long drives, offices, and anywhere the radio is company rather than an event. It asks nothing of you and rewards attention if you give it.',
      ]},
      { h: 'The voice behind it', p: [
        'Jubilee fronts the flagship because the flagship is the house, not a lane within it. Her own records are here, but so is everyone else’s, and that is the point.',
      ]},
    ],
  },

  'jubilee-praise': {
    need: 'For anyone who has ever meant to read the Bible through and lost the thread by Leviticus.',
    stands: 'The book, sung in order, from Genesis to Revelation.',
    sections: [
      { h: 'What you will hear', p: [
        'Torah Sings is the Scriptures set to music and aired in the order they were written down. Not verses lifted out and made into choruses — the text itself, book by book, so the shape of the story survives the setting.',
        'The effect is closer to being read to than to a worship set. Genealogies and laments come round as surely as the psalms do, and the records that follow the hard books are the ones listeners tend to write in about.',
      ]},
      { h: 'Who it is for', p: [
        'People who want Scripture running in the room without a study plan to keep up with, and people who learned early that they remember what they can sing long after they forget what they read.',
      ]},
      { h: 'The voice behind it', p: [
        'Zev carries the Hebrew roots and the feasts across this dial, and this is his workhorse station — the largest single catalogue on the band and the one he is most often heard on.',
      ]},
      { h: 'How the day is built', p: [
        'The rotation walks the canon rather than shuffling it, so tuning in twice at the same hour on consecutive days lands you in roughly the same country of the text. Sunrise Praise and Evening Worship are the two fixed points.',
      ]},
    ],
  },

  'jubilee-gospel-fire': {
    need: 'For the morning you need the room lifted, not soothed.',
    stands: 'Gospel with the roof off.',
    sections: [
      { h: 'What you will hear', p: [
        'Full-throated gospel — choir stacks, Hammond, a rhythm section that pushes rather than keeps time. It is the loudest station on the dial and makes no apology for it.',
        'The catalogue is built to cross the lines that usually divide gospel radio: Pentecostal, charismatic and Black-church traditions all sit in the same rotation, because the songs travel further than the labels do.',
      ]},
      { h: 'Who it is for', p: [
        'Sunday mornings before church and Tuesday afternoons when Sunday feels far away. Anyone who has ever turned a worship track up rather than down.',
      ]},
      { h: 'The voice behind it', p: [
        'Imani carries Pentecostal fire on this dial and Zariah joins her here, which is why the station has more range than a single-voice format usually manages.',
      ]},
    ],
  },

  'latin-worship': {
    need: 'For the listener who loves how Latin worship moves but wants to follow every word.',
    stands: 'The music is Latin. The words are English. Both are meant.',
    sections: [
      { h: 'What you will hear', p: [
        'Ballad, cumbia, samba and theatrical-liturgical worship played straight — the arrangements are not translated or thinned out. What is in English is the singing.',
        'That is an unusual proposition and a deliberate one. Latin worship carries rhythms and harmonic turns that English-language worship rarely reaches for, and this station hands them to a listener who would otherwise only meet them in a language they do not speak.',
      ]},
      { h: 'Who it is for', p: [
        'English speakers who felt something in a Spanish-language service and wanted more of it; second and third generation listeners who kept the music and lost the language; anyone tired of worship that only knows one groove.',
      ]},
      { h: 'The voice behind it', p: [
        'Santiago’s catalogue is the spine of the station — the Latino heart of the family, singing here in the language his listeners read in.',
      ]},
    ],
  },

  'riddim-and-rhyme': {
    need: 'For the diaspora, and for anyone who worships better on the offbeat.',
    stands: 'Reggae, dancehall, soca and Afrobeats, carrying teaching that stays.',
    sections: [
      { h: 'What you will hear', p: [
        'Afro-Caribbean fusion: the riddim is real, the bass is where it belongs, and the words are teaching hymnody rather than filler. Gospel-soul sits in the same rotation and keeps the station from becoming a party channel with a Bible verse attached.',
      ]},
      { h: 'Who it is for', p: [
        'Caribbean and West African households, the diaspora that grew up between two sound systems, and listeners anywhere who find that a groove they can move to is the one that gets a lyric to stick.',
      ]},
      { h: 'The voice behind it', p: [
        'Zariah carries the Caribbean and the diaspora across the dial, with Santiago alongside her here.',
      ]},
    ],
  },

  'island-hallelujah': {
    need: 'For the hour when everything needs to slow down without going quiet.',
    stands: 'Christ lifted up in the language of the islands.',
    sections: [
      { h: 'What you will hear', p: [
        'Slack-key guitar, ʻukulele and island reggae — warm, unhurried, and much closer to a family gathering on the sand than to a stage. It is the gentlest of the up-tempo stations and the easiest to leave running for hours.',
      ]},
      { h: 'Who it is for', p: [
        'Pacific Island families, anyone raised near that music, and listeners who want worship that carries joy without volume.',
      ]},
      { h: 'The voice behind it', p: [
        'Tahoma carries the native voice and healing on this dial, and this is the station where that lands as celebration rather than lament.',
      ]},
    ],
  },

  'jubilee-kids-party': {
    need: 'For six to eight year olds, and the parents who have to hear it too.',
    stands: 'Kids’ praise that a household can survive on repeat.',
    sections: [
      { h: 'What you will hear', p: [
        'Party praise built for children who are old enough to sing along and young enough to want to dance while they do it. Animal choruses, birthday songs, and a great deal of shouting the good bits.',
        'The songs are written to be endured by adults as well as enjoyed by children, which is a harder brief than it sounds and the reason this catalogue exists rather than a playlist of whatever was to hand.',
      ]},
      { h: 'Who it is for', p: [
        'Birthday parties, car journeys, the hour between school and dinner, and any household where the music has to be something everyone can be in the same room with.',
      ]},
      { h: 'The voice behind it', p: [
        'Party Giggles is a catalogue rather than a person — the family’s children’s act, with its own sound and its own following.',
      ]},
    ],
  },

  'ancient-paths': {
    need: 'For the Arabic-speaking believer, and for the seeker who has never heard worship sound like this.',
    stands: 'Maqam, oud and lament — worship that sounds like home.',
    sections: [
      { h: 'What you will hear', p: [
        'Maqam-based worship and acoustic lament: modal, patient, and built on intervals most Western worship never uses. It is the least familiar sound on the dial to an American ear and the most familiar to a Levantine one.',
        'Lament has a place in the rotation rather than an apology. Songs that sit with grief are not skipped past on the way to something brighter.',
      ]},
      { h: 'Who it is for', p: [
        'Arabic-speaking families, the Middle Eastern diaspora, and anyone who suspects that worship in their own tradition has been running on a very small number of shapes.',
      ]},
      { h: 'The voice behind it', p: [
        'Amir carries this ground on the dial — the South Asian and Middle Eastern soul of the family.',
      ]},
    ],
  },

  'midnight-praise': {
    need: 'For the overnight watch, the shift worker, and the ones still awake at three.',
    stands: 'For the long night, and the people who keep it.',
    sections: [
      { h: 'What you will hear', p: [
        'Celtic and European ambient worship — contemplative, cinematic, largely wordless in stretches, and mixed so it can be left on low without disappearing. Nothing on this station is designed to make you sit up.',
      ]},
      { h: 'Who it is for', p: [
        'Night shifts, hospital corridors, insomnia, prayer watches, and the small hours when a bright worship set would be an intrusion. It is also the station most often left running while people work.',
      ]},
      { h: 'The voice behind it', p: [
        'Nova’s ground on this dial is the doubting, which is exactly who is awake at three in the morning. The station is built around that rather than around a genre.',
      ]},
      { h: 'How the day is built', p: [
        'The two fixed points are The Long Night at ten and the Watch of the Fourth Hour at three — named for the watch, not for a daypart.',
      ]},
    ],
  },

  'hebraic-celebrations': {
    need: 'For the Hebrew-Roots family, and for the feasts as they actually arrive.',
    stands: 'The feast days, kept and sung.',
    sections: [
      { h: 'What you will hear', p: [
        'Hebraic chant and modern fusion, built around the celebration rather than the calendar page: circle dances, feast-day songs, and the melodies that a household already knows well enough to join in on.',
      ]},
      { h: 'Who it is for', p: [
        'Messianic and Hebrew-Roots believers, families keeping the feasts at home, and listeners who found the appointed times later in life and are learning the music that goes with them.',
      ]},
      { h: 'The voice behind it', p: [
        'Zev’s second station, and deliberately not the same picture as his first: Torah Sings is the text held still by a song, this one is the room moving.',
      ]},
    ],
  },

  'inspire-hymns-heritage': {
    need: 'For the hymns you were raised on, and the ones being written now in the same key.',
    stands: 'The old words, still load-bearing.',
    sections: [
      { h: 'What you will hear', p: [
        'Hymns and heritage worship — traditional settings alongside the modern hymn revival, which has spent a decade writing new songs with old bones. Celtic threads run through it.',
      ]},
      { h: 'Who it is for', p: [
        'Listeners who grew up with a hymnal and never quite replaced it, and younger ones who arrived at the same songs from the other direction.',
      ]},
      { h: 'The voice behind it', p: [
        'Nova fronts this one as well as Midnight Praise — the same instinct for the listener who is weighing something up, pointed at a different part of the day.',
      ]},
    ],
  },

  'country-gospel': {
    need: 'For the porch, the pickup, and the long way home.',
    stands: 'Christian country, sung plain.',
    sections: [
      { h: 'What you will hear', p: [
        'Country gospel with the instruments left in — steel, fiddle, close harmony — and lyrics that tell rather than declare. It is the most narrative station on the dial: most songs here are a story about somebody.',
      ]},
      { h: 'Who it is for', p: [
        'The Bible Belt and everyone who has ever driven through it with the window down. Christian country reaches a far larger share of religious radio listeners than its share of the charts suggests, and this is that audience’s station.',
      ]},
      { h: 'The voice behind it', p: [
        'Elias carries Appalachian repentance across the dial, with Eliana alongside him here — two voices that suit a form built on duet and testimony.',
      ]},
    ],
  },

  'yes-and-amen': {
    need: 'For the day you need to say what is already true rather than ask for it.',
    stands: 'Every promise of Elohim is Yes and Amen in Him.',
    sections: [
      { h: 'What you will hear', p: [
        'The SingItDone declaration albums: all twelve of the Inspire Family, one record each, singing who they already are before Yahuah. These are not petitions set to music. They are statements.',
        'That makes the station tonally different from everything around it. A petition song leans forward; a declaration song stands still. Listeners tend to find it either bracing or exactly what they were short of.',
      ]},
      { h: 'Who it is for', p: [
        'Anyone who has prayed the same request so many times it has worn smooth, and anyone who was taught to ask but never taught to agree.',
      ]},
      { h: 'The voice behind it', p: [
        'Elias fronts it, but every voice on the roster has a record here — which is the point: the declaration is the family’s, not one singer’s.',
      ]},
      { h: 'How the day is built', p: [
        'Morning Declaration opens the day and Sing What He Has Already Said closes it. The two are the same idea at either end of the waking hours.',
      ]},
    ],
  },

  'jubilee-ccm': {
    need: 'For the listener who wants the contemporary sound without the contemporary vagueness.',
    stands: 'Scripture-rooted songs, in the style most of the world is already listening to.',
    sections: [
      { h: 'What you will hear', p: [
        'Contemporary arrangements carrying text that stays close to Scripture — the production values of mainstream Christian radio without the drift into songs that could be about anyone.',
      ]},
      { h: 'Who it is for', p: [
        'Listeners who came in through mainstream Christian radio and found themselves wanting more Bible in the lyrics, and anyone introducing someone to worship who needs it to sound like the rest of their music.',
      ]},
      { h: 'The voice behind it', p: [
        'Jubilee fronts it — the house voice on the house style.',
      ]},
    ],
  },

  'radiant-stones-radio': {
    need: 'For a catalogue still being cut.',
    stands: 'Assigned, named, and not yet on air.',
    sections: [
      { h: 'What this frequency is', p: [
        'Radiant Stones has its place on the dial and its programming is still being built. The frequency is held rather than filled: nothing airs here until there is a catalogue worth leaving on.',
      ]},
    ],
  },

  'inspire-acapella': {
    need: 'For voices with nothing behind them.',
    stands: 'Assigned, named, and not yet on air.',
    sections: [
      { h: 'What this frequency is', p: [
        'An a cappella station in preparation — unaccompanied voice, which is the oldest form of worship on this dial and the one that leaves a singer with nowhere to hide. It is not airing yet.',
      ]},
    ],
  },

  'gods-little-lambs': {
    need: 'For three to five year olds, and the grown-up holding them.',
    stands: 'Little ones, big songs.',
    sections: [
      { h: 'What you will hear', p: [
        'Songs written for the youngest listeners on the dial — short, warm, and built around animals, bedtime, and the handful of truths a three year old can carry. My Tiny Tiggles is the whole rotation.',
        'It is a quieter room than Jubilee Kids Party next door on the dial. That station is a party for six to eight year olds; this one is closer to a lap and a picture book, and it has lullabies in the rotation because a nap is a legitimate use of a radio station.',
      ]},
      { h: 'Who it is for', p: [
        'Toddlers and preschoolers, and the parent who has to choose something that will not fray the afternoon. It is deliberately parent-attractive: the point is that both of you can stand it.',
      ]},
      { h: 'The voice behind it', p: [
        'My Tiny Tiggles is a catalogue rather than a persona — the family’s act for the very young, with its own albums and its own sound.',
      ]},
    ],
  },
};
