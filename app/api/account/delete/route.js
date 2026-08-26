import { requireAccount, deleteAccount } from '@/lib/account';
import { json, readJson, ssoAuthLimiter } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/*
 * POST /api/account/delete  { password, confirm }
 *
 * Deletes THIS site's membership — the kj_users row, and by cascade the
 * favourites, the follows and every session. The Jubilee ID is left alone; see
 * the note on deleteAccount in lib/account.js for why one property may not
 * close a family-wide identity.
 *
 * Two locks, because they catch different mistakes. The password catches
 * somebody who is not the owner. The typed word catches the owner who did not
 * mean it — a password is muscle memory and a browser will fill it in, while
 * typing DELETE cannot happen by accident.
 */
const CONFIRM_WORD = 'DELETE';

export async function POST(request) {
    const limited = ssoAuthLimiter(request);
    if (limited) return limited;

    const gate = await requireAccount(request);
    if (gate.error) return json({ success: false, error: gate.error }, gate.status);

    const body = await readJson(request);
    if (String(body.confirm || '').trim().toUpperCase() !== CONFIRM_WORD) {
        return json({ success: false, error: `Type ${CONFIRM_WORD} to confirm.` }, 400);
    }

    const result = await deleteAccount(gate.user.id, { password: body.password || '' });
    if (!result.success) return json({ success: false, error: result.error }, result.status || 400);

    return json({ success: true, kept_jubilee_id: result.kept_jubilee_id });
}
