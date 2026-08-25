document.addEventListener('error', function (e) {
        var t = e.target;
        if (t && t.tagName === 'IMG' && !t.dataset.imgFallback) {
          t.dataset.imgFallback = '1';
          t.src = '/images/JubileeLogo.png';
        }
      }, true);
    


        // ============================================
        // STATION DATA
        // ============================================

        // Jubilee Radio v8.0 station registry — Phases 1–3 (27 stations).
        //
        // Each entry carries the spec metadata: HM frequency, operating
        // mode (OHI / Non-OHI / Mixed / Both), phase, content category,
        // bestseller rating (0–100), potential global reach (string), and
        // persona anchor. The `streamUrl` field maps each station to the
        // closest of the 5 currently-running radio.kjubilee.com
        // streams — replace these as additional streams come online.
        //
        // Stations are listed in HM frequency order so the array index
        // already mirrors the dial layout that the Heaven's Dial UI will
        // render in a future iteration. The `frequency` field is kept as
        // a derived "HM XXX.XX" display string for the existing card
        // template's centered title.
        const STREAM_ADULT     = "https://radio.kjubilee.com/stream/adult";
        const STREAM_KIDS_35   = "https://radio.kjubilee.com/stream/kids-3-5";
        const STREAM_KIDS_68   = "https://radio.kjubilee.com/stream/kids-6-8";
        const STREAM_GOSPEL    = "https://radio.kjubilee.com/stream/gospel";
        const STREAM_CELESTIAL = "https://radio.kjubilee.com/stream/celestial";
        // Dedicated mounts: one station, one Liquidsoap source, its own
        // catalogue. Everything above is a shared format mount.
        const STREAM_JUBILEE   = "https://radio.kjubilee.com/stream/jubilee";
        const STREAM_ROMANA    = "https://radio.kjubilee.com/stream/romana";
        const STREAM_COUNTRY   = "https://radio.kjubilee.com/stream/country-gospel";
        const STREAM_FIRE      = "https://radio.kjubilee.com/stream/gospel-fire";
        const STREAM_TORAH     = "https://radio.kjubilee.com/stream/torah-sings";
        const STREAM_LATIN     = "https://radio.kjubilee.com/stream/latin-worship";
        const STREAM_HEBRAIC   = "https://radio.kjubilee.com/stream/hebraic-celebrations";
        const STREAM_WATERS    = "https://radio.kjubilee.com/stream/island-hallelujah";
        const STREAM_RIDDIM    = "https://radio.kjubilee.com/stream/riddim-and-rhyme";
        const STREAM_MIDNIGHT  = "https://radio.kjubilee.com/stream/midnight-praise";

        const stations = [
            // ===================================================================
            // JUBILEE RADIO — prototype station (manifest-driven, Inspire Family)
            // Plays the full Inspire Family catalog from
            //   /cdn/radio/HM308.70-EN/delivery/music.json
            // ===================================================================
            {
                slug: "jubilee-radio", hm: "308.70", frequency: "HM 308.70", name: "kJubilee Radio",
                band: "fivefold", primary: "music",
                // The slug stays jubilee-radio. It is the channel's identity —
                // the generated cover and any listener favourites are keyed to
                // it — and a display rename is not a reason to move either.
                //
                // THE FREQUENCY IS NOT LIKE THE SLUG. The tenant record and the
                // published CDN tree are keyed to the HM number (HM308.70-EN),
                // so moving 388.70 -> 308.70 on 2026-08-25 moved both: the
                // delivery tree was copied to the new id before the catalogue
                // changed, because build-home-data.js reads ON AIR off the
                // presence of delivery/music.json under the id the frequency
                // implies. Change the frequency again and that tree moves again.
                formatLabel: "Jubilee Praise",
                mode: "Both", phase: 1, bestseller: 50, reach: "Featured",
                // Sacramento, not Seattle: the station's anchor base moved with
                // the 2026-08-25 rename. Same zone, so no schedule changed.
                hostCity: "Sacramento", timezone: "America/Los_Angeles",
                image: "/images/JubileeLogo.png",
                description: "kJubilee Radio — continuous worship and teaching from the Inspire Family catalog.",
                listeners: "Inspire Family · 1,502 tracks",
                streamUrl: null,
                musicManifestUrl: "/cdn/radio/HM308.70-EN/delivery/music.json",
                currentShow: { name: "Inspire Family Rotation", host: "kJubilee Radio", time: "24/7" },
                schedule: [
                    { time: "00:00", show: "Continuous Inspire Family playback" }
                ]
            },
            // ===================================================================
            // BAND 1 — Five-Fold Ministry (51 stations)
            // ===================================================================
            {
                slug: "logos", hm: "380.20", frequency: "HM 380.20", name: "The Logos",
                band: "fivefold", primary: "devotionals",
                mode: "Both", phase: 1, bestseller: 92, reach: "350M",
                image: "/images/jubilee-profile.png",
                description: "Continuous Scripture rotation — biblically grounded (John 1:1) and accessible across denominations.",
                listeners: "Devotional · 24/7 Scripture",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "The Logos Live", host: "Inspire Family", time: "24/7 Live" },
                schedule: [
                    { time: "00:00", show: "Word Through the Night" },
                    { time: "06:00", show: "Morning Logos" }
                ]
            },
            {
                slug: "wisdom-channel", hm: "380.50", frequency: "HM 380.50", name: "The Wisdom Channel",
                band: "fivefold", primary: "devotionals",
                mode: "Both", phase: 4, bestseller: 91, reach: "800M",
                image: "/images/jubilee-profile.png",
                description: "Proverbs, Ecclesiastes, Job, and wisdom-literature focus — daily readings and short reflections from the Bible's wisdom corpus.",
                listeners: "Devotional · Wisdom Literature",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "The Wisdom Channel Live", host: "Approved Narrators", time: "24/7 Live" },
                schedule: [
                    { time: "07:00", show: "A Proverb a Chapter" },
                    { time: "19:00", show: "Evening Reflection" }
                ]
            },
            {
                slug: "jubilee-praise", hm: "305.40", frequency: "HM 305.40", name: "Torah Sings",
                band: "fivefold", primary: "music",
                // The card category comes from FORMAT[primary] unless a station
                // overrides it here — this one carries its own format name
                // rather than the shared "Praise & Worship" label.
                formatLabel: "Angel Songs",
                mode: "OHI", phase: 1, bestseller: 96, reach: "480M",
                image: "/images/jubilee-profile.png",
                description: "Angel Songs flagship — Torah-rooted worship voiced by Zev, the family workhorse station.",
                listeners: "Angel Songs · 1,749 tracks · Genesis to Revelation",
                // A live Icecast mount like the rest of the dial — every listener
                // hears the same track at the same moment. Liquidsoap broadcasts
                // from a hot-swap playlist pair generated off the same verified
                // manifest the site carries, so the broadcast and the catalogue
                // cannot drift. Rebuild the playlist with:
                //   node tools/build-station-manifest.js --station HM305.12-EN
                //   node tools/build-station-playlist.js --station HM305.12-EN --out-dir <dir>
                // then copy to /opt/jubilee-radio/storage/playlists on the radio
                // host and run `torah-sings.swap` over the Liquidsoap telnet port.
                streamUrl: null,
                musicManifestUrl: "/cdn/radio/HM305.12-EN/delivery/music.json",
                currentShow: { name: "Torah Sings Live", host: "Zev Inspire", time: "24/7 Live" },
                schedule: [
                    { time: "06:00", show: "Sunrise Praise" },
                    { time: "20:00", show: "Evening Worship" }
                ]
            },
            {
                slug: "money-faith", hm: "387.20", frequency: "HM 387.20", name: "Money & Faith",
                band: "fivefold", primary: "bible_studies",
                mode: "Both", phase: 6, bestseller: 93, reach: "320M",
                image: "/images/jubilee-profile.png",
                description: "Biblical stewardship, generosity, and finances taught through Scripture — practical wisdom for households navigating money with faith at the center.",
                listeners: "Stewardship · Biblical Finance",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Money & Faith Live", host: "Approved Teachers", time: "24/7 Live" },
                schedule: [
                    { time: "08:00", show: "Steward's Hour" },
                    { time: "18:00", show: "Generosity Stories" }
                ]
            },
            {
                slug: "heavens-dawn", hm: "380.80", frequency: "HM 380.80", name: "Heaven's Dawn",
                band: "fivefold", primary: "devotionals",
                mode: "Both", phase: 4, bestseller: 92, reach: "700M",
                image: "/images/jubilee-profile.png",
                description: "Early-morning devotional station — sunrise worship, Scripture reflection, and gentle praise for the first hour of the day.",
                listeners: "Sunrise Devotional · 24/7",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Heaven's Dawn Live", host: "Sunrise Block", time: "24/7 Live" },
                schedule: [
                    { time: "05:00", show: "First Light" },
                    { time: "06:30", show: "Daily Bread" }
                ]
            },
            {
                slug: "freedom-steps", hm: "391.20", frequency: "HM 391.20", name: "Freedom Steps",
                band: "fivefold", primary: "online_church",
                mode: "Non-OHI", phase: 6, bestseller: 93, reach: "380M",
                image: "/images/jubilee-profile.png",
                description: "Recovery and freedom-from-bondage teaching — Scripture-grounded support for addictions, strongholds, and the daily walk toward wholeness.",
                listeners: "Recovery · Freedom Walk",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Freedom Steps Live", host: "Recovery Pastors", time: "24/7 Live" },
                schedule: [
                    { time: "07:00", show: "One Day at a Time" },
                    { time: "21:00", show: "Late-Night Lifeline" }
                ]
            },
            {
                slug: "upper-room", hm: "340.30", frequency: "HM 340.30", name: "The Upper Room",
                band: "fivefold", primary: "prayer",
                mode: "Both", phase: 1, bestseller: 91, reach: "180M",
                image: "/images/jubilee-profile.png",
                description: "Live & recorded prayer — biblically iconic name (Acts 1–2). Listener participation at scale.",
                listeners: "Prayer · Continuous Intercession",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "The Upper Room Live", host: "Intercession Team", time: "24/7 Live" },
                schedule: [
                    { time: "00:00", show: "Watchman's Hour" },
                    { time: "12:00", show: "Midday Prayer" }
                ]
            },
            {
                slug: "marriage-matters", hm: "385.20", frequency: "HM 385.20", name: "Marriage Matters",
                band: "fivefold", primary: "bible_studies",
                mode: "Both", phase: 6, bestseller: 94, reach: "380M",
                image: "/images/jubilee-profile.png",
                description: "Biblical marriage teaching, couple devotionals, and covenant-grounded wisdom for husbands and wives at every stage of the journey.",
                listeners: "Marriage · Couples Walk",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Marriage Matters Live", host: "Approved Teachers", time: "24/7 Live" },
                schedule: [
                    { time: "07:30", show: "Couples Devotional" },
                    { time: "20:00", show: "Date-Night Talk" }
                ]
            },
            {
                slug: "the-mended-place", hm: "392.20", frequency: "HM 392.20", name: "The Mended Place",
                band: "fivefold", primary: "online_church",
                mode: "Both", phase: 6, bestseller: 92, reach: "290M",
                image: "/images/jubilee-profile.png",
                description: "Healing-focused teaching for the brokenhearted — restoration, identity repair, and gentle gospel pastoring for those rebuilding after wounding.",
                listeners: "Healing · Restoration Walk",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "The Mended Place Live", host: "Pastoral Care Team", time: "24/7 Live" },
                schedule: [
                    { time: "09:00", show: "Restoration Hour" },
                    { time: "22:00", show: "Quiet Mending" }
                ]
            },
            {
                slug: "jubilee-ccm", hm: "304.80", frequency: "HM 304.80", name: "Celebrate Yeshua!",
                band: "fivefold", primary: "music",
                // The slug stays jubilee-ccm. It is the station's identity, not
                // its display name: the generated cover, the published CDN copy
                // and any listener favourites are all keyed to it.
                // Biblical Music, not CCM. The station plays Scripture-rooted
                // songs and the card should say what they ARE rather than which
                // industry shelf they would sit on; "Contemporary Christian
                // Music" named the market, not the music. The slug, the cover
                // and every listener favourite stay keyed to jubilee-ccm — the
                // label is display only, and formatLabel is the one field that
                // sets it (see build-home-data.js genreFor: a hand-written
                // formatLabel wins over everything).
                formatLabel: "Biblical Music",
                mode: "Non-OHI", phase: 1, bestseller: 94, reach: "420M",
                image: "/images/jubilee-profile.png",
                // The blurb sits directly under that label on the same card, so
                // it cannot go on calling the station by the name the label just
                // stopped using. Both figures are kept; only the framing moves.
                description: "Biblical Music — Scripture-rooted songs in the contemporary style that has grown 60% over five years to become the #2 genre globally.",
                listeners: "Biblical Music · Mainstream Christian",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Celebrate Yeshua! Live", host: "Jubilee Inspire", time: "24/7 Live" },
                schedule: [
                    { time: "08:00", show: "Morning CCM" },
                    { time: "17:00", show: "Drive-Time CCM" }
                ]
            },
            {
                slug: "yes-and-amen", hm: "303.10", frequency: "HM 303.10", name: "Yes and Amen",
                band: "fivefold", primary: "music",
                // Its own format name. These are declaration records — first-person
                // covenant identity sung before Yahuah — and "Praise & Worship"
                // describes neither what they are about nor how they are sung.
                formatLabel: "Covenant Worship",
                // OHI naming (Yahuah, Yeshua, Elohim, Ruach HaKodesh in the feminine)
                // is declared by the SingItDone property itself, in its README and in
                // its blueprints. It is not inferred from the lyrics.
                mode: "OHI", phase: 1, bestseller: 91, reach: "210M",
                image: "/images/jubilee-profile.png",
                description: "The SingItDone declaration albums — all twelve of the Inspire Family, one record each, singing who they already are before Yahuah. Every promise of Elohim is Yes and Amen in Him.",
                listeners: "Covenant Worship · Inspire Family · 191 tracks",
                // Client-side rotation straight off the repository. Rebuild with:
                //   node tools/build-station-manifest.js --station HM314.88-EN
                //   node tools/build-station-playlist.js --station HM314.88-EN --out-dir <dir>
                streamUrl: null,
                musicManifestUrl: "/cdn/radio/HM314.88-EN/delivery/music.json",
                currentShow: { name: "Yes and Amen Live", host: "Elias Inspire", time: "24/7 Live" },
                schedule: [
                    { time: "06:00", show: "Morning Declaration" },
                    { time: "19:00", show: "Sing What He Has Already Said" }
                ]
            },
            {
                slug: "raising-arrows", hm: "385.50", frequency: "HM 385.50", name: "Raising Arrows",
                band: "fivefold", primary: "bible_studies",
                mode: "Both", phase: 6, bestseller: 92, reach: "290M",
                image: "/images/jubilee-profile.png",
                description: "Parenting taught from Psalm 127 — discipleship in the home, gentle correction, and forming children of conviction in a noisy world.",
                listeners: "Parenting · Family Discipleship",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Raising Arrows Live", host: "Parenting Pastors", time: "24/7 Live" },
                schedule: [
                    { time: "07:00", show: "Family Altar" },
                    { time: "19:30", show: "Bedtime Wisdom" }
                ]
            },
            {
                slug: "strong-sober", hm: "391.50", frequency: "HM 391.50", name: "Strong Sober",
                band: "fivefold", primary: "online_church",
                mode: "Non-OHI", phase: 6, bestseller: 94, reach: "420M",
                image: "/images/jubilee-profile.png",
                description: "Sobriety-grounded discipleship — daily readings, testimonies, and biblical teaching that hold the line for men and women walking in clarity.",
                listeners: "Sobriety · Daily Discipline",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Strong Sober Live", host: "Recovery Pastors", time: "24/7 Live" },
                schedule: [
                    { time: "06:00", show: "Sober Sunrise" },
                    { time: "21:00", show: "Evening Anchor" }
                ]
            },
            {
                slug: "jubilee-sanctuary", hm: "390.30", frequency: "HM 390.30", name: "Jubilee Sanctuary",
                band: "fivefold", primary: "online_church",
                mode: "Mixed", phase: 1, bestseller: 87, reach: "250M",
                image: "/images/jubilee-profile.png",
                description: "Streamed worship services from across the Christian tradition — multi-denominational curation.",
                listeners: "Online Church · All Traditions",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Jubilee Sanctuary Live", host: "Multi-Denominational", time: "24/7 Live" },
                schedule: [
                    { time: "10:00", show: "Sunday Service Stream" },
                    { time: "19:00", show: "Midweek Service" }
                ]
            },
            {
                slug: "pure-heart-brothers", hm: "396.20", frequency: "HM 396.20", name: "Pure Heart Brothers",
                band: "fivefold", primary: "online_church",
                mode: "Non-OHI", phase: 6, bestseller: 92, reach: "310M",
                image: "/images/jubilee-profile.png",
                description: "Brotherhood discipleship for men — purity, accountability, and forged-in-fire teaching for husbands, fathers, and sons walking the narrow road.",
                listeners: "Men's Ministry · Brotherhood",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Pure Heart Brothers Live", host: "Men's Pastors", time: "24/7 Live" },
                schedule: [
                    { time: "05:30", show: "Iron Hour" },
                    { time: "20:00", show: "Brotherhood Roundtable" }
                ]
            },
            {
                slug: "jubilee-teaching", hm: "383.20", frequency: "HM 383.20", name: "Jubilee Teaching",
                band: "fivefold", primary: "bible_studies",
                mode: "Both", phase: 1, bestseller: 89, reach: "220M",
                image: "/images/jubilee-profile.png",
                description: "Recorded teaching, expositional Bible study, sermons, topical messages.",
                listeners: "Bible Teaching · Continuous",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Jubilee Teaching Live", host: "Approved Teachers", time: "24/7 Live" },
                schedule: [
                    { time: "08:00", show: "Expositional Study" },
                    { time: "18:00", show: "Topical Teaching" }
                ]
            },
            {
                slug: "identity-in-yeshua", hm: "384.20", frequency: "HM 384.20", name: "Identity in Yeshua",
                band: "fivefold", primary: "bible_studies",
                mode: "OHI", phase: 6, bestseller: 95, reach: "410M",
                image: "/images/jubilee-profile.png",
                description: "Identity-formation teaching rooted in Yeshua — sonship, calling, and the believer's authority taught from the original Hebraic frame.",
                listeners: "Identity · Yeshua-Centered",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Identity in Yeshua Live", host: "Approved Teachers", time: "24/7 Live" },
                schedule: [
                    { time: "07:00", show: "Sons & Daughters" },
                    { time: "19:00", show: "Authority Walk" }
                ]
            },
            {
                slug: "gods-little-lambs", hm: "360.30", frequency: "HM 360.30", name: "God's Little Lambs",
                band: "fivefold", primary: "children",
                mode: "Non-OHI", phase: 1, bestseller: 88, reach: "140M",
                image: "/images/jubilee-profile.png",
                description: "Bible songs and instrumentals for the youngest listeners — warm, parent-attractive.",
                listeners: "Kids 3–5 · My Tiny Tiggles",
                // ON AIR from its own catalogue, not from a mount. My Tiny
                // Tiggles is the second children's act on the dial - 357 tracks
                // across 31 albums, ingested 2026-08-23 - and it is this
                // station's whole rotation, which is why the stream URL is now
                // null: the day file is the programme and the source.
                streamUrl: null,
                musicManifestUrl: "/cdn/radio/HM325.18-EN/delivery/music.json",
                currentShow: { name: "God's Little Lambs Live", host: "My Tiny Tiggles", time: "24/7 Live" },
                schedule: [
                    { time: "08:00", show: "Lamb Songs Morning" },
                    { time: "13:00", show: "Naptime Lambs" }
                ]
            },
            {
                slug: "whole-hearted-sisters", hm: "396.50", frequency: "HM 396.50", name: "Whole Hearted Sisters",
                band: "fivefold", primary: "online_church",
                mode: "Non-OHI", phase: 6, bestseller: 93, reach: "330M",
                image: "/images/jubilee-profile.png",
                description: "Sisterhood discipleship for women — wholeness, courage, and Spirit-formed teaching for daughters, wives, and mothers anchored in Scripture.",
                listeners: "Women's Ministry · Sisterhood",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Whole Hearted Sisters Live", host: "Women's Pastors", time: "24/7 Live" },
                schedule: [
                    { time: "09:00", show: "Sisters Morning Circle" },
                    { time: "20:00", show: "Evening Tea & Teaching" }
                ]
            },
            {
                slug: "after-the-storm", hm: "388.20", frequency: "HM 388.20", name: "After the Storm",
                band: "fivefold", primary: "bible_studies",
                mode: "Both", phase: 6, bestseller: 91, reach: "220M",
                image: "/images/jubilee-profile.png",
                description: "Post-trial teaching — testimonies and Scripture studies for those rebuilding life after grief, loss, divorce, or season of shaking.",
                listeners: "Restoration · After-Trial",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "After the Storm Live", host: "Pastoral Care Team", time: "24/7 Live" },
                schedule: [
                    { time: "10:00", show: "Rebuilding Hour" },
                    { time: "22:00", show: "Testimony Watch" }
                ]
            },
            {
                slug: "jubilee-kids-party", hm: "361.90", frequency: "HM 361.90", name: "Jubilee Kids Party",
                band: "fivefold", primary: "children",
                // Its own label rather than the shared "Kids" that primary:children
                // gives the other two children's stations — this one is a praise
                // rotation, not storytelling or lullabies.
                formatLabel: "Kids Praise",
                mode: "Mixed", phase: 1, bestseller: 90, reach: "165M",
                image: "/images/jubilee-profile.png",
                description: "Family-celebratory programming — multiplies through parent-driven discovery and household co-listening.",
                listeners: "Kids 6–8 · Family Party",
                streamUrl: null,
                musicManifestUrl: "/cdn/radio/HM329.12-EN/delivery/music.json",
                currentShow: { name: "Jubilee Kids Party Live", host: "Jubilee Kids", time: "24/7 Live" },
                schedule: [
                    { time: "08:00", show: "Party Morning" },
                    { time: "16:00", show: "After-School Bash" }
                ]
            },
            {
                slug: "grief-walked", hm: "393.10", frequency: "HM 393.10", name: "Grief Walked",
                band: "fivefold", primary: "online_church",
                mode: "Both", phase: 6, bestseller: 91, reach: "240M",
                image: "/images/jubilee-profile.png",
                description: "Grief-companion station — pastors, Psalms, and quiet teaching for those walking through loss; honest, biblical, and unhurried.",
                listeners: "Grief · Pastoral Companion",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Grief Walked Live", host: "Pastoral Care Team", time: "24/7 Live" },
                schedule: [
                    { time: "11:00", show: "Psalms of Lament" },
                    { time: "23:00", show: "Quiet Companion" }
                ]
            },
            {
                slug: "inspire-lullaby", hm: "364.80", frequency: "HM 364.80", name: "Inspire Lullaby",
                band: "fivefold", primary: "sleep_rest",
                mode: "Non-OHI", phase: 4, bestseller: 94, reach: "2000M",
                image: "/images/jubilee-profile.png",
                description: "Universal-bridge lullaby station — gentle melodies for sleep that work in any household, faith or no-faith.",
                listeners: "Lullaby · Universal Sleep",
                streamUrl: STREAM_CELESTIAL,
                currentShow: { name: "Inspire Lullaby Live", host: "Melody Inspire", time: "24/7 Live" },
                schedule: [
                    { time: "19:00", show: "Bedtime Stream" },
                    { time: "00:00", show: "Through-the-Night Lullabies" }
                ]
            },
            {
                slug: "purpose-found", hm: "384.50", frequency: "HM 384.50", name: "Purpose Found",
                band: "fivefold", primary: "bible_studies",
                mode: "Both", phase: 6, bestseller: 93, reach: "350M",
                image: "/images/jubilee-profile.png",
                description: "Calling and vocation teaching — discovering the assignment God placed on your life, taught from Scripture and practical discipleship.",
                listeners: "Calling · Purpose Walk",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Purpose Found Live", host: "Approved Teachers", time: "24/7 Live" },
                schedule: [
                    { time: "08:00", show: "Calling Clarity" },
                    { time: "18:30", show: "Vocation Talks" }
                ]
            },
            {
                slug: "country-gospel", hm: "309.30", frequency: "HM 309.30", name: "Gospel Country",
                band: "fivefold", primary: "music",
                mode: "Non-OHI", phase: 1, bestseller: 90, reach: "95M",
                image: "/images/jubilee-profile.png",
                description: "Bible Belt anchor — Christian Country reaches 30% of religious radio listeners (vs. 17% nationally).",
                listeners: "Gospel Country · Elias & Eliana Inspire · 370 tracks",
                // Manifest-driven, not an Icecast mount. Unlike the language
                // stations this is a FORMAT station: its catalog is an explicit
                // selection, because no genre column identifies country — the
                // code names the persona's lane, not the album's production.
                // Elias and Eliana whole, plus two country albums filed under
                // other personas' codes and 26 individual country cuts.
                // Rebuild with:
                //   node tools/build-station-manifest.js --station HM335.16-EN --url-layout source
                // (production serves /cdn/music/* by proxy to cdn.jubileeverse.com,
                //  which holds the source tree — use canonical only for local dev.)
                streamUrl: null,
                musicManifestUrl: "/cdn/radio/HM335.16-EN/delivery/music.json",
                currentShow: { name: "Gospel Country Live", host: "Elias Inspire", time: "24/7 Live" },
                schedule: [
                    { time: "07:00", show: "Country Gospel Morning" },
                    { time: "18:00", show: "Front-Porch Hour" }
                ]
            },
            {
                slug: "beyond-the-trauma", hm: "392.50", frequency: "HM 392.50", name: "Beyond the Trauma",
                band: "fivefold", primary: "online_church",
                mode: "Non-OHI", phase: 6, bestseller: 92, reach: "280M",
                image: "/images/jubilee-profile.png",
                description: "Trauma-aware pastoral teaching — body, soul, and spirit healing taught from Scripture with reverent care for the wounded.",
                listeners: "Trauma · Whole-Person Healing",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Beyond the Trauma Live", host: "Pastoral Care Team", time: "24/7 Live" },
                schedule: [
                    { time: "10:00", show: "Healing Hour" },
                    { time: "22:00", show: "Quiet Recovery" }
                ]
            },
            {
                slug: "decisions-that-matter", hm: "384.80", frequency: "HM 384.80", name: "Decisions That Matter",
                band: "fivefold", primary: "bible_studies",
                mode: "Both", phase: 6, bestseller: 90, reach: "180M",
                image: "/images/jubilee-profile.png",
                description: "Discernment teaching for the crossroads moments — Scripture-grounded counsel for the choices that shape a life.",
                listeners: "Discernment · Crossroads Counsel",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Decisions That Matter Live", host: "Approved Teachers", time: "24/7 Live" },
                schedule: [
                    { time: "09:00", show: "Crossroads Hour" },
                    { time: "20:00", show: "Wisdom Q&A" }
                ]
            },
            {
                slug: "jubilee-gospel-fire", hm: "302.50", frequency: "HM 302.50", name: "Pentecostal Shout",
                band: "fivefold", primary: "music",
                mode: "Both", phase: 1, bestseller: 88, reach: "155M",
                image: "/images/jubilee-profile.png",
                description: "Energetic gospel — cross-denominational appeal in Pentecostal, charismatic, and Black-church contexts.",
                listeners: "Pentecostal Shout · Imani & Zariah Inspire · 331 tracks",
                // Manifest-driven, not an Icecast mount. A persona station:
                // Imani Inspire's whole English catalogue, whose lane
                // (PCGC — Pentecostal/Charismatic Praise × Gospel Choir /
                // Afro-Gospel) is itself the format, so no album picking needed.
                // Rebuild with:
                //   node tools/build-station-manifest.js --station HM339.18-EN --url-layout source
                // (production serves /cdn/music/* by proxy to cdn.jubileeverse.com,
                //  which holds the source tree — use canonical only for local dev.)
                streamUrl: null,
                musicManifestUrl: "/cdn/radio/HM339.18-EN/delivery/music.json",
                currentShow: { name: "Pentecostal Shout Live", host: "Imani Inspire", time: "24/7 Live" },
                schedule: [
                    { time: "08:00", show: "Sunday Morning Gospel" },
                    { time: "19:00", show: "Gospel Fire Hour" }
                ]
            },
            {
                slug: "anxious-no-more", hm: "394.80", frequency: "HM 394.80", name: "Anxious No More",
                band: "fivefold", primary: "online_church",
                mode: "Non-OHI", phase: 6, bestseller: 94, reach: "410M",
                image: "/images/jubilee-profile.png",
                description: "Peace-of-Christ teaching for anxious hearts — Scripture, breath, and biblical meditation that quiets the storm and anchors the soul.",
                listeners: "Anxiety · Peace Walk",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Anxious No More Live", host: "Pastoral Care Team", time: "24/7 Live" },
                schedule: [
                    { time: "06:00", show: "Morning Peace" },
                    { time: "22:30", show: "Quieted Heart" }
                ]
            },
            {
                slug: "lead-like-yeshua", hm: "387.50", frequency: "HM 387.50", name: "Lead Like Yeshua",
                band: "fivefold", primary: "bible_studies",
                mode: "OHI", phase: 6, bestseller: 91, reach: "260M",
                image: "/images/jubilee-profile.png",
                description: "Servant-leadership teaching from the example of Yeshua — for pastors, marketplace leaders, and parents shepherding others well.",
                listeners: "Leadership · Servant-Hearted",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Lead Like Yeshua Live", host: "Approved Teachers", time: "24/7 Live" },
                schedule: [
                    { time: "07:00", show: "Leader's Hour" },
                    { time: "18:00", show: "Marketplace Mentorship" }
                ]
            },
            {
                slug: "inspire-hymns-heritage", hm: "300.30", frequency: "HM 300.30", name: "Inspire Hymns & Heritage",
                band: "fivefold", primary: "music",
                mode: "Non-OHI", phase: 1, bestseller: 84, reach: "110M",
                image: "/images/jubilee-profile.png",
                description: "Hymns, Celtic, traditional — strong appeal to 50+ demographic plus modern hymn-revival audience.",
                listeners: "Hymns · Heritage Worship",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Inspire Hymns & Heritage Live", host: "Nova Inspire", time: "24/7 Live" },
                schedule: [
                    { time: "07:00", show: "Heritage Morning" },
                    { time: "20:00", show: "Hymn Sing" }
                ]
            },
            {
                slug: "riddim-and-rhyme", hm: "311.50", frequency: "HM 311.50", name: "Riddim and Rhyme",
                band: "fivefold", primary: "music",
                // Its own format name — reggae, dancehall and soca under teaching
                // hymnody is not what "Praise & Worship" puts in a listener's head.
                formatLabel: "Afro-Caribbean",
                mode: "CCI", phase: 1, bestseller: 89, reach: "180M",
                image: "/images/jubilee-profile.png",
                description: "Afro-Caribbean fusion worship — Zariah Inspire's reggae, dancehall, soca and Afrobeats catalogue married to teaching hymnody and gospel-soul.",
                listeners: "Afro-Caribbean · Zariah & Santiago Inspire · 251 tracks",
                // A live Icecast mount. Rebuild its playlist with:
                //   node tools/build-station-manifest.js --station HM347.14-EN
                //   node tools/build-station-playlist.js --station HM347.14-EN --out-dir <dir>
                streamUrl: null,
                musicManifestUrl: "/cdn/radio/HM347.14-EN/delivery/music.json",
                currentShow: { name: "Riddim and Rhyme Live", host: "Zariah Inspire", time: "24/7 Live" },
                schedule: [
                    { time: "10:00", show: "Morning Riddim" },
                    { time: "20:00", show: "Yard Session" }
                ]
            },
            {
                slug: "ancient-paths", hm: "313.80", frequency: "HM 313.80", name: "The Ancient Paths",
                band: "fivefold", primary: "music",
                // Its own format name — maqam and oud under acoustic lament is a
                // long way from what "Praise & Worship" suggests.
                formatLabel: "Middle Eastern",
                mode: "CCI", phase: 1, bestseller: 88, reach: "210M",
                image: "/images/jubilee-profile.png",
                description: "Arabic and Middle Eastern worship — Amir Inspire's maqam-based catalogue and acoustic lament, sounding like home to the Arabic-speaking believer and the seeker alike.",
                listeners: "Middle Eastern · Amir Inspire · 92 tracks",
                // Client-side: the browser reads this manifest and streams each
                // track straight from cdn.kjubilee.com. No Icecast mount.
                //   node tools/build-station-manifest.js --station HM345.24-EN
                streamUrl: null,
                musicManifestUrl: "/cdn/radio/HM345.24-EN/delivery/music.json",
                currentShow: { name: "The Ancient Paths Live", host: "Amir Inspire", time: "24/7 Live" },
                schedule: [
                    { time: "06:00", show: "Fajr Light" },
                    { time: "19:00", show: "Evening Maqam" }
                ]
            },
            {
                slug: "iron-sharpening-iron", hm: "386.20", frequency: "HM 386.20", name: "Iron Sharpening Iron",
                band: "fivefold", primary: "bible_studies",
                mode: "Both", phase: 6, bestseller: 92, reach: "240M",
                image: "/images/jubilee-profile.png",
                description: "Roundtable teaching from Proverbs 27:17 — pastors, teachers, and elders sharpening one another in honest, Spirit-led conversation.",
                listeners: "Roundtable · Iron-Sharpening",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Iron Sharpening Iron Live", host: "Approved Teachers", time: "24/7 Live" },
                schedule: [
                    { time: "09:00", show: "Morning Sharpening" },
                    { time: "20:00", show: "Elder Roundtable" }
                ]
            },
            {
                slug: "the-comeback-room", hm: "395.40", frequency: "HM 395.40", name: "The Comeback Room",
                band: "fivefold", primary: "online_church",
                mode: "Both", phase: 6, bestseller: 91, reach: "260M",
                image: "/images/jubilee-profile.png",
                description: "Restoration teaching for the prodigal and the weary — testimonies and Scripture for everyone walking the long road back to wholeness.",
                listeners: "Comeback · Prodigal's Walk",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "The Comeback Room Live", host: "Pastoral Care Team", time: "24/7 Live" },
                schedule: [
                    { time: "10:00", show: "Comeback Stories" },
                    { time: "22:00", show: "Late-Night Return" }
                ]
            },
            {
                slug: "radiant-stones-radio", hm: "301.90", frequency: "HM 301.90", name: "Radiant Stones Radio",
                band: "fivefold", primary: "music",
                mode: "Both", phase: 2, bestseller: 84, reach: "120M",
                image: "/images/jubilee-profile.png",
                description: "Female trio celebration — Sandi Patty / Avalon era, modernized. Female 25–55 audience.",
                listeners: "Female Trio Worship · Modern",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Radiant Stones Live", host: "Radiant Stones", time: "24/7 Live" },
                schedule: [
                    { time: "10:00", show: "Radiant Morning" },
                    { time: "19:00", show: "Trio Hour" }
                ]
            },
            {
                slug: "stillwater", hm: "365.40", frequency: "HM 365.40", name: "Stillwater",
                band: "fivefold", primary: "sleep_rest",
                mode: "Both", phase: 4, bestseller: 91, reach: "1200M",
                image: "/images/jubilee-profile.png",
                description: "Contemplative healing-prayer station (Psalm 23 anchor) — soaking instrumentals and whispered intercession for deep rest.",
                listeners: "Soaking · Healing Rest",
                streamUrl: STREAM_CELESTIAL,
                currentShow: { name: "Stillwater Live", host: "Contemplative Block", time: "24/7 Live" },
                schedule: [
                    { time: "20:00", show: "Soaking Stillwater" },
                    { time: "00:00", show: "Through-the-Night Stream" }
                ]
            },
            {
                slug: "daughters-of-the-king", hm: "386.50", frequency: "HM 386.50", name: "Daughters of the King",
                band: "fivefold", primary: "bible_studies",
                mode: "Both", phase: 6, bestseller: 94, reach: "340M",
                image: "/images/jubilee-profile.png",
                description: "Royal-identity teaching for women — Scripture studies on dignity, calling, and walking as daughters of the King in every season.",
                listeners: "Women · Royal Identity",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Daughters of the King Live", host: "Women's Pastors", time: "24/7 Live" },
                schedule: [
                    { time: "09:00", show: "Daughters Morning Study" },
                    { time: "20:00", show: "King's Daughters Roundtable" }
                ]
            },
            {
                slug: "shalom-be-still", hm: "366.20", frequency: "HM 366.20", name: "Shalom: Be Still",
                band: "fivefold", primary: "sleep_rest",
                mode: "OHI", phase: 2, bestseller: 89, reach: "95M",
                image: "/images/jubilee-profile.png",
                description: "Soaking / intimate worship — Shalom paired with Psalm 46:10. Contemplative atmospheres.",
                listeners: "Soaking · Intimate Worship",
                streamUrl: STREAM_CELESTIAL,
                currentShow: { name: "Shalom: Be Still Live", host: "Nova Inspire", time: "24/7 Live" },
                schedule: [
                    { time: "21:00", show: "Be Still Evening" },
                    { time: "00:00", show: "Shalom Through the Night" }
                ]
            },
            {
                slug: "walking-together", hm: "397.60", frequency: "HM 397.60", name: "Walking Together",
                band: "fivefold", primary: "online_church",
                mode: "Both", phase: 6, bestseller: 93, reach: "350M",
                image: "/images/jubilee-profile.png",
                description: "Community-walk teaching — Scripture and pastoring for life shared in fellowship; small-group depth in a 24/7 audio companion.",
                listeners: "Fellowship · Walking Together",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Walking Together Live", host: "Community Pastors", time: "24/7 Live" },
                schedule: [
                    { time: "08:00", show: "Morning Walk" },
                    { time: "19:00", show: "Evening Fellowship" }
                ]
            },
            {
                slug: "bedtime-blessings", hm: "363.10", frequency: "HM 363.10", name: "Bedtime Blessings",
                band: "fivefold", primary: "children",
                mode: "Non-OHI", phase: 2, bestseller: 90, reach: "105M",
                image: "/images/jubilee-profile.png",
                description: "Sleep-aid Bible content — daily-use rhythm drives high listener-hours per user.",
                listeners: "Kids · Bedtime Bible",
                streamUrl: STREAM_KIDS_35,
                currentShow: { name: "Bedtime Blessings Live", host: "Melody Inspire", time: "24/7 Live" },
                schedule: [
                    { time: "19:00", show: "Bedtime Stories" },
                    { time: "20:30", show: "Lights-Out Blessings" }
                ]
            },
            {
                slug: "pentecostal-fire", hm: "341.90", frequency: "HM 341.90", name: "Pentecostal Fire",
                band: "fivefold", primary: "prayer",
                mode: "Both", phase: 2, bestseller: 83, reach: "145M",
                image: "/images/jubilee-profile.png",
                description: "Pentecostal worship — fastest-growing movement in Africa, Latin America, global South.",
                listeners: "Pentecostal · Spirit-Filled Prayer",
                streamUrl: STREAM_GOSPEL,
                currentShow: { name: "Pentecostal Fire Live", host: "Imani Inspire", time: "24/7 Live" },
                schedule: [
                    { time: "06:00", show: "Morning Fire" },
                    { time: "21:00", show: "Tarry Service" }
                ]
            },
            {
                slug: "inspire-acapella", hm: "307.60", frequency: "HM 307.60", name: "Inspire Acapella",
                band: "fivefold", primary: "music",
                mode: "Both", phase: 2, bestseller: 79, reach: "50M",
                image: "/images/jubilee-profile.png",
                description: "Vocal-driven worship — Mennonite, Church of Christ, and a-cappella-tradition denominations.",
                listeners: "A-Cappella Worship · Vocal-Only",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Inspire Acapella Live", host: "Tahoma Inspire", time: "24/7 Live" },
                schedule: [
                    { time: "08:00", show: "Vocal Morning" },
                    { time: "19:00", show: "Choir Hour" }
                ]
            },
            {
                slug: "when-faith-feels-hard", hm: "388.50", frequency: "HM 388.50", name: "When Faith Feels Hard",
                band: "fivefold", primary: "bible_studies",
                mode: "Both", phase: 6, bestseller: 93, reach: "280M",
                image: "/images/jubilee-profile.png",
                description: "Honest teaching for the wilderness seasons — Scripture and pastoring for the believer holding on through doubt, delay, and silence.",
                listeners: "Wilderness · Honest Faith",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "When Faith Feels Hard Live", host: "Pastoral Care Team", time: "24/7 Live" },
                schedule: [
                    { time: "11:00", show: "Wilderness Hour" },
                    { time: "23:00", show: "Late-Night Honesty" }
                ]
            },
            {
                slug: "inspire-talk", hm: "382.50", frequency: "HM 382.50", name: "Inspire Talk",
                band: "fivefold", primary: "talk_podcasts",
                mode: "Mixed", phase: 2, bestseller: 85, reach: "110M",
                image: "/images/jubilee-profile.png",
                description: "Podcast aggregator — fastest-growing audio category among Millennial and Gen Z.",
                listeners: "Talk · Podcast Aggregator",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Inspire Talk Live", host: "Various Hosts", time: "24/7 Live" },
                schedule: [
                    { time: "07:00", show: "Morning Talk Block" },
                    { time: "17:00", show: "Drive-Time Podcasts" }
                ]
            },
            {
                slug: "midnight-praise", hm: "314.40", frequency: "HM 314.40", name: "Midnight Praise",
                // Its own format name — Celtic ambient and contemplative cinematic
                // is the opposite of what "Praise & Worship" leads a listener to
                // expect, and this frequency exists for the hours nobody is loud.
                formatLabel: "Ambient Worship",
                band: "fivefold", primary: "music",
                mode: "CCI", phase: 1, bestseller: 87, reach: "120M",
                image: "/images/jubilee-profile.png",
                description: "Celtic and European ambient worship — Nova Inspire's contemplative cinematic and ambient-healing catalogue, for the long night, the overnight watch and the ones still awake.",
                listeners: "Ambient Worship · Nova Inspire · 100 tracks",
                // A live Icecast mount. Rebuild its playlist with:
                //   node tools/build-station-manifest.js --station HM379.14-EN
                //   node tools/build-station-playlist.js --station HM379.14-EN --out-dir <dir>
                streamUrl: null,
                musicManifestUrl: "/cdn/radio/HM379.14-EN/delivery/music.json",
                currentShow: { name: "Midnight Praise Live", host: "Nova Inspire", time: "24/7 Live" },
                schedule: [
                    { time: "22:00", show: "The Long Night" },
                    { time: "03:00", show: "Watch of the Fourth Hour" }
                ]
            },
            {
                slug: "word-of-fire", hm: "383.50", frequency: "HM 383.50", name: "Word of Fire!",
                band: "fivefold", primary: "bible_studies",
                mode: "OHI", phase: 3, bestseller: 87, reach: "85M",
                image: "/images/jubilee-profile.png",
                description: "Prophetic / high-impact teaching — biblical fire imagery, prophetic-audience signaling.",
                listeners: "Prophetic · Fire Teaching",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Word of Fire Live", host: "Approved Teachers", time: "24/7 Live" },
                schedule: [
                    { time: "08:00", show: "Prophetic Word" },
                    { time: "20:00", show: "Fire Hour" }
                ]
            },
            {
                slug: "shema-roots", hm: "381.20", frequency: "HM 381.20", name: "Shema Roots",
                band: "fivefold", primary: "hebrew_roots",
                mode: "OHI", phase: 3, bestseller: 80, reach: "28M",
                image: "/images/jubilee-profile.png",
                description: "Hebrew Roots / Messianic — Shema (Deut. 6:4). Native lane for the JSV translation framework.",
                listeners: "Hebrew Roots · Messianic",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Shema Roots Live", host: "Zev Inspire", time: "24/7 Live" },
                schedule: [
                    { time: "06:00", show: "Shacharit Stream" },
                    { time: "18:00", show: "Mincha & Teaching" }
                ]
            },
            {
                slug: "restored-renewed", hm: "398.70", frequency: "HM 398.70", name: "Restored & Renewed",
                band: "fivefold", primary: "online_church",
                mode: "Both", phase: 6, bestseller: 92, reach: "270M",
                image: "/images/jubilee-profile.png",
                description: "Renewal teaching for the long walk — Scripture, testimony, and pastoral care for believers stepping into a refreshed season.",
                listeners: "Renewal · Restored Walk",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Restored & Renewed Live", host: "Pastoral Care Team", time: "24/7 Live" },
                schedule: [
                    { time: "09:00", show: "Renewed Morning" },
                    { time: "20:00", show: "Restoration Stories" }
                ]
            },
            {
                slug: "apostolic-five-fold", hm: "381.50", frequency: "HM 381.50", name: "Apostolic & Five-Fold",
                band: "fivefold", primary: "hebrew_roots",
                mode: "OHI", phase: 3, bestseller: 78, reach: "35M",
                image: "/images/jubilee-profile.png",
                description: "Critical lane for the FiveFoldTest.com ecosystem and broader Jubilee teaching framework.",
                listeners: "Five-Fold · Apostolic Teaching",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Apostolic & Five-Fold Live", host: "Approved Teachers", time: "24/7 Live" },
                schedule: [
                    { time: "07:00", show: "Five-Fold Foundations" },
                    { time: "19:00", show: "Apostolic Roundtable" }
                ]
            },
            {
                slug: "story-hour", hm: "367.20", frequency: "HM 367.20", name: "Story Hour",
                band: "fivefold", primary: "radio_theater",
                mode: "Non-OHI", phase: 3, bestseller: 84, reach: "75M",
                image: "/images/jubilee-profile.png",
                description: "Audio-storytelling — strong vehicle for the Jubilee Inspire universe.",
                listeners: "Audio Drama · Family Stories",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Story Hour Live", host: "MDI · JEI", time: "24/7 Live" },
                schedule: [
                    { time: "17:00", show: "Family Story Hour" },
                    { time: "20:00", show: "Bedtime Theater" }
                ]
            },
            {
                slug: "the-hidden-manna", hm: "381.80", frequency: "HM 381.80", name: "The Hidden Manna",
                band: "fivefold", primary: "hebrew_roots",
                mode: "OHI", phase: 3, bestseller: 74, reach: "18M",
                image: "/images/jubilee-profile.png",
                description: "Deep-dive JSV / Paleo-Hebrew teaching — most specialist content on the platform.",
                listeners: "JSV · Paleo-Hebrew Deep Dive",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "The Hidden Manna Live", host: "Approved Teachers", time: "24/7 Live" },
                schedule: [
                    { time: "08:00", show: "JSV Deep Dive" },
                    { time: "20:00", show: "Paleo-Hebrew Study" }
                ]
            },
            {
                slug: "island-hallelujah", hm: "312.10", frequency: "HM 312.10", name: "Island Hallelujah",
                band: "fivefold", primary: "music",
                // Its own format name rather than the shared "Praise & Worship"
                // label — slack-key, 'ukulele and island reggae are not what a
                // listener pictures when they read Praise & Worship.
                formatLabel: "Hawaiian Praise",
                mode: "CCI", phase: 1, bestseller: 90, reach: "240M",
                image: "/images/jubilee-profile.png",
                description: "Pacific Island worship — Tahoma Inspire's slack-key, 'ukulele and island-reggae catalogue, Christ lifted up in the language of the islands.",
                listeners: "Hawaiian Praise · Tahoma Inspire · 599 tracks",
                // A live Icecast mount. Rebuild its playlist with:
                //   node tools/build-station-manifest.js --station HM399.18-EN
                //   node tools/build-station-playlist.js --station HM399.18-EN --out-dir <dir>
                streamUrl: null,
                musicManifestUrl: "/cdn/radio/HM399.18-EN/delivery/music.json",
                currentShow: { name: "Island Hallelujah Live", host: "Tahoma Inspire", time: "24/7 Live" },
                schedule: [
                    { time: "07:00", show: "Sunrise on the Water" },
                    { time: "20:00", show: "Island Evening" }
                ]
            },

            // ===================================================================
            // BAND 2 — Multilingual / Nations-Based (30 stations)
            // ===================================================================
            {
                slug: "familia-inspire-espanol", hm: "320.30", frequency: "HM 320.30", name: "Familia Inspire (Español)",
                band: "multi", primary: "multilanguage", parentColor: "blue",
                mode: "Both", phase: 2, bestseller: 95, reach: "450M",
                image: "/images/jubilee-profile.png",
                description: "Spanish-language Christian flagship — Praise, Worship, and CCM curated for the global Spanish-speaking family across Latin America, Spain, and the U.S. diaspora.",
                listeners: "Familia · Spanish-Language",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Familia Inspire Live", host: "Santiago Inspire", time: "24/7 Live" },
                schedule: [
                    { time: "08:00", show: "Mañana Familia" },
                    { time: "20:00", show: "Familia de Noche" }
                ]
            },
            {
                slug: "jubilee-prayers-spanish", hm: "350.50", frequency: "HM 350.50", name: "Jubilee Prayers in Spanish",
                band: "multi", primary: "multilanguage", parentColor: "red",
                mode: "Both", phase: 6, bestseller: 93, reach: "380M",
                image: "/images/jubilee-profile.png",
                description: "Continuous Spanish-language prayer and intercession — Padre Nuestro, Salmos, and pastoral oraciones for the global Spanish-speaking family.",
                listeners: "Oración · Spanish-Language",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Jubilee Prayers in Spanish Live", host: "Santiago Inspire", time: "24/7 Live" },
                schedule: [
                    { time: "06:00", show: "Oración de la Mañana" },
                    { time: "21:00", show: "Oración Nocturna" }
                ]
            },
            {
                slug: "brasil-inspire-portugues", hm: "321.90", frequency: "HM 321.90", name: "Brasil Inspire (Português)",
                band: "multi", primary: "multilanguage", parentColor: "blue",
                mode: "Both", phase: 4, bestseller: 93, reach: "250M",
                image: "/images/jubilee-profile.png",
                description: "Brazilian Portuguese Christian flagship — sertanejo gospel, MPB worship, and contemporary Brazilian praise for the largest Christian nation in Latin America.",
                listeners: "Brasil · Portuguese-Language",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Brasil Inspire Live", host: "Santiago Inspire", time: "24/7 Live" },
                schedule: [
                    { time: "08:00", show: "Manhã Brasil" },
                    { time: "20:00", show: "Noite Brasileira" }
                ]
            },
            {
                slug: "asia-inspire-zhongwen", hm: "334.40", frequency: "HM 334.40", name: "Asia Inspire (中文)",
                band: "multi", primary: "multilanguage", parentColor: "blue",
                mode: "Both", phase: 4, bestseller: 91, reach: "350M",
                image: "/images/jubilee-profile.png",
                description: "Mandarin Chinese Christian flagship — house-church-friendly worship and teaching for Mainland, Taiwan, Hong Kong, and the global Chinese diaspora.",
                listeners: "Asia · Mandarin-Language",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Asia Inspire Live", host: "Continental Worship Team", time: "24/7 Live" },
                schedule: [
                    { time: "07:00", show: "晨曦敬拜" },
                    { time: "20:00", show: "夜间赞美" }
                ]
            },
            {
                slug: "jubilee-prayers-mandarin", hm: "357.30", frequency: "HM 357.30", name: "Jubilee Prayers in Mandarin",
                band: "multi", primary: "multilanguage", parentColor: "red",
                mode: "Both", phase: 6, bestseller: 92, reach: "280M",
                image: "/images/jubilee-profile.png",
                description: "Continuous Mandarin-language prayer — Lord's Prayer, Psalms, and pastoral intercession for Chinese believers worldwide and the global diaspora.",
                listeners: "祷告 · Mandarin-Language",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Jubilee Prayers in Mandarin Live", host: "Continental Prayer Team", time: "24/7 Live" },
                schedule: [
                    { time: "06:00", show: "晨祷" },
                    { time: "21:00", show: "晚祷" }
                ]
            },
            {
                slug: "inspire-india-hindi", hm: "332.10", frequency: "HM 332.10", name: "Inspire India (हिन्दी)",
                band: "multi", primary: "multilanguage", parentColor: "blue",
                mode: "Both", phase: 4, bestseller: 91, reach: "600M",
                image: "/images/jubilee-profile.png",
                description: "Hindi/Tamil-mix Christian flagship for the Indian subcontinent — indigenous instrumentation with global praise vocabulary.",
                listeners: "India · Hindi-Language",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Inspire India Live", host: "Subcontinent Worship Team", time: "24/7 Live" },
                schedule: [
                    { time: "07:00", show: "Subah Aaradhana" },
                    { time: "19:00", show: "Sandhya Stuti" }
                ]
            },
            {
                slug: "jubilee-prayers-hindi", hm: "356.70", frequency: "HM 356.70", name: "Jubilee Prayers in Hindi",
                band: "multi", primary: "multilanguage", parentColor: "red",
                mode: "Both", phase: 6, bestseller: 91, reach: "320M",
                image: "/images/jubilee-profile.png",
                description: "Continuous Hindi-language prayer and intercession — Pita Hamare, Bhajans, and pastoral prayers for the Indian subcontinent and the global Hindi diaspora.",
                listeners: "Prarthana · Hindi-Language",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Jubilee Prayers in Hindi Live", host: "Subcontinent Prayer Team", time: "24/7 Live" },
                schedule: [
                    { time: "06:00", show: "Subah Prarthana" },
                    { time: "21:00", show: "Raat Prarthana" }
                ]
            },
            {
                slug: "inspire-crown-arabic", hm: "328.70", frequency: "HM 328.70", name: "Inspire Crown (العربية)",
                band: "multi", primary: "multilanguage", parentColor: "blue",
                mode: "Both", phase: 4, bestseller: 90, reach: "400M",
                image: "/images/jubilee-profile.png",
                description: "Arabic-language Christian flagship — Coptic, Maronite, and Levantine Christian musical traditions woven with global CCM for the Arabic-speaking world.",
                listeners: "Crown · Arabic-Language",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Inspire Crown Live", host: "Amir Inspire", time: "24/7 Live" },
                schedule: [
                    { time: "06:00", show: "Tasbeha Sabah" },
                    { time: "20:00", show: "Tasbeha Masaa" }
                ]
            },
            {
                slug: "jubilee-prayers-arabic", hm: "354.20", frequency: "HM 354.20", name: "Jubilee Prayers in Arabic",
                band: "multi", primary: "multilanguage", parentColor: "red",
                mode: "Both", phase: 6, bestseller: 92, reach: "250M",
                image: "/images/jubilee-profile.png",
                description: "Continuous Arabic-language prayer and intercession — Abana Alladhi, Mazameer, and pastoral oraciones for the Arabic-speaking Christian world.",
                listeners: "Salat · Arabic-Language",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Jubilee Prayers in Arabic Live", host: "Amir Inspire", time: "24/7 Live" },
                schedule: [
                    { time: "05:00", show: "Salat al-Sabah" },
                    { time: "21:00", show: "Salat al-Layl" }
                ]
            },
            {
                slug: "france-inspire-francais", hm: "322.50", frequency: "HM 322.50", name: "France Inspire (Français)",
                band: "multi", primary: "multilanguage", parentColor: "blue",
                mode: "Both", phase: 5, bestseller: 90, reach: "220M",
                image: "/images/jubilee-profile.png",
                description: "French-language Christian flagship — Hexagonal, African Francophone, and Caribbean Christian music for France, Belgium, Quebec, and the wider Francophonie.",
                listeners: "France · French-Language",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "France Inspire Live", host: "Continental Worship Team", time: "24/7 Live" },
                schedule: [
                    { time: "08:00", show: "Matin Inspire" },
                    { time: "20:00", show: "Soir Francophone" }
                ]
            },
            {
                slug: "jubilee-praise-romana", hm: "326.20", frequency: "HM 326.20", name: "Jubilee Praise (Română)",
                band: "multi", primary: "multilanguage", parentColor: "blue",
                mode: "OHI", phase: 1, bestseller: 92, reach: "18M",
                image: "/images/jubilee-profile.png",
                description: "Romanian-language Christian flagship — first language edition reaching ~16M Romanian-speaking Christians including the diaspora across Europe and North America.",
                listeners: "Lăudați · Romanian-Language",
                // A live Icecast mount, not a per-listener shuffle: every
                // listener hears the same track at the same moment. The mount
                // plays the same verified catalogue the manifest describes.
                streamUrl: null,
                musicManifestUrl: "/cdn/radio/HM332.16-RO/delivery/music.json",
                currentShow: { name: "Jubilee Praise Live (RO)", host: "Jubilee Inspire (RO)", time: "24/7 Live" },
                schedule: [
                    { time: "07:00", show: "Lăudați pe Yahuah" },
                    { time: "19:00", show: "Închinare de Seară" }
                ]
            },
            {
                slug: "jubilee-prayers-portuguese", hm: "351.10", frequency: "HM 351.10", name: "Jubilee Prayers in Portuguese",
                band: "multi", primary: "multilanguage", parentColor: "red",
                mode: "Both", phase: 6, bestseller: 92, reach: "200M",
                image: "/images/jubilee-profile.png",
                description: "Continuous Portuguese-language prayer — Pai Nosso, Salmos, and pastoral intercessões for Brazil, Portugal, and the global Lusophone Christian family.",
                listeners: "Oração · Portuguese-Language",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Jubilee Prayers in Portuguese Live", host: "Continental Prayer Team", time: "24/7 Live" },
                schedule: [
                    { time: "06:00", show: "Oração da Manhã" },
                    { time: "21:00", show: "Oração da Noite" }
                ]
            },
            {
                slug: "korea-inspire-hangugeo", hm: "335.20", frequency: "HM 335.20", name: "Korea Inspire (한국어)",
                band: "multi", primary: "multilanguage", parentColor: "blue",
                mode: "Both", phase: 4, bestseller: 92, reach: "60M",
                image: "/images/jubilee-profile.png",
                description: "Korean-language Christian flagship — Seoul-megachurch worship traditions blended with global CCM for South Korea, the diaspora, and the underground church.",
                listeners: "Korea · Korean-Language",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Korea Inspire Live", host: "Continental Worship Team", time: "24/7 Live" },
                schedule: [
                    { time: "05:00", show: "새벽 기도 찬양" },
                    { time: "20:00", show: "저녁 예배" }
                ]
            },
            {
                slug: "deutschland-inspire-deutsch", hm: "323.10", frequency: "HM 323.10", name: "Deutschland Inspire (Deutsch)",
                band: "multi", primary: "multilanguage", parentColor: "blue",
                mode: "Both", phase: 5, bestseller: 89, reach: "160M",
                image: "/images/jubilee-profile.png",
                description: "German-language Christian flagship — Lutheran chorale heritage and modern Lobpreis curated for Germany, Austria, Switzerland, and the global Germanophone family.",
                listeners: "Deutschland · German-Language",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Deutschland Inspire Live", host: "Continental Worship Team", time: "24/7 Live" },
                schedule: [
                    { time: "08:00", show: "Morgenlob" },
                    { time: "20:00", show: "Abendsegen" }
                ]
            },
            {
                slug: "jubilee-prayers-french", hm: "352.80", frequency: "HM 352.80", name: "Jubilee Prayers in French",
                band: "multi", primary: "multilanguage", parentColor: "red",
                mode: "Both", phase: 6, bestseller: 91, reach: "180M",
                image: "/images/jubilee-profile.png",
                description: "Continuous French-language prayer and intercession — Notre Père, Psaumes, and pastoral prières for the worldwide Francophone Christian family.",
                listeners: "Prière · French-Language",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Jubilee Prayers in French Live", host: "Continental Prayer Team", time: "24/7 Live" },
                schedule: [
                    { time: "06:00", show: "Prière du Matin" },
                    { time: "21:00", show: "Prière du Soir" }
                ]
            },
            {
                slug: "russia-inspire-russkiy", hm: "327.60", frequency: "HM 327.60", name: "Russia Inspire (Русский)",
                band: "multi", primary: "multilanguage", parentColor: "blue",
                mode: "Both", phase: 5, bestseller: 88, reach: "280M",
                image: "/images/jubilee-profile.png",
                description: "Russian-language Christian flagship — Orthodox choral heritage, Baptist hymnody, and modern Russian worship for Russia, Ukraine, Belarus, and the diaspora.",
                listeners: "Russia · Russian-Language",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Russia Inspire Live", host: "Continental Worship Team", time: "24/7 Live" },
                schedule: [
                    { time: "07:00", show: "Утренняя Хвала" },
                    { time: "20:00", show: "Вечернее Поклонение" }
                ]
            },
            {
                slug: "italia-inspire-italiano", hm: "324.80", frequency: "HM 324.80", name: "Italia Inspire (Italiano)",
                band: "multi", primary: "multilanguage", parentColor: "blue",
                mode: "Both", phase: 5, bestseller: 89, reach: "70M",
                image: "/images/jubilee-profile.png",
                description: "Italian-language Christian flagship — Catholic, Pentecostal, and Evangelical Italian worship traditions woven into one continuous stream for Italy and the diaspora.",
                listeners: "Italia · Italian-Language",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Italia Inspire Live", host: "Continental Worship Team", time: "24/7 Live" },
                schedule: [
                    { time: "08:00", show: "Lode del Mattino" },
                    { time: "20:00", show: "Adorazione Serale" }
                ]
            },
            {
                slug: "jubilee-prayers-russian", hm: "353.40", frequency: "HM 353.40", name: "Jubilee Prayers in Russian",
                band: "multi", primary: "multilanguage", parentColor: "red",
                mode: "Both", phase: 6, bestseller: 90, reach: "220M",
                image: "/images/jubilee-profile.png",
                description: "Continuous Russian-language prayer — Otche Nash, Psalmy, and pastoral intercessions for the Russian-speaking Christian world.",
                listeners: "Молитва · Russian-Language",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Jubilee Prayers in Russian Live", host: "Continental Prayer Team", time: "24/7 Live" },
                schedule: [
                    { time: "06:00", show: "Утренняя Молитва" },
                    { time: "21:00", show: "Вечерняя Молитва" }
                ]
            },
            {
                slug: "pilipinas-inspire-tagalog", hm: "339.90", frequency: "HM 339.90", name: "Pilipinas Inspire (Tagalog)",
                band: "multi", primary: "multilanguage", parentColor: "blue",
                mode: "Both", phase: 4, bestseller: 92, reach: "90M",
                image: "/images/jubilee-profile.png",
                description: "Filipino-language Christian flagship — Tagalog praise, OPM gospel, and Spirit-filled Filipino worship for the Philippines and the global OFW family.",
                listeners: "Pilipinas · Tagalog-Language",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Pilipinas Inspire Live", host: "Continental Worship Team", time: "24/7 Live" },
                schedule: [
                    { time: "06:00", show: "Umagang Papuri" },
                    { time: "20:00", show: "Gabing Pagsamba" }
                ]
            },
            {
                slug: "vietnam-inspire-tieng-viet", hm: "337.70", frequency: "HM 337.70", name: "Vietnam Inspire (Tiếng Việt)",
                band: "multi", primary: "multilanguage", parentColor: "blue",
                mode: "Both", phase: 4, bestseller: 88, reach: "25M",
                image: "/images/jubilee-profile.png",
                description: "Vietnamese-language Christian flagship — Catholic, Hmong, and Evangelical Vietnamese worship for Vietnam and the global Vietnamese Christian diaspora.",
                listeners: "Vietnam · Vietnamese-Language",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Vietnam Inspire Live", host: "Continental Worship Team", time: "24/7 Live" },
                schedule: [
                    { time: "06:00", show: "Ca Ngợi Buổi Sáng" },
                    { time: "20:00", show: "Thờ Phượng Buổi Tối" }
                ]
            },
            {
                slug: "jubilee-prayers-korean", hm: "358.90", frequency: "HM 358.90", name: "Jubilee Prayers in Korean",
                band: "multi", primary: "multilanguage", parentColor: "red",
                mode: "Both", phase: 6, bestseller: 95, reach: "80M",
                image: "/images/jubilee-profile.png",
                description: "Continuous Korean-language prayer — early-morning saebyeok kido, Psalms, and pastoral intercession for the Korean Christian world.",
                listeners: "기도 · Korean-Language",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Jubilee Prayers in Korean Live", host: "Continental Prayer Team", time: "24/7 Live" },
                schedule: [
                    { time: "05:00", show: "새벽 기도" },
                    { time: "21:00", show: "저녁 기도" }
                ]
            },
            {
                slug: "africa-inspire-kiswahili", hm: "329.30", frequency: "HM 329.30", name: "Africa Inspire (Kiswahili)",
                band: "multi", primary: "multilanguage", parentColor: "blue",
                mode: "Both", phase: 4, bestseller: 92, reach: "200M",
                image: "/images/jubilee-profile.png",
                description: "Pan-African Christian P&W flagship — Afrobeat-inflected praise blending continental worship traditions with global CCM, anchored in Kiswahili.",
                listeners: "Africa · Kiswahili-Language",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Africa Inspire Live", host: "Continental Worship Team", time: "24/7 Live" },
                schedule: [
                    { time: "06:00", show: "Asubuhi ya Sifa" },
                    { time: "20:00", show: "Ibada ya Jioni" }
                ]
            },
            {
                slug: "west-africa-inspire-yoruba", hm: "330.90", frequency: "HM 330.90", name: "West Africa Inspire (Yorùbá)",
                band: "multi", primary: "multilanguage", parentColor: "blue",
                mode: "Both", phase: 4, bestseller: 90, reach: "50M",
                image: "/images/jubilee-profile.png",
                description: "Yorùbá-language Christian flagship — Nigerian gospel, Pentecostal fire, and West African worship traditions for the Yorùbá-speaking Christian family.",
                listeners: "West Africa · Yorùbá-Language",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "West Africa Inspire Live", host: "Continental Worship Team", time: "24/7 Live" },
                schedule: [
                    { time: "06:00", show: "Ìyìn Òwúrọ̀" },
                    { time: "20:00", show: "Ìjọsìn Alẹ́" }
                ]
            },
            {
                slug: "jubilee-prayers-swahili", hm: "355.60", frequency: "HM 355.60", name: "Jubilee Prayers in Swahili",
                band: "multi", primary: "multilanguage", parentColor: "red",
                mode: "Both", phase: 6, bestseller: 91, reach: "170M",
                image: "/images/jubilee-profile.png",
                description: "Continuous Kiswahili prayer — Baba Yetu, Zaburi, and pastoral maombi for East Africa and the wider Kiswahili-speaking Christian world.",
                listeners: "Maombi · Swahili-Language",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Jubilee Prayers in Swahili Live", host: "Continental Prayer Team", time: "24/7 Live" },
                schedule: [
                    { time: "06:00", show: "Maombi ya Asubuhi" },
                    { time: "21:00", show: "Maombi ya Usiku" }
                ]
            },
            {
                slug: "ethiopia-inspire-amharic", hm: "331.50", frequency: "HM 331.50", name: "Ethiopia Inspire (አማርኛ)",
                band: "multi", primary: "multilanguage", parentColor: "blue",
                mode: "Both", phase: 4, bestseller: 88, reach: "35M",
                image: "/images/jubilee-profile.png",
                description: "Amharic-language Christian flagship — Ethiopian Orthodox heritage and modern Pentecostal Ethiopian worship for Ethiopia and the global diaspora.",
                listeners: "Ethiopia · Amharic-Language",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Ethiopia Inspire Live", host: "Continental Worship Team", time: "24/7 Live" },
                schedule: [
                    { time: "06:00", show: "የጠዋት ምስጋና" },
                    { time: "20:00", show: "የምሽት አምልኮ" }
                ]
            },
            {
                slug: "polska-inspire-polski", hm: "325.40", frequency: "HM 325.40", name: "Polska Inspire (Polski)",
                band: "multi", primary: "multilanguage", parentColor: "blue",
                mode: "Both", phase: 5, bestseller: 89, reach: "45M",
                image: "/images/jubilee-profile.png",
                description: "Polish-language Christian flagship — Catholic devotional heritage and modern Polish worship for Poland and the worldwide Polish diaspora.",
                listeners: "Polska · Polish-Language",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Polska Inspire Live", host: "Continental Worship Team", time: "24/7 Live" },
                schedule: [
                    { time: "07:00", show: "Poranna Chwała" },
                    { time: "20:00", show: "Wieczorne Uwielbienie" }
                ]
            },
            {
                slug: "indonesia-inspire-bahasa", hm: "338.30", frequency: "HM 338.30", name: "Indonesia Inspire (Bahasa)",
                band: "multi", primary: "multilanguage", parentColor: "blue",
                mode: "Both", phase: 4, bestseller: 89, reach: "30M",
                image: "/images/jubilee-profile.png",
                description: "Bahasa Indonesia Christian flagship — Indonesian and Bataknese worship traditions for the largest Muslim-majority nation's Christian minority and the diaspora.",
                listeners: "Indonesia · Bahasa-Language",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Indonesia Inspire Live", host: "Continental Worship Team", time: "24/7 Live" },
                schedule: [
                    { time: "06:00", show: "Pujian Pagi" },
                    { time: "20:00", show: "Penyembahan Malam" }
                ]
            },
            {
                slug: "japan-inspire-nihongo", hm: "336.60", frequency: "HM 336.60", name: "Japan Inspire (日本語)",
                band: "multi", primary: "multilanguage", parentColor: "blue",
                mode: "Both", phase: 4, bestseller: 87, reach: "5M",
                image: "/images/jubilee-profile.png",
                description: "Japanese-language Christian flagship — gentle worship and contemplative teaching for Japan's small but devoted Christian community and the global diaspora.",
                listeners: "Japan · Japanese-Language",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Japan Inspire Live", host: "Continental Worship Team", time: "24/7 Live" },
                schedule: [
                    { time: "07:00", show: "朝の賛美" },
                    { time: "20:00", show: "夜の礼拝" }
                ]
            },
            {
                slug: "jubilee-prayers-tagalog", hm: "359.50", frequency: "HM 359.50", name: "Jubilee Prayers in Tagalog",
                band: "multi", primary: "multilanguage", parentColor: "red",
                mode: "Both", phase: 6, bestseller: 91, reach: "75M",
                image: "/images/jubilee-profile.png",
                description: "Continuous Tagalog-language prayer — Ama Namin, Mga Awit, and pastoral panalangin for the Filipino Christian family worldwide.",
                listeners: "Panalangin · Tagalog-Language",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Jubilee Prayers in Tagalog Live", host: "Continental Prayer Team", time: "24/7 Live" },
                schedule: [
                    { time: "05:00", show: "Panalangin sa Umaga" },
                    { time: "21:00", show: "Panalangin sa Gabi" }
                ]
            },
            {
                slug: "bengal-inspire-bangla", hm: "333.80", frequency: "HM 333.80", name: "Bengal Inspire (বাংলা)",
                band: "multi", primary: "multilanguage", parentColor: "blue",
                mode: "Both", phase: 4, bestseller: 88, reach: "8M",
                image: "/images/jubilee-profile.png",
                description: "Bengali-language Christian flagship — Bangladeshi and West Bengali Christian worship traditions for the Bengali-speaking Christian family across the subcontinent.",
                listeners: "Bengal · Bengali-Language",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Bengal Inspire Live", host: "Subcontinent Worship Team", time: "24/7 Live" },
                schedule: [
                    { time: "06:00", show: "সকালের প্রশংসা" },
                    { time: "20:00", show: "রাতের আরাধনা" }
                ]
            },

            // ===================================================================
            // BAND 3 — Mainstream (20 stations)
            // ===================================================================
            {
                slug: "inspire-family-pop", hm: "368.70", frequency: "HM 368.70", name: "Inspire Family Pop",
                band: "mainstream", primary: "mainstream",
                mode: "Family-Safe", phase: 5, bestseller: 93, reach: "2500M",
                image: "/images/jubilee-profile.png",
                description: "Family-Safe pop hits — universal lyric themes (kindness, joy, perseverance) with no religious gating; multi-faith household friendly.",
                listeners: "Family-Safe · Mainstream Pop",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Inspire Family Pop Live", host: "Inspire Family", time: "24/7 Live" },
                schedule: [
                    { time: "08:00", show: "Family Pop Morning" },
                    { time: "17:00", show: "Drive-Time Pop" }
                ]
            },
            {
                slug: "inspire-kids", hm: "362.50", frequency: "HM 362.50", name: "Inspire Kids",
                band: "mainstream", primary: "mainstream",
                mode: "Family-Safe", phase: 5, bestseller: 94, reach: "1800M",
                image: "/images/jubilee-profile.png",
                description: "Non-faith-gating children's station — universal kindness/family/joy themes for multi-cultural and multi-faith homes.",
                listeners: "Family-Safe · Kids Universal",
                streamUrl: STREAM_KIDS_68,
                currentShow: { name: "Inspire Kids Live", host: "Melody Inspire", time: "24/7 Live" },
                schedule: [
                    { time: "08:00", show: "Kids Morning" },
                    { time: "16:00", show: "After-School Kids" }
                ]
            },
            {
                slug: "inspire-cafe", hm: "369.30", frequency: "HM 369.30", name: "Inspire Cafe",
                band: "mainstream", primary: "mainstream",
                mode: "Family-Safe", phase: 5, bestseller: 91, reach: "1500M",
                image: "/images/jubilee-profile.png",
                description: "Coffee-shop ambient — warm acoustic and soft jazz curated for cafes and retail; B2B public-space distribution ready.",
                listeners: "Family-Safe · Cafe Ambient",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Inspire Cafe Live", host: "Inspire Family", time: "24/7 Live" },
                schedule: [
                    { time: "07:00", show: "Cafe Open" },
                    { time: "16:00", show: "Afternoon Pour" }
                ]
            },
            {
                slug: "inspire-active", hm: "376.20", frequency: "HM 376.20", name: "Inspire Active",
                band: "mainstream", primary: "mainstream",
                mode: "Family-Safe", phase: 5, bestseller: 90, reach: "1200M",
                image: "/images/jubilee-profile.png",
                description: "Fitness and workout station — high-BPM clean energy tracks tuned for gyms and home workouts; B2B fitness-facility distribution.",
                listeners: "Family-Safe · Fitness BPM",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Inspire Active Live", host: "Inspire Family", time: "24/7 Live" },
                schedule: [
                    { time: "06:00", show: "Morning Workout" },
                    { time: "18:00", show: "Evening Pump" }
                ]
            },
            {
                slug: "inspire-focus", hm: "376.50", frequency: "HM 376.50", name: "Inspire Focus",
                band: "mainstream", primary: "mainstream",
                mode: "Family-Safe", phase: 5, bestseller: 92, reach: "1400M",
                image: "/images/jubilee-profile.png",
                description: "Study and work concentration station — lyric-light instrumentals and lo-fi for deep focus; education and office B2B ready.",
                listeners: "Family-Safe · Focus Instrumental",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Inspire Focus Live", host: "Inspire Family", time: "24/7 Live" },
                schedule: [
                    { time: "09:00", show: "Deep Work" },
                    { time: "14:00", show: "Afternoon Focus" }
                ]
            },
            {
                slug: "inspire-drive", hm: "376.80", frequency: "HM 376.80", name: "Inspire Drive",
                band: "mainstream", primary: "mainstream",
                mode: "Family-Safe", phase: 5, bestseller: 90, reach: "900M",
                image: "/images/jubilee-profile.png",
                description: "Driving and road-trip station — upbeat clean rock and pop for the highway; family-friendly across all ages in the car.",
                listeners: "Family-Safe · Drive-Time",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Inspire Drive Live", host: "Inspire Family", time: "24/7 Live" },
                schedule: [
                    { time: "07:00", show: "Morning Commute" },
                    { time: "17:00", show: "Evening Drive" }
                ]
            },
            {
                slug: "inspire-celebrations", hm: "378.20", frequency: "HM 378.20", name: "Inspire Celebrations",
                band: "mainstream", primary: "mainstream",
                mode: "Family-Safe", phase: 5, bestseller: 91, reach: "800M",
                image: "/images/jubilee-profile.png",
                description: "Events and parties station — birthdays, weddings, anniversaries; clean celebration tracks suitable for any household or venue.",
                listeners: "Family-Safe · Celebrations",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Inspire Celebrations Live", host: "Inspire Family", time: "24/7 Live" },
                schedule: [
                    { time: "12:00", show: "Party Mix" },
                    { time: "20:00", show: "Wedding & Anniversary Hour" }
                ]
            },
            {
                slug: "inspire-chill", hm: "370.90", frequency: "HM 370.90", name: "Inspire Chill",
                band: "mainstream", primary: "mainstream",
                mode: "Family-Safe", phase: 5, bestseller: 90, reach: "1000M",
                image: "/images/jubilee-profile.png",
                description: "Relaxation and unwinding station — chillhop, downtempo, and ambient pop for evenings and decompression; spa and wellness B2B ready.",
                listeners: "Family-Safe · Chill Downtempo",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Inspire Chill Live", host: "Inspire Family", time: "24/7 Live" },
                schedule: [
                    { time: "20:00", show: "Evening Chill" },
                    { time: "23:00", show: "Late-Night Lo-Fi" }
                ]
            },
            {
                slug: "inspire-classical", hm: "371.50", frequency: "HM 371.50", name: "Inspire Classical",
                band: "mainstream", primary: "mainstream",
                mode: "Family-Safe", phase: 5, bestseller: 92, reach: "1000M",
                image: "/images/jubilee-profile.png",
                description: "Classical instrumental station — symphonic, chamber, and solo piano works selected for universal appeal across cultures and ages.",
                listeners: "Family-Safe · Classical Instrumental",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Inspire Classical Live", host: "Inspire Family", time: "24/7 Live" },
                schedule: [
                    { time: "09:00", show: "Symphonic Hour" },
                    { time: "21:00", show: "Chamber & Piano" }
                ]
            },
            {
                slug: "inspire-throwback", hm: "375.20", frequency: "HM 375.20", name: "Inspire Throwback",
                band: "mainstream", primary: "mainstream",
                mode: "Family-Safe", phase: 5, bestseller: 90, reach: "800M",
                image: "/images/jubilee-profile.png",
                description: "Nostalgia and throwback hits — clean curated favorites from the 60s through 2000s; multi-generational household appeal.",
                listeners: "Family-Safe · Throwback Hits",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Inspire Throwback Live", host: "Inspire Family", time: "24/7 Live" },
                schedule: [
                    { time: "10:00", show: "Throwback Morning" },
                    { time: "19:00", show: "Decades Hour" }
                ]
            },
            {
                slug: "inspire-jazz", hm: "372.10", frequency: "HM 372.10", name: "Inspire Jazz",
                band: "mainstream", primary: "mainstream",
                mode: "Family-Safe", phase: 6, bestseller: 91, reach: "600M",
                image: "/images/jubilee-profile.png",
                description: "Jazz station — smooth, classic, and contemporary jazz curated for family-safe listening at home, in cafes, and in the car.",
                listeners: "Family-Safe · Jazz",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Inspire Jazz Live", host: "Inspire Family", time: "24/7 Live" },
                schedule: [
                    { time: "11:00", show: "Smooth Jazz Morning" },
                    { time: "21:00", show: "Late-Night Standards" }
                ]
            },
            {
                slug: "inspire-latin", hm: "374.40", frequency: "HM 374.40", name: "Inspire Latin",
                band: "mainstream", primary: "mainstream",
                mode: "Family-Safe", phase: 6, bestseller: 92, reach: "1100M",
                image: "/images/jubilee-profile.png",
                description: "Family-Safe Latin station — clean salsa, bachata, reggaeton, and Latin pop for the worldwide Latino household across every generation.",
                listeners: "Family-Safe · Latin Hits",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Inspire Latin Live", host: "Inspire Family", time: "24/7 Live" },
                schedule: [
                    { time: "12:00", show: "Latin Mediodía" },
                    { time: "20:00", show: "Noche Latina" }
                ]
            },
            {
                slug: "inspire-country", hm: "373.80", frequency: "HM 373.80", name: "Inspire Country",
                band: "mainstream", primary: "mainstream",
                mode: "Family-Safe", phase: 6, bestseller: 91, reach: "950M",
                image: "/images/jubilee-profile.png",
                description: "Family-Safe country station — clean classic and contemporary country hits for the household; values-aligned with no profanity or explicit content.",
                listeners: "Family-Safe · Country Hits",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Inspire Country Live", host: "Inspire Family", time: "24/7 Live" },
                schedule: [
                    { time: "07:00", show: "Country Morning" },
                    { time: "18:00", show: "Front-Porch Country" }
                ]
            },
            {
                slug: "inspire-80s-90s", hm: "375.50", frequency: "HM 375.50", name: "Inspire 80s & 90s",
                band: "mainstream", primary: "mainstream",
                mode: "Family-Safe", phase: 6, bestseller: 89, reach: "700M",
                image: "/images/jubilee-profile.png",
                description: "80s and 90s nostalgia — clean curated hits from two of the most-loved pop and rock decades, suitable for any family setting.",
                listeners: "Family-Safe · 80s & 90s",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Inspire 80s & 90s Live", host: "Inspire Family", time: "24/7 Live" },
                schedule: [
                    { time: "10:00", show: "80s Morning" },
                    { time: "19:00", show: "90s Drive" }
                ]
            },
            {
                slug: "latin-worship", hm: "310.90", frequency: "HM 310.90", name: "Latin Worship (Sung in English)",
                band: "fivefold", primary: "music",
                // Carries its own format name rather than the shared
                // "Praise & Worship" label — the whole point of this frequency is
                // that the music is Latin and the words are English.
                formatLabel: "Latin Worship",
                mode: "CCI", phase: 1, bestseller: 91, reach: "620M",
                image: "/images/jubilee-profile.png",
                description: "Latin and South American worship sung in English — Santiago Inspire's Latin ballad, cumbia, samba and theatrical-liturgical catalogue for English-speaking listeners.",
                listeners: "Latin Worship · Santiago Inspire · 470 tracks",
                // A live Icecast mount like the rest of the dial. Rebuild its
                // playlist with:
                //   node tools/build-station-manifest.js --station HM376.15-EN
                //   node tools/build-station-playlist.js --station HM376.15-EN --out-dir <dir>
                streamUrl: null,
                musicManifestUrl: "/cdn/radio/HM376.15-EN/delivery/music.json",
                currentShow: { name: "Latin Worship Live", host: "Santiago Inspire", time: "24/7 Live" },
                schedule: [
                    { time: "08:00", show: "Manana de Alabanza" },
                    { time: "19:00", show: "Latin Worship Nights" }
                ]
            },
            {
                slug: "hebraic-celebrations", hm: "306.20", frequency: "HM 306.20", name: "Hebraic Celebrations",
                band: "fivefold", primary: "music",
                // Its own format name rather than the shared "Praise & Worship"
                // label — this frequency is the feasts, not a worship set.
                formatLabel: "Messianic Worship",
                mode: "OHI", phase: 1, bestseller: 92, reach: "310M",
                image: "/images/jubilee-profile.png",
                description: "Messianic and Hebraic worship — Zev Inspire's feast-day celebration catalogue, Hebraic chant and modern fusion for the Hebrew-Roots family.",
                listeners: "Messianic · Zev Inspire · 283 tracks",
                // A live Icecast mount. Rebuild its playlist with:
                //   node tools/build-station-manifest.js --station HM377.70-EN
                //   node tools/build-station-playlist.js --station HM377.70-EN --out-dir <dir>
                streamUrl: null,
                musicManifestUrl: "/cdn/radio/HM377.70-EN/delivery/music.json",
                currentShow: { name: "Hebraic Celebrations Live", host: "Zev Inspire", time: "24/7 Live" },
                schedule: [
                    { time: "09:00", show: "Morning Shema" },
                    { time: "18:00", show: "Erev Celebration" }
                ]
            },
            {
                slug: "inspire-wellness", hm: "377.60", frequency: "HM 377.60", name: "Inspire Wellness",
                band: "mainstream", primary: "mainstream",
                mode: "Family-Safe", phase: 6, bestseller: 90, reach: "850M",
                image: "/images/jubilee-profile.png",
                description: "Wellness and mindfulness station — gentle instrumentals and meditative ambient curated for spas, yoga studios, and calm at home.",
                listeners: "Family-Safe · Wellness Ambient",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Inspire Wellness Live", host: "Inspire Family", time: "24/7 Live" },
                schedule: [
                    { time: "07:00", show: "Morning Mindfulness" },
                    { time: "19:00", show: "Evening Reset" }
                ]
            },
            {
                slug: "inspire-holiday", hm: "378.50", frequency: "HM 378.50", name: "Inspire Holiday",
                band: "mainstream", primary: "mainstream",
                mode: "Family-Safe", phase: 6, bestseller: 91, reach: "1000M",
                image: "/images/jubilee-profile.png",
                description: "Year-round and seasonal holiday station — Christmas, Easter, and global celebration favorites curated clean for every household.",
                listeners: "Family-Safe · Holiday Seasonal",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Inspire Holiday Live", host: "Inspire Family", time: "24/7 Live" },
                schedule: [
                    { time: "10:00", show: "Holiday Morning" },
                    { time: "19:00", show: "Seasonal Favorites" }
                ]
            },
            {
                slug: "inspire-stories", hm: "367.50", frequency: "HM 367.50", name: "Inspire Stories",
                band: "mainstream", primary: "mainstream",
                mode: "Family-Safe", phase: 6, bestseller: 89, reach: "600M",
                image: "/images/jubilee-profile.png",
                description: "Family-Safe storytelling station — short fiction, biographies, and audio drama curated clean for every age in the household.",
                listeners: "Family-Safe · Audio Stories",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Inspire Stories Live", host: "Inspire Family", time: "24/7 Live" },
                schedule: [
                    { time: "17:00", show: "Family Story Hour" },
                    { time: "20:00", show: "Bedtime Tales" }
                ]
            },
            {
                slug: "inspire-live", hm: "379.90", frequency: "HM 379.90", name: "Inspire Live",
                band: "mainstream", primary: "mainstream",
                mode: "Family-Safe", phase: 6, bestseller: 90, reach: "750M",
                image: "/images/jubilee-profile.png",
                description: "Live performance and concert station — clean curated live recordings across genres for the family-safe household and venue.",
                listeners: "Family-Safe · Live Performances",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Inspire Live Live", host: "Inspire Family", time: "24/7 Live" },
                schedule: [
                    { time: "12:00", show: "Live Sessions" },
                    { time: "21:00", show: "Concert Hour" }
                ]
            },
            {
                slug: "inspire-rising", hm: "375.80", frequency: "HM 375.80", name: "Inspire Rising",
                band: "mainstream", primary: "mainstream",
                mode: "Family-Safe", phase: 6, bestseller: 90, reach: "900M",
                image: "/images/jubilee-profile.png",
                description: "Emerging-artists discovery station — clean breakout tracks from rising independent and indie acts; family-safe and household-friendly throughout.",
                listeners: "Family-Safe · Emerging Artists",
                streamUrl: STREAM_ADULT,
                currentShow: { name: "Inspire Rising Live", host: "Inspire Family", time: "24/7 Live" },
                schedule: [
                    { time: "11:00", show: "Rising Discovery" },
                    { time: "20:00", show: "New Voices Hour" }
                ]
            },
        ];

        // State
        // currentStationIdx  = station whose detail view is currently shown (selection / navigation)
        // playingStationIdx  = station whose audio is actually being streamed (may differ from selected
        //                      if the user navigates while playback continues)
        // isPlaying          = whether audio is active
        let currentStationIdx = -1;
        let playingStationIdx = -1;
        let isPlaying = false;
        let currentFilter = 'all';

        // Favorites state
        let userFavorites = new Set(); // Set of station IDs for O(1) lookup
        let libraryExpanded = true;

        // Follows state
        let userFollows = new Set(); // Set of station IDs for O(1) lookup

        // ============================================
        // FAVORITES HELPER FUNCTIONS
        // ============================================

        // Helper: Get auth data from localStorage
        function getAuthData() {
            try {
                const authStr = localStorage.getItem('jubileeVerseAuth');
                if (!authStr) return null;
                const authData = JSON.parse(authStr);
                return authData.authenticated ? authData : null;
            } catch (error) {
                console.error('Error parsing auth data:', error);
                return null;
            }
        }

        // Show the sign-in prompt for an anonymous user attempting an
        // authenticated action (favorite, follow). actionLabel populates the
        // dialog title; both Sign In and Create Account buttons return here
        // after auth completes via the ?redirect= query param consumed by
        // login.html / signup.html.
        function requireLogin(actionLabel = 'continue') {
            const overlay  = document.getElementById('authPromptOverlay');
            const action   = document.getElementById('authPromptAction');
            const signIn   = document.getElementById('authPromptSignIn');
            const signUp   = document.getElementById('authPromptSignUp');
            if (!overlay || !action || !signIn || !signUp) return;
            action.textContent = actionLabel;
            const here = encodeURIComponent(window.location.pathname + window.location.search);
            signIn.href = `/login?redirect=${here}`;
            signUp.href = `/signup?redirect=${here}`;
            overlay.classList.add('open');
            // Allow Esc to dismiss.
            document.addEventListener('keydown', escDismissAuthPrompt);
        }
        function closeAuthPrompt() {
            const overlay = document.getElementById('authPromptOverlay');
            if (overlay) overlay.classList.remove('open');
            document.removeEventListener('keydown', escDismissAuthPrompt);
        }
        function escDismissAuthPrompt(e) {
            if (e.key === 'Escape') closeAuthPrompt();
        }

        // ── Submit Prayer modal helpers (Phase E, spec Part 1 + Part 8) ──
        // Routes faith-mode listeners into The Upper Room (HM 309.00).
        // Validates client-side, then stubs the submission with console.log
        // until the backend POST /api/prayer/submit lands.

        // Crisis keywords — trigger an immediate redirect to support
        // resources rather than submission. Word-bounded to avoid false
        // positives ("suicide" inside "suicidology" etc.).
        const PRAYER_CRISIS_PATTERNS = [
            /\bsuicide\b/i,
            /\bsuicidal\b/i,
            /\bself[\s-]?harm\b/i,
            /\bwant(?:ing)?\s+to\s+die\b/i,
            /\bend\s+(?:my|it\s+all|my\s+life)\b/i,
            /\bkill(?:ing)?\s+myself\b/i,
        ];
        // Identifiable PII — flag for privacy review (don't block).
        const PRAYER_PII_SSN      = /\b\d{3}-\d{2}-\d{4}\b/;
        const PRAYER_PII_FULL_DOB = /\b(?:0?[1-9]|1[0-2])[\/\-](?:0?[1-9]|[12]\d|3[01])[\/\-](?:19|20)\d{2}\b/;

        function openPrayerModal() {
            const stn = stations[currentStationIdx];
            if (stn && stn.mode === 'Family-Safe') return; // defense in depth
            document.getElementById('prayerFormView').hidden = false;
            document.getElementById('prayerCrisisView').hidden = true;
            document.getElementById('prayerText').value = '';
            document.getElementById('prayerOnBehalf').value = '';
            document.getElementById('prayerAnonymous').checked = true;
            updatePrayerCounter();
            const overlay = document.getElementById('prayerModalOverlay');
            overlay.classList.add('open');
            setTimeout(() => document.getElementById('prayerText').focus(), 200);
        }
        function closePrayerModal() {
            document.getElementById('prayerModalOverlay').classList.remove('open');
        }
        function updatePrayerCounter() {
            const ta = document.getElementById('prayerText');
            if (!ta) return;
            const len = ta.value.length;
            const counter = document.getElementById('prayerCounter');
            if (counter) counter.textContent = `${len} / 500`;
            const hint = document.getElementById('prayerTextHint');
            if (hint) hint.classList.toggle('warn', len > 0 && len < 10);
        }
        function submitPrayer() {
            const text = document.getElementById('prayerText').value.trim();
            const onBehalf = document.getElementById('prayerOnBehalf').value.trim();
            const anonymous = document.getElementById('prayerAnonymous').checked;
            const hint = document.getElementById('prayerTextHint');

            if (text.length < 10 || text.length > 500) {
                hint.textContent = 'Please write between 10 and 500 characters.';
                hint.classList.add('warn');
                document.getElementById('prayerText').focus();
                return;
            }

            const haystack = `${text}\n${onBehalf}`;
            const inCrisis = PRAYER_CRISIS_PATTERNS.some(re => re.test(haystack));
            if (inCrisis) {
                document.getElementById('prayerFormView').hidden = true;
                document.getElementById('prayerCrisisView').hidden = false;
                console.log('[prayer] crisis route triggered — form not submitted');
                return;
            }

            const piiFlags = [];
            if (PRAYER_PII_SSN.test(haystack))      piiFlags.push('ssn-like');
            if (PRAYER_PII_FULL_DOB.test(haystack)) piiFlags.push('full-dob');
            if (/\b(diagnos|cancer|tumor|hiv|stage\s+(?:i{1,4}|\d))\b/i.test(haystack)
                && /\d{4,}/.test(haystack)) {
                piiFlags.push('medical-id');
            }

            const payload = {
                prayer: text,
                on_behalf_of: onBehalf || null,
                anonymous,
                station_slug: stations[currentStationIdx]?.slug || null,
                station_mode: stations[currentStationIdx]?.mode || null,
                pii_flags: piiFlags,
                client_ts: new Date().toISOString(),
            };

            // TODO(phase-e-backend): replace with real POST /api/prayer/submit
            console.log('[prayer] would submit:', payload);

            const btn = document.getElementById('prayerSubmitBtn');
            btn.textContent = 'Sent · thank you';
            btn.disabled = true;
            setTimeout(() => {
                btn.textContent = 'Submit';
                btn.disabled = false;
                closePrayerModal();
            }, 1400);
        }

        // Hide the CTA on Family-Safe stations (spec §1).
        function updatePrayerButtonVisibility() {
            const btn = document.getElementById('submitPrayerBtn');
            if (!btn) return;
            const stn = stations[currentStationIdx];
            const shouldHide = !!(stn && stn.mode === 'Family-Safe');
            btn.hidden = shouldHide;
            const wrap = btn.closest('.dsb-prayer-cta');
            if (wrap) wrap.toggleAttribute('hidden', shouldHide);
        }

        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            const overlay = document.getElementById('prayerModalOverlay');
            if (overlay && overlay.classList.contains('open')) closePrayerModal();
        });

        // Helper: Get station ID — uses the JRE station slug ("adult",
        // "kids-3-5", etc.) so the favorites/follows storage is portable
        // across station-list changes (adding/reordering stations no longer
        // invalidates saved favorites the way numeric indices did).
        function getStationId(stationIdx) {
            const station = stations[stationIdx];
            return station?.slug ?? `station-${stationIdx}`;
        }

        // Helper: map a station's mode declaration to its CSS class.
        // The spec's Mixed-Mode value comes through as "Mixed-Mode" or
        // "Mixed", and "Both" indicates the station rotates between OHI and
        // Non-OHI. Family-Safe is reserved for the Phase 5 Melody Network.
        function modeClassFor(mode) {
            if (!mode) return '';
            const m = String(mode).toLowerCase();
            if (m === 'ohi')                          return 'mode-ohi';
            if (m === 'non-ohi')                      return 'mode-nonohi';
            if (m === 'mixed' || m === 'mixed-mode')  return 'mode-mixed';
            if (m === 'both')                         return 'mode-both';
            if (m === 'family-safe')                  return 'mode-family';
            return '';
        }

        // One-time migration helper: upgrades any legacy "station-N" entry
        // in a Set of station IDs to the current slug. Called from
        // loadFromLocalStorage so users with pre-migration favorites still
        // see them after the upgrade. No-op if all entries are already slugs.
        function migrateLegacyStationIds(idSet) {
            const legacyPattern = /^station-(\d+)$/;
            const upgraded = new Set();
            let changed = false;
            for (const id of idSet) {
                const m = id.match(legacyPattern);
                if (m) {
                    const idx = parseInt(m[1], 10);
                    const station = stations[idx];
                    if (station?.slug) {
                        upgraded.add(station.slug);
                        changed = true;
                    }
                    // Drop legacy entries that no longer map to a station.
                } else {
                    upgraded.add(id);
                }
            }
            return { ids: upgraded, changed };
        }

        // Helper: Get auth headers for API calls
        // login.html stores { authenticated, token, user } — read the flat
        // `token` field. (Earlier code read `authData.tokens.access` which
        // never existed in the actual login schema, so the bearer header
        // was always omitted and every request returned 401.)
        function getAuthHeaders() {
            const authData = getAuthData();
            const token = authData?.token || authData?.tokens?.access; // tolerate either shape
            if (!token) return {};
            return {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            };
        }

        // ============================================
        // AUDIO STREAMING ENGINE (HTML5 Audio)
        // ============================================

        let radioAudio = null;
        let audioVolume = 0.7;

        // Manifest-driven playback state (used by stations with musicManifestUrl
        // instead of a live streamUrl — fetches a JSON track list, shuffles
        // it, plays tracks sequentially, and skips any that fail to load.
        // Manifest JSON is cached by URL so re-selecting the same station
        // does not re-fetch.
        const manifestCache = new Map();
        let manifestQueue = [];
        let manifestIdx = 0;
        // Bumped by every start and every stop. Async work begun under an older
        // epoch must not touch playback state. startManifestPlayback awaits a
        // fetch, and without this guard the manifest for the station you just
        // LEFT can resolve last and overwrite the queue for the station you are
        // now on — which is how a country track ended up on Kids Party while
        // the dial still read Kids Party.
        let playbackEpoch = 0;
        // Held so stopAudioPlayback can detach them. Assigning src='' fires an
        // 'error' event on most browsers; an attached handler would re-enter
        // playNextManifestTrack and revive playback after a stop.
        let manifestAudioHandler = null;
        // The station the live queue was actually built for.
        let manifestStationSlug = null;
        // The track currently playing from a manifest station — used by the
        // BR-I1 engagement layer to attach segment context to feedback events.
        let currentManifestTrack = null;

        // Manifests store absolute CDN URLs. R2 returns no Access-Control-Allow-Origin,
        // so loading cdn.kjubilee.com straight into an <audio> with crossOrigin
        // 'anonymous' is a cross-origin request the browser refuses outright — every
        // track fires 'error' and the queue burns through in silence. Rewriting to a
        // relative /cdn/ path routes through our own origin (dev: server.js proxy;
        // prod: the /cdn/* route), which makes it same-origin and legal.
        //
        // Both hosts are matched: kjubilee.com is the live one, jubileeverse.com only
        // appears in legacy 'source'-layout manifests. This mirrors localise() in
        // public/js/kj-footer-player.js — keep the two in step.
        function localizeCdnUrl(url) {
            if (!url) return url;
            return url.replace(/^https:\/\/cdn\.(?:jubileeverse|kjubilee)\.com\//, '/cdn/');
        }

        function flattenManifestTracks(manifest) {
            const out = [];
            if (Array.isArray(manifest?.albums)) {
                for (const album of manifest.albums) {
                    if (Array.isArray(album.tracks)) {
                        for (const t of album.tracks) {
                            if (t.url) out.push({ url: localizeCdnUrl(t.url), title: t.title, artist: t.artist });
                        }
                    }
                }
            }
            return out;
        }

        function shuffleInPlace(arr) {
            for (let i = arr.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [arr[i], arr[j]] = [arr[j], arr[i]];
            }
            return arr;
        }

        function playNextManifestTrack(epoch) {
            if (epoch !== playbackEpoch) return;   // superseded by a later station
            if (!manifestQueue.length) return;
            // Wrap = one full pass through the catalog. Reshuffle rather than
            // replay the same order — on a station with a few hours of music
            // a listener does reach the end, and a repeating sequence stops
            // sounding like a rotation.
            if (manifestIdx >= manifestQueue.length) {
                shuffleInPlace(manifestQueue);
                manifestIdx = 0;
            }
            const track = manifestQueue[manifestIdx++];
            currentManifestTrack = track;
            // New segment → clear the previous track's thumb vote, and
            // surface the new track in the now-playing line (BR-I3).
            resetSegmentRatingUI();
            updateNowPlayingSegment();
            if (radioAudio) {
                radioAudio.src = track.url;
                radioAudio.play().catch(err => {
                    console.log('[manifest] track failed, skipping:', track.url, err.message);
                });
            }
        }

        async function startManifestPlayback(station, epoch) {
            try {
                let manifest = manifestCache.get(station.musicManifestUrl);
                if (!manifest) {
                    const res = await fetch(station.musicManifestUrl);
                    if (epoch !== playbackEpoch) return;   // listener changed station mid-fetch
                    if (!res.ok) throw new Error(`manifest HTTP ${res.status}`);
                    manifest = await res.json();
                    if (epoch !== playbackEpoch) return;
                    manifestCache.set(station.musicManifestUrl, manifest);
                }
                if (epoch !== playbackEpoch) return;
                manifestQueue = shuffleInPlace(flattenManifestTracks(manifest));
                manifestIdx = 0;
                manifestStationSlug = station.slug;
                console.log(`[manifest] ${manifestQueue.length} tracks for ${station.slug} from ${station.musicManifestUrl}`);
                if (!manifestQueue.length) return;

                radioAudio = new Audio();
                radioAudio.crossOrigin = 'anonymous';
                radioAudio.volume = audioVolume;
                // Skip to next track on either successful end or load/play error.
                // Bound to this epoch so a stale element cannot drive the queue.
                manifestAudioHandler = () => playNextManifestTrack(epoch);
                radioAudio.addEventListener('ended', manifestAudioHandler);
                radioAudio.addEventListener('error', manifestAudioHandler);
                playNextManifestTrack(epoch);
            } catch (err) {
                console.log('[manifest] load error:', err.message);
            }
        }

        function startAudioPlayback(stationIdx) {
            stopAudioPlayback();          // bumps playbackEpoch
            currentManifestTrack = null;
            const station = stations[stationIdx];
            const epoch = playbackEpoch;

            if (station.musicManifestUrl) {
                startManifestPlayback(station, epoch);
                return;
            }

            if (!station.streamUrl) return;

            radioAudio = new Audio();
            radioAudio.crossOrigin = 'anonymous';
            radioAudio.volume = audioVolume;
            radioAudio.src = station.streamUrl;
            radioAudio.play().catch(err => {
                console.log('Stream playback error:', err.message);
            });
        }

        function stopAudioPlayback() {
            // Invalidate in-flight manifest fetches and any pending track
            // advance BEFORE tearing the element down, so neither can write
            // back into the shared queue.
            playbackEpoch++;
            if (radioAudio) {
                if (manifestAudioHandler) {
                    radioAudio.removeEventListener('ended', manifestAudioHandler);
                    radioAudio.removeEventListener('error', manifestAudioHandler);
                    manifestAudioHandler = null;
                }
                radioAudio.pause();
                radioAudio.src = '';
                radioAudio = null;
            }
            manifestQueue = [];
            manifestIdx = 0;
            manifestStationSlug = null;
        }

        function resumeAudioPlayback() {
            if (radioAudio) {
                radioAudio.play().catch(err => {
                    console.log('Resume error:', err.message);
                });
                return;
            }
            // stopAudioPlayback() nulls radioAudio on pause. For live streams
            // that's the right call (otherwise the browser keeps buffering in
            // the background). On resume we have to recreate the element for
            // the station that was last playing.
            const idx = playingStationIdx >= 0 ? playingStationIdx : currentStationIdx;
            if (idx >= 0) startAudioPlayback(idx);
        }

        function setAudioVolume(vol) {
            audioVolume = Math.max(0, Math.min(1, vol));
            if (radioAudio) radioAudio.volume = audioVolume;
            updateVolumeIcon();
            // Persist for the pinned sticky footer's volume restore.
            if (typeof syncPinnedState === 'function') syncPinnedState();
        }

        // Swap the volume button between speaker and muted-speaker SVG based
        // on current audioVolume. Single chokepoint — every volume mutation
        // (slider drag, click, toggleMute, programmatic set) routes through
        // setAudioVolume which calls this.
        function updateVolumeIcon() {
            const btn = document.getElementById('volumeBtn');
            if (!btn) return;
            const svg = btn.querySelector('svg');
            if (!svg) return;
            const speakerCone = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>';
            if (audioVolume <= 0) {
                // Muted — speaker with an X over the sound-wave area.
                svg.innerHTML = speakerCone +
                    '<line x1="23" y1="9" x2="17" y2="15"/>' +
                    '<line x1="17" y1="9" x2="23" y2="15"/>';
                btn.title = 'Unmute';
            } else {
                // Audible — speaker with two arc waves.
                svg.innerHTML = speakerCone +
                    '<path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>';
                btn.title = 'Mute';
            }
        }

        // ============================================
        // FAVORITES API FUNCTIONS
        // ============================================

        // Load favorites from localStorage or API
        async function loadUserFavorites() {
            const authData = getAuthData();

            // ALWAYS seed from localStorage first so heart icons reflect
            // the last-known-good state immediately on reload — even if
            // the API is slow, errors, or returns an empty list. Without
            // this, an empty server response would wipe in-memory state
            // and the user's saved favorites would silently disappear.
            const hadLocalFavorites = (() => {
                try {
                    const raw = localStorage.getItem('jubileeVerseFavorites');
                    return Array.isArray(raw && JSON.parse(raw)) && JSON.parse(raw).length > 0;
                } catch { return false; }
            })();
            loadFromLocalStorage();

            if (!authData) return;

            // Logged in: try to refresh from the server. The server is
            // only authoritative when it actually returns favorites —
            // an empty list while localStorage has data means the
            // server is out of sync (e.g. earlier save didn't reach
            // the DB), so we keep the local state instead of clobbering.
            try {
                const response = await fetch('/api/radio/favorites', {
                    headers: getAuthHeaders()
                });

                if (!response.ok) {
                    console.warn('Favorites API non-OK:', response.status, '— keeping local state');
                    return;
                }

                const data = await response.json();
                if (!data || !data.success || !Array.isArray(data.favorites)) return;

                if (data.favorites.length > 0 || !hadLocalFavorites) {
                    userFavorites = new Set(data.favorites.map(f => f.station_id));
                    updateLibraryContent(data.favorites);
                    updatePlayerLikeButton();
                    renderStationList();
                    renderMobileFavorites();
                }
            } catch (error) {
                console.warn('Favorites API error:', error, '— keeping local state');
            }
        }

        // Load favorites from localStorage. Migrates any legacy "station-N"
        // entries to slugs in-flight and rewrites the stored value so the
        // upgrade is idempotent (next read sees the cleaned set).
        function loadFromLocalStorage() {
            try {
                const stored = localStorage.getItem('jubileeVerseFavorites');
                if (stored) {
                    const rawIds = JSON.parse(stored);
                    const { ids: migratedIds, changed } = migrateLegacyStationIds(new Set(rawIds));
                    userFavorites = migratedIds;

                    // If the migration upgraded any IDs, persist the cleaned
                    // form back so future reads don't re-do the work.
                    if (changed) {
                        localStorage.setItem('jubileeVerseFavorites', JSON.stringify([...migratedIds]));
                    }

                    // Convert to favorites format for UI. Look up by slug now
                    // — index-parsing was brittle and broke after the
                    // station-list shrink.
                    const slugToStation = new Map(stations.map(s => [s.slug, s]));
                    const favorites = [...migratedIds]
                        .map(slug => {
                            const station = slugToStation.get(slug);
                            if (!station) return null; // Skip orphans.
                            return {
                                station_id: slug,
                                station_name: station.name,
                                station_category: station.category,
                                station_image: station.image
                            };
                        })
                        .filter(Boolean);

                    updateLibraryContent(favorites);
                } else {
                    userFavorites.clear();
                    updateLibraryContent([]);
                }
            } catch (error) {
                console.error('Error loading from localStorage:', error);
                userFavorites.clear();
                updateLibraryContent([]);
            }

            // Update player button state
            updatePlayerLikeButton();

            // Update heart icons in station list
            renderStationList();
            renderMobileFavorites();
        }

        // Save favorites to localStorage
        function saveToLocalStorage() {
            try {
                localStorage.setItem('jubileeVerseFavorites', JSON.stringify([...userFavorites]));
            } catch (error) {
                console.error('Error saving to localStorage:', error);
            }
        }

        // Toggle favorite (add or remove)
        async function toggleFavorite(event, stationIdx) {
            event.stopPropagation(); // Prevent station selection

            const authData = getAuthData();

            // Favorites work for everyone — anonymous users get a
            // localStorage-only persistence path; logged-in users also
            // sync to the server. Previously we bailed with a login
            // prompt before saving, which made the heart click feel
            // broken for anonymous visitors.

            const station = stations[stationIdx];
            const stationId = getStationId(stationIdx);
            const isFavorited = userFavorites.has(stationId);

            // Optimistic UI update
            const btn = event.currentTarget;
            const svg = btn.querySelector('svg');

            if (isFavorited) {
                userFavorites.delete(stationId);
                btn.classList.remove('favorited');
                svg.setAttribute('fill', 'none');
                btn.title = 'Add to favorites';
            } else {
                userFavorites.add(stationId);
                btn.classList.add('favorited');
                svg.setAttribute('fill', 'currentColor');
                btn.title = 'Remove from favorites';
            }

            // Persist to localStorage IMMEDIATELY — before any await — so a
            // racing async loadUserFavorites() that resolves later can't wipe
            // the user's click. The init fetch on page load is async; the
            // user can click during that await window. Without this immediate
            // write, the slower of the two responses (401 → loadFromLocalStorage)
            // would read empty storage and clobber the in-memory Set.
            saveToLocalStorage();

            if (authData) {
                // Logged in: try to save to the database. If the session has
                // expired the server returns 401 — in that case we clear the
                // stale auth data and silently fall back to localStorage
                // instead of punishing the user with an error dialog.
                let response;
                try {
                    if (isFavorited) {
                        response = await fetch(`/api/radio/favorites/${encodeURIComponent(stationId)}`, {
                            method: 'DELETE',
                            headers: getAuthHeaders()
                        });
                    } else {
                        response = await fetch('/api/radio/favorites', {
                            method: 'POST',
                            headers: getAuthHeaders(),
                            body: JSON.stringify({
                                station_id: stationId,
                                station_name: station.name,
                                station_category: station.category,
                                station_image: station.image
                            })
                        });
                    }

                    if (response.status === 401 || response.status === 403) {
                        // Don't wipe jubileeVerseAuth — that would log the
                        // user out of the entire site. Just persist this
                        // single click locally and continue. If the bearer
                        // token is genuinely invalid, the home page's own
                        // auth check will surface that to the user.
                        saveToLocalStorage();
                    } else if (!response.ok) {
                        throw new Error(`Server returned ${response.status}`);
                    } else {
                        // 2xx — the database is now authoritative; reload it.
                        await loadUserFavorites();
                    }

                    renderStationList();
                    renderMobileStationList();
                    renderMobileFavorites();
                    renderMobileTrending();
                    renderMobileRecommended();
                    updatePlayerLikeButton();
                } catch (error) {
                    // Server is unreachable or returned a non-2xx — but
                    // saveToLocalStorage() already ran above, so the
                    // user's click is preserved locally. Don't revert
                    // the UI and don't alert; the heart should always
                    // feel responsive even when the favorites API is
                    // down on this environment.
                    console.warn('Favorites server save failed; kept locally:', error);
                    renderStationList();
                    renderMobileStationList();
                    renderMobileFavorites();
                    renderMobileTrending();
                    renderMobileRecommended();
                    updatePlayerLikeButton();
                }
            } else {
                // Not logged in: save to localStorage
                saveToLocalStorage();
                await loadUserFavorites();
                renderStationList();
                renderMobileStationList();
                renderMobileFavorites();
                renderMobileTrending();
                renderMobileRecommended();
                updatePlayerLikeButton();
            }
        }

        // ============================================
        // FOLLOWS API FUNCTIONS
        // ============================================

        // Load follows from localStorage or API
        async function loadUserFollows() {
            const authData = getAuthData();

            if (authData) {
                // Logged in: load from database
                try {
                    const response = await fetch('/api/radio/follows', {
                        headers: getAuthHeaders()
                    });

                    if (!response.ok) {
                        console.error('Failed to load follows:', response.status);
                        loadFollowsFromLocalStorage();
                        return;
                    }

                    const data = await response.json();
                    if (data.success && data.follows) {
                        userFollows = new Set(data.follows.map(f => f.station_id));
                        updateFollowedStationsContent(data.follows);
                    }
                } catch (error) {
                    console.error('Error loading follows:', error);
                    loadFollowsFromLocalStorage();
                }
            } else {
                // Anonymous user: follows are account-only now (mirror of the
                // favorites change). Don't surface stale local state.
                userFollows.clear();
                updateFollowedStationsContent([]);
            }
        }

        // Load follows from localStorage. Same slug-migration treatment as
        // loadFromLocalStorage (favorites) — keeps the two paths symmetric.
        function loadFollowsFromLocalStorage() {
            try {
                const stored = localStorage.getItem('jubileeVerseFollows');
                if (stored) {
                    const rawIds = JSON.parse(stored);
                    const { ids: migratedIds, changed } = migrateLegacyStationIds(new Set(rawIds));
                    userFollows = migratedIds;
                    if (changed) {
                        localStorage.setItem('jubileeVerseFollows', JSON.stringify([...migratedIds]));
                    }

                    const slugToStation = new Map(stations.map(s => [s.slug, s]));
                    const follows = [...migratedIds]
                        .map(slug => {
                            const station = slugToStation.get(slug);
                            if (!station) return null;
                            return {
                                station_id: slug,
                                station_name: station.name,
                                station_category: station.category,
                                station_image: station.image
                            };
                        })
                        .filter(Boolean);

                    updateFollowedStationsContent(follows);
                } else {
                    userFollows.clear();
                    updateFollowedStationsContent([]);
                }
            } catch (error) {
                console.error('[Follows] Error loading from localStorage:', error);
                userFollows.clear();
                updateFollowedStationsContent([]);
            }
        }

        // Save follows to localStorage
        function saveFollowsToLocalStorage() {
            try {
                localStorage.setItem('jubileeVerseFollows', JSON.stringify([...userFollows]));
            } catch (error) {
                console.error('Error saving follows to localStorage:', error);
            }
        }

        // Toggle follow for a station (make it global)
        window.toggleFollow = async function(btnElement, stationIdx) {
            const authData = getAuthData();

            // Follows are also account-only. Show the sign-in prompt before
            // any UI change so the button doesn't briefly read "Following"
            // for a follow we won't actually persist.
            if (!authData) {
                requireLogin('follow stations');
                return;
            }

            const station = stations[stationIdx];
            const stationId = getStationId(stationIdx);
            const isFollowed = userFollows.has(stationId);

            // Optimistic UI update
            if (isFollowed) {
                userFollows.delete(stationId);
                btnElement.classList.remove('following');
                btnElement.textContent = 'Follow';
            } else {
                userFollows.add(stationId);
                btnElement.classList.add('following');
                btnElement.textContent = 'Following';
            }

            if (authData) {
                // Logged in: save to database
                try {
                    if (isFollowed) {
                        const response = await fetch(`/api/radio/follows/${encodeURIComponent(stationId)}`, {
                            method: 'DELETE',
                            headers: getAuthHeaders()
                        });
                        if (!response.ok) throw new Error('Failed to unfollow');
                    } else {
                        const response = await fetch('/api/radio/follows', {
                            method: 'POST',
                            headers: getAuthHeaders(),
                            body: JSON.stringify({
                                station_id: stationId,
                                station_name: station.name,
                                station_category: station.category,
                                station_image: station.image
                            })
                        });
                        if (!response.ok) throw new Error('Failed to follow');
                    }

                    // Reload from database
                    await loadUserFollows();
                    renderMobileStationList();
                    renderMobileFollows();
                    renderMobileTrending();
                    renderMobileRecommended();
                } catch (error) {
                    console.error('Error toggling follow:', error);
                    // Revert on error
                    if (isFollowed) {
                        userFollows.add(stationId);
                        btnElement.classList.add('following');
                        btnElement.textContent = 'Following';
                    } else {
                        userFollows.delete(stationId);
                        btnElement.classList.remove('following');
                        btnElement.textContent = 'Follow';
                    }
                    alert('Failed to update follows. Please try again.');
                }
            } else {
                // Not logged in: save to localStorage
                saveFollowsToLocalStorage();
                await loadUserFollows();
                renderMobileStationList();
                renderMobileFollows();
                renderMobileTrending();
                renderMobileRecommended();
            }
        }

        // ============================================
        // FAVORITES UI FUNCTIONS
        // ============================================

        // Render "Your Library" section
        function renderYourLibrary() {
            return `
                <div class="library-section">
                    <div class="library-header" onclick="toggleLibrary()">
                        <div class="library-title">
                            Your Library
                        </div>
                        <svg class="library-toggle expanded" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="6 9 12 15 18 9"/>
                        </svg>
                    </div>
                    <div class="library-content expanded" id="libraryContent">
                        <div class="library-empty">
                            <div class="library-empty-icon">♡</div>
                            Loading favorites...
                        </div>
                    </div>
                    <div class="library-content expanded" id="desktopFollowsContent">
                        <div class="library-empty">
                            <div class="library-empty-icon">➕</div>
                            Loading follows...
                        </div>
                    </div>
                </div>
            `;
        }

        // Update library content with favorites
        function updateLibraryContent(favorites) {
            const content = document.getElementById('libraryContent');
            if (!content) return;

            if (favorites.length === 0) {
                content.innerHTML = `
                    <div class="library-empty">
                        <div class="library-empty-icon">♡</div>
                        <div>No favorite channels yet</div>
                        <div style="font-size: 11px; margin-top: 4px;">Click the heart icon to save stations</div>
                    </div>
                `;
                return;
            }

            content.innerHTML = `
                <div class="playlist-header">Favorite Channels</div>
                ${favorites.map(fav => {
                    // station_id is now a slug (e.g. "adult"). Find the index
                    // by slug; fall back to legacy "station-N" parsing for any
                    // pre-migration data still in flight.
                    let stationIdx = stations.findIndex(s => s.slug === fav.station_id);
                    if (stationIdx === -1) {
                        const m = String(fav.station_id).match(/^station-(\d+)$/);
                        if (m) stationIdx = parseInt(m[1], 10);
                    }
                    const station = stations[stationIdx];
                    if (!station) return '';

                    return `
                        <div class="discover-card" onclick="selectStation(${stationIdx})">
                            <img class="discover-card-art" src="${fav.station_image}" alt="${fav.station_name}" loading="lazy">
                            <div class="discover-card-info">
                                <div class="discover-card-name">${fav.station_name}</div>
                                <div class="discover-card-cat">${fav.station_category.charAt(0).toUpperCase() + fav.station_category.slice(1)}</div>
                            </div>
                            <button class="discover-remove-btn"
                                    onclick="toggleFavorite(event, ${stationIdx})"
                                    title="Remove from favorites">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="3 6 5 6 21 6"/>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                    <line x1="10" y1="11" x2="10" y2="17"/>
                                    <line x1="14" y1="11" x2="14" y2="17"/>
                                </svg>
                            </button>
                        </div>
                    `;
                }).join('')}
            `;
        }

        // Update followed stations content (desktop library)
        function updateFollowedStationsContent(follows) {
            console.log('[Follows] updateFollowedStationsContent called with:', follows);
            const content = document.getElementById('desktopFollowsContent');
            if (!content) {
                console.error('[Follows] Desktop desktopFollowsContent element not found!');
                return;
            }

            if (follows.length === 0) {
                content.innerHTML = `
                    <div class="library-empty">
                        <div class="library-empty-icon">➕</div>
                        <div>No followed stations yet</div>
                        <div style="font-size: 11px; margin-top: 4px;">Click Follow button on station page</div>
                    </div>
                `;
                console.log('[Follows] Desktop: Set empty state');
                return;
            }

            const html = `
                <div class="playlist-header">Followed Stations</div>
                ${follows.map(follow => {
                    // Slug-first, legacy "station-N" fallback (same migration
                    // shape as the favorites library card).
                    let stationIdx = stations.findIndex(s => s.slug === follow.station_id);
                    if (stationIdx === -1) {
                        const m = String(follow.station_id).match(/^station-(\d+)$/);
                        if (m) stationIdx = parseInt(m[1], 10);
                    }
                    const station = stations[stationIdx];
                    if (!station) return '';

                    return `
                        <div class="discover-card" onclick="selectStation(${stationIdx})">
                            <img class="discover-card-art" src="${follow.station_image}" alt="${follow.station_name}" loading="lazy">
                            <div class="discover-card-info">
                                <div class="discover-card-name">${follow.station_name}</div>
                                <div class="discover-card-cat">${follow.station_category.charAt(0).toUpperCase() + follow.station_category.slice(1)}</div>
                            </div>
                            <button class="discover-remove-btn"
                                    onclick="toggleFollow(this, ${stationIdx})"
                                    title="Unfollow">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="3 6 5 6 21 6"/>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                    <line x1="10" y1="11" x2="10" y2="17"/>
                                    <line x1="14" y1="11" x2="14" y2="17"/>
                                </svg>
                            </button>
                        </div>
                    `;
                }).join('')}
            `;

            content.innerHTML = html;
            console.log('[Follows] Desktop: Updated with', follows.length, 'stations');
        }

        // Toggle library section
        function toggleLibrary() {
            libraryExpanded = !libraryExpanded;
            const content = document.getElementById('libraryContent');
            const followsContentEl = document.getElementById('desktopFollowsContent');
            const toggle = document.querySelector('.library-toggle');

            if (libraryExpanded) {
                content.classList.add('expanded');
                if (followsContentEl) followsContentEl.classList.add('expanded');
                toggle.classList.add('expanded');
            } else {
                content.classList.remove('expanded');
                if (followsContentEl) followsContentEl.classList.remove('expanded');
                toggle.classList.remove('expanded');
            }
        }

        // ============================================
        // MOBILE ACCORDION
        // ============================================

        function toggleAccordion(section) {
            const content = document.getElementById(`${section}Content`);
            const toggle = document.getElementById(`${section}Toggle`);
            const isExpanded = content.classList.contains('expanded');

            // Close all sections first
            document.querySelectorAll('.accordion-content.expanded').forEach(el => {
                el.classList.remove('expanded');
            });
            document.querySelectorAll('.accordion-toggle.expanded').forEach(el => {
                el.classList.remove('expanded');
            });

            // If the clicked section wasn't open, open it
            if (!isExpanded) {
                content.classList.add('expanded');
                toggle.classList.add('expanded');
            }
        }

        function renderMobileStationList() {
            const container = document.getElementById('mobileStationList');
            if (!container) return;

            const filtered = currentFilter === 'all'
                ? stations
                : stations.filter(s => s.category === currentFilter);

            if (filtered.length === 0) {
                container.innerHTML = '<div class="accordion-empty">No stations found</div>';
                return;
            }

            container.innerHTML = filtered.map((station, idx) => {
                const stationIdx = stations.indexOf(station);
                const stationId = getStationId(stationIdx);
                const isFavorited = userFavorites.has(stationId);
                const isFollowed = userFollows.has(stationId);

                const isActive  = currentStationIdx === stationIdx;
                const isCurrentlyPlaying = isPlaying && playingStationIdx === stationIdx;
                const eqBars = isCurrentlyPlaying
                    ? '<span class="station-eq" aria-label="Now playing" title="Now playing"><span></span><span></span><span></span><span></span></span>'
                    : '';
                return `
                    <div class="station-item ${isActive ? 'active' : ''} ${isCurrentlyPlaying ? 'playing' : ''}"
                         id="mobileStationItem${stationIdx}"
                         onclick="selectStation(${stationIdx})">
                        <img class="station-item-art" src="${station.image}" alt="${station.name}">
                        <div class="station-item-info">
                            <div class="station-item-name" style="display:flex;align-items:center;">
                                <span style="overflow:hidden;text-overflow:ellipsis;">${station.name}</span>${eqBars}
                            </div>
                            <div class="station-item-category">
                                ${station.category
                                    ? `<span class="station-item-badge badge-${station.category}">${station.category.toUpperCase()}</span>`
                                    : ''}
                            </div>
                        </div>
                        <div style="display: flex; gap: 4px;">
                            <button class="station-heart-btn ${isFavorited ? 'favorited' : ''}"
                                    onclick="event.stopPropagation(); toggleFavorite(event, ${stationIdx})"
                                    title="${isFavorited ? 'Remove from favorites' : 'Add to favorites'}">
                                <svg viewBox="0 0 24 24" fill="${isFavorited ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                                </svg>
                            </button>
                            <button class="station-follow-btn ${isFollowed ? 'following' : ''}"
                                    onclick="event.stopPropagation(); window.toggleFollow(this, ${stationIdx})"
                                    title="${isFollowed ? 'Unfollow' : 'Follow'}">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    ${isFollowed
                                        ? '<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="23" y1="11" x2="17" y2="11"/>'
                                        : '<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M20 8v6M23 11h-6"/>'}
                                </svg>
                            </button>
                        </div>
                    </div>
                `;
            }).join('');

            // Update badge
            const stationsBadge = document.getElementById('stationsBadge');
            if (stationsBadge) {
                stationsBadge.textContent = filtered.length;
            }
        }

        function renderMobileFavorites() {
            const container = document.getElementById('mobileFavoritesList');
            if (!container) return;

            const favs = Array.from(userFavorites).map(id => {
                const idx = parseInt(id.replace('station-', ''));
                return { idx, station: stations[idx] };
            }).filter(f => f.station);

            if (favs.length === 0) {
                container.innerHTML = '<div class="accordion-empty">No favorite channels yet<br><span style="font-size:11px;margin-top:4px;display:block;">Tap the heart icon to save stations</span></div>';
            } else {
                container.innerHTML = favs.map(({ idx, station }) => `
                    <div class="station-item" onclick="selectStation(${idx})">
                        <img class="station-item-art" src="${station.image}" alt="${station.name}">
                        <div class="station-item-info">
                            <div class="station-item-name">${station.name}</div>
                            <div class="station-item-category">
                                ${station.category
                                    ? `<span class="station-item-badge badge-${station.category}">${station.category.toUpperCase()}</span>`
                                    : ''}
                            </div>
                        </div>
                        <button class="station-heart-btn favorited"
                                onclick="event.stopPropagation(); toggleFavorite(event, ${idx})"
                                title="Remove from favorites">
                            <svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2">
                                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                            </svg>
                        </button>
                    </div>
                `).join('');
            }

            const favoritesBadge = document.getElementById('favoritesBadge');
            if (favoritesBadge) {
                favoritesBadge.textContent = favs.length;
            }
        }

        function renderMobileFollows() {
            const container = document.getElementById('mobileFollowsList');
            if (!container) return;

            const follows = Array.from(userFollows).map(id => {
                const idx = parseInt(id.replace('station-', ''));
                return { idx, station: stations[idx] };
            }).filter(f => f.station);

            if (follows.length === 0) {
                container.innerHTML = '<div class="accordion-empty">No followed stations yet<br><span style="font-size:11px;margin-top:4px;display:block;">Tap the follow button to track stations</span></div>';
            } else {
                container.innerHTML = follows.map(({ idx, station }) => `
                    <div class="station-item" onclick="selectStation(${idx})">
                        <img class="station-item-art" src="${station.image}" alt="${station.name}">
                        <div class="station-item-info">
                            <div class="station-item-name">${station.name}</div>
                            <div class="station-item-category">
                                ${station.category
                                    ? `<span class="station-item-badge badge-${station.category}">${station.category.toUpperCase()}</span>`
                                    : ''}
                            </div>
                        </div>
                        <button class="station-follow-btn following"
                                onclick="event.stopPropagation(); window.toggleFollow(this, ${idx})"
                                title="Unfollow">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="3 6 5 6 21 6"/>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                <line x1="10" y1="11" x2="10" y2="17"/>
                                <line x1="14" y1="11" x2="14" y2="17"/>
                            </svg>
                        </button>
                    </div>
                `).join('');
            }

            const followsBadge = document.getElementById('followsBadge');
            if (followsBadge) {
                followsBadge.textContent = follows.length;
            }
        }

        function renderMobileTrending() {
            const container = document.getElementById('mobileTrendingList');
            if (!container) return;

            // Indices into the stations array. Filter guards against indices
            // that exceed the current station count (e.g. after a station-list
            // shrink) so the renderer never tries to read .image of undefined.
            const trending = [0, 1, 2, 3].filter(i => stations[i]);

            container.innerHTML = trending.map(idx => {
                const station = stations[idx];
                const stationId = getStationId(idx);
                const isFavorited = userFavorites.has(stationId);
                const isFollowed = userFollows.has(stationId);

                return `
                    <div class="station-item" onclick="selectStation(${idx})">
                        <img class="station-item-art" src="${station.image}" alt="${station.name}">
                        <div class="station-item-info">
                            <div class="station-item-name">${station.name}</div>
                            <div class="station-item-category">
                                ${station.category
                                    ? `<span class="station-item-badge badge-${station.category}">${station.category.toUpperCase()}</span>`
                                    : ''}
                            </div>
                        </div>
                        <div style="display: flex; gap: 4px;">
                            <button class="station-heart-btn ${isFavorited ? 'favorited' : ''}"
                                    onclick="event.stopPropagation(); toggleFavorite(event, ${idx})"
                                    title="${isFavorited ? 'Remove from favorites' : 'Add to favorites'}">
                                <svg viewBox="0 0 24 24" fill="${isFavorited ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                                </svg>
                            </button>
                            <button class="station-follow-btn ${isFollowed ? 'following' : ''}"
                                    onclick="event.stopPropagation(); window.toggleFollow(this, ${idx})"
                                    title="${isFollowed ? 'Unfollow' : 'Follow'}">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                                    <circle cx="8.5" cy="7" r="4"></circle>
                                    <path d="M20 8v6M23 11h-6"></path>
                                </svg>
                            </button>
                        </div>
                    </div>
                `;
            }).join('');
        }

        function renderMobileRecommended() {
            const container = document.getElementById('mobileRecommendedList');
            if (!container) return;

            const recommended = [0, 4, 3, 2].filter(i => stations[i]);

            container.innerHTML = recommended.map(idx => {
                const station = stations[idx];
                const stationId = getStationId(idx);
                const isFavorited = userFavorites.has(stationId);
                const isFollowed = userFollows.has(stationId);

                return `
                    <div class="station-item" onclick="selectStation(${idx})">
                        <img class="station-item-art" src="${station.image}" alt="${station.name}">
                        <div class="station-item-info">
                            <div class="station-item-name">${station.name}</div>
                            <div class="station-item-category">
                                ${station.category
                                    ? `<span class="station-item-badge badge-${station.category}">${station.category.toUpperCase()}</span>`
                                    : ''}
                            </div>
                        </div>
                        <div style="display: flex; gap: 4px;">
                            <button class="station-heart-btn ${isFavorited ? 'favorited' : ''}"
                                    onclick="event.stopPropagation(); toggleFavorite(event, ${idx})"
                                    title="${isFavorited ? 'Remove from favorites' : 'Add to favorites'}">
                                <svg viewBox="0 0 24 24" fill="${isFavorited ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                                </svg>
                            </button>
                            <button class="station-follow-btn ${isFollowed ? 'following' : ''}"
                                    onclick="event.stopPropagation(); window.toggleFollow(this, ${idx})"
                                    title="${isFollowed ? 'Unfollow' : 'Follow'}">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                                    <circle cx="8.5" cy="7" r="4"></circle>
                                    <path d="M20 8v6M23 11h-6"></path>
                                </svg>
                            </button>
                        </div>
                    </div>
                `;
            }).join('');
        }

        function filterMobileStations(category) {
            currentFilter = category;

            // Update filter chip active state
            document.querySelectorAll('.accordion-filters .filter-chip').forEach(chip => {
                chip.classList.remove('active');
            });
            event.target.classList.add('active');

            renderMobileStationList();
        }

        // ============================================
        // MOBILE SIDEBAR TOGGLE
        // ============================================

        function toggleMobileSidebar() {
            const sidebar = document.querySelector('.station-sidebar');
            const overlay = document.getElementById('sidebarOverlay');
            const hamburgerBtn = document.getElementById('hamburgerBtn');

            const isActive = sidebar.classList.contains('active');

            if (isActive) {
                closeMobileSidebar();
            } else {
                openMobileSidebar();
            }
        }

        function openMobileSidebar() {
            const sidebar = document.querySelector('.station-sidebar');
            const overlay = document.getElementById('sidebarOverlay');
            const hamburgerBtn = document.getElementById('hamburgerBtn');

            sidebar.classList.add('active');
            overlay.classList.add('active');
            hamburgerBtn.classList.add('active');
            document.body.style.overflow = 'hidden';
        }

        function closeMobileSidebar() {
            const sidebar = document.querySelector('.station-sidebar');
            const overlay = document.getElementById('sidebarOverlay');
            const hamburgerBtn = document.getElementById('hamburgerBtn');

            sidebar.classList.remove('active');
            overlay.classList.remove('active');
            hamburgerBtn.classList.remove('active');

            // On mobile, restore auto overflow for scrolling
            if (window.innerWidth <= 768) {
                document.body.style.overflow = 'auto';
            } else {
                document.body.style.overflow = '';
            }
        }

        // ============================================
        // INITIALIZATION
        // ============================================

        document.addEventListener('DOMContentLoaded', async () => {
            console.log('[Init] Starting initialization');

            // First render UI to create DOM elements
            // Sync sidebar tab buttons with the persisted state (sidebarTab
            // is read from localStorage at module load); setSidebarTab also
            // calls renderStationList for us.
            // Apply persisted sidebar width before any render uses it.
            loadSidebarWidth();
            setSidebarTab(sidebarTab);
            // Phase D — load + paint dimensions before the first render
            // so the dial reflects the listener's persisted preferences.
            loadActiveDimensions();
            renderDimensionStrip();
            // Paint the persisted tri-mode chip + re-render with that filter applied.
            setModeFilter(modeFilter);
            renderDiscoverSidebar();
            // Default landing for the middle column — featured banner +
            // top artists + top albums. Replaced by selectStation().
            renderDiscover();
            // Heaven's Dial — paint ticks + lit stations + needle.
            renderDialTuner();
            buildPlayerEq();    // populate footer equalizer bars (idle until play)
            updateVolumeIcon(); // sync speaker / mute glyph with starting volume
            applyPinButtonVisualState(); // restore pinned indicator from localStorage
            console.log('[Init] Rendered station list and discover sidebar');

            // Render mobile accordion (initial empty state)
            renderMobileStationList();

            // Tune the dial to the default station BEFORE the async
            // favorites/follows loads. Doing this synchronously means a
            // network hiccup on those API calls can't strand the page
            // showing "No station selected" — the deep-link branch and
            // the default-station branch are pure DOM updates.
            //
            // Default tuned station: Jubilee Praise (HM 305.40). On a
            // ?station= deep link we honour that instead and also start
            // playback (the user explicitly asked for it via URL).
            try {
                const params = new URLSearchParams(window.location.search);
                const stationParam = params.get('station');
                if (stationParam !== null) {
                    const idx = parseInt(stationParam);
                    if (idx >= 0 && idx < stations.length) {
                        selectStation(idx);
                        playStation(idx);
                    }
                } else {
                    const defaultIdx = stations.findIndex(s => s.slug === 'jubilee-radio');
                    console.log('[Init] Default station idx for jubilee-radio:', defaultIdx);
                    if (defaultIdx >= 0) {
                        selectStation(defaultIdx);
                        // selectStation() intentionally leaves the footer
                        // alone (it tracks the *playing* station). For
                        // the default-tuned station we pre-fill the
                        // footer so a fresh page doesn't greet the
                        // listener with "No station selected" while the
                        // dial clearly shows Jubilee Praise.
                        const station = stations[defaultIdx];
                        const artEl  = document.getElementById('playerArt');
                        const nameEl = document.getElementById('playerStationName');
                        const showEl = document.getElementById('playerShowName');
                        if (artEl)  artEl.src = station.image;
                        if (nameEl) nameEl.textContent = station.name;
                        if (showEl && station.currentShow) {
                            showEl.textContent = station.currentShow.name;
                        }
                        if (typeof updatePlayerNowPlaying === 'function') {
                            updatePlayerNowPlaying(station);
                        }
                        console.log('[Init] Default station applied:', station.name, 'HM', station.hm);
                    }
                }
            } catch (err) {
                console.error('[Init] Default station setup failed:', err);
            }

            // Then load favorites and follows
            console.log('[Init] Loading favorites...');
            await loadUserFavorites();
            console.log('[Init] Loading follows...');
            await loadUserFollows();
            console.log('[Init] Favorites and follows loaded');

            // Update mobile accordion with loaded data
            renderMobileFavorites();
            renderMobileFollows();
            renderMobileTrending();
            renderMobileRecommended();
            console.log('[Init] Updated mobile accordion');
        });

        // ============================================
        // RENDER FUNCTIONS
        // ============================================

        function getCategoryBadge(cat) {
            const labels = { live: 'LIVE', podcast: 'PODCAST', music: 'MUSIC', religious: 'TEACHING' };
            return `<span class="station-item-badge badge-${cat}">${labels[cat]}</span>`;
        }

        // Sidebar tab state — 'all' shows every station, 'favorites' filters
        // to user's favorited slugs only. Always starts on 'all' on a fresh
        // page load; in-session switches update the variable but are not
        // persisted across reloads.
        let sidebarTab = 'all';
        try { localStorage.removeItem('jubileeVerseRadioSidebarTab'); } catch {}

        function setSidebarTab(name) {
            if (name !== 'all' && name !== 'dimensions' && name !== 'favorites' && name !== 'countries') name = 'all';
            sidebarTab = name;

            // Highlight the right tab buttons (desktop + mobile mirror).
            const tabs = [
                { ids: ['tabAllStations', 'mobileTabAllStations'], value: 'all'        },
                { ids: ['tabDimensions',  'mobileTabDimensions'],  value: 'dimensions' },
                { ids: ['tabFavorites',   'mobileTabFavorites'],   value: 'favorites'  },
                { ids: ['tabCountries',   'mobileTabCountries'],   value: 'countries'  }
            ];
            tabs.forEach(({ ids, value }) => {
                ids.forEach(id => {
                    const el = document.getElementById(id);
                    if (!el) return;
                    el.classList.toggle('active', name === value);
                    el.setAttribute('aria-selected', String(name === value));
                });
            });

            // Swap the visible panel: cards for All/Favorites/Countries;
            // filter controls for Dimensions. Both panels stay in the
            // DOM so their state survives tab switches.
            const listPanel = document.getElementById('stationListPanel');
            const dimsPanel = document.getElementById('dimensionsPanel');
            const showDims = name === 'dimensions';
            if (listPanel) listPanel.hidden = showDims;
            if (dimsPanel) dimsPanel.hidden = !showDims;

            // Mobile sidebar mirrors the desktop tab swap. Three panels
            // share the same parent — only the active tab's panel paints.
            // Countries on mobile closes the sidebar so the listener sees
            // the world-map main content underneath.
            document.querySelectorAll('.mobile-tab-panel').forEach(panel => {
                const target = panel.dataset.tabPanel;
                let visible = false;
                if (name === 'all'        && target === 'all')        visible = true;
                if (name === 'favorites'  && target === 'favorites')  visible = true;
                if (name === 'dimensions' && target === 'dimensions') visible = true;
                panel.hidden = !visible;
            });

            // Re-paint the destination panel so its content is fresh.
            if (name === 'favorites')  renderMobileFavorites();
            if (name === 'dimensions') renderDimensionStrip();
            if (name === 'all')        renderMobileStationList();

            // Countries tab swaps the main-content area for the world
            // map view; any other tab restores the standard Discover view.
            if (name === 'countries') {
                renderCountriesMap();
                // On mobile, close the slide-in sidebar so the user sees
                // the map. No-op on desktop (sidebar isn't `.active`).
                const sb = document.querySelector('.station-sidebar');
                if (sb && sb.classList.contains('active') && typeof closeMobileSidebar === 'function') {
                    closeMobileSidebar();
                }
            } else {
                renderDiscover();
            }

            renderStationList();
        }

        // Mode filter retained as state so existing predicates keep
        // working, but the user-facing chips have been removed (the
        // OHI / Non-OHI labels confused listeners). Force 'all' so any
        // stale persisted selection doesn't strand the user with an
        // unexpected filtered view.
        let modeFilter = 'all';
        try { localStorage.removeItem('jubileeVerseRadioModeFilter'); } catch {}

        // Maps a chip's data-mode value to the CSS class that paints
        // its active-state accent — mirrors modeClassFor() but keyed
        // off the chip's own value rather than a station record.
        const MODE_FILTER_CLASS = {
            'ohi':         'mode-ohi',
            'non-ohi':     'mode-nonohi',
            'mixed':       'mode-mixed',
            'both':        'mode-both',
            'family-safe': 'mode-family'
        };

        function setModeFilter(mode) {
            if (mode !== 'ohi' && mode !== 'non-ohi' && mode !== 'mixed'
                && mode !== 'both' && mode !== 'family-safe') {
                mode = 'all';
            }
            modeFilter = mode;
            try { localStorage.setItem('jubileeVerseRadioModeFilter', mode); } catch {}

            document.querySelectorAll('.mode-filter-chip').forEach(chip => {
                const isActive = chip.dataset.mode === mode;
                chip.classList.toggle('active', isActive);
                chip.classList.remove('mode-ohi', 'mode-nonohi', 'mode-mixed', 'mode-both', 'mode-family');
                if (isActive && MODE_FILTER_CLASS[mode]) {
                    chip.classList.add(MODE_FILTER_CLASS[mode]);
                }
            });

            renderStationList();
        }

        // ============================================
        // PHASE D — DIMENSIONAL ARCHITECTURE (spec Part 1 / §16)
        // ============================================
        // Listener activates dimensions matching their season of life;
        // the sidebar filters to stations whose tags intersect with the
        // active set. New listener defaults: Music + Prayer + Devotionals.

        // Heaven's Dial v1.0 dimension registry. Each dimension maps to a
        // Five-Fold ministry color used by the dial bars + chip border.
        // (key, label, fivefold function name, hex color, default-active)
        const DIMENSIONS = [
            { key: 'music',         label: 'Music',          fivefold: 'Evangelism', color: '#4a90e2', default: true  },
            { key: 'prayer',        label: 'Prayer',         fivefold: 'Prophetic',  color: '#e25555', default: true  },
            { key: 'devotionals',   label: 'Devotionals',    fivefold: 'Pastoral',   color: '#5db074', default: true  },
            { key: 'children',      label: 'Children',       fivefold: 'Pastoral',   color: '#5db074', default: false },
            { key: 'online_church', label: 'Online Church',  fivefold: 'Pastoral',   color: '#5db074', default: false },
            { key: 'sleep_rest',    label: 'Sleep & Rest',   fivefold: 'Pastoral',   color: '#5db074', default: false },
            { key: 'bible_studies', label: 'Bible Studies',  fivefold: 'Teaching',   color: '#e6c235', default: false },
            { key: 'radio_theater', label: 'Radio Theater',  fivefold: 'Teaching',   color: '#e6c235', default: false },
            { key: 'hebrew_roots',  label: 'Hebrew Roots',   fivefold: 'Apostolic',  color: '#9d6dd9', default: false },
            { key: 'talk_podcasts', label: 'Talk & Podcasts',fivefold: 'Apostolic',  color: '#9d6dd9', default: false },
            { key: 'multilanguage', label: 'Multi-Language', fivefold: 'Multi',      color: '#888888', default: false },
            { key: 'mainstream',    label: 'Mainstream',     fivefold: 'Mainstream', color: '#cccccc', default: false }
        ];

        // STATION_DIMENSIONS map removed in v1.0. Each station now carries
        // a single `primary` dimension on its own object, per spec §10
        // ("ONE PRIMARY DIMENSION PER STATION"). Filtering uses
        // station.primary directly — no multi-tag intersection.

        // Bumped storage key to v2 so the migration from the old multi-tag
        // model doesn't strand listeners with stale dimension keys
        // (worship-services, scripture, specialty, international, talk)
        // that no longer exist in the v1.0 registry.
        const DIMENSION_STORAGE_KEY = 'jubileeRadio.activeDimensions.v2';
        const DEFAULT_DIMENSIONS    = DIMENSIONS.filter(d => d.default).map(d => d.key);
        // Music, Prayer, Devotionals are core dimensions — always followed,
        // cannot be unfollowed. Even if a stale localStorage entry omits
        // them, loadActiveDimensions() puts them back on every load.
        const LOCKED_DIMENSIONS     = new Set(['music', 'prayer', 'devotionals']);

        let activeDimensions = new Set(DEFAULT_DIMENSIONS);

        function loadActiveDimensions() {
            try {
                const raw = localStorage.getItem(DIMENSION_STORAGE_KEY);
                if (!raw) {
                    activeDimensions = new Set(DEFAULT_DIMENSIONS);
                    return;
                }
                const arr = JSON.parse(raw);
                if (Array.isArray(arr)) {
                    const valid = new Set(DIMENSIONS.map(d => d.key));
                    activeDimensions = new Set(arr.filter(k => valid.has(k)));
                }
            } catch (err) {
                console.error('Failed to load active dimensions:', err);
                activeDimensions = new Set(DEFAULT_DIMENSIONS);
            }
            // Force-enable the locked dimensions every load so they
            // can't be lost via a stale storage entry or migration.
            LOCKED_DIMENSIONS.forEach(k => activeDimensions.add(k));
        }

        function saveActiveDimensions() {
            try {
                localStorage.setItem(
                    DIMENSION_STORAGE_KEY,
                    JSON.stringify([...activeDimensions])
                );
            } catch (err) {
                console.error('Failed to save active dimensions:', err);
            }
        }

        function toggleDimension(key) {
            // Locked dimensions (Music/Prayer/Devotionals) are always
            // followed — clicks on them are no-ops.
            if (LOCKED_DIMENSIONS.has(key)) return;
            if (activeDimensions.has(key)) activeDimensions.delete(key);
            else activeDimensions.add(key);
            saveActiveDimensions();
            renderDimensionStrip();
            renderStationList();
            // Heaven's Band ticks reflect the active dimension set —
            // re-render so the dial gains/loses lit ticks live.
            renderDialTuner();
        }

        function resetDimensions() {
            activeDimensions = new Set(DEFAULT_DIMENSIONS);
            saveActiveDimensions();
            renderDimensionStrip();
            renderStationList();
            renderDialTuner();
        }

        // Renders the 12 dimension chips. Each chip is a single button
        // (whole-pill click target) holding four visual segments: a +/−
        // icon (− when added), the dimension label, a dark count badge,
        // and a Follow/Unfollow action pill. Five-Fold dimension color
        // is no longer carried on the chip border per redesign — the
        // border stays gold across all states.
        function renderDimensionStrip() {
            const desktopStrip = document.getElementById('dimensionStrip');
            const mobileStrip  = document.getElementById('mobileDimensionStrip');
            if (!desktopStrip && !mobileStrip) return;
            const buttons = DIMENSIONS.map(d => {
                const on = activeDimensions.has(d.key);
                const locked = LOCKED_DIMENSIONS.has(d.key);
                const count = stations.filter(s => s.primary === d.key).length;
                const glyph = on ? '−' : '+';
                const action = locked ? 'Default' : (on ? 'Unfollow' : 'Follow');
                const cls = `dimension-toggle${on ? ' active' : ''}${locked ? ' locked' : ''}`;
                const titleText = locked
                    ? `${d.label} (${d.fivefold}) — ${count} stations · always followed`
                    : `${d.label} (${d.fivefold}) — ${count} stations`;
                return `
                    <button type="button"
                            class="${cls}"
                            data-dimension-key="${d.key}"
                            aria-pressed="${on}"
                            ${locked ? 'aria-disabled="true"' : ''}
                            ${locked ? '' : `onclick="toggleDimension('${d.key}')"`}
                            title="${titleText}">
                        <span class="dimension-toggle-icon" aria-hidden="true">${glyph}</span>
                        <span class="dimension-label">${d.label}</span>
                        <span class="dimension-count">${count}</span>
                        <span class="dimension-toggle-action">${action}</span>
                    </button>`;
            }).join('');
            const reset = `
                <button type="button" class="dimension-toggle reset"
                        onclick="resetDimensions()"
                        title="Restore default dimensions">Reset</button>`;
            const html = buttons + reset;
            if (desktopStrip) desktopStrip.innerHTML = html;
            if (mobileStrip)  mobileStrip.innerHTML  = html;
        }

        // Heaven's Dial v1.0 — single-primary filtering. Each station has
        // exactly one `primary` dimension; visibility is a direct membership
        // test. Architectural integrity rule from spec §10: count-badge
        // values equal actual filtered station count when only that
        // dimension is active.
        function stationMatchesDimensions(station) {
            if (activeDimensions.size === 0) return false;
            if (!station || !station.primary) return false;
            return activeDimensions.has(station.primary);
        }

        // Predicate used by renderStationList(). Pulled out so the
        // matching rules live in one place and stay aligned with
        // modeClassFor() which normalises station.mode the same way.
        function stationMatchesModeFilter(station) {
            if (modeFilter === 'all') return true;
            const m = String(station.mode || '').toLowerCase();
            if (modeFilter === 'ohi')         return m === 'ohi';
            if (modeFilter === 'non-ohi')     return m === 'non-ohi';
            if (modeFilter === 'mixed')       return m === 'mixed' || m === 'mixed-mode';
            if (modeFilter === 'both')        return m === 'both';
            if (modeFilter === 'family-safe') return m === 'family-safe';
            return true;
        }

        // Render the square-card grid. The two tabs (All Stations / Favorites)
        // share this single function — `sidebarTab` decides what's filtered in.
        function renderStationList() {
            const list = document.getElementById('stationList');
            if (!list) return;

            const isFavTab = sidebarTab === 'favorites';
            const isCountriesTab = sidebarTab === 'countries';
            const isLoggedIn = !!getAuthData();

            // Empty-state copy for the Favorites tab — different message
            // depending on whether the user is signed in.
            if (isFavTab) {
                if (!isLoggedIn) {
                    list.innerHTML = `
                        <div class="station-card-grid-empty">
                            <div class="empty-icon">♡</div>
                            <div>Sign in to save your favorite stations and sync them across devices.</div>
                            <button class="signin-link" type="button" onclick="requireLogin('save favorites')">Sign in</button>
                        </div>
                    `;
                    return;
                }
                if (userFavorites.size === 0) {
                    list.innerHTML = `
                        <div class="station-card-grid-empty">
                            <div class="empty-icon">♡</div>
                            <div>No favorites yet. Tap the heart on any station to save it here.</div>
                        </div>
                    `;
                    return;
                }
            }

            // Build the filtered station list. Index is preserved so the
            // existing selectStation/toggleFavorite functions still work.
            // Sort by HM frequency so cards display in dial order even
            // when the underlying array isn't strictly ordered (Phase 4/5
            // stations appended after Phase 1–3 still slot into their
            // proper bands visually).
            // Phase D: explicit "all dimensions off" empty state. Fires
            // before the main visible loop so the listener gets a clear
            // configuration nudge rather than an empty grid. Skipped on
            // the Countries tab — that view always shows the
            // multi-language roster regardless of dimension state.
            if (activeDimensions.size === 0 && !isCountriesTab) {
                list.innerHTML = `
                    <div class="station-card-grid-empty dimensions-empty">
                        <div class="empty-icon">◌</div>
                        <div><strong>Activate at least one dimension</strong></div>
                        <div style="margin-top:6px; color: var(--text-muted);">
                            Tap a dimension above to personalize your Heaven's Dial.
                        </div>
                        <button class="signin-link" type="button" onclick="resetDimensions()">Restore defaults</button>
                    </div>`;
                return;
            }

            const visible = stations
                .map((s, idx) => ({ station: s, idx }))
                .filter(({ station }) => !isFavTab || userFavorites.has(station.slug))
                .filter(({ station }) => !isCountriesTab || station.primary === 'multilanguage')
                .filter(({ station }) => isCountriesTab || stationMatchesModeFilter(station))
                .filter(({ station }) => isCountriesTab || stationMatchesDimensions(station))
                .sort((a, b) => parseFloat(a.station.hm) - parseFloat(b.station.hm));

            // Heaven's Dial band groupings (spec §1 frequency allocation).
            // Only show dividers on the "All Stations" tab — the Favorites
            // tab is a flat list of the user's pinned stations.
            const bandOf = (hm) => {
                const f = parseFloat(hm);
                if (f < 330) return 'core';
                if (f < 370) return 'mid';
                return 'high';
            };
            const BAND_META = {
                core: { name: "Core Band",  range: "HM 300.00 — 329.90 · Foundational & Universal" },
                mid:  { name: "Mid Band",   range: "HM 330.00 — 369.90 · Mainstream Genre & Audience" },
                high: { name: "High Band",  range: "HM 370.00 — 399.90 · Niche & Specialty" }
            };

            // Build the cards. We track which band the previous card
            // belonged to so we can splice in a band-header element each
            // time the band changes — only on the All Stations tab.
            let lastBand = null;
            const cardsHtml = visible.map(({ station, idx }, vi) => {
                const stationId = getStationId(idx);
                const isFavorited = userFavorites.has(stationId);
                const isCurrentlyPlaying = isPlaying && idx === playingStationIdx;
                // "Selected" = the user has navigated to this station's
                // detail view but isn't necessarily playing it. Visualised
                // as a thin gold ring (subtler than the playing background).
                const isSelected = idx === currentStationIdx;

                // Visualizer markup — playing cards get a 14-bar animated
                // Card layout per design reference: gold left accent +
                // top row (HM frequency in gold | heart) + dashed gold
                // divider + station name. No bottom visualizer / wave.
                const hmNumber = station.hm || (station.frequency || '').replace(/^HM\s+/i, '');
                const heartBtn = `
                    <button class="station-card-heart ${isFavorited ? 'favorited' : ''}"
                            onclick="toggleFavorite(event, ${idx})"
                            title="${isFavorited ? 'Remove from favorites' : 'Add to favorites'}"
                            aria-label="${isFavorited ? 'Remove from favorites' : 'Add to favorites'}"
                            data-station-id="${stationId}">
                        <svg viewBox="0 0 24 24" fill="${isFavorited ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                        </svg>
                    </button>`;

                // Live dot is absolutely positioned at the card's top-left,
                // OUTSIDE the top row so the frequency can centre cleanly
                // between the (empty) left cell and the heart on the right.
                const liveDot = isCurrentlyPlaying
                    ? `<span class="station-card-live-dot" aria-label="Now playing" title="Now playing"></span>`
                    : '';

                const cardBody = hmNumber
                    ? `<div class="station-card-top">
                           <div class="station-card-frequency"><span class="station-card-hm-prefix">HM</span>${hmNumber}</div>
                           ${heartBtn}
                       </div>
                       <div class="station-card-divider"></div>
                       <div class="station-card-name">${station.name}</div>`
                    : `<div class="station-card-top">
                           <div class="station-card-name">${station.name}</div>
                           ${heartBtn}
                       </div>`;

                return `
                    <div class="station-card ${isCurrentlyPlaying ? 'playing' : ''} ${isSelected ? 'selected' : ''} ${hmNumber ? 'has-frequency' : ''}"
                         id="stationItem${idx}"
                         data-mode="${station.mode || ''}"
                         onclick="selectStation(${idx})"
                         role="button"
                         tabindex="0"
                         aria-pressed="${isCurrentlyPlaying}"
                         aria-label="${station.name}${isCurrentlyPlaying ? ' (now playing)' : ''}">
                        ${liveDot}
                        ${cardBody}
                    </div>
                `;
            }).join('');

            list.innerHTML = cardsHtml;
        }

        function filterStations(cat) {
            currentFilter = cat;
            // Update filter chips
            document.querySelectorAll('.filter-chip').forEach(chip => {
                chip.classList.toggle('active', chip.textContent.trim().toLowerCase() === cat || (cat === 'all' && chip.textContent.trim() === 'All'));
            });
            renderStationList();
        }

        // ============================================
        // DISCOVER VIEW (middle column landing)
        // ============================================
        // Featured banner (Jubilee-Concert background) + Top Artists row +
        // Top Albums row. Acts as the default landing for main-content;
        // selectStation() overwrites it with the station detail view.

        const DISCOVER_FEATURED = {
            eyebrow: 'Featured · HM 308.70',
            title: 'kJubilee Radio',
            artist: 'Inspire Family · Continuous worship & teaching',
            plays: '1,802 tracks · 24/7 manifest rotation',
            // Default station — Jubilee Radio, the manifest-driven prototype
            // that plays the full Inspire Family catalog. Same slug the
            // page-load tunes to when no ?station= param is present.
            stationSlug: 'jubilee-radio'
        };

        // Six featured artists pulled from the Inspire Family. Each `image`
        // points at the persona portrait shipped in /images/personas/.
        // `gradient` is kept as a graceful fallback for any future persona
        // we add before we have a portrait for them.
        const DISCOVER_ARTISTS = [
            { code: 'JEI', name: 'Jubilee Inspire',  image: '/images/personas/1.png',  gradient: 'grad-jubilee'  },
            { code: 'MDI', name: 'Melody Inspire',   image: '/images/personas/2.png',  gradient: 'grad-melody'   },
            { code: 'ZHI', name: 'Zariah Inspire',   image: '/images/personas/3.png',  gradient: 'grad-zariah'   },
            { code: 'NVI', name: 'Nova Inspire',     image: '/images/personas/10.png', gradient: 'grad-nova'     },
            { code: 'IMI', name: 'Imani Inspire',    image: '/images/personas/7.png',  gradient: 'grad-imani'    },
            { code: 'SAI', name: 'Santiago Inspire', image: '/images/personas/11.png', gradient: 'grad-santiago' }
        ];

        // Six albums — one per featured artist. Plausible titles fitting each
        // persona's musical lineage. Real cover-art paths can replace the
        // .album-art-title overlay later by adding `background-image: url(...)`
        // to each entry in DISCOVER_ALBUMS.
        const DISCOVER_ALBUMS = [
            { title: 'Songs of Yahuah, Vol. 1', artist: 'Jubilee Inspire',  gradient: 'grad-jubilee',  lightBg: true  },
            { title: 'Beauty Restored',         artist: 'Melody Inspire',   gradient: 'grad-melody',   lightBg: false },
            { title: 'Diaspora Joy',            artist: 'Zariah Inspire',   gradient: 'grad-zariah',   lightBg: false },
            { title: 'Standing Stones',         artist: 'Nova Inspire',     gradient: 'grad-nova',     lightBg: false },
            { title: 'Prophetic Justice',       artist: 'Imani Inspire',    gradient: 'grad-imani',    lightBg: false },
            { title: 'Cumbia Profética',        artist: 'Santiago Inspire', gradient: 'grad-santiago', lightBg: false }
        ];

        function renderDiscover() {
            const main = document.getElementById('mainContent');
            if (!main) return;

            const playSvg  = '<svg viewBox="0 0 24 24"><polygon points="6 4 20 12 6 20 6 4"/></svg>';
            const heartSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';

            // Find the station idx for the featured slug so Play Now is wired.
            const featuredIdx = stations.findIndex(s => s.slug === DISCOVER_FEATURED.stationSlug);

            // Real persona portrait wrapped in a rounded square — falls back
            // to the gradient class if the image fails to load (e.g. asset
            // missing on a fresh deploy). The onerror handler swaps the
            // class so the gradient + code label show through.
            const artistsHtml = DISCOVER_ARTISTS.map(a => `
                <div class="artist-card" onclick="onDiscoverArtistClick('${a.code}')" role="button" tabindex="0" aria-label="${a.name}">
                    <div class="artist-avatar ${a.gradient}">
                        <img src="${a.image}" alt="${a.name}" loading="lazy"
                             onerror="this.style.display='none'; this.parentNode.dataset.fallback='${a.code}';">
                    </div>
                    <div class="artist-name">${a.name}</div>
                </div>
            `).join('');

            const albumsHtml = DISCOVER_ALBUMS.map(al => `
                <div class="album-card" onclick="onDiscoverAlbumClick('${al.title.replace(/'/g, "\\'")}')" role="button" tabindex="0" aria-label="${al.title} by ${al.artist}">
                    <div class="album-art ${al.gradient} ${al.lightBg ? 'has-light-bg' : ''}">
                        <div class="album-art-title">${al.title}</div>
                    </div>
                    <div class="album-meta-title">${al.title}</div>
                    <div class="album-meta-artist">${al.artist}</div>
                </div>
            `).join('');

            main.innerHTML = `
                <div class="discover-view">
                    <section class="discover-banner" aria-label="Featured this week">
                        <div class="discover-banner-bg" aria-hidden="true"></div>
                        <div class="discover-banner-overlay" aria-hidden="true"></div>
                        <div class="discover-banner-content">
                            <div class="discover-banner-eyebrow">${DISCOVER_FEATURED.eyebrow}</div>
                            <h1 class="discover-banner-title">${DISCOVER_FEATURED.title}</h1>
                            <div class="discover-banner-meta"><strong>${DISCOVER_FEATURED.artist}</strong> · ${DISCOVER_FEATURED.plays}</div>
                            <div class="discover-banner-actions">
                                <button class="discover-play-btn" type="button" onclick="${featuredIdx >= 0 ? `playStation(${featuredIdx})` : ''}">
                                    ${playSvg} Play Now
                                </button>
                                <button class="discover-mini-heart" type="button" onclick="onDiscoverFeaturedFavorite(event, ${featuredIdx})" aria-label="Add to favorites">
                                    ${heartSvg}
                                </button>
                            </div>
                        </div>
                    </section>

                    <section class="discover-section" aria-label="Top Artists">
                        <div class="discover-section-header">
                            <h2 class="discover-section-title">Top Artists</h2>
                            <a class="discover-section-link" href="#" onclick="event.preventDefault();">Show all</a>
                        </div>
                        <div class="discover-row">${artistsHtml}</div>
                    </section>

                    <section class="discover-section" aria-label="Top Albums">
                        <div class="discover-section-header">
                            <h2 class="discover-section-title">Top Albums</h2>
                            <a class="discover-section-link" href="#" onclick="event.preventDefault();">Show all</a>
                        </div>
                        <div class="discover-row">${albumsHtml}</div>
                    </section>

                    <!-- Discover §4: Bestseller leaderboard (spec §6 ratings). -->
                    <section class="discover-section" aria-label="Top by Bestseller Rating">
                        <div class="discover-section-header">
                            <h2 class="discover-section-title">Top by Bestseller Rating</h2>
                            <a class="discover-section-link" href="#" onclick="event.preventDefault();">View all stations</a>
                        </div>
                        <div class="bestseller-list" id="bestsellerList" role="list"></div>
                    </section>
                </div>
            `;
            renderBestsellerLeaderboard();
        }

        // ============================================
        // COUNTRIES MAP VIEW (Multi-Language stations)
        // ============================================
        //
        // Compact continent-outline SVG used as the map backdrop. Paths
        // are simplified approximations on a 1000×500 equirectangular
        // canvas — good enough to give listeners geographic anchoring
        // without shipping a 200KB country-level dataset. The dots
        // overlaid on top are the actual interactive elements.
        const WORLD_MAP_SVG = `
            <img class="countries-map-bg"
                 src="/images/WorldMap-Radio.svg?v=2"
                 alt=""
                 aria-hidden="true"
                 decoding="async">`;

        // Each multi-language station maps to a country whose listeners
        // speak that language. Coordinates are equirectangular projection
        // percentages (x = 0..100 left→right, y = 0..100 top→bottom)
        // approximating the country's centroid on a standard world map.
        const STATION_COUNTRY_LOCATIONS = {
            'familia-inspire-espanol':    { country: 'Mexico',       x: 21.5, y: 41.0 },
            'jubilee-prayers-spanish':    { country: 'Spain',        x: 47.5, y: 33.5 },
            'brasil-inspire-portugues':   { country: 'Brazil',       x: 32.5, y: 60.0 },
            'asia-inspire-zhongwen':      { country: 'China',        x: 76.0, y: 38.0 },
            'jubilee-prayers-mandarin':   { country: 'Taiwan',       x: 81.5, y: 44.0 },
            'inspire-india-hindi':        { country: 'India',        x: 67.5, y: 42.0 },
            'jubilee-prayers-hindi':      { country: 'Nepal',        x: 71.5, y: 43.0 },
            'inspire-crown-arabic':       { country: 'Saudi Arabia', x: 58.5, y: 45.0 },
            'jubilee-prayers-arabic':     { country: 'Egypt',        x: 55.0, y: 43.0 },
            'france-inspire-francais':    { country: 'France',       x: 49.5, y: 31.5 },
            'jubilee-praise-romana':      { country: 'Romania',      x: 53.5, y: 32.5 },
            'jubilee-prayers-portuguese': { country: 'Portugal',     x: 45.5, y: 34.0 },
            'korea-inspire-hangugeo':     { country: 'South Korea',  x: 84.5, y: 38.0 },
            'deutschland-inspire-deutsch':{ country: 'Germany',      x: 51.0, y: 30.0 },
            'jubilee-prayers-french':     { country: 'Belgium',      x: 50.0, y: 30.5 },
            'russia-inspire-russkiy':     { country: 'Russia',       x: 65.0, y: 23.0 },
            'italia-inspire-italiano':    { country: 'Italy',        x: 51.5, y: 35.0 },
            'jubilee-prayers-russian':    { country: 'Ukraine',      x: 56.0, y: 30.0 },
            'pilipinas-inspire-tagalog':  { country: 'Philippines',  x: 83.0, y: 50.0 },
            'vietnam-inspire-tieng-viet': { country: 'Vietnam',      x: 78.5, y: 49.5 },
            'jubilee-prayers-korean':     { country: 'North Korea',  x: 84.0, y: 36.5 },
            'africa-inspire-kiswahili':   { country: 'Kenya',        x: 56.5, y: 58.5 },
            'west-africa-inspire-yoruba': { country: 'Nigeria',      x: 50.0, y: 55.5 },
            'jubilee-prayers-swahili':    { country: 'Tanzania',     x: 56.5, y: 62.0 },
            'ethiopia-inspire-amharic':   { country: 'Ethiopia',     x: 58.0, y: 55.0 },
            'polska-inspire-polski':      { country: 'Poland',       x: 52.5, y: 29.0 },
            'indonesia-inspire-bahasa':   { country: 'Indonesia',    x: 80.0, y: 60.5 },
            'japan-inspire-nihongo':      { country: 'Japan',        x: 87.5, y: 37.5 },
            'jubilee-prayers-tagalog':    { country: 'Philippines',  x: 84.0, y: 51.5 },
            'bengal-inspire-bangla':      { country: 'Bangladesh',   x: 73.5, y: 46.0 }
        };

        function renderCountriesMap() {
            const main = document.getElementById('mainContent');
            if (!main) return;

            const dots = stations
                .map((s, idx) => ({ s, idx }))
                .filter(({ s }) => s.primary === 'multilanguage'
                                && STATION_COUNTRY_LOCATIONS[s.slug])
                .map(({ s, idx }) => {
                    const loc = STATION_COUNTRY_LOCATIONS[s.slug];
                    const safeName = s.name.replace(/"/g, '&quot;');
                    return `
                        <button class="country-dot"
                                style="left: ${loc.x}%; top: ${loc.y}%;"
                                data-station-idx="${idx}"
                                onclick="onCountryDotClick(${idx})"
                                title="${loc.country} — ${safeName} · HM ${s.hm}"
                                aria-label="${loc.country} — ${safeName}">
                            <span class="country-dot-pulse" aria-hidden="true"></span>
                            <span class="country-dot-core" aria-hidden="true"></span>
                            <span class="country-dot-tooltip">
                                <span class="country-dot-tooltip-country">${loc.country}</span>
                                <span class="country-dot-tooltip-station">${s.name}</span>
                                <span class="country-dot-tooltip-hm">HM ${s.hm}</span>
                            </span>
                        </button>`;
                }).join('');

            main.innerHTML = `
                <section class="countries-map-section" aria-label="Multi-Language stations world map">
                    <header class="countries-map-header">
                        <div class="countries-map-header-text">
                            <h2 class="countries-map-title">Multi-Language Stations</h2>
                            <p class="countries-map-subtitle">
                                Click any blinking dot to tune in. ${Object.keys(STATION_COUNTRY_LOCATIONS).length} stations across the globe.
                            </p>
                        </div>
                        <div class="countries-map-zoom" role="group" aria-label="Map zoom controls">
                            <button type="button" class="countries-map-zoom-btn" id="mapZoomOutBtn"
                                    onclick="mapZoomOut()" title="Zoom out" aria-label="Zoom out">
                                <svg viewBox="0 0 24 24" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/></svg>
                            </button>
                            <button type="button" class="countries-map-zoom-btn" id="mapZoomInBtn"
                                    onclick="mapZoomIn()" title="Zoom in" aria-label="Zoom in">
                                <svg viewBox="0 0 24 24" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                            </button>
                            <button type="button" class="countries-map-zoom-btn" id="mapZoomResetBtn"
                                    onclick="mapZoomReset()" title="Restore actual size" aria-label="Restore actual size">
                                <svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                            </button>
                        </div>
                    </header>
                    <div class="countries-map-viewport" id="countriesMapViewport">
                        <div class="countries-map-canvas" id="countriesMapCanvas" style="--map-zoom: ${mapZoomLevel};">
                            ${WORLD_MAP_SVG}
                            <div class="countries-map-dots">${dots}</div>
                        </div>
                    </div>
                </section>
            `;
            applyMapZoomButtonState();
        }

        // ============================================
        // COUNTRIES MAP — ZOOM CONTROLS
        // ============================================
        // Zoom is implemented by widening the inner canvas via the
        // --map-zoom CSS variable (height tracks via aspect-ratio).
        // The viewport wrapper has overflow: auto so the user can pan
        // the zoomed map by scrolling. Zoom level is preserved across
        // tab switches by storing it on the module-scope state below.
        const MAP_ZOOM_MIN  = 1.0;
        // 3× actual size — enough headroom to read individual countries
        // (Europe + south-east Asia get most of the dot density).
        const MAP_ZOOM_MAX  = 3.0;
        const MAP_ZOOM_STEP = 0.25;
        let mapZoomLevel = MAP_ZOOM_MIN;

        function setMapZoom(level) {
            // Clamp + round to two decimals so the steps land on the
            // grid (1.00, 1.25, 1.50, ..., 3.00) rather than drifting
            // via floating-point noise.
            const clamped = Math.max(MAP_ZOOM_MIN, Math.min(MAP_ZOOM_MAX, level));
            mapZoomLevel = Math.round(clamped * 100) / 100;
            const canvas = document.getElementById('countriesMapCanvas');
            if (canvas) canvas.style.setProperty('--map-zoom', mapZoomLevel);
            applyMapZoomButtonState();
        }

        function mapZoomIn()    { setMapZoom(mapZoomLevel + MAP_ZOOM_STEP); }
        function mapZoomOut()   { setMapZoom(mapZoomLevel - MAP_ZOOM_STEP); }
        function mapZoomReset() { setMapZoom(MAP_ZOOM_MIN); }

        function applyMapZoomButtonState() {
            const inBtn    = document.getElementById('mapZoomInBtn');
            const outBtn   = document.getElementById('mapZoomOutBtn');
            const resetBtn = document.getElementById('mapZoomResetBtn');
            if (inBtn)    inBtn.disabled    = mapZoomLevel >= MAP_ZOOM_MAX;
            if (outBtn)   outBtn.disabled   = mapZoomLevel <= MAP_ZOOM_MIN;
            if (resetBtn) resetBtn.disabled = mapZoomLevel === MAP_ZOOM_MIN;
        }

        function onCountryDotClick(idx) {
            // Tune to the station and start playing immediately. Same
            // path as clicking a station card + pressing play.
            selectStation(idx);
            playStation(idx);
        }

        // Top-5 stations by spec §6 bestseller rating. Renders into the
        // #bestsellerList container painted by renderDiscover() above.
        function renderBestsellerLeaderboard() {
            const host = document.getElementById('bestsellerList');
            if (!host) return;
            const top5 = [...stations]
                .filter(s => typeof s.bestseller === 'number')
                .sort((a, b) => b.bestseller - a.bestseller)
                .slice(0, 5);
            host.innerHTML = top5.map((s, i) => {
                const idx = stations.findIndex(x => x.slug === s.slug);
                return `
                    <div class="bestseller-row" role="listitem"
                         data-station-slug="${s.slug}"
                         onclick="playStation(${idx})"
                         title="${s.name} — ${s.bestseller}% bestseller · ${s.reach} reach">
                        <div class="bestseller-rank">${i + 1}</div>
                        <div class="bestseller-freq">${s.frequency || '—'}</div>
                        <div class="bestseller-name">${s.name}</div>
                        <div class="bestseller-rating">${s.bestseller}%</div>
                        <div class="bestseller-reach">${s.reach || ''}</div>
                    </div>
                `;
            }).join('');
        }

        // Click handlers for the discover entries — placeholders for now.
        // Hooking these to real navigation/playback can come in a follow-up
        // (e.g. show a persona detail view, or filter the station list).
        function onDiscoverArtistClick(code) {
            // Future: show persona detail or filter stations by persona.
            console.log('[Discover] Artist clicked:', code);
        }
        function onDiscoverAlbumClick(title) {
            console.log('[Discover] Album clicked:', title);
        }
        function onDiscoverFeaturedFavorite(e, idx) {
            e.stopPropagation();
            if (idx >= 0) toggleFavorite(e, idx);
        }

        // Right sidebar tab state — 'playing' (queue / now-playing list) or
        // 'schedule' (full day's broadcast). Persisted so the user's last
        // pick survives a refresh.
        let dsbTab = (() => {
            try { return localStorage.getItem('jubileeVerseRadioDsbTab') || 'playing'; }
            catch { return 'playing'; }
        })();

        // Spec §7 — The Logos parallel-rotation preference. 'ohi' (default,
        // JSV-aligned, Hebrew names preserved) or 'nonOhi' (standard
        // English translation). Persisted so the user's choice survives.
        let logosRotation = (() => {
            try { return localStorage.getItem('jubileeVerseLogosRotation') || 'ohi'; }
            catch { return 'ohi'; }
        })();
        function setLogosRotation(rot) {
            if (rot !== 'ohi' && rot !== 'nonOhi') rot = 'ohi';
            logosRotation = rot;
            try { localStorage.setItem('jubileeVerseLogosRotation', rot); } catch {}
            renderDiscoverSidebar();
        }

        function setDsbTab(name) {
            if (name !== 'playing' && name !== 'schedule') name = 'playing';
            dsbTab = name;
            try { localStorage.setItem('jubileeVerseRadioDsbTab', name); } catch {}
            renderDiscoverSidebar();
        }

        // Pick the station whose schedule we should render in the right
        // sidebar. Prefer what's actually streaming, fall back to the
        // user-selected station, and finally to Jubilee Radio (slug "adult"
        // = the featured station on the Discover view) so the panel is
        // never empty on first load.
        function getDsbStationIdx() {
            if (playingStationIdx >= 0 && stations[playingStationIdx]) return playingStationIdx;
            if (currentStationIdx >= 0 && stations[currentStationIdx]) return currentStationIdx;
            const adultIdx = stations.findIndex(s => s.slug === 'adult');
            return adultIdx >= 0 ? adultIdx : 0;
        }

        function renderDiscoverSidebar() {
            const desktopSidebar = document.getElementById('discoverSidebar');
            const mobileSidebar  = document.getElementById('discoverSidebarMobile');
            if (!desktopSidebar && !mobileSidebar) return;

            const idx = getDsbStationIdx();
            const station = stations[idx];

            // Spec §7 — The Logos serves two parallel rotations. When the
            // active station is Logos, swap in the listener-selected
            // rotation rather than the default `schedule`.
            let schedule = (station && station.schedule) || [];
            const isLogos = station && station.slug === 'logos';
            if (isLogos && station.rotations) {
                schedule = station.rotations[logosRotation] || schedule;
            }

            // Highlight the row currently on air. For "Schedule" use the
            // station's currentShow.name; for "Playing List" mark the first
            // entry as "Now playing" (it's the active track in the rotation).
            const nowShowName = station?.currentShow?.name ?? '';

            const playingRows = schedule.length === 0
                ? `<div class="dsb-row-host" style="padding:12px 0;">No tracks queued.</div>`
                : schedule.map((item, i) => `
                    <div class="dsb-row ${i === 0 ? 'now' : ''}">
                        <div class="dsb-row-time">${i === 0 ? 'Now' : 'Up ' + i}</div>
                        <div>
                            <div class="dsb-row-show">${item.show}</div>
                            <div class="dsb-row-host">${item.host}</div>
                        </div>
                    </div>
                `).join('');

            const scheduleRows = schedule.length === 0
                ? `<div class="dsb-row-host" style="padding:12px 0;">Schedule unavailable.</div>`
                : schedule.map(item => `
                    <div class="dsb-row ${item.show === nowShowName ? 'now' : ''}">
                        <div class="dsb-row-time">${item.time}</div>
                        <div>
                            <div class="dsb-row-show">${item.show}</div>
                            <div class="dsb-row-host">${item.host}</div>
                        </div>
                    </div>
                `).join('');

            const tabBody = dsbTab === 'schedule' ? scheduleRows : playingRows;

            // Build 50 waveform bars with negative animation-delays staggered
            // across one period — produces a "moving wave" visual without JS
            // touching the bars after first paint.
            const BAR_COUNT = 50;
            const PERIOD = 1.6; // matches @keyframes dsb-wave duration
            const waveBars = Array.from({ length: BAR_COUNT }, (_, i) => {
                const phase = (i / BAR_COUNT) * PERIOD * 2; // two full periods across the row
                return `<span style="animation-delay: -${phase.toFixed(3)}s"></span>`;
            }).join('');

            const sidebarHtml = `
                <div class="dsb-top">
                    <!-- Submit Prayer CTA — Phase E. Hidden on Family-Safe
                         stations via updatePrayerButtonVisibility(). -->
                    <div class="dsb-prayer-cta">
                        <button type="button"
                                class="submit-prayer-btn"
                                id="submitPrayerBtn"
                                onclick="openPrayerModal()"
                                aria-label="Submit a prayer request to The Upper Room">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                                 stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                            </svg>
                            Submit a Prayer
                        </button>
                    </div>
                    <div class="dsb-tabs" role="tablist">
                        <button class="dsb-tab ${dsbTab === 'playing' ? 'active' : ''}" role="tab" aria-selected="${dsbTab === 'playing'}" onclick="setDsbTab('playing')">Playing List</button>
                        <button class="dsb-tab ${dsbTab === 'schedule' ? 'active' : ''}" role="tab" aria-selected="${dsbTab === 'schedule'}" onclick="setDsbTab('schedule')">Schedule</button>
                    </div>
                    <div class="dsb-tab-content" id="dsbTabContent">
                        <div class="dsb-station-header">${dsbTab === 'schedule' ? "Today's Schedule" : 'Now Playing'}</div>
                        <div class="dsb-station-title">${station ? station.name : '—'}</div>
                        ${isLogos ? `
                            <div class="logos-rotation-toggle" role="group" aria-label="Scripture rotation">
                                <button type="button"
                                        class="logos-rot-btn ${logosRotation === 'ohi' ? 'active' : ''}"
                                        onclick="setLogosRotation('ohi')"
                                        aria-pressed="${logosRotation === 'ohi'}">OHI Rotation</button>
                                <button type="button"
                                        class="logos-rot-btn ${logosRotation === 'nonOhi' ? 'active' : ''}"
                                        onclick="setLogosRotation('nonOhi')"
                                        aria-pressed="${logosRotation === 'nonOhi'}">Non-OHI</button>
                            </div>
                        ` : ''}
                        ${tabBody}
                    </div>
                </div>
                <div class="dsb-bottom">
                    <!-- .is-active set inline so a renderDiscoverSidebar()
                         call mid-playback doesn't drop the class — the
                         updateAudioPlayingClasses() chokepoint also keeps
                         it in sync after subsequent state changes. -->
                    <div class="dsb-waveform${isPlaying ? ' is-active' : ''}" aria-hidden="true">${waveBars}</div>
                </div>
            `;
            if (desktopSidebar) desktopSidebar.innerHTML = sidebarHtml;
            if (mobileSidebar)  mobileSidebar.innerHTML  = sidebarHtml;
            // Phase E — paint Submit Prayer button visibility based on
            // active station's mode (hidden on Family-Safe stations).
            updatePrayerButtonVisibility();
        }

        function renderDiscoverCard(idx) {
            const station = stations[idx];
            return `
                <div class="discover-card" onclick="selectStation(${idx})">
                    <img class="discover-card-art" src="${station.image}" alt="${station.name}" loading="lazy">
                    <div class="discover-card-info">
                        <div class="discover-card-name">${station.name}</div>
                        <div class="discover-card-cat">${station.category.charAt(0).toUpperCase() + station.category.slice(1)}</div>
                        <div class="discover-card-listeners">${station.listeners}</div>
                    </div>
                </div>
            `;
        }

        // ============================================
        // SIDEBAR RESIZE HANDLE
        // ============================================
        // The user can drag the right edge of the left sidebar to widen
        // it (up to 30% of viewport width). Width persists to localStorage
        // so it survives across sessions.

        const SIDEBAR_MIN_PX  = 280;
        const SIDEBAR_MAX_VW  = 0.30;     // 30% of viewport width per spec
        const SIDEBAR_DEFAULT = 320;
        const SIDEBAR_STORAGE_KEY = 'jubileeVerseRadioSidebarWidth';

        function clampSidebarWidth(px) {
            const max = Math.round(window.innerWidth * SIDEBAR_MAX_VW);
            return Math.max(SIDEBAR_MIN_PX, Math.min(max, px));
        }

        function applySidebarWidth(px) {
            const clamped = clampSidebarWidth(px);
            const layout = document.querySelector('.radio-layout');
            if (layout) layout.style.setProperty('--sidebar-w', clamped + 'px');
        }

        function loadSidebarWidth() {
            try {
                const stored = parseInt(localStorage.getItem(SIDEBAR_STORAGE_KEY), 10);
                if (Number.isFinite(stored) && stored > 0) {
                    applySidebarWidth(stored);
                    return;
                }
            } catch {}
            applySidebarWidth(SIDEBAR_DEFAULT);
        }

        function startSidebarResize(e) {
            if (e.button !== undefined && e.button !== 0) return;
            e.preventDefault();
            const handle = document.getElementById('sidebarResizeHandle');
            const sidebar = document.getElementById('stationSidebar');
            if (!handle || !sidebar) return;
            handle.classList.add('dragging');
            document.body.classList.add('sidebar-resizing');
            try { handle.setPointerCapture(e.pointerId); } catch (_) {}

            const sidebarRect = sidebar.getBoundingClientRect();
            // Compute the offset between the cursor's clientX and the
            // sidebar's left edge — so dragging tracks 1:1 regardless of
            // where on the handle the user grabbed.
            const onMove = (ev) => {
                const newWidth = ev.clientX - sidebarRect.left;
                applySidebarWidth(newWidth);
            };
            const onUp = (ev) => {
                handle.classList.remove('dragging');
                document.body.classList.remove('sidebar-resizing');
                handle.removeEventListener('pointermove', onMove);
                handle.removeEventListener('pointerup', onUp);
                handle.removeEventListener('pointercancel', onUp);
                try { handle.releasePointerCapture(ev.pointerId); } catch (_) {}
                // Persist the final width.
                const layout = document.querySelector('.radio-layout');
                const finalWidth = layout && parseInt(layout.style.getPropertyValue('--sidebar-w'), 10);
                if (Number.isFinite(finalWidth) && finalWidth > 0) {
                    try { localStorage.setItem(SIDEBAR_STORAGE_KEY, String(finalWidth)); } catch {}
                }
            };
            handle.addEventListener('pointermove', onMove);
            handle.addEventListener('pointerup', onUp);
            handle.addEventListener('pointercancel', onUp);
        }

        // Re-clamp on viewport resize so the 30vw ceiling stays accurate.
        window.addEventListener('resize', () => {
            const layout = document.querySelector('.radio-layout');
            if (!layout) return;
            const current = parseInt(layout.style.getPropertyValue('--sidebar-w'), 10);
            if (Number.isFinite(current)) applySidebarWidth(current);
        });

        /* ============================================================
           HEAVEN'S DIAL v1.0 — tri-band SVG tuner
           Replaces the single-band tick track. Stations now render as
           SVG <line> inside <g id="dialStations">, colored + sized by
           their primary dimension and band. The orange indicator group
           overlays the active station's bar.
           ------------------------------------------------------------ */

        // Spec-locked geometry. Active band container spans x=20..680;
        // station x positions land inside that, with HM 300 at x=28 and
        // HM 400 at x=680 (the scale text endpoints).
        const DIAL_X_LEFT   = 28;
        const DIAL_X_SPAN   = 652;     // x=28 (HM 300) → x=680 (HM 400)
        const DIAL_HM_BASE  = 300;
        const DIAL_HM_RANGE = 100;     // HM 300 → HM 400

        // Spec §"Color hex values" — primary-dimension palette. Keys are
        // colour roles (not dimension names) because the multi-band station
        // carries its colour via station.parentColor.
        const DIAL_COLORS = {
            purple: '#9d6dd9', // Apostolic — hebrew_roots, talk_podcasts
            red:    '#e25555', // Prophetic — prayer
            blue:   '#4a90e2', // Evangelism — music
            green:  '#5db074', // Pastoral  — devotionals, children, online_church, sleep_rest
            yellow: '#e6c235', // Teaching  — bible_studies, radio_theater
            white:  '#cccccc'  // Mainstream
        };

        // Spec §"Bar widths" — stroke-width keyed off the COLOR (role)
        // for ministry/multi bands; forced to 1 for mainstream.
        const DIAL_WIDTHS = {
            purple: 7, red: 8, blue: 6, green: 6, yellow: 4,
            multi: 2,   // every multilanguage station regardless of parent
            white: 1
        };

        // Maps station.primary → color key. Edit here when new dimensions
        // are added; renderDialTuner() and colorForStation() both read it.
        const PRIMARY_TO_COLOR = {
            music:          'blue',
            prayer:         'red',
            devotionals:    'green',
            children:       'green',
            online_church:  'green',
            sleep_rest:     'green',
            bible_studies:  'yellow',
            radio_theater:  'yellow',
            hebrew_roots:   'purple',
            talk_podcasts:  'purple'
        };

        // viewBox-space x for any HM frequency. Spec formula — do not
        // refactor to percentages; the SVG is fixed-coordinate.
        function xForHm(hm) {
            return DIAL_X_LEFT + ((hm - DIAL_HM_BASE) / DIAL_HM_RANGE) * DIAL_X_SPAN;
        }

        // Overlapping zones in viewBox 0..57. Bars sit nearly flush
        // with the edges (~2u margin top/bottom) so the SVG renders
        // tightly packed with almost no internal dead space.
        function getBandY(band) {
            if (band === 'fivefold')   return { y1: 3,  y2: 35 };  // 32u
            if (band === 'multi')      return { y1: 11, y2: 42 };  // 31u
            if (band === 'mainstream') return { y1: 21, y2: 53 };  // 32u
            return { y1: 3, y2: 53 };
        }

        // Color resolution honors band first, then dimension. Multi-band
        // stations carry parentColor ('blue'|'red') set in the registry.
        function colorForStation(station) {
            if (!station) return DIAL_COLORS.white;
            if (station.band === 'mainstream') return DIAL_COLORS.white;
            if (station.band === 'multi') {
                const key = station.parentColor || 'white';
                return DIAL_COLORS[key] || DIAL_COLORS.white;
            }
            const key = PRIMARY_TO_COLOR[station.primary];
            return DIAL_COLORS[key] || DIAL_COLORS.white;
        }

        // Stroke width follows the same band-first logic. Multi-band
        // stations are ALWAYS 2px regardless of parent color.
        function widthForStation(station) {
            if (!station) return 1;
            if (station.band === 'mainstream') return DIAL_WIDTHS.white;
            if (station.band === 'multi')      return DIAL_WIDTHS.multi;
            const key = PRIMARY_TO_COLOR[station.primary];
            return DIAL_WIDTHS[key] || 1;
        }

        // The set of stations the listener can currently tune. activeDimensions
        // is a Set<string> of primary keys. Empty set → empty filtered list.
        function getFilteredDialStations() {
            if (typeof activeDimensions === 'undefined' || activeDimensions.size === 0) {
                return [];
            }
            return stations
                .map((s, idx) => ({ s, idx }))
                .filter(({ s }) => activeDimensions.has(s.primary))
                .sort((a, b) => parseFloat(a.s.hm) - parseFloat(b.s.hm));
        }

        // Paint all station bars. Called whenever the dimension filter
        // changes; idempotent — clears the <g> first.
        function renderDialTuner() {
            const group = document.getElementById('dialStations');
            if (!group) return;
            while (group.firstChild) group.removeChild(group.firstChild);

            const SVG_NS = 'http://www.w3.org/2000/svg';
            getFilteredDialStations().forEach(({ s, idx }) => {
                const { y1, y2 } = getBandY(s.band);
                const x = xForHm(parseFloat(s.hm));
                const line = document.createElementNS(SVG_NS, 'line');
                line.setAttribute('x1', x);
                line.setAttribute('x2', x);
                line.setAttribute('y1', y1);
                line.setAttribute('y2', y2);
                line.setAttribute('stroke', colorForStation(s));
                line.setAttribute('stroke-width', widthForStation(s));
                line.setAttribute('stroke-linecap', 'round');
                line.setAttribute('class', 'dial-station-line');
                line.dataset.stationIdx = String(idx);
                line.dataset.hm = String(s.hm);
                const native = document.createElementNS(SVG_NS, 'title');
                native.textContent = `${s.name} · HM ${s.hm}`;
                line.appendChild(native);
                line.addEventListener('click', () => selectStation(idx));
                group.appendChild(line);
            });

            refreshDialTuner();
        }

        // Move the orange indicator to the active station, toggle .playing
        // class, update Previous/Next disabled state. The textual "HM x.xx
        // Station Name" lives in player-station-info now, not the dial.
        function refreshDialTuner() {
            const indicator = document.getElementById('dialIndicator');
            const bar       = document.getElementById('dialIndicatorBar');
            const top       = document.getElementById('dialIndicatorTop');
            const bot       = document.getElementById('dialIndicatorBot');
            // Previous/Next buttons live in the player footer — they were
            // moved out of the dial row but the disable-at-edges logic is
            // still driven from here so it stays in lockstep with the
            // dial's filtered station list.
            const tuneUp    = document.getElementById('playerBtnNext');
            const tuneDown  = document.getElementById('playerBtnPrev');
            const group     = document.getElementById('dialStations');
            if (!indicator) return;

            const filtered = getFilteredDialStations();
            // Indicator follows the SELECTED (tuned) station, not the
            // playing one — so Tune Up/Down can move the needle even
            // while audio keeps playing on a different station. The
            // playing-glow class is applied separately below.
            const idx = (typeof currentStationIdx !== 'undefined' && currentStationIdx >= 0)
                ? currentStationIdx
                : (typeof playingStationIdx !== 'undefined' ? playingStationIdx : -1);
            const tuned = idx >= 0 && stations[idx]
                && filtered.some(({ idx: i }) => i === idx);

            if (!tuned) {
                indicator.style.display = 'none';
                if (tuneUp)   tuneUp.disabled   = true;
                if (tuneDown) tuneDown.disabled = true;
                if (group) {
                    group.querySelectorAll('.dial-station-line.playing')
                         .forEach(n => n.classList.remove('playing'));
                }
                return;
            }

            const station = stations[idx];
            const x = xForHm(parseFloat(station.hm));
            indicator.style.display = '';
            bar.setAttribute('x', x - 2);
            top.setAttribute('points', `${x - 7},0 ${x + 7},0 ${x},4`);
            bot.setAttribute('points', `${x - 7},57 ${x + 7},57 ${x},53`);

            if (group) {
                group.querySelectorAll('.dial-station-line.playing')
                     .forEach(n => n.classList.remove('playing'));
                if (typeof playingStationIdx !== 'undefined' && playingStationIdx === idx) {
                    const target = group.querySelector(
                        `.dial-station-line[data-station-idx="${idx}"]`);
                    if (target) target.classList.add('playing');
                }
            }

            const pos = filtered.findIndex(({ idx: i }) => i === idx);
            if (tuneDown) tuneDown.disabled = pos <= 0;
            if (tuneUp)   tuneUp.disabled   = pos < 0 || pos >= filtered.length - 1;
        }

        // Step to the next/previous station in HM order, scoped to the
        // currently-filtered list. Calls existing selectStation() so all
        // side effects (now-playing strip, audio, etc.) stay wired.
        function tuneUp() {
            const filtered = getFilteredDialStations();
            if (!filtered.length) return;
            // Step from the SELECTED station, not the playing one.
            const cur = (typeof currentStationIdx !== 'undefined' && currentStationIdx >= 0)
                ? currentStationIdx
                : (typeof playingStationIdx !== 'undefined' ? playingStationIdx : -1);
            const pos = filtered.findIndex(({ idx }) => idx === cur);
            const next = pos < 0 ? 0 : Math.min(pos + 1, filtered.length - 1);
            if (pos >= 0 && next === pos) return;
            // playStation() instead of selectStation() so the audio
            // actually starts on the next station, matching listener
            // expectation that Prev/Next behave like a media player's
            // skip buttons (not just a dial-cursor nudge).
            playStation(filtered[next].idx);
        }
        function tuneDown() {
            const filtered = getFilteredDialStations();
            if (!filtered.length) return;
            const cur = (typeof currentStationIdx !== 'undefined' && currentStationIdx >= 0)
                ? currentStationIdx
                : (typeof playingStationIdx !== 'undefined' ? playingStationIdx : -1);
            const pos = filtered.findIndex(({ idx }) => idx === cur);
            if (pos <= 0) return;
            playStation(filtered[pos - 1].idx);
        }

        // Spec Part 10 — push HM frequency, mode badge, persona/host into
        // the footer Now Playing strip. Idempotent; called from both
        // selectStation() and playStation() so the bar stays in sync.
        function updatePlayerNowPlaying(station) {
            if (!station) return;
            const hmEl = document.getElementById('playerStationHm');
            if (hmEl) {
                if (station.hm) {
                    hmEl.textContent = 'HM ' + station.hm;
                    hmEl.hidden = false;
                } else {
                    hmEl.hidden = true;
                }
            }
            const badge = document.getElementById('playerModeBadge');
            const mode = (station.mode || '').trim();
            if (badge) {
                badge.classList.remove('is-ohi','is-non-ohi','is-mixed','is-both','is-family');
                // Per request: hide the OHI / Non-OHI / Mixed / Both
                // labels (theological jargon that confused listeners).
                // Family-Safe stays — it's a useful family-safety signal.
                if (/family/i.test(mode)) {
                    badge.textContent = 'Family-Safe';
                    badge.classList.add('is-family');
                    badge.hidden = false;
                } else {
                    badge.hidden = true;
                }
            }
            // Persona / host. Treat the placeholder dash as empty and
            // fall back to currentShow.host.
            const persona = (station.persona && station.persona !== '—') ? station.persona : '';
            const host = persona || (station.currentShow && station.currentShow.host) || '';
            const hostEl = document.getElementById('playerStationHost');
            if (hostEl) hostEl.textContent = host;
            // Submit Prayer button — visible on every faith mode; hidden
            // only on Family-Safe.
            const prayerBtn = document.getElementById('playerPrayerBtn');
            if (prayerBtn) prayerBtn.classList.toggle('is-hidden', /family/i.test(mode));
            // Sync the heart with whichever station the footer is now
            // showing. Without this, the heart kept the favorited state
            // of the previous station after the listener tuned a new one
            // (e.g. user favourites A, then plays B → heart still filled).
            if (typeof updatePlayerLikeButton === 'function') {
                updatePlayerLikeButton();
            }
            // BR-B3 — show the current six-hour cycle for this station.
            refreshCycleBadge();
        }

        // ============================================
        // BR-B3 — SIX-HOUR CYCLE INDICATOR (m / a / e / n)
        // ============================================

        // Returns { code, name } for the cycle currently active at the
        // station's host city. Falls back to browser-local time when the
        // station has no declared timezone (most stations until BR-B1
        // backfills timezones for the whole network).
        function getStationCycle(station) {
            let hour;
            try {
                if (station && station.timezone) {
                    const parts = new Intl.DateTimeFormat('en-US', {
                        timeZone: station.timezone, hour: 'numeric', hour12: false
                    }).formatToParts(new Date());
                    hour = parseInt(parts.find(p => p.type === 'hour').value, 10);
                } else {
                    hour = new Date().getHours();
                }
            } catch (e) {
                hour = new Date().getHours();
            }
            if (hour === 24 || isNaN(hour)) hour = 0; // Intl can yield '24' at midnight
            if (hour >= 6  && hour < 12) return { code: 'm', name: 'Morning' };
            if (hour >= 12 && hour < 18) return { code: 'a', name: 'Afternoon' };
            if (hour >= 18 && hour < 24) return { code: 'e', name: 'Evening' };
            return { code: 'n', name: 'Night' };
        }

        // Refresh the footer cycle badge for whichever station the footer
        // is currently showing. Called on station change and on a timer so
        // the badge stays correct across cycle boundaries.
        function refreshCycleBadge() {
            const cycleEl = document.getElementById('playerCycleBadge');
            if (!cycleEl) return;
            const idx = playingStationIdx >= 0 ? playingStationIdx : currentStationIdx;
            const station = idx >= 0 ? stations[idx] : null;
            if (!station) { cycleEl.hidden = true; return; }
            const cyc = getStationCycle(station);
            cycleEl.textContent = cyc.name;
            const tzNote = station.timezone
                ? (station.hostCity || station.timezone) + ' local time'
                : 'your local time';
            cycleEl.title = 'Cycle ' + cyc.code.toUpperCase() + ' — ' + cyc.name + ' (' + tzNote + ')';
            cycleEl.hidden = false;
        }

        // Keep the cycle badge fresh if the page is left open across a
        // cycle boundary (every 60s is plenty for a 6-hour window).
        setInterval(refreshCycleBadge, 60000);

        // ============================================
        // BR-I3 — NOW-PLAYING SEGMENT (manifest track title / artist)
        // ============================================

        // When a manifest station is playing, surface the actual track in
        // the footer's show + host lines instead of the static station show
        // name. No-op for live-stream stations (they keep their show name).
        function updateNowPlayingSegment() {
            if (!currentManifestTrack) return;
            const showEl = document.getElementById('playerShowName');
            const hostEl = document.getElementById('playerStationHost');
            if (showEl) showEl.textContent = '♪ ' + (currentManifestTrack.title || 'Now playing');
            if (hostEl && currentManifestTrack.artist) hostEl.textContent = currentManifestTrack.artist;
        }

        // Share the currently-selected/playing station. Web Share API on
        // mobile + Safari; clipboard fallback elsewhere with a deep link.
        async function shareStation() {
            const idx = playingStationIdx >= 0 ? playingStationIdx : currentStationIdx;
            if (idx < 0 || !stations[idx]) return;
            const station = stations[idx];
            const url = `${location.origin}${location.pathname}?station=${encodeURIComponent(station.slug)}`;
            const title = `Jubilee Radio · ${station.name}`;
            const text  = `Listening to ${station.name} (HM ${station.hm}) on Jubilee Radio.`;
            try {
                if (navigator.share) {
                    await navigator.share({ title, text, url });
                    return;
                }
                await navigator.clipboard.writeText(url);
                const btn = document.querySelector('.player-share-btn');
                if (btn) {
                    const orig = btn.title;
                    btn.title = 'Link copied!';
                    setTimeout(() => { btn.title = orig; }, 1500);
                }
            } catch (err) {
                if (err && err.name !== 'AbortError') console.warn('shareStation failed', err);
            }
        }

        function selectStation(idx) {
            currentStationIdx = idx;

            // Close mobile sidebar when station is selected
            if (window.innerWidth <= 768) {
                closeMobileSidebar();
            }

            // Re-render the desktop + mobile station lists so the `.active`
            // (selected) and `.playing` (streaming) classes stay consistent
            // across both viewports.
            renderStationList();

            // NOTE: The footer player (.player-station-info, HM badge,
            // etc.) is intentionally NOT updated here. Selecting a card
            // only moves the dial cursor — the footer continues to show
            // the station that's actually streaming. The footer is
            // refreshed only by playStation(), which is what the user
            // triggers via the play button.

            // Right sidebar follows the selection so its Playing List /
            // Schedule reflect this station's data.
            renderDiscoverSidebar();

            // Heaven's Dial — needle slides to the newly tuned station.
            refreshDialTuner();
        }

        // ============================================
        // PLAYBACK CONTROLS
        // ============================================

        function playStation(idx) {
            currentStationIdx = idx;
            playingStationIdx = idx;
            isPlaying = true;
            const station = stations[idx];

            // Update player
            document.getElementById('playerArt').src = station.image;
            document.getElementById('playerStationName').textContent = station.name;
            document.getElementById('playerShowName').textContent = station.currentShow.name;
            // Spec Part 10 — push HM, mode, persona/host into the bar.
            updatePlayerNowPlaying(station);

            // Update play icon
            updatePlayIcon();

            // Update live indicator
            const indicator = document.getElementById('liveIndicator');
            indicator.classList.remove('inactive');

            // Update sidebar
            renderStationList();
            // Right sidebar updates so its Playing List / Schedule follows
            // whatever's actually streaming.
            renderDiscoverSidebar();

            // Start audio
            startAudioPlayback(idx);

            // BR-I1 — new station → enable engagement buttons, clear stale vote.
            resetSegmentRatingUI();
            updateEngagementButtons();

            // Heaven's Dial — light the playing tick.
            refreshDialTuner();

            // Persist for cross-page sticky footer.
            syncPinnedState();
        }

        // Step to the previous / next station and start playing it. The
        // reference index prefers what's actually streaming (so prev/next
        // walks the playback chain), falling back to the user-selected
        // station, then to before-first → wraps to last. Pressing prev or
        // next when no station is selected starts at the natural end.
        function playPreviousStation() {
            if (!stations.length) return;
            const ref = playingStationIdx >= 0 ? playingStationIdx
                       : currentStationIdx >= 0 ? currentStationIdx
                       : 0;
            const idx = (ref - 1 + stations.length) % stations.length;
            playStation(idx);
        }
        function playNextStation() {
            if (!stations.length) return;
            const ref = playingStationIdx >= 0 ? playingStationIdx
                       : currentStationIdx >= 0 ? currentStationIdx
                       : -1;
            const idx = (ref + 1) % stations.length;
            playStation(idx);
        }

        function togglePlay() {
            // First-ever click with no station selected → start with the first.
            if (currentStationIdx === -1) {
                if (stations.length > 0) playStation(0);
                return;
            }
            isPlaying = !isPlaying;
            if (isPlaying) {
                // If the user navigated to a different station while paused,
                // resume on the *selected* station rather than the old one.
                if (playingStationIdx !== currentStationIdx) {
                    playStation(currentStationIdx);
                    return;
                }
                resumeAudioPlayback();
                document.getElementById('liveIndicator').classList.remove('inactive');
            } else {
                stopAudioPlayback();
                document.getElementById('liveIndicator').classList.add('inactive');
            }
            updatePlayIcon();
            // Re-render so the animated equalizer appears/disappears with play state.
            renderStationList();
            // Keep the pinned state in sync with what's currently happening.
            syncPinnedState();
        }

        // ============================================
        // PIN PLAYER TO ALL PAGES
        // ============================================
        //
        // When the listener clicks the pin button on the radio-player footer,
        // we persist the current selection + play state to localStorage. Other
        // pages on the site can include /js/sticky-radio-player.js, which
        // reads this state and re-renders a compact footer (so the listener
        // sees the same player while navigating).
        //
        // Audio cannot truly continue uninterrupted across full page reloads
        // (the <audio> element gets destroyed), so the cross-page script
        // tries to auto-resume on each page load — subject to the browser's
        // autoplay policy (typically allowed once the user has gestured for
        // the origin recently).
        //
        // localStorage shape:
        //   jubileeRadio.pin.enabled  -> 'true' | 'false'
        //   jubileeRadio.pin.station  -> JSON of {slug, name, hm, image, streamUrl, mode, host}
        //   jubileeRadio.pin.playing  -> 'true' | 'false'
        //   jubileeRadio.pin.volume   -> '0.0' .. '1.0'
        const PIN_STORAGE = {
            enabled: 'jubileeRadio.pin.enabled',
            station: 'jubileeRadio.pin.station',
            playing: 'jubileeRadio.pin.playing',
            volume:  'jubileeRadio.pin.volume',
        };

        let radioPlayerPinned = (() => {
            try { return localStorage.getItem(PIN_STORAGE.enabled) === 'true'; }
            catch { return false; }
        })();

        function toggleRadioPlayerPin() {
            radioPlayerPinned = !radioPlayerPinned;
            try {
                localStorage.setItem(PIN_STORAGE.enabled, String(radioPlayerPinned));
            } catch {}
            applyPinButtonVisualState();
            // When pinning, immediately snapshot the current playback so the
            // sticky-radio-player.js on other pages has data to render right
            // away. When unpinning, leave the snapshot in place — the radio
            // page itself still needs a default station; only the *cross-page*
            // injection is suppressed when not pinned.
            if (radioPlayerPinned) {
                syncPinnedState();
            }
        }

        function applyPinButtonVisualState() {
            const btn = document.getElementById('radioPlayerPinBtn');
            if (!btn) return;
            btn.classList.toggle('pinned', radioPlayerPinned);
            btn.setAttribute('aria-pressed', String(radioPlayerPinned));
            btn.title = radioPlayerPinned
                ? 'Player pinned to all pages — click to unpin'
                : 'Pin player to all pages (currently unpinned)';
        }

        // Snapshot the live player state into the PIN_STORAGE keys. Called
        // whenever something the cross-page footer would need changes:
        // station selection (playStation), play/pause (togglePlay), volume.
        // No-op when not pinned, except for station — even when unpinned we
        // keep the last selection so re-pinning later picks up where the
        // listener left off.
        function syncPinnedState() {
            try {
                const idx = (typeof playingStationIdx !== 'undefined' && playingStationIdx >= 0)
                    ? playingStationIdx
                    : currentStationIdx;
                if (idx >= 0 && stations[idx]) {
                    const s = stations[idx];
                    localStorage.setItem(PIN_STORAGE.station, JSON.stringify({
                        slug: s.slug, name: s.name, hm: s.hm, image: s.image,
                        // Manifest stations have no streamUrl — the footer
                        // needs the manifest instead or it has nothing to play.
                        streamUrl: s.streamUrl, musicManifestUrl: s.musicManifestUrl || null,
                        mode: s.mode || '', host: (s.persona && s.persona !== '—') ? s.persona : ((s.currentShow && s.currentShow.host) || ''),
                    }));
                }
                if (radioPlayerPinned) {
                    localStorage.setItem(PIN_STORAGE.playing, String(!!isPlaying));
                    const audio = document.querySelector('audio');
                    if (audio) localStorage.setItem(PIN_STORAGE.volume, String(audio.volume));
                }
            } catch {}
        }

        // Build the footer equalizer bars. Mirrors the card-equalizer
        // pattern: scrambled animation-delays cycled across the row so
        // neighbours bounce out of phase (organic, non-wave look). The 14
        // delay values are the same set used by .station-card-equalizer
        // (CSS rules at the top of the stylesheet) — keeping them
        // identical makes the two equalizers feel like the same family.
        // Idempotent: safe to call repeatedly.
        function buildPlayerEq() {
            const host = document.getElementById('playerEq');
            if (!host) return;
            if (host.childElementCount > 0) return;
            const BAR_COUNT = 50;
            const CARD_DELAYS = [
                -0.10, -0.85, -0.30, -0.55, -0.05, -0.65, -0.20,
                -0.45, -0.75, -0.15, -0.50, -0.35, -0.90, -0.25
            ];
            const html = Array.from({ length: BAR_COUNT }, (_, i) => {
                const d = CARD_DELAYS[i % CARD_DELAYS.length];
                return `<span style="animation-delay: ${d}s"></span>`;
            }).join('');
            host.innerHTML = html;
        }

        // Single chokepoint — adds / removes the .is-active modifier on
        // every animated waveform on the page (footer eq + sidebar wave).
        // Drives off the global isPlaying flag, so call this any time
        // playback starts or stops.
        function updateAudioPlayingClasses() {
            const eq    = document.getElementById('playerEq');
            // renderDiscoverSidebar() writes the same HTML into BOTH
            // the desktop and mobile sidebar hosts, so there are two
            // .dsb-waveform elements in the DOM at once. querySelector
            // only matched the first, leaving the second one stuck
            // animating after pause. querySelectorAll + forEach toggles
            // both in lockstep.
            const dsbWfs = document.querySelectorAll('.dsb-waveform');
            if (eq) eq.classList.toggle('is-active', !!isPlaying);
            dsbWfs.forEach(el => el.classList.toggle('is-active', !!isPlaying));
        }

        function updatePlayIcon() {
            const playSvg = '<polygon points="5 3 19 12 5 21 5 3"/>';
            const pauseSvg = '<rect x="6" y="4" width="4" height="16" fill="currentColor"/><rect x="14" y="4" width="4" height="16" fill="currentColor"/>';

            // Footer player button reflects whether audio is currently playing
            // anywhere (global state).
            const icon = document.getElementById('playIcon');
            if (icon) icon.innerHTML = isPlaying ? pauseSvg : playSvg;
            // Animated equalizers (footer + sidebar) follow play state.
            updateAudioPlayingClasses();

            // Banner play button represents the *selected* station, not global
            // state. Only show Pause when this specific station is the one
            // actually streaming — otherwise clicking Play should start this
            // station (not pause whatever else is playing).
            const bannerIcon = document.getElementById('bannerPlayIcon');
            const bannerBtn  = document.getElementById('bannerPlayBtn');
            const thisStationIsPlaying = isPlaying && playingStationIdx === currentStationIdx;
            if (bannerIcon) {
                bannerIcon.innerHTML = thisStationIsPlaying ? pauseSvg : playSvg;
            }
            if (bannerBtn) {
                bannerBtn.title = thisStationIsPlaying ? 'Pause' : 'Play';
            }
        }

        function toggleBannerPlay(idx) {
            // Pause only if THIS banner's station is the one streaming.
            // Otherwise clicking the banner Play starts this station
            // (switching audio away from whatever was playing before).
            if (isPlaying && playingStationIdx === idx) {
                togglePlay();
            } else {
                playStation(idx);
            }
        }

        function toggleFollow(btn) {
            btn.classList.toggle('following');
            btn.textContent = btn.classList.contains('following') ? 'Following' : 'Follow';
        }

        function toggleLike() {
            // Toggle favorite for the currently playing station
            if (currentStationIdx >= 0 && currentStationIdx < stations.length) {
                // Create a fake event to pass to toggleFavorite
                const fakeEvent = {
                    stopPropagation: () => {},
                    currentTarget: document.querySelector('.player-like-btn')
                };
                toggleFavorite(fakeEvent, currentStationIdx);
            }
        }

        // Update player like button state
        function updatePlayerLikeButton() {
            const btn = document.querySelector('.player-like-btn');
            if (!btn) return;

            const svg = btn.querySelector('svg');
            const stationId = getStationId(currentStationIdx);
            const isFavorited = userFavorites.has(stationId);

            svg.setAttribute('fill', isFavorited ? 'currentColor' : 'none');
            svg.setAttribute('stroke', 'currentColor');
            btn.style.color = isFavorited ? 'var(--accent-gold)' : '';
            btn.title = isFavorited ? 'Remove from favorites' : 'Add to favorites';
        }

        // ============================================
        // BR-I1 — LISTENER ENGAGEMENT (thumbs, comment, feedback POST)
        // ============================================

        // Anonymous session id — stable per browser, lets feedback be
        // attributed without requiring login. Authenticated users additionally
        // send their bearer token via getAuthHeaders().
        function getRadioSessionId() {
            let sid = localStorage.getItem('jubileeRadioSessionId');
            if (!sid) {
                sid = 'anon-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
                localStorage.setItem('jubileeRadioSessionId', sid);
            }
            return sid;
        }

        // Resolve the station + segment a feedback event applies to. Prefers
        // the station actually streaming; falls back to the selected one.
        function getFeedbackContext() {
            const idx = playingStationIdx >= 0 ? playingStationIdx : currentStationIdx;
            const station = idx >= 0 ? stations[idx] : null;
            if (!station) return null;
            let segmentId = null, segmentType = null;
            if (currentManifestTrack) {
                const m = (currentManifestTrack.url || '').match(/([^/]+)\.mp3$/i);
                segmentId = m ? m[1] : currentManifestTrack.url;
                segmentType = 'song';
            } else if (station.streamUrl) {
                segmentType = 'stream';
            }
            return {
                station_id: station.slug,
                station_name: station.name,
                segment_id: segmentId,
                segment_type: segmentType
            };
        }

        // POST a single engagement event. Failures are logged, never thrown —
        // engagement must never break playback.
        async function postRadioFeedback(eventType, extra) {
            const ctx = getFeedbackContext();
            if (!ctx) return false;
            const payload = Object.assign({
                event_type: eventType,
                session_id: getRadioSessionId(),
                timestamp: new Date().toISOString()
            }, ctx, extra || {});
            try {
                const res = await fetch('/api/radio/feedback', {
                    method: 'POST',
                    headers: Object.assign({ 'Content-Type': 'application/json' }, getAuthHeaders()),
                    body: JSON.stringify(payload)
                });
                return res.ok;
            } catch (err) {
                console.log('[feedback] post failed:', err.message);
                return false;
            }
        }

        // Enable/disable thumb + comment buttons based on whether a station
        // is actually playing.
        function updateEngagementButtons() {
            const active = playingStationIdx >= 0;
            ['thumbUpBtn', 'thumbDownBtn', 'commentBtn', 'voicemailBtn'].forEach(id => {
                const btn = document.getElementById(id);
                if (btn) btn.disabled = !active;
            });
        }

        // Clear the thumb-vote highlight + state — called on every
        // segment/station change so the listener can rate the new track.
        let currentSegmentVote = null;
        function resetSegmentRatingUI() {
            currentSegmentVote = null;
            const up = document.getElementById('thumbUpBtn');
            const down = document.getElementById('thumbDownBtn');
            if (up) up.classList.remove('rated');
            if (down) down.classList.remove('rated', 'rated-down');
        }

        // Thumb up / down on the currently-playing segment. One vote per
        // segment; tapping the same thumb again clears it, the other switches.
        function rateSegment(direction) {
            if (playingStationIdx < 0) return;
            const up = document.getElementById('thumbUpBtn');
            const down = document.getElementById('thumbDownBtn');
            const wasVote = currentSegmentVote;
            resetSegmentRatingUI();
            if (wasVote === direction) {
                postRadioFeedback('thumb_clear');
                return;
            }
            currentSegmentVote = direction;
            if (direction === 'up') {
                up.classList.add('rated');
                postRadioFeedback('thumb_up');
            } else {
                down.classList.add('rated', 'rated-down');
                postRadioFeedback('thumb_down');
            }
        }

        // ---- Comment modal ----
        function openCommentModal() {
            const ctx = getFeedbackContext();
            if (!ctx) return;
            const sub = document.getElementById('commentModalSubtitle');
            if (sub) sub.textContent = ctx.station_name + (ctx.segment_id ? ' · ' + ctx.segment_id : '');
            document.getElementById('commentFormView').hidden = false;
            document.getElementById('commentThanksView').hidden = true;
            const ta = document.getElementById('commentText');
            ta.value = '';
            updateCommentCounter();
            document.getElementById('commentModalOverlay').classList.add('open');
            ta.focus();
        }

        function closeCommentModal() {
            document.getElementById('commentModalOverlay').classList.remove('open');
        }

        function updateCommentCounter() {
            const ta = document.getElementById('commentText');
            const len = ta.value.trim().length;
            document.getElementById('commentCounter').textContent = len + ' / 400';
            document.getElementById('commentSubmitBtn').disabled = len < 3;
        }

        async function submitRadioComment() {
            const ta = document.getElementById('commentText');
            const text = ta.value.trim();
            if (text.length < 3) return;
            const btn = document.getElementById('commentSubmitBtn');
            btn.disabled = true;
            const ok = await postRadioFeedback('comment', { comment: text });
            if (ok) {
                document.getElementById('commentFormView').hidden = true;
                document.getElementById('commentThanksView').hidden = false;
            } else {
                btn.disabled = false;
                alert('Could not submit your comment. Please try again.');
            }
        }

        // ============================================
        // BR-I2 — VOICE MESSAGE SUBMISSION (browser recording)
        // ============================================
        let vmMediaRecorder = null;
        let vmChunks = [];
        let vmRecordedBlob = null;
        let vmStream = null;
        let vmTimerInterval = null;
        let vmElapsed = 0;
        const VM_MAX_SECONDS = 60;

        function vmFmtTime(s) {
            return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
        }

        function vmSetStatus(msg, isError) {
            const status = document.getElementById('vmStatus');
            if (!status) return;
            status.textContent = msg;
            status.classList.toggle('error', !!isError);
        }

        // Release the mic so the browser's recording indicator clears.
        function vmStopTracks() {
            if (vmStream) {
                vmStream.getTracks().forEach(t => t.stop());
                vmStream = null;
            }
        }

        function vmReset() {
            clearInterval(vmTimerInterval);
            vmStopTracks();
            if (vmMediaRecorder && vmMediaRecorder.state === 'recording') {
                try { vmMediaRecorder.stop(); } catch (e) {}
            }
            vmMediaRecorder = null;
            vmChunks = [];
            vmRecordedBlob = null;
            vmElapsed = 0;
            const btn = document.getElementById('vmRecordBtn');
            if (btn) { btn.classList.remove('recording'); btn.disabled = false; }
            const timer = document.getElementById('vmTimer');
            if (timer) timer.textContent = '0:00';
            vmSetStatus('Tap the mic to start recording (max 60s).', false);
            const preview = document.getElementById('vmPreview');
            if (preview) { preview.hidden = true; preview.removeAttribute('src'); }
            const rerec = document.getElementById('vmRerecordBtn');
            if (rerec) rerec.hidden = true;
            const submit = document.getElementById('vmSubmitBtn');
            if (submit) submit.disabled = true;
        }

        function openVoicemailModal() {
            const ctx = getFeedbackContext();
            if (!ctx) return;
            const sub = document.getElementById('voicemailModalSubtitle');
            if (sub) sub.textContent = ctx.station_name || 'Jubilee Radio';
            vmReset();
            document.getElementById('voicemailFormView').hidden = false;
            document.getElementById('voicemailThanksView').hidden = true;
            document.getElementById('voicemailModalOverlay').classList.add('open');
        }

        function closeVoicemailModal() {
            clearInterval(vmTimerInterval);
            vmStopTracks();
            if (vmMediaRecorder && vmMediaRecorder.state === 'recording') {
                try { vmMediaRecorder.stop(); } catch (e) {}
            }
            document.getElementById('voicemailModalOverlay').classList.remove('open');
        }

        async function vmToggleRecording() {
            if (vmMediaRecorder && vmMediaRecorder.state === 'recording') {
                vmStopRecording();
                return;
            }
            if (!navigator.mediaDevices || !window.MediaRecorder) {
                vmSetStatus('Recording is not supported in this browser.', true);
                return;
            }
            try {
                vmStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            } catch (err) {
                vmSetStatus('Microphone access was denied.', true);
                return;
            }
            vmChunks = [];
            vmRecordedBlob = null;
            try {
                vmMediaRecorder = new MediaRecorder(vmStream);
            } catch (err) {
                vmSetStatus('Could not start recording.', true);
                vmStopTracks();
                return;
            }
            vmMediaRecorder.ondataavailable = e => { if (e.data && e.data.size) vmChunks.push(e.data); };
            vmMediaRecorder.onstop = () => {
                clearInterval(vmTimerInterval);
                vmRecordedBlob = new Blob(vmChunks, { type: vmMediaRecorder.mimeType || 'audio/webm' });
                vmStopTracks();
                const preview = document.getElementById('vmPreview');
                preview.src = URL.createObjectURL(vmRecordedBlob);
                preview.hidden = false;
                document.getElementById('vmRerecordBtn').hidden = false;
                document.getElementById('vmSubmitBtn').disabled = false;
                const btn = document.getElementById('vmRecordBtn');
                btn.classList.remove('recording');
                btn.disabled = true;
                vmSetStatus('Recorded ' + vmFmtTime(vmElapsed) + '. Preview it, then submit.', false);
            };
            vmMediaRecorder.start();
            vmElapsed = 0;
            document.getElementById('vmTimer').textContent = '0:00';
            document.getElementById('vmRecordBtn').classList.add('recording');
            vmSetStatus('Recording… tap the mic again to stop.', false);
            vmTimerInterval = setInterval(() => {
                vmElapsed++;
                document.getElementById('vmTimer').textContent = vmFmtTime(vmElapsed);
                if (vmElapsed >= VM_MAX_SECONDS) vmStopRecording();
            }, 1000);
        }

        function vmStopRecording() {
            clearInterval(vmTimerInterval);
            if (vmMediaRecorder && vmMediaRecorder.state === 'recording') {
                try { vmMediaRecorder.stop(); } catch (e) {}
            }
        }

        async function vmSubmit() {
            if (!vmRecordedBlob) return;
            const ctx = getFeedbackContext();
            if (!ctx) return;
            const submit = document.getElementById('vmSubmitBtn');
            submit.disabled = true;
            vmSetStatus('Uploading…', false);
            const mime = vmRecordedBlob.type || 'audio/webm';
            const qs = new URLSearchParams({
                station_id: ctx.station_id,
                station_name: ctx.station_name || '',
                session_id: getRadioSessionId(),
                duration_s: String(vmElapsed),
                mime: mime
            });
            // Send the raw blob — octet-stream content type so the global
            // 1mb express.json parser skips it and the route's raw parser
            // (8mb) handles the upload.
            const headers = Object.assign({}, getAuthHeaders());
            headers['Content-Type'] = 'application/octet-stream';
            try {
                const res = await fetch('/api/radio/voicemail?' + qs.toString(), {
                    method: 'POST',
                    headers: headers,
                    body: vmRecordedBlob
                });
                if (res.ok) {
                    document.getElementById('voicemailFormView').hidden = true;
                    document.getElementById('voicemailThanksView').hidden = false;
                } else {
                    submit.disabled = false;
                    vmSetStatus('Upload failed. Please try again.', true);
                }
            } catch (err) {
                submit.disabled = false;
                vmSetStatus('Upload failed. Please try again.', true);
            }
        }

        // Volume controls — pointer-based drag with capture.
        //
        // Click → instant set; drag → continuous update; the pointer is
        // captured on pointerdown so the drag continues even when the cursor
        // leaves the slim bar (the old click-only handler was the entire
        // reason the slider felt jumpy — there was no drag at all).
        function applyVolumeFromPointer(e) {
            const bar = document.getElementById('volumeBar');
            const rect = bar.getBoundingClientRect();
            const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            setAudioVolume(pct);
            // Update the fill width directly (style overrides the CSS default).
            // setAudioVolume already updates the icon glyph.
            const fill = document.querySelector('.volume-fill');
            if (fill) fill.style.width = (pct * 100) + '%';
            return pct;
        }

        function startVolumeDrag(e) {
            // Only respond to primary button / first finger.
            if (e.button !== undefined && e.button !== 0) return;
            e.preventDefault();
            const bar = document.getElementById('volumeBar');
            if (!bar) return;
            bar.classList.add('dragging');
            // Pointer capture ensures we keep getting move/up events even if
            // the cursor moves out of the bar — that's the difference between
            // a smooth scrub and a sticky click.
            try { bar.setPointerCapture(e.pointerId); } catch (_) {}
            applyVolumeFromPointer(e);

            const onMove = (ev) => applyVolumeFromPointer(ev);
            const onUp = (ev) => {
                bar.classList.remove('dragging');
                bar.removeEventListener('pointermove', onMove);
                bar.removeEventListener('pointerup', onUp);
                bar.removeEventListener('pointercancel', onUp);
                try { bar.releasePointerCapture(ev.pointerId); } catch (_) {}
            };
            bar.addEventListener('pointermove', onMove);
            bar.addEventListener('pointerup', onUp);
            bar.addEventListener('pointercancel', onUp);
        }

        let preMuteVolume = 0.7;
        function toggleMute() {
            if (audioVolume > 0) {
                preMuteVolume = audioVolume;
                setAudioVolume(0);
                document.querySelector('.volume-fill').style.width = '0%';
            } else {
                setAudioVolume(preMuteVolume);
                document.querySelector('.volume-fill').style.width = (preMuteVolume * 100) + '%';
            }
        }
