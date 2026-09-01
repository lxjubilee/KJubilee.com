# Share cards

`kjubilee-dial.png` — 1200×630, the Open Graph / Twitter card for the whole
site and for the dial. **Generated, not drawn.** Rebuild it with:

    node tools/make-og-card.js tmp/og-card.html
    node tools/shoot.js "file:///<abs path>/tmp/og-card.html" \
         public/images/og/kjubilee-dial.png 1200 630 0

The source is an HTML card in `tools/make-og-card.js` with
`public/images/JubileeLogo.png` inlined, screenshotted by the same headless
Chrome the layout checks use. Editing the card means editing that file, so the
wording and the frequency on it stay in version control rather than in a PNG
nobody can diff.

1200×630 is the size iMessage, WhatsApp, Slack, Facebook and X all crop from.
Anything smaller than 600×315 is shown as a small square thumbnail instead of
a full-width card, which is the difference between a link that reads as a
station and one that reads as a URL.
