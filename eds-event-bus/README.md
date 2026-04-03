# eds-event-bus

A Cloudflare Worker that polls [EDS admin activity logs](https://www.aem.live/docs/admin.html#tag/log) on a cron schedule and dispatches events to subscriber handlers — enabling cross-site republishing, notifications, and other automations triggered by content changes.

## Background

When content is published on an AEM Edge Delivery Services (EDS) site, there is no built-in push notification. The only way to detect changes is to poll the admin API's activity log (`GET /log/{org}/{site}/{ref}`). If multiple systems each poll independently, you quickly run into rate limits and duplicated logic.

This project centralises that polling into a single Cloudflare Worker. It checks for new log entries on a schedule, normalises them into a consistent event format, and fans them out to handler functions that can react however you need — republish a page on another site, post to Slack, invalidate a CDN cache, etc.

## Architecture

```
  Cloudflare Cron Trigger (e.g. every 1 min)
       │
       ▼
┌─────────────┐    ┌──────────────┐    ┌──────────────────┐
│  KV: read   │───▶│  Poll EDS    │───▶│    Event Bus     │
│  cursor     │    │  Admin API   │    │                  │
└─────────────┘    └──────────────┘    │  ┌─ log handler  │
       ▲                               │  ├─ republish    │
       │                               │  └─ (your own)   │
┌─────────────┐                        └──────────────────┘
│  KV: write  │◀───────────────────────────────┘
│  cursor     │
└─────────────┘
```

Each invocation:

1. Reads the last-seen cursor from Cloudflare KV for each configured site.
2. Calls `GET https://admin.hlx.page/log/{org}/{site}/{ref}?from={cursor}`, following `nextToken` pagination if there are many entries.
3. Normalises each raw log entry into a structured event object.
4. Dispatches events through an in-process pub/sub bus to all registered handlers.
5. Writes the updated cursor back to KV so the next invocation picks up where this one left off.

On the very first run (no cursor in KV), the poller looks back 2 minutes (`?since=2m`) to catch any very recent activity without flooding with old data.

## Project structure

```
eds-event-bus/
├── index.js              # Worker entry point (scheduled handler)
├── poller.js             # Stateless function that fetches new log entries
├── event-bus.js          # Pub/sub dispatcher + event normalisation
├── handlers/
│   ├── log-handler.js    # Logs every event to stdout (wrangler tail / CF dashboard)
│   └── republish-handler.js  # Republishes target pages when source paths match rules
├── wrangler.toml         # Cloudflare Worker configuration
└── package.json
```

## Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- A [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier is sufficient)
- An EDS admin API auth token with `log:read` scope (and `live:write` if using the republish handler)

## Setup and deployment

### 1. Install dependencies

```bash
cd eds-event-bus
npm install
```

### 2. Create a KV namespace

The Worker stores its poll cursors in [Cloudflare KV](https://developers.cloudflare.com/kv/). Create a namespace:

```bash
npx wrangler kv namespace create EDS_CURSORS
```

This outputs an `id` — paste it into `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "EDS_CURSORS"
id = "abc123..."           # ← your actual id here
```

For local development, also create a preview namespace:

```bash
npx wrangler kv namespace create EDS_CURSORS --preview
```

And add the preview id:

```toml
[[kv_namespaces]]
binding = "EDS_CURSORS"
id = "abc123..."
preview_id = "def456..."   # ← your preview id here
```

### 3. Set the auth token

Store the EDS admin API token as a secret (it won't appear in `wrangler.toml` or source):

```bash
npx wrangler secret put EDS_AUTH_TOKEN
```

You'll be prompted to enter the token value.

### 4. Configure sites to watch

Edit the `SITES` variable in `wrangler.toml`. It's a JSON array of objects:

```toml
[vars]
SITES = '[{ "org": "acme", "site": "marketing", "ref": "main" }]'
```

To watch multiple sites:

```toml
[vars]
SITES = '[{ "org": "acme", "site": "marketing", "ref": "main" }, { "org": "acme", "site": "blog", "ref": "main" }]'
```

Each site object:

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `org` | yes | — | The EDS organisation (GitHub owner) |
| `site` | yes | — | The EDS site (GitHub repo) |
| `ref` | no | `main` | The git ref/branch to watch |

### 5. Configure republish rules

See [Managing republish rules](#managing-republish-rules) below. If you don't need republishing yet, set:

```toml
REPUBLISH_RULES = '[]'
```

### 6. Set the cron schedule

The default is every minute. Edit `wrangler.toml` to change:

```toml
[triggers]
crons = ["* * * * *"]       # every minute (default)
# crons = ["*/5 * * * *"]   # every 5 minutes
# crons = ["*/2 * * * *"]   # every 2 minutes
```

Bear in mind the EDS admin API [rate limits](https://www.aem.live/docs/limits#admin-api-limits). If you're watching many sites, a less aggressive interval is safer.

### 7. Deploy

```bash
npm run deploy
```

### 8. Verify

Stream live logs from the deployed Worker:

```bash
npm run tail
```

You should see output like:

```
[2026-04-03T10:15:32.000Z] live POST acme/marketing /products/widget
acme/marketing: 1 new entries
```

## Operations

### Managing republish rules

Republish rules tell the Worker: "when a page matching this pattern is published on the source site, republish these target pages". This is the main way to set up cross-site content synchronisation.

Rules are configured in the `REPUBLISH_RULES` variable in `wrangler.toml` as a JSON array.

#### Rule structure

```json
{
  "match": "<regex pattern>",
  "targets": [
    {
      "org": "<target org>",
      "site": "<target site>",
      "ref": "main",
      "path": "<target path>"
    }
  ]
}
```

| Field | Description |
|-------|-------------|
| `match` | A regex pattern string tested against each published path. Uses JavaScript `RegExp` syntax. |
| `targets` | Array of pages to republish when the pattern matches. Each target is a separate `POST /live` call. |
| `targets[].org` | Target EDS organisation |
| `targets[].site` | Target EDS site |
| `targets[].ref` | Target git ref (default: `main`) |
| `targets[].path` | The exact path to republish on the target site |

#### Examples

**Republish a feed page when any product page is published:**

```json
[
  {
    "match": "^/products/.*",
    "targets": [
      { "org": "acme", "site": "storefront", "path": "/product-feed" }
    ]
  }
]
```

**Sync shared navigation across microsites:**

```json
[
  {
    "match": "^/nav$",
    "targets": [
      { "org": "acme", "site": "microsite-a", "path": "/nav" },
      { "org": "acme", "site": "microsite-b", "path": "/nav" }
    ]
  }
]
```

**Republish a homepage when any blog post is published:**

```json
[
  {
    "match": "^/blog/",
    "targets": [
      { "org": "acme", "site": "marketing", "path": "/" }
    ]
  }
]
```

**Multiple rules together** (the full `wrangler.toml` value):

```toml
REPUBLISH_RULES = '[{ "match": "^/products/.*", "targets": [{ "org": "acme", "site": "storefront", "path": "/product-feed" }] }, { "match": "^/nav$", "targets": [{ "org": "acme", "site": "microsite-a", "path": "/nav" }, { "org": "acme", "site": "microsite-b", "path": "/nav" }] }]'
```

#### Deploying rule changes

After editing `wrangler.toml`, redeploy:

```bash
npm run deploy
```

Rule changes take effect on the next cron invocation (within 1 minute by default).

### Adding a new site to watch

Add an entry to the `SITES` JSON array in `wrangler.toml` and redeploy. The Worker will start polling the new site on the next cron tick, looking back 2 minutes on its first run.

### Removing a site

Remove the entry from `SITES` and redeploy. The old cursor will remain in KV but is harmless — you can clean it up manually if you want:

```bash
npx wrangler kv key delete --namespace-id=<your-kv-id> "cursor:org/site/ref"
```

### Resetting a cursor

If you need to re-process events (e.g. after fixing a handler bug), delete the cursor for a site:

```bash
npx wrangler kv key delete --namespace-id=<your-kv-id> "cursor:acme/marketing/main"
```

The next invocation will start fresh with a 2-minute lookback.

### Monitoring

- **Live logs:** `npm run tail` streams `console.log` / `console.error` output from the deployed Worker.
- **CF Dashboard:** Workers > eds-event-bus > Logs shows recent invocations, errors, and cron trigger history.
- **KV inspection:** Check cursor state at any time:
  ```bash
  npx wrangler kv key get --namespace-id=<your-kv-id> "cursor:acme/marketing/main"
  ```

## Writing a custom handler

A handler is any function `(event) => void | Promise<void>`. Create a file in `handlers/`, then register it on the event bus in `index.js`.

### Example: Slack notification on publish

```js
// handlers/slack-handler.js
export function createSlackHandler(webhookUrl) {
  return async (event) => {
    if (event.route !== 'live') return;
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: `Published on ${event.org}/${event.site}: ${event.paths.join(', ')}`,
      }),
    });
  };
}
```

Wire it up in `index.js`:

```js
import { createSlackHandler } from './handlers/slack-handler.js';

// inside the scheduled() function, after the existing bus.on() calls:
bus.on('live', createSlackHandler(env.SLACK_WEBHOOK_URL));
```

Add the webhook URL as a secret:

```bash
npx wrangler secret put SLACK_WEBHOOK_URL
```

### Subscribing to specific routes

The event bus supports filtering by the EDS `route` field:

```js
bus.on('live', handler);     // only live/publish events
bus.on('preview', handler);  // only preview events
bus.on('code', handler);     // only code push events
bus.on('*', handler);        // all events
```

## Event reference

Every handler receives a normalised event object:

```js
{
  route: 'live',              // 'live' | 'preview' | 'code' | 'custom'
  method: 'POST',             // HTTP method of the original admin API call
  status: 200,                // HTTP status returned
  path: '/my-page',           // single path (if present in log entry)
  paths: ['/my-page'],        // array of all paths affected
  user: 'user@example.com',   // who triggered it (if available)
  timestamp: Date,            // JS Date of when the action occurred
  duration: 467,              // duration in ms (if available)
  event: null,                // custom event string (for custom log entries)
  org: 'acme',                // source EDS organisation
  site: 'marketing',          // source EDS site
  ref: 'main',                // source git ref
  raw: { ... }                // the unmodified log entry from the admin API
}
```

Key routes and what they mean:

| Route | Method | Meaning |
|-------|--------|---------|
| `live` | `POST` | A page was published (went live) |
| `preview` | `POST` | A page was previewed |
| `code` | `POST` | Code was pushed/updated |
| `custom` | — | A custom event was logged via `POST /log` |

## Local development

```bash
npm run dev
```

This starts wrangler in local dev mode. Cron triggers can be tested manually by hitting the `/__scheduled` endpoint:

```bash
curl http://localhost:8787/__scheduled
```

## Limitations

- **Polling latency:** the minimum Cloudflare Cron Trigger interval is 1 minute, so events are detected at most 1 minute after they occur.
- **Rate limits:** the EDS admin API enforces [rate limits](https://www.aem.live/docs/limits#admin-api-limits). If watching many sites, increase the cron interval.
- **Auth scopes:** the token needs `log:read` to poll. The republish handler additionally needs `live:write` on target sites.
- **No retry/dead-letter:** if a handler fails, the event is logged but not retried. The cursor still advances, so the event won't be re-delivered on the next run.
- **In-process only:** handlers run within the same Worker invocation. For heavier workloads, a handler could enqueue to a Cloudflare Queue or Durable Object instead of doing the work inline.
