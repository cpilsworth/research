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

## Notes

- The component loads Adobe's hosted viewer CSS and JavaScript once per page.
- The player runtime is mounted in light DOM because the Adobe viewer looks up its mount node with `document.getElementById(...)`.
- The static `index.html` demo is designed to work when served directly, including via the provided Caddy config on `http://localhost:8080/`, so it does not enable `proxy-base-path` by default.
- GitHub Pages publishing is configured through `.github/workflows/github-pages.yml`, and the published site copies the canonical `dm-video-player/adobe-dm-video-player.js` into the deploy artifact so there is only one source file in the repo.
