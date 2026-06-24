import { describe, it, expect, beforeEach } from "vitest";
import { env, SELF } from "cloudflare:test";
import { createMockOp } from "./mock-op.js";
import { mintSessionCookie } from "../src/session.js";
import { seedDiscovery } from "./helpers.js";

const config = { sessionKey: "test-hmac-key-at-least-32-bytes-long!!", sessionTtlSeconds: 3600 };

async function sessionCookie(groups) {
  const sc = await mintSessionCookie({ sub: "user-123", groups }, config);
  return sc.match(/__gate_session=([^;]*)/)[1];
}

beforeEach(async () => {
  // Seed discovery/JWKS using the worker's configured issuer so the KV cache hit
  // avoids a live outbound fetch (which the outboundService stub would 502).
  const op = await createMockOp({ issuer: env.OIDC_ISSUER });
  await seedDiscovery(env.OIDC_ISSUER, op.discovery, op.jwks);
});

describe("gate end-to-end", () => {
  it("P4 public path forwards without auth", async () => {
    const res = await SELF.fetch("https://www.example.com/blog/post");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("origin-body");
  });
  it("P1 protected path with no session → 302 to IdP", async () => {
    const res = await SELF.fetch("https://www.example.com/protected/x", { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("/authorize");
  });
  it("N14 secured path with no session → 401 JSON, no redirect", async () => {
    const res = await SELF.fetch("https://www.example.com/api/orders");
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.headers.get("location")).toBeNull();
  });
  it("P5/P7 secured path with authorized session → forward", async () => {
    const cookie = `__gate_session=${await sessionCookie(["secure"])}`;
    const res = await SELF.fetch("https://www.example.com/api/orders", { headers: { cookie } });
    expect(res.status).toBe(200);
  });
  it("N15 authenticated but wrong audience → navigation gets origin error page", async () => {
    const cookie = `__gate_session=${await sessionCookie(["other-group"])}`;
    const res = await SELF.fetch("https://www.example.com/protected/medical/x", {
      headers: { cookie, "sec-fetch-mode": "navigate" },
    });
    expect(res.status).toBe(403);
    expect(await res.text()).toBe("origin-body");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("N15b authenticated but wrong audience → sub-resource fetch gets JSON 403, no cascading error page", async () => {
    const cookie = `__gate_session=${await sessionCookie(["other-group"])}`;
    const res = await SELF.fetch("https://www.example.com/protected/medical/footer", {
      headers: { cookie, "sec-fetch-mode": "cors" },
    });
    expect(res.status).toBe(403);
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("N17 media_* files under any path are always public without auth", async () => {
    for (const path of [
      "/media_abc.jpg",
      "/protected/media_abc.jpg",
      "/protected/medical/media_abc.jpg",
      "/protected/market-access/media_xyz.png",
    ]) {
      const res = await SELF.fetch(`https://www.example.com${path}`);
      expect(res.status, path).toBe(200);
    }
  });

  it("N16 public assets load without auth even when user lacks role for protected page", async () => {
    const cookie = `__gate_session=${await sessionCookie(["other-group"])}`;
    for (const path of ["/styles/main.css", "/scripts/app.js", "/blocks/header.js", "/icons/logo.svg"]) {
      const res = await SELF.fetch(`https://www.example.com${path}`, { headers: { cookie } });
      expect(res.status, path).toBe(200);
    }
  });

  it("malformed session cookies fail closed without 500", async () => {
    const protectedRes = await SELF.fetch("https://www.example.com/protected/x", {
      redirect: "manual",
      headers: { cookie: "__gate_session=%" },
    });
    expect(protectedRes.status).toBe(302);
    expect(protectedRes.status).toBeLessThan(500);

    const securedRes = await SELF.fetch("https://www.example.com/api/orders", {
      headers: { cookie: "__gate_session=not-valid!!!" },
    });
    expect(securedRes.status).toBe(401);
    expect(securedRes.status).toBeLessThan(500);
  });
});
