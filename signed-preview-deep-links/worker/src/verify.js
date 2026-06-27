// JWT verification using the Web Crypto API. No third-party dependencies.

function b64urlDecode(str) {
  let s = str.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const binary = atob(s);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Verify an ES256 JWT.
 *
 * @param {string} token
 * @param {object} env         Worker env bindings (PREVIEW_KEYS, JTI_STORE)
 * @param {object} [opts]
 * @param {boolean} [opts.checkJti=true]  When true, enforce one-time use via KV.
 * @returns {object|null}  Decoded claims, or null if invalid.
 */
export async function verifyJwt(token, env, { checkJti = true } = {}) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, encodedSig] = parts;

  // Decode header to get kid
  let header;
  try {
    header = JSON.parse(new TextDecoder().decode(b64urlDecode(encodedHeader)));
  } catch {
    return null;
  }
  if (header.alg !== 'ES256') return null;

  // Load matching public key from KV
  const jwksRaw = await env.PREVIEW_KEYS.get('jwks');
  if (!jwksRaw) return null;

  let jwks;
  try {
    jwks = JSON.parse(jwksRaw);
  } catch {
    return null;
  }

  const jwk = jwks.keys.find((k) => k.kid === header.kid) ?? jwks.keys[0];
  if (!jwk) return null;

  let publicKey;
  try {
    publicKey = await crypto.subtle.importKey(
      'jwk', jwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false, ['verify']
    );
  } catch {
    return null;
  }

  // Verify signature over "header.payload"
  const signingInput = new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`);
  const sigBytes = b64urlDecode(encodedSig);

  let valid;
  try {
    valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      sigBytes,
      signingInput
    );
  } catch {
    return null;
  }
  if (!valid) return null;

  // Decode claims
  let claims;
  try {
    claims = JSON.parse(new TextDecoder().decode(b64urlDecode(encodedPayload)));
  } catch {
    return null;
  }

  // Check expiry
  if (claims.exp < Math.floor(Date.now() / 1000)) return null;

  // One-time-use check via jti KV entry
  if (checkJti && claims.jti) {
    const jtiKey = `jti:${claims.jti}`;
    const used = await env.JTI_STORE.get(jtiKey);
    if (used) return null;

    const ttl = claims.exp - Math.floor(Date.now() / 1000);
    if (ttl > 0) {
      await env.JTI_STORE.put(jtiKey, '1', { expirationTtl: ttl });
    }
  }

  return claims;
}
