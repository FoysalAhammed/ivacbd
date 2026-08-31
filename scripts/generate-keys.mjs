// ============================================================
//  Generate the ECDSA P-256 signing keypair for license tokens.
//
//    node scripts/generate-keys.mjs
//
//  • PRIVATE key  → paste into the server env (LICENSE_SIGNING_PRIVATE_KEY).
//                   NEVER ships in the extension.
//  • PUBLIC key   → paste into extension/src/license.js (PUBLIC_KEY_SPKI_B64)
//                   AND the server env (LICENSE_SIGNING_PUBLIC_KEY).
//  Both are base64-encoded DER (PKCS8 for private, SPKI for public), the
//  formats the server's crypto and the extension's Web Crypto both accept.
// ============================================================
import crypto from "node:crypto";

const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", {
  namedCurve: "P-256", // aka prime256v1 / secp256r1 — ES256
});

const privB64 = privateKey.export({ type: "pkcs8", format: "der" }).toString("base64");
const pubB64 = publicKey.export({ type: "spki", format: "der" }).toString("base64");

const line = "─".repeat(64);
console.log(`\n${line}\n  IVAC license signing keypair (ECDSA P-256 / ES256)\n${line}\n`);

console.log("① Add these to your server environment (.env.local / Vercel):\n");
console.log(`LICENSE_SIGNING_PRIVATE_KEY=${privB64}`);
console.log(`LICENSE_SIGNING_PUBLIC_KEY=${pubB64}`);
console.log(`LICENSE_SIGNING_KEY_ID=k1`);

console.log("\n② Paste the PUBLIC key into extension/src/license.js:\n");
console.log(`   const PUBLIC_KEY_SPKI_B64 = "${pubB64}";`);
console.log(`   const LICENSE_KEY_ID = "k1";`);

console.log(`\n${line}`);
console.log("  Keep the PRIVATE key secret. It must never enter the extension,");
console.log("  the customer website, or any client-side bundle.");
console.log(`${line}\n`);
