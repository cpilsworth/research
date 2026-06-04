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

## Considerations

- **No revocation**: tokens are valid until `exp`. Short TTL (30–60 min) is the
  mitigation. If immediate revocation is needed, add a lightweight server-side check on
  link open — at the cost of a network round-trip and an always-on endpoint.
- **Key rotation** is operationally simple (update JWKS, retire old key after its
  tokens expire) but requires distributing a new private key to all signing parties
  out-of-band.
- **Path scoping** prevents a token for `/home` unlocking `/products`, but the app must
  validate this claim explicitly — it is not enforced by the JWT library.
- **iOS-specific**: `CryptoKit.P256.Signing` is used for verification — no third-party
  dependency. JWT signature must be in raw R‖S (64 bytes), not DER-encoded. Node.js
  `createSign` requires `{ dsaEncoding: 'ieee-p1363' }` to produce this format
  (Node ≥ 13.2).
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
- Artefacts committed: `app/ContentPreview/ContentPreview/JWTVerifier.swift`,
  `app/ContentPreview/ContentPreview/ContentView.swift`, `tools/sign-preview-link.js`,
  `app/ContentPreview/Info2.plist`, `app/ContentPreview/PREVIEW_MODE.md`.
  Private key gitignored via `.gitignore`.

---

*Captured: 2026-06-05*
*Source project: cpilsworth/nedp (hlxsites/nedp, app/ContentPreview)*
