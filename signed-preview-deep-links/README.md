# Signed Preview Deep Links for Native Apps

> Use short-lived ECDSA-signed JWTs delivered via custom URL scheme deep links to let
> trusted authors activate a preview content session in a native app, while regular
> users always see published live content.

## Problem

Authors publishing content via a CMS (AEM / Edge Delivery Services) need to verify
what the native mobile app will display before a page goes live. There is no safe way
to do this with a plain URL parameter — anyone who discovers the URL would get access
to draft content, and the parameter could be trivially forged or replayed indefinitely.

Regular users must always see only published content. The two audiences need separating
without separate app builds, server-side feature flags, or a second login flow.

## Solution

- **Custom URL scheme deep link** (`myapp://home?token=<jwt>`) registered in the app's
  Info.plist via `CFBundleURLTypes`, wired to Xcode's `INFOPLIST_FILE` build setting so
  the scheme is included in the auto-generated Info.plist at build time.
- **JWT signed with ECDSA P-256 (ES256)**. The private key lives only in author tooling
  (`tools/preview-private.pem`, gitignored). The app holds only the public key — enough
  to verify, impossible to forge with.
- **Claims lock down scope**: `path` (token is only valid for one page), `exp` (expiry
  timestamp, covered by signature so it cannot be extended), `sub` (author identity).
- **Session activation**: on a valid link open the app sets an in-memory `previewActive`
  flag for the lifetime of that app session. Closing the app resets to live content.
  No persistence to disk.
- **Public key discovery via JWKS** at `https://<content-domain>/.well-known/jwks.json`
  (RFC 7517). App fetches and caches per session. Key rotation requires only updating
  the JWKS document — no app release needed.
- **Asymmetric signing was chosen over HMAC** because a shared secret embedded in the
  binary can be extracted via reverse engineering; with asymmetric keys only the useless
  public half is in the binary.

## JWT Structure

A JWT is three base64url-encoded segments joined by `.`:

```
base64url(header) . base64url(payload) . base64url(signature)
```

The signature covers the first two segments exactly as they appear in the URL — any
modification to header or payload invalidates it.

### Header

```json
{
  "alg": "ES256",
  "typ": "JWT",
  "kid": "preview-v1"
}
```

`kid` (key ID) is important and should not be omitted. The JWKS endpoint returns an
array of keys; during rotation there will be two active simultaneously (old and new).
`kid` tells the verifier exactly which entry to select, rather than trying each key
in sequence until one validates. A simple versioned string (`preview-v1`, `preview-v2`)
is sufficient — it does not need to be a key fingerprint or hash.

### Payload

```json
{
  "sub": "author@example.com",
  "path": "/digi2/home",
  "src": "page",
  "iat": 1780614662,
  "exp": 1780618262
}
```

| Claim  | Purpose |
|--------|---------|
| `sub`  | Author identity — useful for audit; not used in verification logic |
| `path` | Content path the token is valid for — app must validate this explicitly |
| `src`  | Content source to activate (`page` = preview, `live` = published) |
| `iat`  | Issued-at (Unix epoch) — informational; not independently enforced |
| `exp`  | Expiry (Unix epoch) — enforced by app; covered by signature so cannot be changed |

### Signature

64 bytes: raw R‖S concatenation (IEEE P1363 format), **not** DER-encoded.
This is the format required by both iOS CryptoKit and Android's
`SHA256withECDSAinP1363Format` — the signing tool must produce this format explicitly.

### JWKS entry

Each key in `/.well-known/jwks.json` follows RFC 7517:

```json
{
  "keys": [
    {
      "kty": "EC",
      "crv": "P-256",
      "use": "sig",
      "kid": "preview-v1",
      "x": "<base64url x-coordinate>",
      "y": "<base64url y-coordinate>"
    }
  ]
}
```

During rotation, add the new key and leave the old one until its tokens have all
expired (i.e. at most one TTL window after switching signing to the new key).

---

## Considerations

- **No revocation**: tokens are valid until `exp`. Short TTL (30–60 min) is the
  mitigation. If immediate revocation is needed, add a lightweight server-side check on
  link open — at the cost of a network round-trip and an always-on endpoint.
- **Key rotation** is operationally simple (update JWKS, retire old key after its
  tokens expire) but requires distributing a new private key to all signing parties
  out-of-band.
- **Path scoping** prevents a token for `/home` unlocking `/products`, but the app must
  validate this claim explicitly — it is not enforced by the JWT library.
- **iOS verification**: `CryptoKit.P256.Signing` — no third-party dependency needed.
  `P256.Signing.ECDSASignature(rawRepresentation:)` accepts the raw R‖S bytes directly.
  `publicKey.isValidSignature(_:for:)` hashes with SHA-256 internally.
- **Android verification**: `java.security.Signature.getInstance("SHA256withECDSAinP1363Format")`
  (API 23+ / Android 6.0) accepts the same raw R‖S bytes without any conversion.
  Load the public key via `KeyFactory.getInstance("EC").generatePublic(X509EncodedKeySpec(derBytes))`
  where `derBytes` is the base64-decoded body of the PEM. No third-party library needed
  if targeting API 23+; for older targets use BouncyCastle or convert R‖S → DER manually.
- **Android deep link registration**: add an `<intent-filter>` in `AndroidManifest.xml`:
  ```xml
  <intent-filter>
      <action android:name="android.intent.action.VIEW" />
      <category android:name="android.intent.category.DEFAULT" />
      <category android:name="android.intent.category.BROWSABLE" />
      <data android:scheme="myapp" android:host="home" />
  </intent-filter>
  ```
  Handle the intent in `Activity.onCreate` and `onNewIntent` via `intent.data`.
- **The JWT token itself is platform-agnostic** — the same URL works on both iOS and
  Android. Only the verification code and deep link registration differ per platform.
- **Xcode build setup gotcha**: `GENERATE_INFOPLIST_FILE = YES` auto-generates the
  Info.plist from `INFOPLIST_KEY_*` settings. Adding a supplemental `INFOPLIST_FILE`
  causes Xcode to merge the two — so the URL scheme plist only needs the
  `CFBundleURLTypes` key. The file must NOT be in the Resources build phase.

## Findings

- The end-to-end pattern (sign → deep link → validate → session) is clean and requires
  no backend service to operate. The only infrastructure needed is the JWKS endpoint on
  the content domain, which already serves static JSON.
- For a web-based signing tool, the Web Crypto API (`SubtleCrypto.sign` with ECDSA /
  SHA-256) can replace the Node CLI entirely, keeping the private key in browser
  `IndexedDB` and tying generation to an authenticated IMS session — the preferred
  long-term path.
- JWT ES256 + CryptoKit on iOS is a zero-dependency implementation: base64url decode,
  `P256.Signing.ECDSASignature(rawRepresentation:)`, `publicKey.isValidSignature(_:for:)`
  (hashes SHA-256 internally). About 50 lines of Swift.
- Both iOS (`CryptoKit`) and Android (`java.security`, API 23+) can verify ES256 with
  raw R‖S signatures without any third-party JWT library — the token format is a thin
  wrapper around a standard ECDSA signature and base64url encoding.
- **Session `previewActive` flag — iOS**: store as a `@Published` property on an
  `ObservableObject` held in memory (e.g. via `@StateObject` at the root view). It lives
  only for the process lifetime — no `UserDefaults` or keychain write. The flag is set
  in the `onOpenURL` / `onContinueUserActivity` handler after successful JWT verification.
- **Session `previewActive` flag — Android**: store as a property on an
  `Application`-scoped object (a Kotlin `object` singleton or an `AndroidViewModel`
  retained at the `Application` level). Set it in the `Activity.onCreate` /
  `onNewIntent` handler after verification. Scoped to the process; cleared on app
  restart. Avoid `SharedPreferences` — persistence across sessions is not the intent.

---

*Captured: 2026-06-05*
*Source project: cpilsworth/nedp (hlxsites/nedp, app/ContentPreview)*
