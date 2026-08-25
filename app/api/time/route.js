import { json, NO_STORE } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────
// streaming-services.md §4.3 — the one thing a synchronized broadcast cannot do
// without. The device clock may be minutes off, manually wrong, or reset after
// sleep, and a listener whose clock is out is not slightly off the beat: they
// are in a different song.
//
// MINIMAL BY DESIGN. The response carries a UTC instant and nothing else,
// because the client measures the round trip around this request and halves it
// (§4.3 step 4). Every byte of body and every millisecond of server work is
// error in that estimate, so there is no database call and no auth, and the
// payload is under fifty bytes.
// ─────────────────────────────────────────────────────────────────────────
export async function GET() {
    return json({ now: Date.now() }, 200, NO_STORE);
}
