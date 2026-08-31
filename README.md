# IVAC License Backend

The license API, seller/admin dashboard, and customer sales website — one Next.js 14 (App Router) app on Vercel, backed by MongoDB Atlas.

- **Runtime:** Node.js ≥ 18 (developed on Node 24). Uses the official `mongodb` driver (no Prisma) + Zod.
- **Signing:** ECDSA P-256 / ES256. Server signs; the extension verifies with the public half.
- **Auth:** admin sessions are HMAC-signed cookies. First admin is created via a one-time bootstrap token.

> This is the backend runbook. For the overall architecture and the extension-wiring checklist, see the [repo root README](../README.md).

---

## 1. Prerequisites

- Node.js 18+ and npm
- A **MongoDB Atlas** cluster (free tier is fine) — [cloud.mongodb.com](https://cloud.mongodb.com)
- A **Vercel** account for deployment — [vercel.com](https://vercel.com)

## 2. Install

```bash
cd app
npm install
```

## 3. Generate the license signing keypair

```bash
npm run gen:keys
```

This prints an ECDSA P-256 keypair and tells you exactly where each half goes:

- **`LICENSE_SIGNING_PRIVATE_KEY`** and **`LICENSE_SIGNING_PUBLIC_KEY`** → the server env (step 5).
- The **public** key → also paste into `extension/src/license.js` (`PUBLIC_KEY_SPKI_B64`).

The private key must **never** leave the server. It is not committed and not shipped in any client bundle.

## 4. MongoDB Atlas

1. Create a cluster and a database user (username + password).
2. Network access: allow your dev IP, and add `0.0.0.0/0` **only if** you rely on Vercel's dynamic egress IPs (or use Atlas's Vercel integration).
3. Atlas → **Connect → Drivers** → copy the SRV connection string. Put the database name in the path, e.g.
   `mongodb+srv://USER:PASS@cluster0.xxxxx.mongodb.net/ivac_license?retryWrites=true&w=majority`

## 5. Environment variables

Copy the template and fill it in:

```bash
cp .env.example .env.local
```

| Variable | Scope | Notes |
|---|---|---|
| `MONGODB_URI` | **server only** | SRV string incl. db name. Never expose to any client. |
| `MONGODB_DB` | server | Database name (default `ivac_license`). |
| `LICENSE_SIGNING_PRIVATE_KEY` | **server only** | base64 PKCS8 DER, from `gen:keys`. Secret. |
| `LICENSE_SIGNING_PUBLIC_KEY` | server | base64 SPKI DER. Also embedded in the extension. |
| `LICENSE_SIGNING_KEY_ID` | server | `k1` by default; must match the extension's `LICENSE_KEY_ID`. |
| `ADMIN_AUTH_SECRET` | **server only** | 32+ random bytes; signs admin session cookies. |
| `ADMIN_BOOTSTRAP_TOKEN` | **server only** | One-time token to create the first admin. **Delete after use.** |
| `NEXT_PUBLIC_API_URL` | public | Origin the site + extension call. Must equal the extension's `LICENSE_API_BASE`. |
| `NEXT_PUBLIC_BKASH_NUMBER` | public | Shown in the purchase modal. |
| `NEXT_PUBLIC_PRODUCT_NAME` | public | Display name. |
| `LICENSE_VALIDATION_INTERVAL_HOURS` | server | Offline-trust window before re-validation (~24). |
| `OFFLINE_GRACE_PERIOD_HOURS` | server | Extra grace if the backend is unreachable (~72). |
| `CORS_ALLOWED_ORIGINS` | server | Extra origins allowed to call public APIs. |

> Anything prefixed `NEXT_PUBLIC_` is bundled into the browser — **never** put secrets there. `MONGODB_URI`, the private key, `ADMIN_AUTH_SECRET`, and `ADMIN_BOOTSTRAP_TOKEN` are server-only.

Generate a strong `ADMIN_AUTH_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

## 6. Provision the database

Creates indexes and seeds the default 1 / 3 / 5-PC plans. Idempotent — safe to re-run.

```bash
npm run setup:db
```

## 7. Create the first admin

Run the app (`npm run dev`, step 8) or hit your deployed URL, then POST the bootstrap token once:

```bash
curl -X POST "$NEXT_PUBLIC_API_URL/api/admin/bootstrap" \
  -H "Content-Type: application/json" \
  -d '{"token":"<ADMIN_BOOTSTRAP_TOKEN>","username":"admin","password":"<10+ chars>"}'
```

Then **remove `ADMIN_BOOTSTRAP_TOKEN`** from the environment so no second bootstrap is possible. Log in at `/admin/login`.

## 8. Local development

```bash
npm run dev      # http://localhost:3000
```

- Customer site: `/`
- Admin dashboard: `/admin` (redirects to `/admin/login` until authenticated)

## 9. Deploy to Vercel

1. Import the repo into Vercel. Set the **Root Directory** to `app`.
2. Add every server + public env var from step 5 in **Settings → Environment Variables**.
3. Deploy. Note the production URL (e.g. `https://your-app.vercel.app`).
4. Set `NEXT_PUBLIC_API_URL` to that URL and redeploy so the public bundle points at itself.
5. Run `npm run setup:db` against the production `MONGODB_URI` (from your machine with prod env, or a one-off job), then bootstrap the admin (step 7) against the production URL.
6. **Wire the extension** to the production URL — see the [checklist in the root README](../README.md#-deploy-wiring-checklist--do-this-once-get-all-four-right).

## 10. Quality gate

```bash
npm test          # Node built-in test runner — 33 tests
npm run typecheck # tsc --noEmit
npm run lint      # next lint
npm run build     # next build
```

The tests cover the signing↔verification contract (including the extension's exact Web Crypto path), fail-closed behavior when keys are unconfigured, key generation/hashing/masking, the shared validation regexes, and cross-artifact consistency between `app/` and `extension/`.

---

## API surface

**Public** (called by the extension via `background.js`, or by the website):

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/license/activate` | Bind a key to an installation, return a signed license. |
| POST | `/api/license/validate` | Background re-validation (~24h). |
| POST | `/api/license/deactivate-device` | Free a device slot. |
| GET  | `/api/license/status` | Lightweight status probe. |
| GET  | `/api/plans` | List active plans for the site. |
| POST | `/api/customer/purchase` | Submit a manual bKash payment claim. |

**Admin** (cookie-authenticated): `/api/admin/{bootstrap,login,logout,stats,plans,customers,licenses,payments,devices/deactivate,audit}` and nested `[id]` / verify / reject routes. Admin UI: `/admin`, `/admin/{audit,customers,licenses,payments,plans}`.

## Manual payment → license flow

1. Customer picks a plan and submits their bKash **sender number + transaction id** → a `PENDING_VERIFICATION` request (no license yet).
2. Admin reviews under **/admin/payments**, then **verifies** → the system creates/reuses the customer, generates a license + subscription, and reveals the plaintext key **once**. Or **rejects** with a reason.
3. Nothing is auto-verified; no payment is ever fabricated.

## Troubleshooting

- **`MONGODB_URI is not set — database calls will fail`** during `next build`: harmless. Dynamic pages defer DB access to request time; only static pages (`/`, `/admin/login`) are prerendered.
- **Extension never activates:** confirm the four wiring points agree (root README checklist). Run `npm test` — `extension-consistency.test.mjs` catches key-id / payload / host / storage-key drift.
- **`signLicense … not configured`:** `LICENSE_SIGNING_PRIVATE_KEY` is missing or still a placeholder. Re-run `gen:keys` and set it.
- **Admin login fails after redeploy:** `ADMIN_AUTH_SECRET` changed — existing session cookies are invalidated. Log in again.
- **Second bootstrap rejected:** expected once an admin exists; the token is one-time by design.
