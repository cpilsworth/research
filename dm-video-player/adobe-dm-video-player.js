const DEFAULT_VIEWER_ASSET_PATHS = {
  css: "/adobe/assets/urn:aaid:aem:dmviewers-html5-css/as/core-player.css",
  videoPlayer: "/adobe/assets/urn:aaid:aem:dmviewers-html5/as/VideoPlayer.js",
  corePlayer: "/adobe/assets/urn:aaid:aem:dmviewers-html5/as/CorePlayer.js",
};

const dependencyPromises = new Map();
const instanceStylesheets = new Map(); // absolute url -> Set<containerId>
const RESOURCE_LOAD_TIMEOUT_MS = 5000;
let playerSequence = 0;

function scopeStyles(css, scopeSelector) {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  return Array.from(sheet.cssRules).map((rule) => {
    if (rule instanceof CSSStyleRule) {
      return rule.cssText.replace(/^([^{]+)\{/, (_, sel) => `${scopeSelector} ${sel.trim()} {`);
    }
    if (
      rule instanceof CSSMediaRule ||
      rule instanceof CSSSupportsRule ||
      (typeof CSSLayerBlockRule !== "undefined" && rule instanceof CSSLayerBlockRule) ||
      (typeof CSSContainerRule !== "undefined" && rule instanceof CSSContainerRule)
    ) {
      const inner = Array.from(rule.cssRules)
        .map((r) =>
          r instanceof CSSStyleRule
            ? r.cssText.replace(/^([^{]+)\{/, (_, sel) => `${scopeSelector} ${sel.trim()} {`)
            : r.cssText
        )
        .join("\n");
      return rule.cssText.replace(/\{[\s\S]*\}/, `{\n${inner}\n}`);
    }
    return rule.cssText;
  }).join("\n");
}

function ensureDocumentStyle(id, cssText) {
  const existing = document.getElementById(id);
  if (existing) {
    if (existing.textContent !== cssText) {
      existing.textContent = cssText;
    }
    return;
  }

  const style = document.createElement("style");
  style.id = id;
  style.textContent = cssText;
  document.head.appendChild(style);
}

function ensureStylesheet(url) {
  const existing = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
    .find((link) => link.href === url);

  if (existing) {
    if (existing.dataset.loaded === "true" || existing.sheet) {
      existing.dataset.loaded = "true";
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        if (existing.sheet) {
          existing.dataset.loaded = "true";
          resolve();
          return;
        }

        reject(new Error(`Timed out waiting for stylesheet: ${url}`));
      }, RESOURCE_LOAD_TIMEOUT_MS);

      existing.addEventListener("load", () => {
        window.clearTimeout(timeoutId);
        existing.dataset.loaded = "true";
        resolve();
      }, { once: true });
      existing.addEventListener("error", () => {
        window.clearTimeout(timeoutId);
        reject(new Error(`Failed to load stylesheet: ${url}`));
      }, { once: true });
    });
  }

  return new Promise((resolve, reject) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = url;
    link.crossOrigin = "anonymous";
    const timeoutId = window.setTimeout(() => {
      if (link.sheet) {
        link.dataset.loaded = "true";
        resolve();
        return;
      }

      reject(new Error(`Timed out waiting for stylesheet: ${url}`));
    }, RESOURCE_LOAD_TIMEOUT_MS);

    link.addEventListener("load", () => {
      window.clearTimeout(timeoutId);
      link.dataset.loaded = "true";
      resolve();
    }, { once: true });
    link.addEventListener("error", () => {
      window.clearTimeout(timeoutId);
      reject(new Error(`Failed to load stylesheet: ${url}`));
    }, { once: true });
    document.head.appendChild(link);
  });
}

function ensureScript(url, isReady = () => true) {
  const existing = Array.from(document.querySelectorAll("script"))
    .find((script) => script.src === url);

  if (existing) {
    if (existing.dataset.loaded === "true" || isReady()) {
      existing.dataset.loaded = "true";
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const finishIfReady = () => {
        if (!isReady()) {
          return false;
        }

        existing.dataset.loaded = "true";
        resolve();
        return true;
      };

      const timeoutId = window.setTimeout(() => {
        if (finishIfReady()) {
          return;
        }

        reject(new Error(`Timed out waiting for script: ${url}`));
      }, RESOURCE_LOAD_TIMEOUT_MS);

      existing.addEventListener("load", () => {
        if (finishIfReady()) {
          window.clearTimeout(timeoutId);
          return;
        }

        window.setTimeout(() => {
          if (finishIfReady()) {
            window.clearTimeout(timeoutId);
            return;
          }

          existing.dataset.loaded = "true";
          reject(new Error(`Script loaded but did not initialize expected runtime: ${url}`));
        }, 0);
      }, { once: true });
      existing.addEventListener("error", () => {
        window.clearTimeout(timeoutId);
        reject(new Error(`Failed to load script: ${url}`));
      }, { once: true });
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.crossOrigin = "anonymous";
    const finishIfReady = () => {
      if (!isReady()) {
        return false;
      }

      script.dataset.loaded = "true";
      resolve();
      return true;
    };

    const timeoutId = window.setTimeout(() => {
      if (finishIfReady()) {
        return;
      }

      reject(new Error(`Timed out waiting for script: ${url}`));
    }, RESOURCE_LOAD_TIMEOUT_MS);

    script.addEventListener("load", () => {
      if (finishIfReady()) {
        window.clearTimeout(timeoutId);
        return;
      }

      window.setTimeout(() => {
        if (finishIfReady()) {
          window.clearTimeout(timeoutId);
          return;
        }

        reject(new Error(`Script loaded but did not initialize expected runtime: ${url}`));
      }, 0);
    }, { once: true });
    script.addEventListener("error", () => {
      window.clearTimeout(timeoutId);
      reject(new Error(`Failed to load script: ${url}`));
    }, { once: true });
    document.head.appendChild(script);
  });
}

function parseBooleanAttribute(value, defaultValue) {
  if (value == null) {
    return defaultValue;
  }

  if (value === "" || value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return defaultValue;
}

function removePlaySuffix(pathname) {
  return pathname.endsWith("/play") ? pathname.slice(0, -5) : pathname;
}

function appendQueryParam(url, key, value) {
  const parsed = new URL(url);
  parsed.searchParams.set(key, value);
  return parsed.toString();
}

function withOptionalToken(url, token) {
  return token ? appendQueryParam(url, "token", token) : url;
}

function proxiedUrl(resourceUrl, proxyBasePath) {
  const parsed = new URL(resourceUrl);
  const normalizedBasePath = (proxyBasePath || "").replace(/\/$/, "");
  const proxyUrl = new URL(`${normalizedBasePath}${parsed.pathname}`, window.location.href);
  proxyUrl.search = parsed.search;
  proxyUrl.searchParams.set("dm-origin", parsed.origin);
  return proxyUrl.toString();
}

function buildPlayerSourceUrls(urls, proxyBasePath) {
  if (!proxyBasePath || window.location.origin === urls.origin) {
    return {
      DASH: urls.dashUrl,
      HLS: urls.hlsUrl,
    };
  }

  return {
    DASH: proxiedUrl(urls.dashUrl, proxyBasePath),
    HLS: proxiedUrl(urls.hlsUrl, proxyBasePath),
  };
}

function buildUrls(sourceUrl, token, width, height) {
  const playUrl = new URL(sourceUrl, window.location.href);
  const baseUrl = new URL(`${removePlaySuffix(playUrl.pathname)}/`, playUrl.origin);
  const safeWidth = Math.max(1, Math.round(width || 1280));
  const safeHeight = Math.max(1, Math.round(height || 720));

  return {
    origin: playUrl.origin,
    dashUrl: withOptionalToken(new URL("manifest.mpd", baseUrl).toString(), token),
    hlsUrl: withOptionalToken(new URL("manifest.m3u8", baseUrl).toString(), token),
    posterUrl: withOptionalToken(
      new URL(`as/thumbnail.jpeg?width=${safeWidth}&height=${safeHeight}`, baseUrl).toString(),
      token,
    ),
  };
}

function loadViewerDependencies(origin) {
  if (!dependencyPromises.has(origin)) {
    const cssUrl = new URL(DEFAULT_VIEWER_ASSET_PATHS.css, origin).toString();
    const videoPlayerUrl = new URL(DEFAULT_VIEWER_ASSET_PATHS.videoPlayer, origin).toString();
    const corePlayerUrl = new URL(DEFAULT_VIEWER_ASSET_PATHS.corePlayer, origin).toString();

    const dependencyPromise = (async () => {
      ensureDocumentStyle("adobe-dm-video-player-base-styles", `
        adobe-dm-video-player {
          display: block;
          width: 100%;
          min-height: 240px;
          background: #000;
          position: relative;
        }

        adobe-dm-video-player .adobe-dm-video-player__container {
          width: 100%;
          height: 100%;
          min-height: inherit;
          background: #000;
        }

        adobe-dm-video-player .adobe-dm-video-player__status {
          position: absolute;
          inset: 0;
          display: grid;
          place-items: center;
          padding: 1rem;
          color: #fff;
          background: #000;
          font: 500 14px/1.4 sans-serif;
          text-align: center;
        }

        adobe-dm-video-player .adobe-dm-video-player__status[hidden] {
          display: none;
        }

        .vjs-text-track-display {
          display: none;
        }
      `);

      await ensureStylesheet(cssUrl);
      await ensureScript(corePlayerUrl, () => !!window.dmViewers?.CorePlayer);
      await ensureScript(videoPlayerUrl, () => !!window.dmViewers?.VideoPlayer);

      if (!window.dmViewers?.VideoPlayer || !window.dmViewers?.CorePlayer) {
        throw new Error("Adobe Dynamic Media player runtime did not initialize correctly.");
      }
    })();

    dependencyPromises.set(origin, dependencyPromise);
  }

  return dependencyPromises.get(origin);
}

class AdobeDmVideoPlayer extends HTMLElement {
  static get observedAttributes() {
    return ["src", "token", "autoplay", "controls", "letterboxed", "proxy-base-path", "styles", "stylesheet"];
  }

  static get CSS_VAR_MAPPINGS() {
    return [
      { prop: "--vjs-control-bar-bg",      selector: ".vjs-control-bar",                                    rule: "background-color" },
      { prop: "--vjs-progress-color",       selector: ".vjs-play-progress",                                  rule: "background-color" },
      { prop: "--vjs-load-progress-color",  selector: ".vjs-load-progress",                                  rule: "background-color" },
      { prop: "--vjs-big-play-bg",          selector: ".vjs-big-play-button",                                rule: "background-color" },
      { prop: "--vjs-big-play-border",      selector: ".vjs-big-play-button",                                rule: "border-color" },
      { prop: "--vjs-big-play-color",       selector: ".vjs-big-play-button .vjs-icon-placeholder::before",  rule: "color" },
      { prop: "--vjs-volume-bar-color",     selector: ".vjs-volume-level",                                   rule: "background-color" },
      { prop: "--vjs-control-color",        selector: ".vjs-control-bar button",                             rule: "color" },
    ];
  }

  constructor() {
    super();
    this.player = null;
    this.renderVersion = 0;
    this.resizeObserver = null;
    this.debugInfo = null;
    this._stylesheetUrl = null;
    this.containerId = `adobe-dm-video-player-${++playerSequence}`;
    this.container = document.createElement("div");
    this.container.id = this.containerId;
    this.container.className = "adobe-dm-video-player__container";
    this.status = document.createElement("div");
    this.status.className = "adobe-dm-video-player__status";
    this.status.hidden = true;
    this.append(this.container, this.status);
  }

  connectedCallback() {
    if (!this.style.minHeight) {
      this.style.minHeight = "240px";
    }

    if (!this.resizeObserver) {
      this.resizeObserver = new ResizeObserver(() => {
        if (!this.player) {
          return;
        }

        this.player?.trigger?.("componentresize");
      });

      this.resizeObserver.observe(this);
    }

    this._updateCustomPropsStyle();
    this._updateCustomStyles();
    this._updateStylesheet();
    this.renderPlayer();
  }

  disconnectedCallback() {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.disposePlayer();
    document.getElementById(`${this.containerId}-custom-props`)?.remove();
    document.getElementById(`${this.containerId}-custom-styles`)?.remove();
    this._cleanupStylesheet();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue || !this.isConnected) {
      return;
    }

    if (name === "src" && !newValue) {
      this.disposePlayer();
      this.showStatus("Set the `src` attribute to a Dynamic Media `/play` URL.");
      return;
    }

    if (name === "styles") {
      this._updateCustomStyles();
      return;
    }

    if (name === "stylesheet") {
      this._updateStylesheet();
      return;
    }

    this.renderPlayer();
  }

  get customStyles() {
    return this.getAttribute("styles") ?? "";
  }

  set customStyles(value) {
    if (value == null || value === "") {
      this.removeAttribute("styles");
    } else {
      this.setAttribute("styles", value);
    }
  }

  _updateCustomPropsStyle() {
    const scope = `#${this.containerId}`;
    const rules = AdobeDmVideoPlayer.CSS_VAR_MAPPINGS
      .map(({ prop, selector, rule }) => `${scope} ${selector} { ${rule}: var(${prop}); }`)
      .join("\n");
    ensureDocumentStyle(`${this.containerId}-custom-props`, rules);
  }

  _updateCustomStyles() {
    const raw = this.getAttribute("styles") || "";
    const styleId = `${this.containerId}-custom-styles`;
    if (!raw.trim()) {
      document.getElementById(styleId)?.remove();
      return;
    }
    let scoped;
    try {
      scoped = scopeStyles(raw, `#${this.containerId}`);
    } catch {
      console.warn("[adobe-dm-video-player] Could not parse `styles` attribute CSS.", raw);
      return;
    }
    ensureDocumentStyle(styleId, scoped);
  }

  _updateStylesheet() {
    const rawAttr = this.getAttribute("stylesheet") || "";
    const url = rawAttr ? new URL(rawAttr, window.location.href).toString() : "";
    const prevUrl = this._stylesheetUrl || "";

    if (url === prevUrl) return;

    if (prevUrl) {
      const refs = instanceStylesheets.get(prevUrl);
      refs?.delete(this.containerId);
      if (refs?.size === 0) {
        instanceStylesheets.delete(prevUrl);
        document.querySelector(`link[href="${prevUrl}"]`)?.remove();
      }
    }

    this._stylesheetUrl = url || null;
    if (!url) return;

    if (!instanceStylesheets.has(url)) {
      instanceStylesheets.set(url, new Set());
    }
    instanceStylesheets.get(url).add(this.containerId);

    ensureStylesheet(url).catch((err) => {
      console.warn("[adobe-dm-video-player] Failed to load stylesheet:", url, err);
      this.dispatchEvent(new CustomEvent("adobe-dm-player-stylesheet-error", {
        detail: { url, error: err },
        bubbles: true,
      }));
    });
  }

  _cleanupStylesheet() {
    const url = this._stylesheetUrl;
    if (!url) return;
    const refs = instanceStylesheets.get(url);
    refs?.delete(this.containerId);
    if (refs?.size === 0) {
      instanceStylesheets.delete(url);
      document.querySelector(`link[href="${url}"]`)?.remove();
    }
    this._stylesheetUrl = null;
  }

  getToken(src) {
    return this.getAttribute("token") || new URL(src, window.location.href).searchParams.get("token");
  }

  getBooleanAttribute(name, defaultValue) {
    return parseBooleanAttribute(this.getAttribute(name), defaultValue);
  }

  buildInitOptions(urls, proxyBasePath) {
    const playerSourceUrls = buildPlayerSourceUrls(urls, proxyBasePath);

    return {
      sources: {
        DASH: playerSourceUrls.DASH,
        HLS: playerSourceUrls.HLS,
      },
      posterImage: urls.posterUrl,
      solution: "polaris",
      autoplay: this.getBooleanAttribute("autoplay", false),
      controls: this.getBooleanAttribute("controls", true),
      isLetterBoxed: this.getBooleanAttribute("letterboxed", false),
    };
  }

  updateDebugInfo(src, token, proxyBasePath, urls, initOptions) {
    this.debugInfo = {
      containerId: this.containerId,
      src,
      token,
      proxyBasePath,
      resolvedUrls: urls,
      initOptions,
    };
    this.__debug = this.debugInfo;
    window.__adobeDmVideoPlayerDebug = window.__adobeDmVideoPlayerDebug || {};
    window.__adobeDmVideoPlayerDebug[this.containerId] = this.debugInfo;
  }

  hideStatus() {
    this.status.hidden = true;
  }

  async renderPlayer() {
    const src = this.getAttribute("src");
    if (!src) {
      this.showStatus("Set the `src` attribute to a Dynamic Media `/play` URL.");
      return;
    }

    const version = ++this.renderVersion;
    const token = this.getToken(src);
    const proxyBasePath = this.getAttribute("proxy-base-path");
    const rect = this.getBoundingClientRect();
    const urls = buildUrls(src, token, rect.width, rect.height);
    const initOptions = this.buildInitOptions(urls, proxyBasePath);

    this.updateDebugInfo(src, token, proxyBasePath, urls, initOptions);

    this.showStatus("Loading Adobe Dynamic Media player…");

    try {
      await loadViewerDependencies(urls.origin);

      if (version !== this.renderVersion) {
        return;
      }

      this.disposePlayer();
      this.container.innerHTML = "";

      const initPromise = window.dmViewers.VideoPlayer.init(this.containerId, initOptions);

      const player = await initPromise;

      if (version !== this.renderVersion) {
        player?.dispose?.();
        return;
      }

      player?.setupPlayer?.(window.dmViewers.CorePlayer);
      this.player = player;
      this.hideStatus();
      this.dispatchEvent(new CustomEvent("adobe-dm-player-ready", {
        detail: { player },
      }));
    } catch (error) {
      if (version !== this.renderVersion) {
        return;
      }

      this.disposePlayer();
      this.showStatus("Unable to load the Adobe Dynamic Media player.");
      if (this.debugInfo) {
        this.debugInfo.error = {
          message: error?.message,
          stack: error?.stack,
        };
      }
      this.dispatchEvent(new CustomEvent("adobe-dm-player-error", {
        detail: { error },
      }));
      console.error(error);
    }
  }

  showStatus(message) {
    this.status.textContent = message;
    this.status.hidden = false;
  }

  disposePlayer() {
    if (this.player?.dispose) {
      try {
        this.player.dispose();
      } catch (error) {
        console.warn("Failed to dispose Adobe Dynamic Media player cleanly.", error);
      }
    }

    this.player = null;
    this.container.innerHTML = "";
  }

  play() {
    this.player?.play?.();
  }

  pause() {
    this.player?.pause?.();
  }
}

if (!customElements.get("adobe-dm-video-player")) {
  customElements.define("adobe-dm-video-player", AdobeDmVideoPlayer);
}
