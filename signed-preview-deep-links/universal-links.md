# Universal Links / App Links for Preview Deep Links

Replacing the custom URL scheme (`myapp://home?token=<jwt>`) with HTTPS-based
Universal Links (iOS) and App Links (Android) improves the delivery mechanism
for signed preview tokens without changing the JWT structure, signing logic, or
in-app verification code.

The deep link URL becomes:

```
https://<content-domain>/preview?token=<jwt>
```

This is a real HTTPS URL. The OS routes it to the app when installed, or falls
through to the browser when not — with no disambiguation prompt in either case.

---

## How it works

Both platforms associate an HTTPS domain with an app by verifying a
JSON file served on that domain. The OS fetches and caches this file at app
install time. When the user taps a matching URL, the OS has already confirmed
the association and opens the app directly.

### iOS — Apple App Site Association

Served at `https://<content-domain>/.well-known/apple-app-site-association`:

```json
{
  "applinks": {
    "details": [
      {
        "appIDs": ["<TeamID>.<BundleID>"],
        "components": [
          {
            "/": "/preview",
            "?": { "token": "?*" },
            "comment": "Signed preview deep links"
          }
        ]
      }
    ]
  }
}
```

The app declares the `Associated Domains` capability in its entitlements:

```
applinks:<content-domain>
```

Universal Links arrive in SwiftUI via `onContinueUserActivity`:

```swift
.onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
    guard let url = activity.webpageURL,
          let token = URLComponents(url: url, resolvingAgainstBaseURL: false)?
              .queryItems?.first(where: { $0.name == "token" })?.value
    else { return }
    viewModel.applyPreviewToken(token)
}
```

### Android — Digital Asset Links

Served at `https://<content-domain>/.well-known/assetlinks.json`:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.example.contentpreview",
      "sha256_cert_fingerprints": [
        "AA:BB:CC:..."
      ]
    }
  }
]
```

The app registers an intent filter with `autoVerify="true"` in `AndroidManifest.xml`:

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

The token is extracted from the `Intent` in `onCreate` and `onNewIntent`:

```kotlin
private fun handleIntent(intent: Intent) {
    if (intent.action == Intent.ACTION_VIEW) {
        val token = intent.data?.getQueryParameter("token") ?: return
        viewModel.applyPreviewToken(token)
    }
}
```

---

## Benefits over custom URL schemes

**No OS confirmation prompt**
Custom scheme URLs (`myapp://`) always trigger a "Open in AppName?" dialog —
unavoidable, and a friction point for every preview activation. Universal Links
and App Links open the app directly and silently when tapped from Mail,
Messages, or a browser.

**Graceful fallback when the app is not installed**
A `myapp://` URL silently fails on a device without the app. An HTTPS URL falls
through to the browser, where you control what happens — an App Store install
prompt, a web-based preview for authenticated authors, or a clear error message.

**No URL scheme hijacking**
Any app can register `myapp://`; the OS picks one arbitrarily if multiple apps
claim the same scheme. HTTPS domain ownership is exclusive — only the operator
of `<content-domain>` can serve the verification file, so only the legitimate
app can be associated with those URLs.

**Works in all link contexts**
Custom scheme URLs are stripped or rendered as plain text by some email clients,
chat tools, and content security policies. `https://` URLs survive everywhere —
email, Slack, Notion, QR codes, printed materials.

**Single URL works on both platforms**
Because both Universal Links and App Links use plain HTTPS, the signing CLI
outputs one URL that routes correctly on iOS and Android. Platform differences
are confined to the verification file and the intent handler — the token and
its delivery URL are identical.

**Infrastructure reuse**
The content domain already serves `/.well-known/jwks.json` for public key
discovery. The `apple-app-site-association` and `assetlinks.json` files sit in
the same `/.well-known/` directory on the same host, with no additional
infrastructure.

---

## iOS considerations

**AASA caching**
Apple's CDN fetches the AASA file when the app is installed or updated and
caches it aggressively. Changes to the file do not take effect immediately on
existing installs — expect up to 24 hours for propagation. Test changes using
the `aasa-validator` tool or Apple's AASA validation endpoint before releasing.

**Simulator limitation**
Universal Links are not supported in the iOS Simulator. The OS routing step
requires real device identity (APNS tokens) that simulators do not have. For
simulator testing, retain the custom scheme (`myapp://`) as a fallback and test
JWT verification via the `-previewToken` launch argument:

```bash
xcrun simctl launch booted <bundle-id> -previewToken <jwt>
```

**Tap from Safari on the same domain**
If the author is already in Safari viewing `content-domain.com`, tapping a
Universal Link on that domain shows a prompt rather than opening the app
directly — a deliberate Apple restriction to prevent sites from hijacking their
own navigation. This only applies to in-Safari navigation; links tapped in
Mail, Messages, or other apps open the app directly.

**Distribution**
Universal Links work with any signed build — App Store, TestFlight, Ad Hoc, or
a Development build on a registered device. TestFlight is the natural choice for
internal author tooling: no App Store review, fast distribution, and the AASA
entry is identical to the production release.

---

## Android considerations

**Play App Signing fingerprint**
The `sha256_cert_fingerprints` entry in `assetlinks.json` must match the
certificate used to sign the APK that is actually delivered to the device. If
Play App Signing is enabled (the default for new apps), Google re-signs the APK
with their key before delivery — use the Play-managed fingerprint shown in Play
Console under **Setup → App integrity**, not the upload key fingerprint. Using
the wrong fingerprint causes silent verification failure and a fallback to the
"Open with…" chooser.

**Multiple signing environments**
Debug, release, and Play-signed builds each have different certificate
fingerprints. During development, include all relevant fingerprints as an array
in `assetlinks.json`:

```json
"sha256_cert_fingerprints": [
    "<play-signing-cert>",
    "<debug-keystore-cert>"
]
```

Remove the debug fingerprint before production if you want to restrict access
to Play-distributed builds only.

**Emulator limitation**
App Links do not route correctly in the Android Emulator for the same reason as
iOS — no real device identity for pre-verification. Test the intent handler
directly via ADB:

```bash
adb shell am start -W -a android.intent.action.VIEW \
  -d "https://content-domain.com/preview?token=<jwt>" \
  com.example.contentpreview
```

**Verification failure fallback**
If Android cannot verify the domain association (network unavailable at install
time, wrong fingerprint, malformed JSON), it falls back to showing the "Open
with…" app chooser rather than routing directly to the app. Authors on devices
with failed verification would see a chooser rather than the app opening
automatically — not a security failure, but a UX regression. Monitor the Play
Console's App Links dashboard for verification failures after release.

**API level**
`autoVerify` and the P1363-format ECDSA verification (`SHA256withECDSAinP1363Format`)
both require API 23 (Android 6.0). Devices below this threshold cannot use App
Links and cannot verify the JWT signature natively without a third-party library.
Given Android 6.0's market share is negligible, API 23 is a reasonable minimum.

---

## What does not change

- The JWT structure, claims, and ES256 signature format
- The ECDSA P-256 key pair and JWKS endpoint
- In-app JWT verification (CryptoKit on iOS, `java.security` on Android)
- The signing CLI — only the output URL changes from `myapp://` to `https://`
- The session `previewActive` / `previewPaths` state management
