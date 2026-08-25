import { revokeSession } from '@/lib/sessions';
import { json, readJson } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/auth/signout  { refreshToken }
//
// The half of signing out that was missing. Clearing localStorage only ever
// removed the copy in front of you; the token itself stayed valid for its full
// life in anyone else's hands. This retires it.
//
// Always answers 200. A caller signing out has nothing to learn from being told
// their token was already dead, and the browser should clear itself regardless.
export async function POST(request) {
    const body = await readJson(request);
    const { revoked } = await revokeSession(body.refreshToken);
    return json({ success: true, revoked });
}
