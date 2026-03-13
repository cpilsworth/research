# Adobe Dynamic Media Video Player Web Component

This folder contains a small Web Component wrapper around Adobe's Dynamic Media HTML5 video player so it can be embedded directly in another page without an iframe.

## Files

- `adobe-dm-video-player.js`: Custom element implementation.
- `index.html`: Minimal demo page wired to the sample Dynamic Media asset.
- `../docs/index.html`: GitHub Pages-friendly published demo page that also includes the README guidance inline.

## Usage

```html
<script type="module" src="/path/to/dm-video-player/adobe-dm-video-player.js"></script>

<adobe-dm-video-player
  src="https://delivery-p31359-e1338271.adobeaemcloud.com/adobe/assets/urn:aaid:aem:7091fd88-9d0f-4aa6-8bfb-2746ce1d815f/play"
  controls
></adobe-dm-video-player>
```

## Supported attributes

- `src`: Required. The Dynamic Media `/play` URL.
- `token`: Optional secure-delivery token. If omitted, the component also checks the token already present in `src`.
- `autoplay`: Optional boolean attribute.
- `controls`: Optional boolean attribute. Defaults to `true`.
- `letterboxed`: Optional boolean attribute. Defaults to `false`.
- `proxy-base-path`: Optional same-origin proxy base path for manifests and media. Use this only when your server actually proxies that route.
- `styles`: Optional raw CSS string scoped automatically to this player instance. Rules are prefixed with the container ID so they never affect other players on the page. Also settable via the `customStyles` JS property.
- `stylesheet`: Optional URL of an external CSS file to load. The stylesheet is document-global but ref-counted across instances and removed when the last referencing instance disconnects.

## Styling

The component exposes three composable mechanisms for per-instance player styling.

### 1. CSS custom properties

Set variables on the element via inline `style` or external CSS. The component generates a scoped style block that maps each variable to the correct VideoJS selector using `var()` references, so the browser resolves them live.

| Variable | Effect |
|---|---|
| `--vjs-control-bar-bg` | Control bar background |
| `--vjs-progress-color` | Played-progress fill |
| `--vjs-load-progress-color` | Buffered-progress fill |
| `--vjs-big-play-bg` | Big play button background |
| `--vjs-big-play-border` | Big play button border |
| `--vjs-big-play-color` | Big play button icon |
| `--vjs-volume-bar-color` | Volume level fill |
| `--vjs-control-color` | Control bar button icons |

```html
<adobe-dm-video-player
  src="…"
  style="--vjs-progress-color: #f4562d; --vjs-big-play-bg: #f4562d;"
></adobe-dm-video-player>
```

### 2. `styles` attribute / `customStyles` property

Raw CSS scoped to this instance. The component parses the string via `CSSStyleSheet` and prefixes every selector with the container's unique ID.

```html
<adobe-dm-video-player
  src="…"
  styles=".vjs-big-play-button { border-radius: 50%; }"
></adobe-dm-video-player>
```

```js
player.customStyles = '.vjs-big-play-button { border-radius: 50%; }';
```

### 3. `stylesheet` attribute

Load an external CSS file. The `<link>` tag is added to `document.head` once and removed when the last instance that requested it disconnects.

```html
<adobe-dm-video-player src="…" stylesheet="/styles/player-theme.css"></adobe-dm-video-player>
```

## Notes

- The component loads Adobe's hosted viewer CSS and JavaScript once per page.
- The player runtime is mounted in light DOM because the Adobe viewer looks up its mount node with `document.getElementById(...)`.
- The static `index.html` demo is designed to work when served directly, including via the provided Caddy config on `http://localhost:8080/`, so it does not enable `proxy-base-path` by default.
- GitHub Pages publishing is configured through `.github/workflows/github-pages.yml`, and the published site copies the canonical `dm-video-player/adobe-dm-video-player.js` into the deploy artifact so there is only one source file in the repo.
