# VAU — Deployment Guide (vaugift.com)

This is the end-to-end runbook for taking VAU live on **vaugift.com**.

---

## 1. Recommended hosting

**Primary recommendation: [Render](https://render.com) (all-in-one) + [Cloudflare](https://cloudflare.com) DNS in front.**

Why this is optimal for VAU specifically:

| Need | How Render + Cloudflare meets it |
|---|---|
| React SPA + Node/Express + Postgres in one stack | Render hosts all three (static site, web service, managed Postgres) from a **single `render.yaml`** and one dashboard — one bill, one place to hand to an agency. |
| Audience in Israel | Render's **Frankfurt** region is the closest (~60–80 ms). Cloudflare's CDN serves the static frontend from an edge node near Tel Aviv, so first paint is fast regardless. |
| Customer data + Israeli privacy law | Managed Postgres with **daily automated backups** and point-in-time options; data stays in the EU region. |
| Low ops burden (no full-time DevOps) | Push to `main` → auto-build & deploy. Health checks, TLS certs, and DB migrations are automated (`preDeployCommand: node init-db.js`). |
| Security posture already built in | The app ships helmet, CORS allow-list, rate limiting, `trust proxy`, `/health/ready`. Cloudflare adds free TLS, DDoS protection and a WAF. |
| Cost at launch | Static site **free** · API **~$7/mo** (starter) · Postgres **~$7/mo** → **≈ $15–20/mo**, scales up only when traffic does. |

**Runners-up (also fine, different trade-offs):**

- **Railway** — even simpler DX, usage-based billing (DB not free; costs can be less predictable). Same Docker image works.
- **Vercel (frontend) + Neon/Supabase (Postgres) + Render/Railway (API)** — best-in-class CDN for the SPA, but three dashboards instead of one.
- **Hetzner / DigitalOcean VPS** — cheapest at scale and full control, but *you* own OS patching, backups, TLS, and process supervision. Not recommended for a launch handed to a non-technical owner.

> The repo is prepared for Render via `render.yaml`, but everything is portable: the backend is a standard Docker image and all config is environment variables, so Railway/Fly/a VPS work with the same artifacts.

---

## 2. One-time deploy on Render

1. **Push the repo to GitHub** (already at `endikalt-spec/Epic`).
2. Render Dashboard → **New → Blueprint** → select this repo. Render reads `render.yaml` and creates `vau-db`, `vau-api`, `vau-web`.
3. When prompted, fill the **`sync: false`** secrets (see §4). You can leave provider keys blank for now — the app boots and stays in safe fallback mode.
4. First deploy runs `node init-db.js` automatically → schema + seed catalog loaded.
5. Add the custom domains (see §3), then verify (see §5).

---

## 3. DNS for vaugift.com

Point the domain at the two Render services. In Render, open each service → **Settings → Custom Domains**, add the hostnames below; Render shows the exact target to use.

| Host | Type | Points to | Purpose |
|---|---|---|---|
| `vaugift.com` (apex) | A / ALIAS | Render static-site target (or CNAME-flatten via Cloudflare) | Main site |
| `www.vaugift.com` | CNAME | `vau-web.onrender.com` | Redirects to apex |
| `api.vaugift.com` | CNAME | `vau-api.onrender.com` | Backend API |

If you put **Cloudflare** in front (recommended): set the records above in Cloudflare, proxy status **ON** (orange cloud) for the web hosts, SSL/TLS mode **Full (strict)**. Cloudflare's CNAME flattening lets the apex point at a CNAME cleanly.

### Email authentication (so voucher emails land in the inbox)

Brevo will show the exact records under **Senders & Domains → Authenticate `vaugift.com`**. You add three record types:

| Record | Type | Value (Brevo gives the exact string) |
|---|---|---|
| SPF | TXT @ | `v=spf1 include:spf.brevo.com mx ~all` |
| DKIM | CNAME/TXT | `mail._domainkey…` provided by Brevo |
| DMARC | TXT `_dmarc` | `v=DMARC1; p=none; rua=mailto:postmaster@vaugift.com` |

Until the domain shows **verified/authenticated** in Brevo, keep `EMAIL_TRANSPORT=log` (vouchers still issue and are shown on-screen; they just aren't emailed yet).

---

## 4. Secret checklist (set in the host, never in git)

**Required to go live:**
- `JWT_SECRET`, `VOUCHER_SECRET` — long random (Render generates these automatically).
- `ADMIN_PASSWORD` — strong password for `admin@vaugift.com`.
- `ADMIN_PHONE` — E.164, enables SMS recovery.

**Per integration (blank = safe fallback):**
- `BREVO_API_KEY` — ⚠️ **rotate the key that was shared earlier in chat** and paste the new one. Enables CRM mirror, transactional email, and SMS recovery.
- `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY` / `STRIPE_WEBHOOK_SECRET` — then set `PAYMENT_PROVIDER=stripe`. Add a Stripe webhook to `https://api.vaugift.com/api/payments/webhook`.
- `ANTHROPIC_API_KEY` — upgrades the gift assistant from rules to Claude (optional).
- `GOOGLE_CLIENT_ID/SECRET`, Apple keys — real social sign-in (optional; without them social login stays disabled in prod).

See `backend/.env.production.example` for the complete annotated list.

---

## 5. Post-deploy verification

```bash
# API is up and the DB is reachable
curl https://api.vaugift.com/health/ready          # → {"status":"ready"}

# Catalog loads from Postgres
curl https://api.vaugift.com/api/experiences | head

# Front loads and points at the API subdomain
open https://vaugift.com
```

Then click through once on the live site:
1. Add a gift → checkout with a test card → voucher code + QR appears.
2. Voucher email arrives (once Brevo domain is verified).
3. The buyer shows up in **Brevo → Contacts**.
4. Admin panel at `https://vaugift.com/?v=admin` → log in → dashboard shows the order.

---

## 6. Go-live switches (do these when ready)

- [ ] Rotate & set `BREVO_API_KEY`; authenticate `vaugift.com` in Brevo; set `EMAIL_TRANSPORT=brevo`.
- [ ] Add Stripe live keys + webhook; set `PAYMENT_PROVIDER=stripe`.
- [ ] Fill the four registration facts in `frontend/src/company.js` (legal name, ח.פ., address, phone) and have an Israeli attorney review Terms & Privacy.
- [ ] Set a strong `ADMIN_PASSWORD`; log in and enrol **2FA** for every admin.
- [ ] Confirm daily Postgres backups are enabled in Render.
- [ ] (Optional) Cloudflare WAF + rate-limiting rules in front of `api.vaugift.com`.

---

## 7. Operations quick reference

- **Redeploy:** push to `main` (auto), or Render → Manual Deploy.
- **Run/refresh DB schema:** happens automatically each deploy (`node init-db.js`, idempotent). To run by hand: Render → `vau-api` → Shell → `node init-db.js`.
- **Logs:** Render → service → Logs. CRM/email failures are logged (`[crm:brevo]`, `[email:brevo]`) but never break checkout.
- **Rollback:** Render → Deploys → Rollback to a previous successful build.
