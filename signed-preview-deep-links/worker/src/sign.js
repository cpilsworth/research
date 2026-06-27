import { validateTotp } from './totp.js';

function b64url(data) {
  const bytes =
    data instanceof ArrayBuffer ? new Uint8Array(data) :
    typeof data === 'string' ? new TextEncoder().encode(data) : data;
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function handleSign(request, env) {
  const authError = await authenticate(request, env);
  if (authError) return authError;

  const geoError = checkGeo(request, env);
  if (geoError) return geoError;

  const rateError = await checkRateLimit(request, env);
  if (rateError) return rateError;

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }

  const { path, ttlMinutes = 60, sub = 'author@example.com' } = body;
  if (!path || typeof path !== 'string' || !path.startsWith('/')) {
    return new Response('`path` must be a string starting with /', { status: 400 });
  }
  if (typeof ttlMinutes !== 'number' || ttlMinutes < 1 || ttlMinutes > 1440) {
    return new Response('`ttlMinutes` must be between 1 and 1440', { status: 400 });
  }

  let privateKey;
  try {
    const jwk = JSON.parse(env.PREVIEW_PRIVATE_KEY);
    privateKey = await crypto.subtle.importKey(
      'jwk', jwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false, ['sign']
    );
  } catch {
    return new Response('Signing key not configured', { status: 503 });
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'ES256', typ: 'JWT', kid: 'preview-v1' };
  const payload = {
    sub,
    path,
    src: 'page',
    jti: crypto.randomUUID(),
    iat: now,
    exp: now + ttlMinutes * 60,
  };

  const encodedHeader = b64url(JSON.stringify(header));
  const encodedPayload = b64url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    new TextEncoder().encode(signingInput)
  );

  const token = `${signingInput}.${b64url(sig)}`;
  const universalLink = `https://${env.CONTENT_DOMAIN}/preview?token=${token}`;

  return new Response(
    JSON.stringify({
      token,
      universalLink,
      expiresAt: new Date(payload.exp * 1000).toISOString(),
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

async function authenticate(request, env) {
  // Phase 3: API key auth.
  // Phase 7: replace with TOTP by removing SIGNING_API_KEY and checking body.totp
  // against the author's AUTHOR_STORE KV entry via validateTotp().
  if (env.SIGNING_API_KEY) {
    const header = request.headers.get('Authorization') ?? '';
    const key = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!key || key !== env.SIGNING_API_KEY) {
      return new Response('Unauthorized', {
        status: 401,
        headers: { 'WWW-Authenticate': 'Bearer' },
      });
    }
    return null;
  }

  // TOTP auth (Phase 7) — active when SIGNING_API_KEY is not set.
  // Expects { ..., sub: "<author-id>", totp: "<6-digit-code>" } in the body.
  let body;
  try {
    body = await request.clone().json();
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }

  const { sub, totp } = body;
  if (!sub || !totp) {
    return new Response('Unauthorized — `sub` and `totp` required', { status: 401 });
  }

  const secret = await env.AUTHOR_STORE.get(`totp:${sub}`);
  if (!secret) {
    return new Response('Unauthorized — author not registered', { status: 401 });
  }

  const valid = await validateTotp(secret, totp);
  if (!valid) {
    return new Response('Unauthorized — invalid TOTP code', { status: 401 });
  }

  return null;
}

// ---------------------------------------------------------------------------
// Geo check
// ---------------------------------------------------------------------------

function checkGeo(request, env) {
  if (!env.ALLOWED_COUNTRIES) return null;

  const allowed = env.ALLOWED_COUNTRIES.split(',').map((c) => c.trim()).filter(Boolean);
  if (allowed.length === 0) return null;

  const country = request.cf?.country;
  if (!country || !allowed.includes(country)) {
    return new Response('Forbidden', { status: 403 });
  }
  return null;
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

async function checkRateLimit(request, env) {
  if (!env.RATE_LIMITER) return null;

  // Derive author identity from the Authorization header or body sub.
  const authHeader = request.headers.get('Authorization') ?? '';
  let authorId = authHeader.startsWith('Bearer ') ? 'api-key' : 'unknown';

  try {
    const body = await request.clone().json();
    if (body.sub) authorId = body.sub;
  } catch { /* ignore */ }

  const id = env.RATE_LIMITER.idFromName(authorId);
  const limiter = env.RATE_LIMITER.get(id);
  const res = await limiter.fetch(new Request('http://internal/check'));
  const { allowed, retryAfter } = await res.json();

  if (!allowed) {
    return new Response('Rate limit exceeded', {
      status: 429,
      headers: { 'Retry-After': String(retryAfter) },
    });
  }
  return null;
}
