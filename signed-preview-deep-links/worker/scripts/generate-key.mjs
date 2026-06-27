#!/usr/bin/env node
// One-time setup: generates an ECDSA P-256 key pair and prints the values
// needed to configure the worker.
//
// Usage: node scripts/generate-key.mjs
//
// Outputs:
//   1. Private key JWK  → paste when prompted by: wrangler secret put PREVIEW_PRIVATE_KEY
//   2. JWKS document    → paste as the argument to:
//                         wrangler kv:key put --binding PREVIEW_KEYS jwks '<value>'
//   3. Public key PEM   → paste into ContentPreview/JWTVerifier.publicKeyPEM
//                         if the app is still using the embedded key instead of
//                         fetching from /.well-known/jwks.json

import { webcrypto as crypto } from 'node:crypto';

const pair = await crypto.subtle.generateKey(
  { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']
);

const privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
const publicJwk  = await crypto.subtle.exportKey('jwk', pair.publicKey);
const spkiDer    = await crypto.subtle.exportKey('spki', pair.publicKey);

const jwks = {
  keys: [
    {
      kty: 'EC',
      crv: 'P-256',
      use: 'sig',
      kid: 'preview-v1',
      x: publicJwk.x,
      y: publicJwk.y,
    },
  ],
};

const pemBody = Buffer.from(spkiDer).toString('base64').replace(/(.{64})/g, '$1\n');
const publicKeyPem = `-----BEGIN PUBLIC KEY-----\n${pemBody}\n-----END PUBLIC KEY-----`;

console.log('='.repeat(72));
console.log('STEP 1 — Store private key as Worker Secret');
console.log('='.repeat(72));
console.log('Run:  wrangler secret put PREVIEW_PRIVATE_KEY');
console.log('Paste the following value when prompted:\n');
console.log(JSON.stringify(privateJwk));

console.log('\n' + '='.repeat(72));
console.log('STEP 2 — Seed JWKS into KV');
console.log('='.repeat(72));
console.log("Run:  wrangler kv:key put --binding PREVIEW_KEYS jwks '<value below>'\n");
console.log(JSON.stringify(jwks));

console.log('\n' + '='.repeat(72));
console.log('STEP 3 — App embedded public key (only if not using JWKS fetch)');
console.log('='.repeat(72));
console.log('Paste into ContentPreview/ContentPreview/JWTVerifier.publicKeyPEM:\n');
console.log(publicKeyPem);
