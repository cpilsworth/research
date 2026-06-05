# ContentPreview — iOS proof-of-concept

Minimal SwiftUI app that implements the [signed preview deep link](../README.md) pattern
end-to-end on iOS. An author opens a signed link on their device; the app verifies the
JWT, switches its content source from published to preview, and fetches the draft page
title.

---

## The "live vs page" folder concept

Document Authoring exposes two path-prefixed content APIs for the same logical page:

| Source | URL prefix | What it returns |
|--------|-----------|-----------------|
| `live` | `/live/<org>/<repo>/<path>` | Published content only |
| `page` | `/page/<org>/<repo>/<path>` | Latest saved draft (pre-publish) |

The app models this directly as a two-case enum in
[`ContentView.swift`](ContentPreview/ContentView.swift):

```swift
enum ContentSource: String {
    case live
    case page

    var url: URL? {
        switch self {
        case .live:
            return URL(string: "https://da-sc.adobeaem.workers.dev/live/cpilsworth/nedp/digi2/home")
        case .page:
            return URL(string: "https://da-sc.adobeaem.workers.dev/page/cpilsworth/nedp/digi2/home")
        }
    }
}
```

On cold launch `currentSource` is `.live` — regular users always see published content.
A valid signed deep link switches it to `.page` for the lifetime of the app process and
triggers a re-fetch. Closing the app resets to live; nothing is written to disk.

---

## Source walkthrough

### [`JWTVerifier.swift`](ContentPreview/JWTVerifier.swift) — ES256 verification

Zero-dependency JWT verification using Apple's `CryptoKit`. The public key is embedded
directly as a PEM constant:

```swift
private static let publicKeyPEM = """
-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...
-----END PUBLIC KEY-----
"""
```

Verification steps, in order:

1. Split the token on `.` — must have exactly three segments (`header.payload.signature`).
2. Base64url-decode the signature segment → raw 64-byte R‖S representation.
3. Load the public key via `P256.Signing.PublicKey(pemRepresentation:)`.
4. Verify the signature over `header.payload` (the bytes as they appear in the URL).
   `publicKey.isValidSignature(_:for:)` hashes with SHA-256 internally — no explicit
   digest step needed.
5. Decode the payload JSON and check `exp > now`.
6. Compare `claims.path` to the expected path — rejects tokens issued for a different page.

On success it returns a `PreviewToken` struct with `subject`, `path`, and `expiresAt`.

### [`ContentView.swift`](ContentPreview/ContentView.swift) — deep link handling and UI

`onOpenURL` receives every `myapp://` deep link the OS routes to the app:

```swift
.onOpenURL { url in
    handleDeepLink(url)
}
```

`handleDeepLink` extracts the `token` query parameter, calls `JWTVerifier.verify`, and
on success sets `currentSource = .page` and re-fetches the title. On failure it sets
`tokenError` which is displayed in the UI with a lock icon.

The view shows a "Preview mode" badge (eye icon) whenever `currentSource == .page`, and
uppercases the title as a visible indicator that draft content is active.

### [`ContentPreviewApp.swift`](ContentPreview/ContentPreviewApp.swift) — app entry point

Standard SwiftUI `@main` entry point. Sets up a SwiftData `ModelContainer` (Xcode
template boilerplate — not used by the preview feature).

---

## What this prototype does not implement

| Gap | Notes |
|-----|-------|
| **JWKS key lookup** | Public key is hardcoded as a PEM. Production should fetch `/.well-known/jwks.json` and cache per session so key rotation requires no app update. |
| **`kid` header parsing** | The JWT header is never decoded — the hardcoded key is always used. With JWKS, `kid` selects which entry to verify against. |
| **`src` claim** | The payload carries a `src: "page"` claim indicating which source to activate, but it is ignored; the app always switches to `.page` on a valid token. |
| **Universal Links** | Uses a raw `myapp://` custom scheme. If the app is not installed the link silently fails. Universal Links (AASA file at `/.well-known/apple-app-site-association`) would fall through to Safari instead. |
| **Token revocation** | No check against a server-side blocklist. Mitigation is a short `exp` TTL (30–60 min). |
| **`sub` claim in UI** | The author identity is verified and available on `PreviewToken.subject` but not surfaced anywhere in the interface. |
| **`Item` model** | `Item.swift` is unused Xcode template scaffolding (SwiftData boilerplate). |
