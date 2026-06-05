// Author tooling: mint a signed preview deep link.
//
//   node tools/sign-preview.mjs [path] [ttlMinutes] [--open] [--device=<udid>]
//
// Generates (or reuses) an ECDSA P-256 key pair, signs an ES256 JWT scoped to
// `path`, and prints the `myapp://` deep link. The private key is written to
// tools/preview-private.pem (gitignored); the matching public key is printed
// so it can be pasted into the app's JWTVerifier.
//
//   --open            open the link straight into the simulator via
//                     `xcrun simctl openurl` (tap "Open" on the prompt)
//   --device=<udid>   target a specific simulator (default: booted)
//
// WebCrypto's ECDSA sign returns a raw r‖s signature — exactly what Swift's
// P256.Signing.ECDSASignature(rawRepresentation:) expects.

import { webcrypto as crypto } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const PRIVATE_PEM = join(here, 'preview-private.pem');
const PUBLIC_PEM = join(here, 'preview-public.pem');

const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith('--'));
const positional = args.filter((a) => !a.startsWith('--'));
const shouldOpen = flags.includes('--open');
const device = (flags.find((f) => f.startsWith('--device='))?.split('=')[1]) ?? 'booted';

const path = positional[0] ?? '/digi2/home';
const ttlMinutes = Number(positional[1] ?? 60);

const b64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const pemToDer = (pem) =>
  Buffer.from(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''), 'base64');

const derToPem = (der, label) => {
  const b64 = Buffer.from(der).toString('base64').replace(/(.{64})/g, '$1\n');
  return `-----BEGIN ${label}-----\n${b64}\n-----END ${label}-----\n`;
};

async function loadOrCreateKeys() {
  if (existsSync(PRIVATE_PEM) && existsSync(PUBLIC_PEM)) {
    const privateKey = await crypto.subtle.importKey(
      'pkcs8', pemToDer(readFileSync(PRIVATE_PEM, 'utf8')),
      { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    const publicPem = readFileSync(PUBLIC_PEM, 'utf8');
    return { privateKey, publicPem, created: false };
  }
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const privDer = await crypto.subtle.exportKey('pkcs8', pair.privateKey);
  const pubDer = await crypto.subtle.exportKey('spki', pair.publicKey);
  const publicPem = derToPem(pubDer, 'PUBLIC KEY');
  writeFileSync(PRIVATE_PEM, derToPem(privDer, 'PRIVATE KEY'), { mode: 0o600 });
  writeFileSync(PUBLIC_PEM, publicPem);
  return { privateKey: pair.privateKey, publicPem, created: true };
}

const { privateKey, publicPem, created } = await loadOrCreateKeys();

const header = { alg: 'ES256', typ: 'JWT', kid: 'preview-v1' };
const now = Math.floor(Date.now() / 1000);
const payload = {
  sub: 'author@example.com',
  path,
  src: 'page',
  iat: now,
  exp: now + ttlMinutes * 60,
};

const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
const sig = await crypto.subtle.sign(
  { name: 'ECDSA', hash: 'SHA-256' }, privateKey, Buffer.from(signingInput));
const token = `${signingInput}.${b64url(sig)}`;
const deepLink = `myapp://home?token=${token}`;

if (created) {
  console.log('Generated a new key pair (private key saved to tools/preview-private.pem).');
  console.log('\n>>> Paste this PUBLIC KEY into JWTVerifier.publicKeyPEM:\n');
  console.log(publicPem);
}
console.log(`path:    ${path}`);
console.log(`expires: ${new Date(payload.exp * 1000).toISOString()} (${ttlMinutes} min)`);
console.log(`\nDEEP LINK:\n${deepLink}`);

if (shouldOpen) {
  try {
    execFileSync('xcrun', ['simctl', 'openurl', device, deepLink], { stdio: 'inherit' });
    console.log(`\nOpened on simulator "${device}". Tap "Open" if prompted.`);
  } catch (err) {
    console.error(`\nFailed to open on simulator "${device}": ${err.message}`);
    console.error('Is a simulator booted? Try `xcrun simctl list devices booted`.');
    process.exit(1);
  }
}
