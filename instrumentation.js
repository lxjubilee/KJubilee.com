// ─────────────────────────────────────────────────────────────────────────
// Production safety guard, ported from server.js.
//
// Refuse to boot in production with placeholder/empty secrets. A forgeable JWT
// secret or missing DB password silently shipping to prod is a real risk, and
// without this the Next server would start where the Express one would not.
//
// register() is Next's once-per-server-start hook. It runs in the edge runtime
// too, where these secrets are not the concern, so it is scoped to node.
// ─────────────────────────────────────────────────────────────────────────

export async function register() {
    if (process.env.NEXT_RUNTIME !== 'nodejs') return;
    if ((process.env.NODE_ENV || 'development') !== 'production') return;

    const placeholders = ['change-me-in-production', 'kjubilee-jwt-secret-CHANGE-ME', ''];
    const problems = [];
    if (!process.env.JWT_SECRET || placeholders.includes(process.env.JWT_SECRET) || process.env.JWT_SECRET.length < 32) {
        problems.push('JWT_SECRET is missing, a placeholder, or too short (need ≥32 chars — `openssl rand -hex 64`)');
    }
    if (!process.env.DB_PASSWORD) {
        problems.push('DB_PASSWORD is empty');
    }
    if (problems.length) {
        console.error('\n✗ Refusing to start in production:\n  - ' + problems.join('\n  - ') + '\n');
        process.exit(1);
    }
}
