# Preview Proxy Worker

A Cloudflare Worker that fronts the content domain and owns the full preview
activation lifecycle — key management, token signing, Universal Link / App Link
discovery, content proxying, and session management — with no dependency on
external identity providers.

---

## Architecture

```
Author (browser / CLI)
  │
  ├── POST /api/sign ──── auth (API key / TOTP / Passkey) ──► Worker
  │                                                            mints JWT
  │   ◄── { token, universalLink: "https://domain/preview?token=..." } ──
  │
  ├── QR code or Universal Link delivered to device
  │
  │
iOS / Android app
  │
  ├── taps Universal Link ──────────────────────────────────► Worker
  │                                                            validates JWT
  │                                                            checks jti (KV)
  │                                                            proxies to origin
  │   ◄── preview content (from AEM preview origin) ──────────
  │
  └── onContinueUserActivity / onNewIntent sets previewPaths


Regular user
  │
  └── requests content-domain.com/* ─────────────────────────► Worker
                                                                no token → live
      ◄── published content (from AEM live origin) ────────────
```

---

## Worker responsibilities

| Concern | Owned by worker |
|---|---|
| ECDSA key pair generation and storage | ✓ |
| JWKS public key endpoint | ✓ |
| Apple App Site Association | ✓ |
| Digital Asset Links (Android) | ✓ |
| JWT minting (signing endpoint) | ✓ |
| Author authentication | ✓ (API key / TOTP / Passkey) |
| JWT validation on content requests | ✓ |
| jti one-time-use enforcement | ✓ (KV) |
| Preview vs live content routing | ✓ |
| Preview session cookie (web) | ✓ |
| Rate limiting on signing endpoint | ✓ (Durable Objects) |
| Geo / IP controls on signing endpoint | ✓ (request.cf) |
| App-side JWT verification | app (CryptoKit / java.security) |
| AEM preview and live content | AEM origins |

---

## Cloudflare resources

### Worker Secrets

| Secret | Purpose |
|---|---|
| `PREVIEW_PRIVATE_KEY` | ECDSA P-256 private key in JWK format — never exposed outside the worker |
| `SIGNING_API_KEY` | Shared secret for API key auth mode |

### KV namespaces

| Binding | Purpose | Key pattern | TTL |
|---|---|---|---|
| `PREVIEW_KEYS` | JWKS document (public key) | `jwks` | None |
| `JTI_STORE` | Consumed JWT IDs (one-time-use) | `jti:<uuid>` | Matching `exp` |
| `AUTHOR_STORE` | TOTP secrets / Passkey credentials per author | `totp:<id>`, `passkey:<id>` | None |

### Durable Objects

| Class | Purpose |
|---|---|
| `RateLimiter` | Per-author signing rate limit (e.g. 10 tokens per 60 s) |

### Environment variables

| Variable | Example |
|---|---|
| `PREVIEW_ORIGIN` | `https://preview.author.aem.cloud` |
| `LIVE_ORIGIN` | `https://live.aem.cloud` |
| `CONTENT_DOMAIN` | `content-domain.com` |
| `APP_BUNDLE_ID` | `<TeamID>.<BundleID>` |
| `ANDROID_PACKAGE` | `com.example.contentpreview` |
| `ANDROID_CERT_FINGERPRINT` | `AA:BB:CC:...` |

---

## Endpoints

### `GET /.well-known/jwks.json`

Returns the public key for app-side JWT verification (RFC 7517). Served from
KV. Updated on key rotation.

```json
{
  "keys": [
    {
      "kty": "EC",
      "crv": "P-256",
      "use": "sig",
      "kid": "preview-v1",
      "x": "<base64url>",
      "y": "<base64url>"
    }
  ]
}
```

### `GET /.well-known/apple-app-site-association`

Enables iOS Universal Links. The `appIDs` value is read from the
`APP_BUNDLE_ID` environment variable.

```json
{
  "applinks": {
    "details": [
      {
        "appIDs": ["<APP_BUNDLE_ID>"],
        "components": [
          {
            "/": "/preview",
            "?": { "token": "?*" }
          }
        ]
      }
    ]
  }
}
```

### `GET /.well-known/assetlinks.json`

Enables Android App Links. Values read from `ANDROID_PACKAGE` and
`ANDROID_CERT_FINGERPRINT`.

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "<ANDROID_PACKAGE>",
      "sha256_cert_fingerprints": ["<ANDROID_CERT_FINGERPRINT>"]
    }
  }
]
```

### `POST /api/sign`

Mints a signed JWT and returns the Universal Link. Requires authentication
(see Auth section). Subject to rate limiting and optional geo restriction.

**Request**
```json
{ "path": "/digi2/home", "ttlMinutes": 60, "sub": "author@example.com" }
```

**Response**
```json
{
  "token": "<jwt>",
  "universalLink": "https://content-domain.com/preview?token=<jwt>",
  "expiresAt": "2026-06-06T14:00:00Z"
}
```

**Error responses**

| Status | Condition |
|---|---|
| 401 | Missing or invalid auth credential |
| 429 | Rate limit exceeded |
| 403 | Request origin outside allowed geo |

### `GET /preview` and `GET /preview/*`

Proxies the request to the AEM preview origin if a valid token is present
(query param or session cookie), otherwise proxies to the live origin.

Token sources checked in order:
1. `?token=<jwt>` query parameter
2. `__preview-session` cookie

Validation steps:
1. Decode and verify ECDSA signature against public key
2. Check `exp` claim
3. Check `path` claim matches request pathname
4. Check `jti` not already consumed in KV

On first valid use: write `jti` to KV with TTL = `exp - now`.

### `GET /author` *(optional web UI)*

A minimal HTML page served by the worker for browser-based token minting.
Authenticates via Passkey (WebAuthn) and provides a form to generate a
Universal Link / QR code. No external framework or CDN dependency — all
assets inlined.

---

## JWT structure

Identical to the existing baseline. The worker signs using the same ES256
format the iOS and Android apps already verify.

**Header**
```json
{ "alg": "ES256", "typ": "JWT", "kid": "preview-v1" }
```

**Payload**
```json
{
  "sub": "author@example.com",
  "path": "/digi2/home",
  "src": "page",
  "jti": "<uuid-v4>",
  "iat": 1780614662,
  "exp": 1780618262
}
```

The `jti` claim is new relative to the baseline. No other claim changes.
App-side verification code is unchanged.

---

## Author authentication

Three modes, selectable by environment configuration. API key is the default
for an initial deployment; TOTP or Passkey can replace it without changing
the signing endpoint's interface.

### API key

`SIGNING_API_KEY` stored in Worker Secrets. Caller sends:

```
Authorization: Bearer <key>
```

Suitable for CLI tooling and small teams. Individual revocation requires
issuing per-author keys (multiple values stored as a JSON array in the secret).

### TOTP

Per-author TOTP secret stored in `AUTHOR_STORE` KV. Author registers once
by scanning a QR displayed at `/author/register`. Caller sends:

```json
{ "path": "...", "ttlMinutes": 60, "sub": "...", "totp": "123456" }
```

The worker validates the TOTP using HMAC-SHA1 via the Web Crypto API. Accepts
the current window ± 1 (30-second tolerance). Individual revocation by deleting
the KV entry for that author.

### Passkey (WebAuthn)

Author registers a device-bound passkey (Face ID / Touch ID / hardware key)
via the `/author` web page. The passkey public key is stored in `AUTHOR_STORE`.

On each signing session:
1. `GET /author/challenge` — worker generates and returns a random challenge,
   stores it in KV with a 2-minute TTL
2. Browser calls `navigator.credentials.get()` — signs the challenge
3. `POST /author/session` — worker verifies the assertion, issues a
   `__preview-session` cookie (HttpOnly, Secure, SameSite=Strict, 1-hour TTL)
4. Author uses the signing form; requests carry the session cookie

Passkeys are hardware-bound and phishing-resistant. No password or shared
secret is transmitted.

---

## Preview session cookie (web)

After successful Passkey or TOTP auth, the worker issues a signed cookie
alongside the app JWT. This enables browser-based preview on the same domain
without a separate token:

```
Set-Cookie: __preview-session=<signed-token>; Secure; HttpOnly;
            SameSite=Strict; Max-Age=3600; Path=/
```

The cookie value is a short-lived JWT signed with the same worker key, with
`aud: web-session` to distinguish it from app tokens. On content requests,
the worker accepts either the URL token or the cookie.

---

## Rate limiting

A Durable Object (`RateLimiter`) enforces a per-author sliding window on
`POST /api/sign`. Default: 10 tokens per 60 seconds. Exceeding the limit
returns HTTP 429 with a `Retry-After` header.

```
Author ID → RateLimiter DO → check window → allow / deny
```

Author ID is derived from the authenticated credential (API key identity,
TOTP KV key, or Passkey credential ID).

---

## Geo / IP controls

Applied to `POST /api/sign` only — content delivery is unrestricted.
Cloudflare provides country and ASN data on every request with no additional
configuration:

```js
const country = request.cf?.country;
if (!ALLOWED_COUNTRIES.includes(country)) {
  return new Response('Forbidden', { status: 403 });
}
```

`ALLOWED_COUNTRIES` is set as an environment variable (comma-separated ISO
codes). Not set = no geo restriction.

---

## Key rotation

1. Generate a new key pair (via a protected `/admin/rotate-key` endpoint or
   `wrangler secret put`)
2. Add the new public key to JWKS with a new `kid` (`preview-v2`) alongside
   the existing entry — both keys are valid during the transition window
3. Update `PREVIEW_PRIVATE_KEY` secret — new tokens are signed with the new key
4. Wait for all `preview-v1` tokens to expire (at most one TTL window)
5. Remove the old key from JWKS

No app release is required. The app fetches JWKS per session and selects the
key by `kid`.

---

## iOS app changes

The JWT verification and session state management are unchanged. Two additions:

**Associated Domains entitlement**

```
applinks:<content-domain>
```

**Universal Link handler** (alongside the existing `onOpenURL` for simulator
fallback)

```swift
.onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
    guard let url = activity.webpageURL,
          let token = URLComponents(url: url, resolvingAgainstBaseURL: false)?
              .queryItems?.first(where: { $0.name == "token" })?.value
    else { return }
    viewModel.applyPreviewToken(token)
}
```

---

## Android app changes

**`AndroidManifest.xml`** intent filter with `autoVerify`:

```xml
<intent-filter android:autoVerify="true">
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data
        android:scheme="https"
        android:host="content-domain.com"
        android:pathPrefix="/preview" />
</intent-filter>
```

**Intent handler** in `onCreate` / `onNewIntent`:

```kotlin
private fun handleIntent(intent: Intent) {
    if (intent.action == Intent.ACTION_VIEW) {
        val token = intent.data?.getQueryParameter("token") ?: return
        viewModel.applyPreviewToken(token)
    }
}
```
