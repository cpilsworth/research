# Plan: Preview activation as a DA app, authenticated by DA/EDS (IMS)

How to deliver the signed‑preview‑deep‑link feature as a **Document Authoring (DA)
app** inside the AEM Edge Delivery Services (EDS) authoring environment, using the
author's existing **IMS** session to authorize creation of the preview‑activation
URLs — replacing the standalone API‑key / TOTP signing tool.

---

## 1. The core idea — a token‑exchange broker

The author is **already authenticated** when they are in DA: they signed in with
their Adobe account (IMS), and DA holds an IMS access token for them. We should
reuse that identity instead of inventing a second credential.

```
IMS access token  ──►  (broker validates + authorizes)  ──►  preview capability JWT
 "who you are,                                                "what one device may
  proven by DA login"                                          see, for a short time"
```

- The **IMS token authorizes the *minting*** of a preview token. It never leaves
  the server boundary and is **never embedded in the QR / deep link**.
- The **preview JWT** stays exactly what it is today: ES256‑signed by a key only
  our worker holds, scoped to a single content path, short TTL, one‑time `jti`.
  The mobile app keeps verifying *only* that JWT and needs **zero IMS awareness**.

This is the OAuth "token exchange" pattern: a broad, sensitive identity token is
exchanged for a narrowly‑scoped, short‑lived capability token.

---

## 2. Architecture

```
┌────────────────────────────────────────────────────────────────┐
│ DA authoring UI (da.live)  — author signed in via IMS            │
│                                                                  │
│   ┌──────────────────────────────────────────────────────────┐  │
│   │ "Preview on app"  DA app  (iframe)                         │  │
│   │   import DA_SDK from 'https://da.live/nx/utils/sdk.js'     │  │
│   │   const { context, token, actions } = await DA_SDK;        │  │
│   │   context = { org, repo, path, ref }                       │  │
│   │   token   = IMS access token (from DA parent window)       │  │
│   └───────────────┬──────────────────────────────────────────┘  │
└───────────────────┼──────────────────────────────────────────────┘
                    │ POST /api/sign     Authorization: Bearer <IMS token>
                    │                    { org, repo, ref, path, ttlMinutes }
                    ▼
┌────────────────────────────────────────────────────────────────┐
│ Signing worker (broker)                                          │
│   1. AUTHENTICATE the IMS token (introspection / JWKS)           │
│   2. AUTHORIZE for this content — replay the token to DA/EDS     │
│      admin: can this user read this source? (delegated decision) │
│   3. (optional) refresh EDS preview so .aem.page is current      │
│   4. MINT ES256 preview JWT  (sub = IMS user, jti, short exp)    │
│   5. return { token, universalLink, expiresAt }                  │
└───────────────────┬──────────────────────────────────────────────┘
                    │ universalLink → QR
                    ▼
┌────────────────────────────────────────────────────────────────┐
│ Mobile app  — scans QR / opens Universal Link                    │
│   verifies ES256 preview JWT (embedded key / JWKS) → preview on  │
│   UNCHANGED from today                                            │
└────────────────────────────────────────────────────────────────┘
```

---

## 3. Components

### 3.1 DA app (frontend plugin)

A small static HTML page (reuse the signing UI we already built) registered as a
DA app for the org/site. When opened inside DA it runs in an iframe and uses the
DA SDK:

```js
import DA_SDK from 'https://da.live/nx/utils/sdk.js';

const { context, token, actions } = await DA_SDK;
// context: { org, repo, path, ref }  → the document currently open in DA
// token:   the author's IMS access token (refreshed via the SDK message channel)

const res = await fetch(`${WORKER}/api/sign`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    org: context.org, repo: context.repo, ref: context.ref || 'main',
    path: context.path, ttlMinutes: 15,
  }),
});
const { universalLink } = await res.json();
// render QR + link (existing UI)
```

- **No credential entry** — the author never sees or manages a key. The `context`
  pre‑fills the path; there is nothing to type.
- Registered for a project via the DA config (org/site config), so it appears in
  the DA toolbar/library for that site only.
- `actions.daFetch` is a token‑injecting fetch helper if we want to call DA APIs
  directly from the app, but the broker pattern keeps authz on the server.

### 3.2 Signing worker (broker) — the real change

Replace the `authenticate()` API‑key / TOTP logic in `sign.js` with two steps:

**(a) Authenticate the IMS token** — prove it is a live Adobe token:
- *Option A — introspection (simplest, authoritative):*
  `POST https://ims-na1.adobelogin.com/ims/validate_token/v1`
  with `token`, `type=access_token`, `client_id`. Returns `{ valid: true, … }`.
- *Option B — local verify (no per‑request round‑trip):* verify the JWT signature
  against the IMS JWKS (`https://ims-na1.adobelogin.com/ims/keys`), check `exp`,
  cache keys. Faster, but must handle key rotation.

Pin the expected **`client_id`** (the DA client) so a token minted for some other
application can't be replayed at us.

**(b) Authorize for *this* content — delegate the decision to DA/EDS.**
Token validity proves identity, **not** that the user may preview this project's
content. Rather than trust our own claim parsing, **replay the user's token to
DA/EDS's own API** and let it decide:

```
HEAD https://admin.da.live/source/{org}/{repo}/{path}
     Authorization: Bearer <user IMS token>
→ 2xx  = user can read this source → authorized
→ 401/403 = not authorized → reject the mint
```

(or the EDS `GET /profile` + a `GET /preview/{org}/{site}/{ref}/{path}` status
check on `admin.hlx.page`). This means **DA's existing ACLs are the access model** —
we add no parallel permission store.

**(c) Mint** the preview JWT exactly as today (`sign.js` crypto path), with:
- `sub` = the IMS `user_id` / email (real author identity, good for audit)
- `path`, plus new `org`, `repo`, `ref` claims so the device/proxy fetch the right
  EDS tree
- `jti` (one‑time), short `exp` (≈5–15 min)

### 3.3 Mobile app — unchanged

Still verifies the ES256 preview JWT with the embedded key (or `/.well-known/
jwks.json`). No IMS, no Adobe login on the device. The app only ever trusts our
signing key.

### 3.4 Content origins

Point the proxy/app origins at the EDS trees for the resolved `org/repo/ref`:

| Mode | Origin |
|---|---|
| Preview | `https://{ref}--{repo}--{org}.aem.page{path}` |
| Live | `https://{ref}--{repo}--{org}.aem.live{path}` |

(equivalently the `da-sc` delivery worker `preview/live` trees already wired in
`wrangler.toml`). Carrying `org/repo/ref` in the JWT lets one worker serve many
sites.

---

## 4. End‑to‑end flow

1. Author edits a document in DA — already IMS‑authenticated.
2. Author opens the **"Preview on app"** DA app from the toolbar.
3. DA SDK hands the app `{ context, token }` for the open document.
4. App `POST`s to the worker `/api/sign` with the IMS token + `org/repo/ref/path`.
5. Worker **authenticates** the IMS token (introspection / JWKS).
6. Worker **authorizes** by replaying the token to `admin.da.live` (HEAD source) —
   DA confirms the user can access that content.
7. *(optional)* Worker `POST`s `admin.hlx.page/preview/{org}/{site}/{ref}/{path}`
   to ensure `.aem.page` is fresh before previewing.
8. Worker **mints** the preview JWT (`sub` = IMS user, short TTL, `jti`) and returns
   the Universal Link.
9. App shows the **QR**; the author scans it on their device; the app opens, verifies
   the JWT locally, and enters preview mode.

---

## 5. Why this beats API key / TOTP

| Concern | API key / TOTP (today) | DA/EDS IMS (proposed) |
|---|---|---|
| Credential to manage | Yes — issue, rotate, enroll | None — Adobe SSO |
| Authorization scope | "holds the key" (all paths) | Per‑content via DA ACLs |
| Who minted a token | `sub` is self‑declared | `sub` = real IMS user (audit) |
| Revocation | Rotate key / delete secret | Disable user in IMS/DA → instant |
| Onboarding | Manual enrollment | Already onboarded to author |

---

## 6. Security considerations

- **IMS token never reaches the device.** It is consumed only at the broker; the
  QR carries the narrow preview JWT. The exchange is the isolation boundary.
- **Pin `client_id` / audience.** Only accept tokens issued for the DA client;
  reject tokens borrowed from other Adobe apps.
- **Authorize, don't just authenticate.** Always do the per‑content DA/EDS check —
  a valid token ≠ permission for this site. Delegating to DA's API avoids drift.
- **Short TTL + one‑time `jti`** unchanged — a forwarded link dies fast and works once.
- **DA app hygiene** — strict CSP on the app page, POST only to our worker over
  HTTPS, never log the token, treat the SDK message channel as the only token source.
- **CORS** — the worker must allow the `https://da.live` (and content.da.live)
  origin for `/api/sign`; keep the allowlist tight.
- **Rate‑limit per IMS `user_id`** (reuse the existing `RateLimiter` Durable Object,
  keyed on the real user instead of `api-key`).
- **Geo / org allowlist** controls still available on top.

---

## 7. Implementation phases

- **Phase 1 — IMS authentication.** Add IMS validation to the worker (introspection
  first; JWKS + caching later). Pin `client_id`. Replace the API‑key branch.
- **Phase 2 — Content authorization.** HEAD `admin.da.live/source/...` with the
  user's token; reject on non‑2xx. (Add EDS `/profile` fallback if needed.)
- **Phase 3 — DA app scaffold.** Wrap the existing signing UI as a DA app, wire the
  DA SDK, drop the credential fields, pre‑fill path from `context`. Register it in
  the org/site DA config.
- **Phase 4 — Multi‑site origins.** Carry `org/repo/ref` in JWT claims; resolve
  `.aem.page` / `.aem.live` (or da‑sc) origins dynamically.
- **Phase 5 — Preview freshness (optional).** Trigger `admin.hlx.page/preview/...`
  before minting so the device sees current draft content.
- **Phase 6 — Audit & limits.** Log `{ user_id, org/repo/path, jti, ts }` per mint;
  rate‑limit per `user_id`.
- **Phase 7 — Decommission.** Remove API‑key / TOTP paths (or keep a single
  service API key purely for non‑interactive/CI minting).

---

## 8. Open questions to confirm before building

1. **Token audience.** The DA‑held token is issued for DA's `client_id`. Confirm
   our worker can (a) introspect it and (b) use it against `admin.da.live`. If a
   different audience is required, we may need an IMS **token exchange / On‑Behalf‑Of**
   or a server‑to‑server service token for the authz call.
2. **Authoritative permission signal.** Is `HEAD /source/{org}/{repo}/{path}` a
   reliable "can preview" signal, or is there a dedicated DA permissions endpoint
   we should use instead?
3. **DA app registration.** Exact config location/format to surface a custom app
   for one org/site (project config sheet vs. org config).
4. **CORS / allowed origins** for the DA app iframe calling the worker.
5. **`ref` handling.** Which branch authors preview from (always `main`, or the
   working branch) and how that maps to `.aem.page`.

---

## 9. Relationship to existing docs

- `preview-proxy-worker.md` — the worker design this plan modifies (auth layer only).
- `worker/src/sign.js` — `authenticate()` is the function being replaced.
- `alternative-approaches.md` — this is the "reuse existing IdP" option made concrete
  for DA/EDS, without standing up a third‑party IMS dependency of our own.
