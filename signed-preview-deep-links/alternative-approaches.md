# Alternative Approaches for Preview Mode Access

The baseline solution uses ECDSA-signed JWTs delivered via deep link to activate
an in-app preview session. This document describes alternative activation
mechanisms and additional security controls, with the tradeoffs of each.

---

## Activation approaches

### 1. Identity-based (IMS / OAuth login)

The app has an author login flow. The author signs in with corporate IMS
credentials; the app checks group membership (e.g. `aem-authors`) and enables
preview globally for that session. The access token is attached to every content
request as `Authorization: Bearer`; the content server decides whether to serve
draft or published content based on the token.

```
Author logs in → IMS issues access token → app attaches token to content requests
→ content server validates token → serves preview or live content accordingly
```

**Upside**
- No token delivery problem — activation is a side effect of login
- Works across all pages without per-URL signing
- Revocable immediately by removing group membership in IMS
- Short-lived access tokens bound by the IMS session TTL

**Downside**
- Requires IMS SDK integration and an `ASWebAuthenticationSession` / Chrome Custom
  Tab login flow in the app
- Content server must validate tokens per-request — not viable if the server is
  purely static
- Heavier than the baseline if IMS infrastructure is not already in place

**Best fit**: when the content server already has an authenticated API and authors
are the app's primary user base.

---

### 2. Device enrollment

An author registers their device once via a web tool. The web tool authenticates
the author (IMS), generates a device secret, and displays it as a QR code or
deep link. The app receives and stores the secret in the keychain. On each launch,
the app presents the secret to a lightweight enrollment check endpoint; the server
responds with the current preview state.

```
Author visits web tool → authenticates → scans QR / taps deep link
→ app stores device secret in keychain → each launch checks /enrolled
→ server returns { preview: true/false }
```

**Upside**
- One-time setup per device, no per-content friction
- Preview is always-on for enrolled devices without repeated activation
- Enrollment can be revoked centrally for a specific device

**Downside**
- Requires a server-side enrollment store and a check endpoint
- Offline behaviour needs a defined policy: fail open (security risk) or fail
  closed (frustrating if the check endpoint is unreachable)
- Device secret in keychain is long-lived; rotation requires re-enrollment

**Best fit**: when authors use a small number of known devices and want persistent
preview access without any per-session ceremony.

---

### 3. Server-side per-request auth

The app has no preview mode concept. Every content request carries the author's
credential. The CDN or origin decides what to serve — draft content for
credentialed authors, published content for everyone else. Preview activation is
implicit in the authenticated state.

```
Author logs in → app attaches credential to every URLSession request
→ CDN validates → proxies to AEM preview or live tree
```

**Upside**
- No in-app preview state, no token delivery, no expiry management
- Simplest app code of all options
- The content layer already has this concept (AEM author preview vs. publish)

**Downside**
- Every request hits auth validation — latency and cost at scale
- Requires the CDN/Worker to be auth-aware rather than serving static JSON
- Biggest infrastructure lift of all options

**Best fit**: when content is already served via an authenticated API and the
distinction between author and consumer is handled server-side.

---

### 4. MDM managed configuration

For enterprise devices managed by Jamf, Intune, or similar, IT pushes a managed
configuration key (`enablePreview = true`) to specific device groups. The app
reads this at launch from the managed app config dictionary.

```swift
// iOS
let managed = UserDefaults.standard.dictionary(forKey: "com.apple.configuration.managed")
let previewEnabled = managed?["enablePreview"] as? Bool ?? false
```

```kotlin
// Android (AppConfig / Android Enterprise)
val restrictions = getSystemService(RestrictionsManager::class.java)
val bundle = restrictions.applicationRestrictions
val previewEnabled = bundle.getBoolean("enablePreview", false)
```

**Upside**
- Zero runtime friction — authors do nothing to activate preview
- Centrally controlled; IT manages the rollout by device group
- No app code complexity in the auth path

**Downside**
- Only viable for managed/enrolled devices; does not work for BYOD or contractors
- Requires IT involvement for every change to the enrolled device list
- No cryptographic binding — any device in the MDM group gets preview,
  regardless of who is using it

**Best fit**: organisations with a fixed set of IT-managed author devices and an
existing MDM deployment.

---

### 5. In-app token entry

Keeps the JWT approach but removes the deep link delivery dependency. A hidden
gesture (shake, 5-tap on a logo, long-press) surfaces a text field where the
author pastes a JWT from Slack or email. Clipboard detection can pre-fill it
automatically.

```swift
.onReceive(NotificationCenter.default.publisher(for: UIDevice.deviceDidShakeNotification)) {
    showTokenEntry = true
}
```

On foreground, the app can check `UIPasteboard.general.string` for a string
that matches the JWT pattern and offer to apply it automatically.

**Upside**
- No URL scheme registration or Universal Link setup required
- Works on TestFlight, simulators, and any distribution channel
- Authors can share tokens via Slack like a password — no special tooling
- Minimal change from the baseline

**Downside**
- Clipboard access triggers a permission banner on iOS 16+
- Shake gesture is easy to trigger accidentally; a more deliberate gesture is
  harder to discover
- Still one token per path unless the JWT claims are broadened (e.g. wildcard
  path or no path restriction)

**Best fit**: during development or for small internal teams where the deep link
delivery ceremony is the only friction point.

---

## Comparison

| Approach | Author friction | Security | Infrastructure | App complexity |
|---|---|---|---|---|
| JWT deep link (baseline) | Medium | High | None | Low |
| IMS identity | Low (once) | High | Auth endpoint | Medium |
| Device enrollment | Low (once) | High | Enrollment store | Medium |
| Server-side per-request | None | High | Auth-aware CDN | Low |
| MDM config | None | Medium | IT / MDM | None |
| In-app token entry | Low | High | None | Low |

---

## Additional security controls

The following controls can be layered onto any of the above approaches to
restrict preview access to members of the publishing organisation and reduce
the exposure window of any single credential.

### Dual-factor: token + active org identity

The JWT alone is not sufficient; the app also requires an active IMS session for
a user in the publishing org. Verification becomes:

```
valid signature ∧ not expired ∧ path matches ∧ IMS user ∈ org
```

A forwarded token is useless without the org login. This is the highest-value
addition if IMS infrastructure already exists — it closes the forwarding threat
with no new backend, reusing auth that AEM author access already depends on.

---

### Apple App Attest / Android Play Integrity

**App Attest (iOS 14+)** lets the app prove to the content server that:
- it is running on genuine Apple hardware (not a simulator or jailbroken device)
- the binary matches the TestFlight or App Store build (not repackaged)

The app generates a key in the Secure Enclave, gets it attested by Apple's CA
once at install, then generates a lightweight assertion with each request. The
server verifies the assertion against Apple's root certificate and the stored
public key.

```swift
let service = DCAppAttestService.shared
let keyId = try await service.generateKey()
let attestation = try await service.attestKey(keyId, clientDataHash: challengeHash)
// send attestation to server for one-time verification; store keyId
// subsequent requests: generateAssertion(keyId, clientDataHash:)
```

**Play Integrity API (Android)** provides an equivalent verdict: device
integrity, app integrity (whether the binary matches Play distribution), and
a licensing check. The app requests an integrity token; the server decrypts and
validates it using Google's API.

Neither control prevents a legitimate org member with the app from forwarding a
token, but together with dual-factor identity they close the fake-client attack
surface entirely.

---

### Token binding to the requesting device

The JWT payload includes a device fingerprint claim (`dfp`). On iOS, the app
generates a non-exportable EC key pair in the Secure Enclave at install time and
registers the public key with the signing service. When a token is minted, the
signing service embeds the thumbprint of the requesting device's public key:

```json
{
  "sub": "author@example.com",
  "path": "/digi2/home",
  "dfp": "<base64url-sha256-of-device-public-key>",
  "exp": 1780618262
}
```

On receipt, the app signs a server-provided challenge with its Secure Enclave
key and includes the signature alongside the JWT. The server verifies both the
JWT signature and the device signature. A forwarded token does not work on a
different device because the Secure Enclave key is hardware-bound and
non-exportable.

---

### Mutual TLS with MDM-provisioned client certificates

IT pushes a client certificate to managed devices via MDM. The preview content
endpoint requires a valid client cert issued by the org's CA — enforced at the
transport layer before any application-level token check.

```swift
// URLSession auth challenge handler
func urlSession(_ session: URLSession,
                didReceive challenge: URLAuthenticationChallenge,
                completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
    if challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodClientCertificate {
        completionHandler(.useCredential, URLCredential(identity: identity, certificates: nil, persistence: .forSession))
    }
}
```

Revocation via CRL or OCSP. Works even if someone builds a fake client — they
would need a certificate issued by the org's CA.

**Limitation**: only viable for MDM-managed devices.

---

### Server-side one-time-use tokens (jti)

A `jti` (JWT ID) claim — a random UUID — is added to each minted token. The
content server records consumed `jti` values in a short-lived KV store (TTL
matching `exp`). On first use the token is accepted and the `jti` is recorded;
on replay it is rejected.

```json
{
  "jti": "a3f2c1b4-...",
  "path": "/digi2/home",
  "exp": 1780618262
}
```

This prevents a forwarded link from being activated on a second device after
first use. The tradeoff is a server-side store and a network round-trip on link
open.

---

### IP / network boundary enforcement

The preview content endpoint is restricted to corporate IP ranges at the
CDN/WAF level (Fastly conditions, Cloudflare WAF rules). Authors outside the
office network must VPN in — a control that already exists and is enforced by
IT, requiring no app changes.

Crude as a standalone control, but effective as a defence-in-depth layer. Does
not protect against a compromised device inside the network perimeter.

---

## Controls vs. threat model

| Threat | Token + IMS | App Attest | Device binding | mTLS | jti one-time | IP boundary |
|---|---|---|---|---|---|---|
| Forwarded token used on another device | ✓ (if no org login) | — | ✓ | — | ✓ | — |
| Token used by non-org member with the app | ✓ | — | — | ✓ | — | — |
| Fake / modified client app | — | ✓ | — | ✓ | — | — |
| Replay on same device | — | — | — | — | ✓ | — |
| Access from outside org network | — | — | — | — | — | ✓ |

**Recommended baseline additions**: dual-factor IMS identity closes the most
impactful threat (token forwarding) with the least new infrastructure. App Attest
is worth adding if content sensitivity justifies the integration cost — it covers
the fake-client surface that IMS identity alone does not.
