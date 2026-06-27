// TOTP validation (RFC 6238) using only the Web Crypto API.
// Used in Phase 7 when SIGNING_API_KEY is removed and per-author TOTP
// secrets are stored in AUTHOR_STORE KV as `totp:<author-id>`.

const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(str) {
  const s = str.toUpperCase().replace(/=+$/, '').replace(/[^A-Z2-7]/g, '');
  const bytes = [];
  let bits = 0;
  let value = 0;

  for (const char of s) {
    const idx = BASE32_CHARS.indexOf(char);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(bytes);
}

async function hotp(secretBytes, counter) {
  const key = await crypto.subtle.importKey(
    'raw', secretBytes,
    { name: 'HMAC', hash: 'SHA-1' },
    false, ['sign']
  );

  // 8-byte big-endian counter
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  // Counter fits in 32 bits for any realistic TOTP window
  view.setUint32(0, 0);
  view.setUint32(4, counter >>> 0);

  const hmac = new Uint8Array(await crypto.subtle.sign('HMAC', key, buf));
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = (
    ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3]
  ) % 1_000_000;

  return String(code).padStart(6, '0');
}

/**
 * Validate a 6-digit TOTP code against a base32-encoded secret.
 * Accepts the current 30-second window ± 1 to tolerate clock skew.
 *
 * @param {string} base32Secret  Secret stored in AUTHOR_STORE KV
 * @param {string} code          6-digit code from the author's authenticator app
 * @returns {Promise<boolean>}
 */
export async function validateTotp(base32Secret, code) {
  const secretBytes = base32Decode(base32Secret);
  const window = Math.floor(Date.now() / 30_000);

  for (const offset of [-1, 0, 1]) {
    const expected = await hotp(secretBytes, window + offset);
    if (expected === code) return true;
  }
  return false;
}

/**
 * Generate a random base32-encoded TOTP secret suitable for storage in KV
 * and display as an otpauth:// URI for authenticator app registration.
 *
 * @param {string} authorId   Used as the account label in the URI
 * @param {string} issuer     Displayed in the authenticator app
 * @returns {{ secret: string, uri: string }}
 */
export function generateTotpSecret(authorId, issuer = 'Preview Proxy') {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  const secret = Array.from(bytes)
    .map((b) => BASE32_CHARS[b >> 3] + BASE32_CHARS[(b & 0x07) << 2])
    .join('')
    .slice(0, 32);

  const uri = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(authorId)}` +
    `?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

  return { secret, uri };
}
