import { verifyJwt } from './verify.js';

const SESSION_COOKIE = '__preview-session';

/**
 * Universal Link activation endpoint: GET /preview?token=<jwt>
 *
 * On iOS/Android the OS intercepts this URL and passes it to the app via
 * onContinueUserActivity / onNewIntent — no HTTP response is consumed by
 * the app. This handler serves browser fallback users: it validates the
 * token, fetches the preview content for claims.path, sets a session cookie
 * so subsequent browser requests stay in preview, and returns the content.
 */
export async function handlePreviewActivation(request, env) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');

  if (!token) {
    return new Response('Missing token', { status: 400 });
  }

  // Full validation including jti one-time-use check.
  const claims = await verifyJwt(token, env, { checkJti: true });
  if (!claims) {
    return new Response('Invalid or expired token', { status: 401 });
  }

  // Fetch the preview content for the path the token was issued for.
  // IMPORTANT: use string concatenation — new URL(path, base) drops the base
  // path when `path` starts with '/', giving the wrong upstream URL.
  // Use the CONTENT service binding (not a public fetch) — same-zone
  // worker-to-worker fetch via hostname is blocked with Cloudflare error 1042.
  const upstreamUrl = `${env.PREVIEW_ORIGIN}${claims.path}`;
  let upstreamResponse;
  try {
    upstreamResponse = await env.CONTENT.fetch(upstreamUrl, {
      headers: { Accept: request.headers.get('Accept') ?? '*/*' },
    });
  } catch (err) {
    return new Response('Preview origin unreachable', { status: 502 });
  }

  if (!upstreamResponse.ok) {
    return new Response(
      `Preview content unavailable (upstream ${upstreamResponse.status})`,
      { status: 502, headers: { 'Content-Type': 'text/plain' } }
    );
  }

  const response = new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers: upstreamResponse.headers,
  });

  // Session cookie lets the browser stay in preview without re-presenting the URL token.
  const maxAge = claims.exp - Math.floor(Date.now() / 1000);
  response.headers.append(
    'Set-Cookie',
    `${SESSION_COOKIE}=${token}; Secure; HttpOnly; SameSite=Strict; Max-Age=${maxAge}; Path=/`
  );

  return response;
}

/**
 * General content proxy: all other paths.
 *
 * Checks for a __preview-session cookie (set by handlePreviewActivation).
 * Cookie tokens skip the jti check — the jti was consumed on first activation;
 * the cookie is the session credential for subsequent requests.
 */
export async function handleProxy(request, env) {
  const token = getSessionCookie(request);

  let usePreview = false;
  if (token) {
    const claims = await verifyJwt(token, env, { checkJti: false });
    if (claims) usePreview = true;
  }

  const url = new URL(request.url);
  const origin = usePreview ? env.PREVIEW_ORIGIN : env.LIVE_ORIGIN;
  const upstreamUrl = `${origin}${url.pathname}${url.search}`;

  // Route via the CONTENT service binding (see handlePreviewActivation note).
  return env.CONTENT.fetch(upstreamUrl, {
    method: request.method,
    headers: request.headers,
    body: request.body,
  });
}

function getSessionCookie(request) {
  const cookie = request.headers.get('Cookie') ?? '';
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return match?.[1] ?? null;
}
