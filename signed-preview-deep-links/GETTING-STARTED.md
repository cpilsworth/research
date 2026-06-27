# Getting Started

End-to-end guide for minting a signed preview token and activating preview
mode in the iOS app.

---

## What is deployed

| Resource | URL |
|---|---|
| Proxy worker | `https://preview-proxy-worker.cpilsworth.workers.dev` |
| JWKS (public key) | `https://preview-proxy-worker.cpilsworth.workers.dev/.well-known/jwks.json` |
| Apple App Site Association | `https://preview-proxy-worker.cpilsworth.workers.dev/.well-known/apple-app-site-association` |
| Token signing endpoint | `POST https://preview-proxy-worker.cpilsworth.workers.dev/api/sign` |

---

## Prerequisites

- Node.js 18+
- Xcode 15+
- Wrangler CLI: `npm i -g wrangler` (already installed in `worker/`)
- An iOS Simulator or real device with the ContentPreview app installed

---

## Step 1 — Set a known signing key

The `SIGNING_API_KEY` was auto-generated at deploy time and is not visible.
Replace it with a value you choose:

```bash
cd worker
npx wrangler secret put SIGNING_API_KEY
# Type your chosen key when prompted, e.g.:
#   my-secret-preview-key-2026
```

Keep this value — you will use it in every `curl` or CLI call below.

---

## Step 2 — Mint a preview token

Send a signed request to the worker's signing endpoint. Replace
`<YOUR_KEY>` with the value you set in Step 1.

```bash
curl -s -X POST \
  https://preview-proxy-worker.cpilsworth.workers.dev/api/sign \
  -H "Authorization: Bearer <YOUR_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"path": "/digi2/home", "ttlMinutes": 60, "sub": "you@example.com"}' \
  | python3 -m json.tool
```

**Response:**

```json
{
    "token": "eyJhbGci...",
    "universalLink": "https://preview-proxy-worker.cpilsworth.workers.dev/preview?token=eyJhbGci...",
    "expiresAt": "2026-06-06T13:00:00.000Z"
}
```

The `universalLink` is what you deliver to the device.

---

## Step 3 — Open in the iOS Simulator

Copy the `universalLink` from the response and pass it to the booted simulator.

The simulator does not support Universal Links, so use the custom URL scheme
fallback (`myapp://`) for simulator testing. The signing endpoint returns an
HTTPS link; convert the token into a custom scheme URL:

```bash
TOKEN=$(curl -s -X POST \
  https://preview-proxy-worker.cpilsworth.workers.dev/api/sign \
  -H "Authorization: Bearer <YOUR_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"path": "/digi2/home", "ttlMinutes": 60, "sub": "you@example.com"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

xcrun simctl openurl booted "myapp://home?token=$TOKEN"
```

The simulator will prompt **"Open in ContentPreview?"** — tap Open. The Home
tab switches to preview mode (amber wash in the navigation bar, eye icon in
the toolbar).

Alternatively, bypass the URL entirely using the launch argument:

```bash
xcrun simctl launch booted chrisp.ContentPreview -previewToken "$TOKEN"
```

No prompt is shown with the launch argument — the app reads the token directly
on startup.

---

## Step 4 — Open on a real device (Universal Link)

On a real device the HTTPS Universal Link opens the app directly with no
prompt.

**Option A — QR code**

Paste the `universalLink` into any QR code generator. Point the device camera
at the code; iOS offers to open ContentPreview directly.

**Option B — Tap from Messages or Mail**

Copy the `universalLink` and send it to yourself via iMessage or Mail. Tap the
link on the device.

**Option C — Tap-to-open (same device)**

If you are on the same device, open the `universalLink` in Safari. iOS
intercepts the navigation and opens the app — no "Open in app?" prompt.

> **Note**: Universal Links require the Associated Domains entitlement to be
> configured in the Xcode project. See the Xcode setup section below.

---

## Step 5 — Verify preview is active

When preview is active:

- The navigation bar has an amber wash
- An eye icon (⌖) appears in the top-right of the screen
- Content is fetched from the AEM preview origin instead of live

Tap the eye icon to exit preview and return to published content.

---

## Xcode setup — Universal Links

To enable Universal Links on a real device (not required for the Simulator):

1. Open `ContentPreview.xcodeproj` in Xcode
2. Select the **ContentPreview** target → **Signing & Capabilities**
3. Click **+ Capability** → add **Associated Domains**
4. Add the entry:
   ```
   applinks:preview-proxy-worker.cpilsworth.workers.dev
   ```
5. Add the Universal Link handler to `ContentView.swift` if not already present:
   ```swift
   .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
       guard let url = activity.webpageURL,
             let token = URLComponents(url: url, resolvingAgainstBaseURL: false)?
                 .queryItems?.first(where: { $0.name == "token" })?.value
       else { return }
       viewModel.applyPreviewToken(token)
   }
   ```
6. Build and install on the device

---

## Minting tokens for different screens

| Screen | Path |
|---|---|
| Home | `/digi2/home` |
| Invest | `/digi2/invest` |
| Trade | `/digi2/trade` |
| Accounts | `/digi2/accounts` |

Change the `path` field in the `curl` body. The token activates preview for
that screen only — other tabs continue to show published content.

---

## Running the unit tests

```bash
xcodebuild test \
  -scheme ContentPreview \
  -destination 'platform=iOS Simulator,name=iPhone 16' \
  | xcbeautify   # optional: brew install xcbeautify
```

All unit tests run without network access. They use CryptoKit-generated key
pairs and in-memory state — no secrets or running worker needed.

---

## Running the integration tests

Integration tests exercise the live worker endpoints. They are skipped by
default; pass the `INTEGRATION` environment variable to enable them:

```bash
INTEGRATION=1 xcodebuild test \
  -scheme ContentPreview \
  -destination 'platform=iOS Simulator,name=iPhone 16'
```

The integration tests check:
- `/healthz` returns 200
- `/.well-known/jwks.json` contains the EC P-256 key
- `/.well-known/apple-app-site-association` contains the correct bundle ID
- `POST /api/sign` without auth returns 401

---

## Key rotation

If the signing key pair needs to be rotated:

```bash
cd worker
node scripts/generate-key.mjs
```

Follow the three steps it prints:
1. `wrangler secret put PREVIEW_PRIVATE_KEY` — paste the new private key JWK
2. `wrangler kv key put --binding PREVIEW_KEYS --remote jwks '<json>'` — update the public key
3. Update `JWTVerifier.publicKeyPEM` in `ContentPreview/JWTVerifier.swift` and ship a new app build

Old tokens signed by the previous key stop verifying immediately once the
public key in the app is updated.

---

## Quick reference

```bash
# Health check
curl https://preview-proxy-worker.cpilsworth.workers.dev/healthz

# Inspect the public key
curl https://preview-proxy-worker.cpilsworth.workers.dev/.well-known/jwks.json

# Mint a token (60-minute TTL)
curl -X POST https://preview-proxy-worker.cpilsworth.workers.dev/api/sign \
  -H "Authorization: Bearer <YOUR_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"path": "/digi2/home", "ttlMinutes": 60, "sub": "you@example.com"}'

# Open token in booted simulator (custom scheme fallback)
xcrun simctl openurl booted "myapp://home?token=<TOKEN>"

# Or inject via launch argument (no prompt)
xcrun simctl launch booted chrisp.ContentPreview -previewToken "<TOKEN>"

# Redeploy the worker after config changes
cd worker && npm run deploy
```
