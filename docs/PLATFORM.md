# VAU Platform — Auth, Payments, Vouchers, Assistant & Anti-Fraud

This document describes the commerce/identity scaffolding added to VAU and how to
plug real providers into each integration seam. Everything ships in **demo mode**
(no external keys) and becomes production-grade by setting `.env` values — see
`backend/.env.example`.

---

## 1. Login (Google / Apple)

- **Frontend:** `LoginModal.jsx` renders "Continue with Google/Apple" buttons.
  Backend `/api/auth/providers` reports whether each provider is configured.
- **Real OAuth:** set `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI` (and the Apple keys).
  The button then redirects to `/api/auth/<provider>/start` → provider consent →
  callback (`/api/auth/google/callback`, `/api/auth/apple/callback`) → the backend
  issues a **JWT** and redirects to the SPA with `?token=…`, which is stored in
  `localStorage`.
- **Demo:** with no keys, the modal collects a name and calls `/api/auth/demo`,
  which issues a JWT immediately — the whole UI is testable without a provider.
- **Session:** JWT (HS256, 30-day). `authOptional` middleware attaches `req.user`.

> Apple's `id_token` is decoded for its claims; for production, verify its
> signature against `https://appleid.apple.com/auth/keys`.

## 2. Payment gateway (ready to plug a real processor)

- **Interface** (`payments.js`): `createPayment / getPayment / verifyWebhook`,
  with a normalized status (`requires_action | processing | succeeded | failed`)
  and three methods: **card (Visa/Mastercard), apple_pay, google_pay**.
- **Adapters:**
  - `mock` (default) — fully functional, no keys. A demo card ending in **0002**
    simulates a decline; anything else succeeds.
  - `stripe` — set `PAYMENT_PROVIDER=stripe` + `STRIPE_SECRET_KEY` and
    `npm i stripe`. Stripe covers card + Apple Pay + Google Pay through
    PaymentIntents, which is why it's the reference adapter.
  - Israeli PSPs (Tranzila, Cardcom, PayPlus, Meshulam, Bit) drop in as sibling
    adapters implementing the same three methods.
- **Checkout is honest:** a voucher is issued **only** when the gateway actually
  returns `succeeded`; a decline returns `402` and no voucher is created.

## 3. E-voucher delivery (email)

- On successful checkout the backend **issues a voucher** and emails it to the
  address entered at checkout (`email.js`). SMTP when configured; otherwise the
  delivery is logged so the flow is testable end-to-end.
- The email contains the code, a **QR code**, and a **Code128 barcode**.

## 4. Vouchers — QR + barcode, personalized vs bearer

Each voucher (`vouchers.js`) carries:

| Field       | Purpose |
|-------------|---------|
| `code`      | Human code the recipient types (e.g. `VAU-7F3KQ9M2`) — unambiguous alphabet. |
| `token`     | Opaque secret embedded in the QR link — makes the QR URL unguessable. |
| `signature` | **HMAC-SHA256** over `code|token|type|recipient` — proves authenticity offline. |
| `type`      | `bearer` (неименной) — anyone with the code can redeem; `personalized` (именной) — bound to the recipient's email. |
| `qr`        | PNG data-URL of the redemption URL (`/redeem?code=…&t=…&s=…`). |
| `barcode`   | Code128 PNG data-URL of the code — for POS scanners at partner venues. |
| `expiresAt` | Validity window (default ~2 years). |

**Personalized vouchers** fold a hash of the recipient's email into the signature,
so the voucher can only be validated together with that identity.

## 5. Anti-fraud model

Threats and the control that mitigates each:

| # | Threat | Control |
|---|--------|---------|
| 1 | **Forged codes** | HMAC signature check (`verifySignature`) — a fabricated code carries no valid signature, rejected before any DB hit. |
| 2 | **Code brute-force / enumeration** | Per-IP **velocity limit** on activation & redemption attempts (`fraud.tooManyAttempts`, default 10/hour → `429`). |
| 3 | **Double-spend** | **Single-use atomic** transition: `UPDATE vouchers SET status='redeemed' WHERE code=$1 AND status='active' RETURNING id`. Only one request can flip the row; a second gets `409 already_redeemed`. |
| 4 | **Wrong recipient** (personalized) | Redemption requires the recipient's email to hash-match `recipient_ref`; a mismatch is rejected (`recipient_mismatch`). |
| 5 | **Expired vouchers** | Expiry checked at validation time. |
| 6 | **Auditability** | Every attempt is written to `redemption_attempts` (code, IP, result). |

Redemption is **two-step**: `/api/vouchers/activate` verifies the voucher and
returns the choices; `/api/vouchers/redeem` performs the single-use atomic
selection. The frontend `RedeemView` prefills `code/token/signature` from the
scanned QR link and, for personalized vouchers, asks for the recipient email.

> **Production hardening:** move the in-memory rate limiter to Redis, verify
> Apple `id_token` signatures, add webhook-driven payment reconciliation, and
> consider binding personalized redemption to a signed-in account.

## 6. Voucher exchange (swap / upgrade with top-up)

The recipient can swap the gifted experience for a different one — e.g. a
₪450 spa night → a ₪1,490 private-chef-at-home. Flow (`ExchangeView` +
`/api/vouchers/exchange`):

1. Enter the code (recipient email too, for personalized vouchers) → the backend
   validates the voucher and returns its **face value**.
2. Pick a new experience from the catalog; each card shows the **top-up**
   (`max(0, newPrice − faceValue)`).
3. If there's a difference, pay it via the gateway (card / Apple Pay / Google Pay).
4. The voucher is **atomically re-pointed** to the new experience and its face
   value bumped; it's then redeemed as usual.

Honest by construction: the swap is committed only after the top-up charge
actually succeeds, and the update runs `WHERE status='active'` so a redeemed
voucher can't be exchanged. `quoteOnly: true` previews the top-up without
charging. A cheaper target incurs no top-up (the extra credit is retained as
face value, not refunded).

## 7. AI Gift Assistant

- **Frontend:** `AiAssistant.jsx` — a floating concierge. The buyer describes the
  recipient; the assistant recommends experiences **from VAU's own catalog** and
  can add them straight to the gift box.
- **Backend** (`assistant.js`): `/api/assistant` uses **Anthropic Claude**
  (`claude-opus-5`) when `ANTHROPIC_API_KEY` is set, returning structured JSON
  (`reply`, `experienceIds`) constrained to catalog IDs, and handling
  `stop_reason: "refusal"`. With no key, a **deterministic keyword recommender**
  keeps the feature working. The catalog is passed in from the client, so the
  assistant never invents experiences that don't exist.

---

## API surface (added)

```
GET  /api/auth/providers
GET  /api/auth/:provider/start            → OAuth redirect (or demo notice)
GET  /api/auth/google/callback
POST /api/auth/apple/callback
POST /api/auth/demo                        { provider, name, email? }
GET  /api/auth/me
GET  /api/payments/config
POST /api/payments/webhook                 (raw body; Stripe signature)
POST /api/checkout                         { experienceIds, method, recipient, buyerEmail, voucherType, cardLast4 }
POST /api/vouchers/activate                { code, token?, signature?, recipient? }
POST /api/vouchers/redeem                  { code, experienceId, token?, signature?, recipient? }
POST /api/vouchers/exchange                { code, experienceId, method, cardLast4?, quoteOnly?, token?, signature?, recipient? }
POST /api/assistant                        { messages, recipient?, catalog, lang }
```
