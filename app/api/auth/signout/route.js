import { revokeSession } from '@/lib/sessions';
import { ssoRevokeSession } from '@/lib/sso';
import { readFamily, clearedFamilyCookie } from '@/lib/family-session';
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

    // AND THE FAMILY SESSION THIS BROWSER HOLDS.
    //
    // Left alive it would go on minting tickets: the "Bible Talks" row would
    // still carry the signed-out reader into a sibling site as themselves, which
    // is not what anybody means by signing out.
    //
    // ONLY THE SESSION THIS COOKIE NAMES. The authority also offers revoke-all,
    // which ends every family session for the identity — that is what
    // JubileeInspire's sign-out does, by owner decision. It is deliberately not
    // what happens here: signing out of a radio site should not sign you out of
    // Bible Chat on another device. Revisit if the family wants one rule.
    const family = readFamily(request);
    if (family && family.token) {
        try { await ssoRevokeSession(family.token); } catch { /* the cookie still goes */ }
    }

    return json({ success: true, revoked }, 200, { 'Set-Cookie': clearedFamilyCookie() });
}
