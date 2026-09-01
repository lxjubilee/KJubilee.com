'use client';

import { usePageScripts } from '@/lib/use-page-script';
import SiteHeader from '../_site-header';

/*
 * Ported from public/player.
 *
 * The markup is that file's markup; its <style> block is now
 * public/css/pages/player.css and its inline
 * <script> is now /js/pages/player.js.
 * Nothing about the behaviour changed — the scripts are the same classic
 * scripts, loaded in the same order, and usePageScripts unwinds what they
 * register when this page goes away.
 */
export default function PlayerPage() {
    usePageScripts(['/js/circulation-data.js', '/js/pages/player.js']);

    return (
        <>
            <link rel="stylesheet" href="/css/site-header.css" precedence="kj-header" />
            <link rel="stylesheet" href="/css/pages/player.css" precedence="kj-page" />
            <SiteHeader current="player" />

            <main className="stage">
              {/* What the band could REACH, top left; what the band IS, top
                  right. Both filled in by the dial script from
                  /js/circulation-data.js, and both describe the band rather
                  than whichever station is tuned — which is why they sit in the
                  corners and never change as the dial turns. Which corner each
                  takes is set in player.css; the markup order is DOM order, not
                  screen position. */}
              <aside className="band-counts" id="band-counts" aria-label="Band size"></aside>
              <aside className="band-reach" id="band-reach" aria-label="Potential outreach"></aside>
              {/* WHO ELSE IS HERE. "3 / 17" — three listeners on the frequency
                  under the needle, seventeen across the whole dial.

                  INSIDE THE STAGE, directly under band-reach, and that is the
                  whole reason it moved here. It began life `position:fixed` at
                  `left:14px`, which is 14px from the VIEWPORT — and the
                  JubileeInspire rail owns the first 52px of that, so the number
                  was drawn underneath it and read "ISTENING". The outreach
                  figure above it is absolute inside .stage, so sharing the
                  parent is what makes the two line up, at any width, without
                  either of them knowing the rail's width.

                  NOT aria-hidden, unlike the song count in the other corner. A
                  song count changes on every tune and would be chatter; this
                  changes rarely and answers a question a listener actually has,
                  so it carries a real label and announces politely. Filled from
                  the `kj-presence` event — public/js/kj-presence.js — and left
                  EMPTY until the first reply lands, because a listener count
                  that guesses is worse than none. */}
              <div className="dial-listeners" id="dial-listeners" role="status" aria-live="polite"></div>
              <div className="readout">
                {/* The digits carry the centre line, not "HM" + the digits —
                    see .freq in player.css for how the prefix is balanced out. */}
                {/* HM on the left, digits dead centre, and on the right a
                    stacked flank: ON AIR above, the station's LANGUAGE CODE
                    below it — `EN`, `JA`, `EN-ES` — set in the same size,
                    face and colour as the HM on the other side, so the number
                    reads as a frequency with a prefix and a suffix.

                    THE CODE IS NOT DECORATION. This dial carries thirty
                    languages; a listener who lands on HM 336.60 and hears
                    Japanese should be able to see why before they conclude the
                    station is broken.

                    THREE GRID COLUMNS, `1fr auto 1fr`, and that is what keeps
                    the digits on the centre line the needle sits on. The flanks
                    are different widths and always will be, so the two 1fr
                    tracks take the slack equally and the middle column lands
                    dead centre whatever is parked either side of it. This
                    replaces a pair of hidden pseudo-element twins that mirrored
                    each flank's text — exact for one line of text on each side,
                    and unable to mirror a stacked block at all. */}
                <div className="freq">
                  <span className="freq-hm"><span className="hm" aria-hidden="true">HM</span></span>
                  <span className="freq-n" id="freq">—</span>
                  <span className="freq-tail">
                    <span className="onair" id="onair"><i></i><span id="onair-text">On air</span></span>
                    <span className="lang" id="lang"></span>
                  </span>
                </div>
                <h1 className="station" id="station">Turn the dial</h1>
                <div className="sub" id="sub">Press play, or step through the band with next</div>
                {/* WHERE THE STATION ACTUALLY BROADCASTS FROM. The anchor city
                    first, the rest of its bases in brackets after it. Left
                    empty for a station whose bases are not recorded — eleven of
                    the international frequencies have none, and a made-up city
                    on a page that prints real ones is worse than a blank. */}
                <div className="origin" id="origin"></div>
              </div>

              <div className="dial" id="dial" role="group" aria-label="Frequency dial">
                <div className="dial-track" id="track"></div>
                <div className="needle"></div>
              </div>

              <div className="controls">
                <div className="control">
                  <button className="tbtn" id="prev" type="button" aria-label="Previous station">
                    <svg viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3 6 9-6v12z" /></svg>
                  </button>
                  <span className="tbtn-label">Back</span>
                </div>
                <div className="control">
                  <button className="tbtn play" id="play" type="button" aria-label="Play">
                    <svg id="play-icon" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                  </button>
                  <span className="tbtn-label" id="play-label">Play</span>
                </div>
                <div className="control">
                  <button className="tbtn" id="next" type="button" aria-label="Next station">
                    <svg viewBox="0 0 24 24"><path d="M16 6h2v12h-2zM6 6l9 6-9 6z" /></svg>
                  </button>
                  <span className="tbtn-label">Next</span>
                </div>
              </div>

              <p className="hint">
                Keep pressing <kbd>Next</kbd> and listen. Every station on the band is a mark on the
                scale — the arrow keys move along it too, and the bar at the foot of the page keeps
                playing wherever you go on the site.
              </p>
            </main>

            {/* An operator's readout: the number of songs on whichever station
                the dial is currently sitting on. Deliberately UNLABELLED — it is
                a tracking figure, not something a listener needs explained, and a
                caption would turn a quiet number in the corner into a claim the
                page is making. aria-hidden for the same reason: a screen reader
                announcing a bare number every time the dial moves is noise.
                Filled by public/js/pages/player.js on every tune. */}
            <div className="dial-count" id="dial-count" aria-hidden="true"></div>


        </>
    );
}
