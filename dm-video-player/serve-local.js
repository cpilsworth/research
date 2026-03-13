#!/usr/bin/env node

const http = require("http");
const fs = require("fs");
const path = require("path");

const host = process.env.HOST || "127.0.0.1";
const port = Number.parseInt(process.env.PORT || "4173", 10);
const rootDir = __dirname;
const proxyBasePath = "/__dm_proxy__";

const MIME_TYPES = {
  ".css": "text/css; charset=UTF-8",
  ".html": "text/html; charset=UTF-8",
  ".js": "text/javascript; charset=UTF-8",
  ".json": "application/json; charset=UTF-8",
  ".map": "application/json; charset=UTF-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=UTF-8",
};

function send(response, statusCode, body, contentType) {
  response.writeHead(statusCode, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
  });
  response.end(body);
}

function proxyTargetUrl(requestUrl) {
  const origin = requestUrl.searchParams.get("dm-origin");
  if (!origin) {
    return null;
  }

  const proxiedPath = requestUrl.pathname.slice(proxyBasePath.length) || "/";
  const targetUrl = new URL(proxiedPath, origin);
  for (const [key, value] of requestUrl.searchParams.entries()) {
    if (key !== "dm-origin") {
      targetUrl.searchParams.append(key, value);
    }
  }
  return targetUrl;
}

function rewriteProxyUrl(reference, baseUrl, pageOrigin) {
  const resolved = new URL(reference, baseUrl);
  const proxyUrl = new URL(`${proxyBasePath}${resolved.pathname}`, pageOrigin);
  proxyUrl.search = resolved.search;
  proxyUrl.searchParams.set("dm-origin", resolved.origin);
  return proxyUrl.toString();
}

function escapeXml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function rewriteHlsManifest(manifestText, manifestUrl, pageOrigin) {
  return manifestText
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return line;
      }

      if (!trimmed.startsWith("#")) {
        return rewriteProxyUrl(trimmed, manifestUrl, pageOrigin);
      }

      return line.replace(/URI="([^"]+)"/g, (_match, uri) => `URI="${rewriteProxyUrl(uri, manifestUrl, pageOrigin)}"`);
    })
    .join("\n");
}

function rewriteDashManifest(manifestText, manifestUrl, pageOrigin) {
  return manifestText
    .replace(/(initialization|media|sourceURL)="([^"]+)"/g, (_match, attribute, value) => {
      return `${attribute}="${escapeXml(rewriteProxyUrl(value, manifestUrl, pageOrigin))}"`;
    })
    .replace(/<BaseURL>([^<]+)<\/BaseURL>/g, (_match, value) => {
      return `<BaseURL>${escapeXml(rewriteProxyUrl(value, manifestUrl, pageOrigin))}</BaseURL>`;
    });
}

function getFilePath(urlPath) {
  const requestPath = urlPath === "/" ? "/index.html" : urlPath;
  const normalizedPath = path.normalize(decodeURIComponent(requestPath)).replace(/^(\.\.[/\\])+/, "");
  return path.join(rootDir, normalizedPath);
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${host}:${port}`);

  if (requestUrl.pathname.startsWith(proxyBasePath)) {
    const targetUrl = proxyTargetUrl(requestUrl);
    if (!targetUrl) {
      send(response, 400, "Missing dm-origin query parameter", "text/plain; charset=UTF-8");
      return;
    }

    try {
      const upstream = await fetch(targetUrl, { redirect: "follow" });
      if (!upstream.ok) {
        send(response, upstream.status, `Upstream request failed: ${upstream.status}`, "text/plain; charset=UTF-8");
        return;
      }

      const pageOrigin = `http://${host}:${port}`;
      const extname = path.extname(targetUrl.pathname).toLowerCase();

      if (extname === ".m3u8") {
        const manifest = await upstream.text();
        send(response, 200, rewriteHlsManifest(manifest, targetUrl, pageOrigin), "application/vnd.apple.mpegurl");
        return;
      }

      if (extname === ".mpd") {
        const manifest = await upstream.text();
        send(response, 200, rewriteDashManifest(manifest, targetUrl, pageOrigin), "application/dash+xml");
        return;
      }

      response.writeHead(200, {
        "Content-Type": upstream.headers.get("content-type") || "application/octet-stream",
        "Cache-Control": "no-store",
      });

      const buffer = Buffer.from(await upstream.arrayBuffer());
      response.end(buffer);
      return;
    } catch (error) {
      send(response, 502, `Proxy error: ${error.message}`, "text/plain; charset=UTF-8");
      return;
    }
  }

  const filePath = getFilePath(requestUrl.pathname);

  if (!filePath.startsWith(rootDir)) {
    send(response, 403, "Forbidden", "text/plain; charset=UTF-8");
    return;
  }

  fs.readFile(filePath, (error, contents) => {
    if (error) {
      if (error.code === "ENOENT") {
        send(response, 404, "Not found", "text/plain; charset=UTF-8");
        return;
      }

      send(response, 500, "Internal server error", "text/plain; charset=UTF-8");
      return;
    }

    const extname = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[extname] || "application/octet-stream";
    send(response, 200, contents, contentType);
  });
});

server.listen(port, host, () => {
  console.log(`Serving dm-video-player at http://${host}:${port}`);
});
