import { generateTotpSecret } from './totp.js';

/**
 * POST /api/enroll — register an author for TOTP-based signing.
 *
 * Gated by the admin SIGNING_API_KEY (the "initial auth"): an operator who
 * holds the API key generates a per-author TOTP secret, which is stored in
 * AUTHOR_STORE KV as `totp:<author-id>` and returned (with an otpauth:// URI)
 * so the UI can show a QR for the author to scan into their authenticator app.
 *
 * Once enrolled, that author can sign tokens with `{ sub, totp }` whenever the
 * SIGNING_API_KEY is removed and the TOTP auth branch in sign.js becomes active.
 */
export async function handleEnroll(request, env) {
  // Enrollment always requires the admin API key, independent of which auth
  // mode signing uses. Without it there is no bootstrap credential.
  if (!env.SIGNING_API_KEY) {
    return new Response('Enrollment disabled — no SIGNING_API_KEY configured', {
      status: 503,
    });
  }
  const header = request.headers.get('Authorization') ?? '';
  const key = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!key || key !== env.SIGNING_API_KEY) {
    return new Response('Unauthorized', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Bearer' },
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }

  const sub = typeof body.sub === 'string' ? body.sub.trim() : '';
  if (!sub) {
    return new Response('`sub` (author id) is required', { status: 400 });
  }

  const issuer = env.TOTP_ISSUER || 'Preview Proxy';
  const existing = await env.AUTHOR_STORE.get(`totp:${sub}`);
  const { secret, uri } = generateTotpSecret(sub, issuer);

  await env.AUTHOR_STORE.put(`totp:${sub}`, secret);

  return new Response(
    JSON.stringify({ sub, secret, uri, replaced: Boolean(existing) }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}
