// ============================================================
//  Cross-artifact consistency: the extension (src/license.js +
//  background.js + manifest.json) and the backend share several
//  constants that MUST agree but live in different files/rep-halves.
//  A silent drift here (e.g. renaming the cache key, bumping the
//  payload version on one side, or changing the API host in
//  background.js but not the manifest host_permissions) produces a
//  build that looks fine yet never activates. These string/JSON checks
//  are cheap insurance against exactly that.
// ============================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { LICENSE_PAYLOAD_VERSION } from "../src/shared/constants.ts";

const ext = (rel) => fileURLToPath(new URL("../../extension/" + rel, import.meta.url));
const licenseJs = readFileSync(ext("src/license.js"), "utf8");
const backgroundJs = readFileSync(ext("background.js"), "utf8");
const manifest = JSON.parse(readFileSync(ext("manifest.json"), "utf8"));

const grab = (src, re) => {
  const m = src.match(re);
  assert.ok(m, `pattern ${re} not found`);
  return m[1];
};

test("extension PAYLOAD_VERSION matches the backend's LICENSE_PAYLOAD_VERSION", () => {
  const v = Number(grab(licenseJs, /PAYLOAD_VERSION\s*=\s*(\d+)/));
  assert.equal(v, LICENSE_PAYLOAD_VERSION);
});

test("extension LICENSE_KEY_ID is k1 (the server keyId() default)", () => {
  assert.equal(grab(licenseJs, /LICENSE_KEY_ID\s*=\s*'([^']+)'/), "k1");
});

test("the embedded public key is a valid P-256 SPKI key (Web Crypto importable)", async () => {
  const b64 = grab(licenseJs, /PUBLIC_KEY_SPKI_B64\s*=\s*'([^']+)'/);
  const key = await crypto.subtle.importKey(
    "spki", Buffer.from(b64, "base64"),
    { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"],
  );
  assert.equal(key.type, "public");
});

test("cache + install storage keys agree between license.js and background.js", () => {
  const cache = grab(licenseJs, /CACHE_KEY\s*=\s*'([^']+)'/);
  const install = grab(licenseJs, /INSTALL_KEY\s*=\s*'([^']+)'/);
  assert.ok(backgroundJs.includes(`"${cache}"`), `background.js must reference cache key ${cache}`);
  assert.ok(backgroundJs.includes(`"${install}"`), `background.js must reference install key ${install}`);
});

test("every endpoint the client calls is whitelisted in background.js", () => {
  const endpoints = [...licenseJs.matchAll(/bgFetch\('([^']+)'/g)].map((m) => m[1]);
  assert.ok(endpoints.length >= 3, "expected activate/validate/deactivate calls");
  for (const e of endpoints) {
    assert.ok(backgroundJs.includes(`"${e}"`), `background.js LICENSE_ENDPOINTS must include ${e}`);
  }
});

test("hard-rejection codes agree between the two halves", () => {
  for (const code of ["REVOKED", "BLOCKED", "SUSPENDED", "EXPIRED", "INVALID_KEY", "NOT_FOUND"]) {
    assert.ok(licenseJs.includes(`'${code}'`), `license.js HARD_CODES missing ${code}`);
    assert.ok(backgroundJs.includes(`"${code}"`), `background.js LICENSE_HARD_CODES missing ${code}`);
  }
});

test("DEPLOY GOTCHA: background LICENSE_API_BASE host is in manifest host_permissions", () => {
  const base = grab(backgroundJs, /LICENSE_API_BASE\s*=\s*"([^"]+)"/);
  const host = base.replace(/\/+$/, "");
  const hosts = manifest.host_permissions || [];
  assert.ok(
    hosts.some((h) => h.startsWith(host)),
    `manifest host_permissions ${JSON.stringify(hosts)} must cover ${host} (update BOTH together)`,
  );
});

test("manifest wires alarms + license.js content script", () => {
  assert.ok((manifest.permissions || []).includes("alarms"), "alarms permission required");
  const scripts = (manifest.content_scripts || []).flatMap((c) => c.js || []);
  assert.ok(scripts.includes("src/license.js"), "src/license.js must be a registered content script");
  // license.js must load after core.js (it depends on window.VA)
  const group = (manifest.content_scripts || []).find((c) => (c.js || []).includes("src/license.js"));
  assert.ok(group.js.indexOf("src/core.js") < group.js.indexOf("src/license.js"), "core.js must load before license.js");
});
