# Implementation Plan — Preview Proxy Worker

Phased delivery from a working end-to-end skeleton to a production-ready
worker. Each phase produces a testable, deployable increment.

---

## Phase 1 — Worker scaffold

Set up the Cloudflare Worker project alongside the existing repo.

- [ ] Initialise a new Worker project under `worker/` using Wrangler:
      `npm create cloudflare@latest worker -- --type=javascript`
- [ ] Configure `wrangler.toml`:
  - Worker name
  - KV namespace bindings: `PREVIEW_KEYS`, `JTI_STORE`, `AUTHOR_STORE`
  - Environment variable stubs: `PREVIEW_ORIGIN`, `LIVE_ORIGIN`,
    `CONTENT_DOMAIN`, `APP_BUNDLE_ID`, `ANDROID_PACKAGE`,
    `ANDROID_CERT_FINGERPRINT`, `ALLOWED_COUNTRIES`
- [ ] Add a basic request router (URL pattern matching, no logic yet)
- [ ] Add a `GET /healthz` route that returns 200 — confirms the worker deploys
      and routes correctly
- [ ] Deploy to a `dev` environment and verify with `curl`

**Deliverable**: deployed worker that routes requests and returns 200 on `/healthz`.

---

## Phase 2 — Key management and discovery endpoints

The worker generates, stores, and exposes the signing key. This is the
foundation everything else builds on.

- [ ] Write a one-time key generation script (`worker/scripts/generate-key.mjs`)
  that:
  - Generates an ECDSA P-256 key pair using Node WebCrypto
  - Prints the private key JWK (to store as `PREVIEW_PRIVATE_KEY` secret)
  - Prints the JWKS document (to seed `PREVIEW_KEYS` KV)
- [ ] Store the private key: `wrangler secret put PREVIEW_PRIVATE_KEY`
- [ ] Seed the JWKS KV entry: `wrangler kv:key put --binding PREVIEW_KEYS jwks '<json>'`
- [ ] Implement `GET /.well-known/jwks.json` — reads from `PREVIEW_KEYS` KV,
      returns with `Cache-Control: max-age=3600`
- [ ] Implement `GET /.well-known/apple-app-site-association` — builds response
      from `APP_BUNDLE_ID` env var
- [ ] Implement `GET /.well-known/assetlinks.json` — builds response from
      `ANDROID_PACKAGE` and `ANDROID_CERT_FINGERPRINT` env vars
- [ ] Verify AASA with [Apple's validation tool](https://developer.apple.com/news/?id=q3c9n4zv)
- [ ] Update `tools/sign-preview.mjs` to fetch the public key from the worker's
      JWKS endpoint instead of reading `preview-public.pem`

**Deliverable**: worker serves JWKS, AASA, and assetlinks. Public key is hosted,
not in the repo.

---

## Phase 3 — JWT signing endpoint (API key auth)

End-to-end token minting through the worker. API key auth is the simplest
starting point — replace with TOTP in Phase 7.

- [ ] Store a signing API key: `wrangler secret put SIGNING_API_KEY`
- [ ] Implement `POST /api/sign`:
  - Validate `Authorization: Bearer <key>` against `SIGNING_API_KEY`
  - Parse and validate request body (`path`, `ttlMinutes`, `sub`)
  - Import `PREVIEW_PRIVATE_KEY` via `crypto.subtle.importKey`
  - Build header and payload, generate `jti` (UUID v4 via `crypto.randomUUID()`)
  - Sign with `crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, ...)`
  - Return `{ token, universalLink, expiresAt }`
- [ ] Update `tools/sign-preview.mjs` to call `POST /api/sign` instead of
      signing locally — private key moves entirely to the worker
- [ ] Smoke test: mint a token via CLI, verify it manually with the existing
      `JWTVerifier` Swift unit tests

**Deliverable**: tokens are minted server-side. The CLI no longer holds a
private key.

---

## Phase 4 — Content proxy with JWT validation

The worker routes content requests to preview or live origin based on token
validity.

- [ ] Implement JWT verification helper:
  - Base64url decode header and payload
  - Fetch public key from `PREVIEW_KEYS` KV
  - Import via `crypto.subtle.importKey('jwk', ...)`
  - Verify signature: `crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, ...)`
  - Decode and return claims
- [ ] Implement `GET /preview` and `GET /preview/*` handler:
  - Extract token from `?token=` query param or `__preview-session` cookie
  - Validate signature, `exp`, and `path` claim against request pathname
  - On valid token: proxy to `PREVIEW_ORIGIN`
  - On missing / invalid token: proxy to `LIVE_ORIGIN`
  - Strip the `token` query param before forwarding to origin
- [ ] Test with a real token from Phase 3 — verify preview content is returned
- [ ] Test with no token — verify live content is returned
- [ ] Test with an expired token — verify fallback to live

**Deliverable**: the worker correctly gates preview content behind a valid JWT.

---

## Phase 5 — jti one-time-use enforcement

Prevents a forwarded token from being activated on a second device.

- [ ] On each validated content request, check `JTI_STORE` KV for the `jti`
      claim — return 401 if already present
- [ ] On first valid use, write `jti:<value>` to `JTI_STORE` with TTL =
      `claims.exp - Math.floor(Date.now() / 1000)`
- [ ] Add `jti` (UUID v4) to the JWT payload in the signing endpoint
      (already included from Phase 3 — confirm it is present)
- [ ] Test replay: use the same token twice — second request should fail
- [ ] Test expiry: confirm KV entry is absent after the token's `exp`

**Deliverable**: each token is single-use. Forwarded links cannot activate
preview on a second device after first use.

---

## Phase 6 — iOS app: Universal Links

Replace the custom scheme with a Universal Link. JWT verification is
unchanged.

- [ ] Enable the `Associated Domains` capability in the Xcode project:
      `applinks:<content-domain>`
- [ ] Add `onContinueUserActivity(NSUserActivityTypeBrowsingWeb)` handler in
      `ContentView.swift` alongside the existing `onOpenURL`
- [ ] Extract token from `activity.webpageURL` query parameters and call
      `viewModel.applyPreviewToken(_:)` — identical to the existing handler
- [ ] Keep `onOpenURL` and the custom scheme registration for simulator testing
- [ ] Update `tools/sign-preview.mjs` `--open` flag to use the HTTPS Universal
      Link URL rather than `myapp://` (on real device; keep custom scheme for
      simulator)
- [ ] Test on a real device: mint a token via CLI, tap the Universal Link in
      Messages — confirm the app opens directly without the "Open in app?"
      prompt

**Deliverable**: authors tap an HTTPS link; iOS opens the app directly.

---

## Phase 7 — TOTP authentication

Replace the shared API key with per-author TOTP secrets.

- [ ] Implement `GET /author/register?id=<author-id>` (admin-only, protected by
      `SIGNING_API_KEY`):
  - Generate a random 20-byte TOTP secret
  - Store as `totp:<author-id>` in `AUTHOR_STORE` KV
  - Return the secret encoded as a `otpauth://` URI and as a base32 string
    for manual entry
- [ ] Implement TOTP validation helper:
  - `HMAC-SHA1` via `crypto.subtle.sign({ name: 'HMAC', hash: 'SHA-1' }, ...)`
  - Generate expected codes for `now`, `now - 30s`, `now + 30s`
  - Accept if any window matches
- [ ] Update `POST /api/sign` to accept `{ ..., "totp": "123456" }` and
      validate against the stored secret for the given `sub`
- [ ] Remove `SIGNING_API_KEY` dependency from the signing endpoint
- [ ] Register each author via the registration endpoint; provide QR code
      (encode the `otpauth://` URI using a simple KV-fetched JS library or
      generate the QR server-side as SVG)
- [ ] Test: generate a TOTP code from an authenticator app, mint a token —
      confirm success; test with wrong code — confirm 401

**Deliverable**: per-author TOTP auth. Revoke an author by deleting their KV
entry.

---

## Phase 8 — Session cookie and web UI

Browser-based preview activation without the CLI.

- [ ] Implement a minimal `/author` HTML page served inline by the worker:
  - A form with path, TTL, sub fields
  - A button to generate a Universal Link and display as a clickable link
    and QR code (use a dependency-free QR library inlined as a base64 data URI
    or generated server-side as SVG)
  - TOTP code input for authentication
- [ ] On successful `POST /api/sign` from the web UI, issue a
      `__preview-session` cookie (HttpOnly, Secure, SameSite=Strict,
      Max-Age=3600)
- [ ] Update the content proxy (Phase 4) to also accept the session cookie as
      a token source for browser-based preview
- [ ] The session cookie JWT uses `aud: web-session` to distinguish it from
      app tokens — validate `aud` appropriately in each handler

**Deliverable**: authors can mint tokens in the browser without the CLI.
Browser also enters preview mode directly via the session cookie.

---

## Phase 9 — Rate limiting

Protect the signing endpoint against token flooding.

- [ ] Create a `RateLimiter` Durable Object class:
  - State: `{ count, windowStart }` stored in DO storage
  - Method `check(limit, windowSeconds)` — returns `{ allowed, retryAfter }`
- [ ] Register `RateLimiter` in `wrangler.toml`
- [ ] In `POST /api/sign`: derive an author ID from the credential (TOTP `sub`
      or API key identity), get the DO by author ID, call `check(10, 60)`
- [ ] Return HTTP 429 with `Retry-After` header on limit exceeded
- [ ] Test: exceed 10 requests in 60 seconds — confirm 429; wait for window
      reset — confirm requests are accepted again

**Deliverable**: per-author signing rate limit enforced at the worker.

---

## Phase 10 — Geo controls

Restrict token minting to requests from the publishing org's countries.

- [ ] Add `ALLOWED_COUNTRIES` environment variable to `wrangler.toml`
      (comma-separated ISO 3166-1 alpha-2 codes, e.g. `GB,IE,US`)
- [ ] In `POST /api/sign`: check `request.cf?.country` against the allowlist —
      return 403 if not present or not in list
- [ ] If `ALLOWED_COUNTRIES` is not set, skip the check (no restriction)
- [ ] Test from an allowed country — confirm success
- [ ] Test with a spoofed `CF-IPCountry` header — confirm Cloudflare's value
      takes precedence (it does; the header cannot be overridden by clients)

**Deliverable**: signing endpoint is restricted to configured countries.

---

## Phase 11 — Passkey authentication *(optional)*

Upgrade TOTP to hardware-bound, phishing-resistant Passkey auth.

- [ ] Implement WebAuthn registration flow on `/author`:
  - `GET /author/register/challenge` — generate and store a random challenge
    in KV (2-minute TTL), return it
  - `POST /author/register` — verify attestation, store credential public key
    in `AUTHOR_STORE` as `passkey:<credential-id>`
- [ ] Implement WebAuthn authentication flow:
  - `GET /author/challenge` — new challenge in KV
  - `POST /author/session` — verify assertion against stored public key, issue
    session cookie on success
- [ ] WebAuthn verification uses `crypto.subtle.verify` (P-256 or RS256
      depending on authenticator) — implement for both key types
- [ ] Add `navigator.credentials.create` / `get` calls to the `/author` HTML
      (no external library — use the raw WebAuthn API)
- [ ] Retire TOTP as the primary auth method; keep as fallback for devices
      without Passkey support

**Deliverable**: authors authenticate with a biometric or hardware key.
No password or TOTP code is transmitted.

---

## Phase 12 — Android app *(if in scope)*

- [ ] Add `autoVerify` intent filter to `AndroidManifest.xml` for
      `https://<content-domain>/preview`
- [ ] Implement `handleIntent` in main `Activity` — extract token from
      `intent.data` and call `viewModel.applyPreviewToken(token)`
- [ ] Implement `JWTVerifier` in Kotlin:
  - Base64url decode
  - `Signature.getInstance("SHA256withECDSAinP1363Format")`
  - Load public key via `KeyFactory.getInstance("EC").generatePublic(X509EncodedKeySpec(...))`
  - Validate `exp` and `path` claims
- [ ] Fetch public key from `/.well-known/jwks.json` at session start; cache
      in memory
- [ ] Obtain correct Play App Signing fingerprint from Play Console and add
      to `ANDROID_CERT_FINGERPRINT` env var
- [ ] Test via ADB: `adb shell am start -W -a android.intent.action.VIEW -d "<url>" <package>`

**Deliverable**: Android app verifies and activates preview from the same
Universal Link URL as iOS.

---

## Testing checklist

| Scenario | Expected |
|---|---|
| Valid token, correct path | Preview content served |
| Valid token, wrong path | Live content served |
| Expired token | Live content served |
| Token replayed (jti seen) | 401 |
| No token | Live content served |
| Invalid signature | Live content served |
| `POST /api/sign`, correct TOTP | JWT returned |
| `POST /api/sign`, wrong TOTP | 401 |
| `POST /api/sign`, rate exceeded | 429 + Retry-After |
| `POST /api/sign`, disallowed country | 403 |
| Universal Link tapped (real device) | App opens, no prompt |
| Universal Link tapped (app not installed) | Falls through to browser |
| AASA served correctly | Apple validation tool passes |

---

## Delivery order summary

| Phase | Output |
|---|---|
| 1 | Worker scaffold deployed |
| 2 | JWKS, AASA, assetlinks served |
| 3 | Server-side token minting via CLI |
| 4 | Content gated behind JWT |
| 5 | One-time-use enforcement |
| 6 | iOS Universal Links (no prompt) |
| 7 | Per-author TOTP auth |
| 8 | Browser signing UI + session cookie |
| 9 | Rate limiting |
| 10 | Geo controls |
| 11 | Passkey auth *(optional)* |
| 12 | Android *(if in scope)* |

Phases 1–6 deliver the core end-to-end flow. Phases 7–10 harden it.
Phases 11–12 are independent extensions.
