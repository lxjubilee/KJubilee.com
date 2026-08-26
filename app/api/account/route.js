import { requireAccount, toSettingsAccount, libraryCounts, changeName } from '@/lib/account';
import { json, readJson } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/*
 * The account a person owns, and the one field of it they may edit here.
 *
 * /api/auth/me already answers "who am I" for the pages that only need an id and
 * an address. This is the settings screen's view: it also carries where the
 * password lives, whether the row is linked to a Jubilee ID, and how much
 * library a deletion would take with it — all of which that screen has to state
 * plainly before anyone presses anything.
 */

// GET /api/account
export async function GET(request) {
    const gate = await requireAccount(request);
    if (gate.error) return json({ success: false, error: gate.error }, gate.status);

    return json({
        success: true,
        user: toSettingsAccount(gate.user),
        library: await libraryCounts(gate.user.id),
    });
}

// PATCH /api/account  { first_name, last_name }
//
// No password asked for. A name is not a credential: getting it wrong is
// embarrassing and reversible in one edit, which is a different class of thing
// from the two acts that do ask (see the password and delete routes).
export async function PATCH(request) {
    const gate = await requireAccount(request);
    if (gate.error) return json({ success: false, error: gate.error }, gate.status);

    const body = await readJson(request);
    const result = await changeName(gate.user.id, {
        first_name: body.first_name,
        last_name: body.last_name,
    });
    if (!result.success) return json({ success: false, error: result.error }, result.status || 400);

    return json({ success: true, user: result.user });
}
