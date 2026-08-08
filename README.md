# VAU · מתנות של חוויות / Подарки-впечатления

VAU is a modern, bright experience-gift marketplace tailored to the Israeli
market. You buy a gift **box** of experiences, send a digital voucher, and the
recipient chooses the experience that excites them the most.

The UI ships in **Hebrew (default, RTL)** and **Russian**, with an energetic,
photo-driven design.

- **Frontend:** React 19 + Vite + Tailwind CSS v4 + i18next
- **Backend:** Node.js (Express 5) + PostgreSQL

---

## Table of contents

- [Project structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Quick start (frontend only)](#quick-start-frontend-only)
- [Full setup (frontend + backend + database)](#full-setup-frontend--backend--database)
- [Environment variables](#environment-variables)
- [Available scripts](#available-scripts)
- [How the data works](#how-the-data-works)
- [Internationalization (Hebrew / Russian)](#internationalization-hebrew--russian)
- [Claude Code on the web](#claude-code-on-the-web)

---

## Project structure

```
Epic/
├── frontend/                 # React + Vite single-page app
│   ├── src/
│   │   ├── Vau.jsx           # Main storefront (sections, drawer, modal, redeem)
│   │   ├── data.js           # Fallback catalog (used when the API is offline)
│   │   ├── StoreContext.jsx  # Gift-box state
│   │   ├── i18n.js           # i18next setup (he default + ru)
│   │   ├── locales/          # he/ and ru/ translation.json
│   │   └── index.css         # Tailwind theme + design tokens
│   └── package.json
├── backend/                  # Express API
│   ├── index.js              # Routes: categories, experiences, checkout, activate, redeem
│   ├── db.js                 # PostgreSQL pool (reads DATABASE_URL)
│   ├── schema.sql            # Tables
│   ├── seed.sql              # Categories + 12 experiences (he/ru)
│   ├── init-db.js            # Applies schema.sql then seed.sql
│   └── package.json
└── .claude/                  # SessionStart hook for Claude Code on the web
```

---

## Prerequisites

- **Node.js 18+** (Node 20+ recommended) and npm
- **PostgreSQL 13+** — only required if you want the full backend flows
  (checkout / voucher activation / redemption). The storefront itself runs and
  looks complete without it (see [How the data works](#how-the-data-works)).

---

## Quick start (frontend only)

The fastest way to see the site. No database needed — the app falls back to a
built-in catalog for browsing.

```bash
cd frontend
npm install
npm run dev
```

Open the printed URL (default <http://localhost:5173>).

> Note: without the backend running, browsing works fully, but the
> **checkout, voucher activation, and redemption** actions require the API and
> will show an error (by design — they must not fake a purchase).

---

## Full setup (frontend + backend + database)

### 1. Start PostgreSQL and create a database

Use any PostgreSQL instance (local or hosted, e.g. Neon / Supabase / RDS).
Create a database, e.g. `vau`.

### 2. Configure the backend

```bash
cd backend
npm install
```

Create `backend/.env`:

```dotenv
# PostgreSQL connection string
DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/vau
# Optional — defaults to 3001
PORT=3001
```

> **SSL note:** `db.js` connects with `ssl: { rejectUnauthorized: false }`,
> which suits hosted providers that require SSL. If you use a **local**
> PostgreSQL without SSL and hit `The server does not support SSL connections`,
> either enable SSL on your server or set `ssl: false` in `backend/db.js` for
> local development.

### 3. Initialize the schema and seed data

```bash
npm run init-db
```

This applies `schema.sql` and then `seed.sql` (6 categories + 12 experiences
with Hebrew/Russian content).

### 4. Run the backend

```bash
npm start
```

The API listens on <http://localhost:3001> (health check at `/health`).

### 5. Run the frontend against the API

In a second terminal:

```bash
cd frontend
npm install
# Point the app at your API (defaults to http://localhost:3001/api)
echo "VITE_API_URL=http://localhost:3001/api" > .env.local
npm run dev
```

Now checkout, voucher activation, and redemption are fully functional.

---

## Environment variables

| Location   | Variable       | Default                       | Purpose                                    |
| ---------- | -------------- | ----------------------------- | ------------------------------------------ |
| `backend`  | `DATABASE_URL` | — (required)                  | PostgreSQL connection string               |
| `backend`  | `PORT`         | `3001`                        | API port                                   |
| `frontend` | `VITE_API_URL` | `http://localhost:3001/api`   | Base URL the SPA calls for data & actions  |

Backend variables go in `backend/.env`; frontend variables go in
`frontend/.env.local` (Vite only exposes vars prefixed with `VITE_`).

---

## Available scripts

**Frontend** (`cd frontend`):

| Script            | Description                       |
| ----------------- | --------------------------------- |
| `npm run dev`     | Start the Vite dev server         |
| `npm run build`   | Production build to `dist/`       |
| `npm run preview` | Serve the production build        |
| `npm run lint`    | Run ESLint                        |

**Backend** (`cd backend`):

| Script              | Description                          |
| ------------------- | ------------------------------------ |
| `npm start`         | Start the Express API                |
| `npm run init-db`   | Apply `schema.sql` and `seed.sql`    |

---

## How the data works

The frontend fetches categories and experiences from the API. If the API is
unreachable, it transparently falls back to the built-in catalog in
`frontend/src/data.js`, so the storefront always renders as a complete page.

This fallback is **read-only** (browsing only). Transactional flows are
deliberately honest:

- **Checkout** shows a voucher code only after the backend actually records the
  certificate; on failure it shows an error and keeps the cart.
- **Voucher activation** rejects invalid/unknown codes instead of pretending
  they are valid.
- **Redemption** confirms only after the selection is persisted.

Product photos load from Unsplash; each card has a branded gradient + emoji
fallback (with a load timeout) so nothing appears blank on slow or blocked
networks.

---

## Internationalization (Hebrew / Russian)

- Default language is **Hebrew** with full **RTL** layout; **Russian** is the
  second language. The switcher is in the header.
- Translations live in `frontend/src/locales/he/translation.json` and
  `frontend/src/locales/ru/translation.json`.
- The document `dir`/`lang` attributes update automatically on language change.
- Catalog content (titles, descriptions, duration, participants) is stored
  per-language in the database and in `data.js`.

---

## Claude Code on the web

`.claude/hooks/session-start.sh` installs the frontend and backend
dependencies when a Claude Code on the web session starts, so linting and
builds work immediately. It runs only in the remote environment, is
idempotent, and requires no input. See
[the docs](https://code.claude.com/docs/en/claude-code-on-the-web) for details.
