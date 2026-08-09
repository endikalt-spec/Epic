CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    name_he TEXT NOT NULL,
    name_ru TEXT NOT NULL,
    name_en TEXT,
    slug TEXT UNIQUE NOT NULL,
    emoji TEXT,
    img TEXT,
    tint TEXT
);

CREATE TABLE IF NOT EXISTS experiences (
    id SERIAL PRIMARY KEY,
    title_he TEXT NOT NULL,
    title_ru TEXT NOT NULL,
    title_en TEXT,
    description_he TEXT,
    description_ru TEXT,
    description_en TEXT,
    price INTEGER NOT NULL,
    old_price INTEGER,
    rating DECIMAL(3,2) DEFAULT 5.0,
    reviews_count INTEGER DEFAULT 0,
    participants_he TEXT,
    participants_ru TEXT,
    participants_en TEXT,
    duration_he TEXT,
    duration_ru TEXT,
    duration_en TEXT,
    emoji TEXT,
    img TEXT,
    tint TEXT,
    category_id INTEGER REFERENCES categories(id),
    is_best_seller BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS certificates (
    id SERIAL PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'active', -- active, redeemed, expired
    purchased_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    redeemed_at TIMESTAMP,
    selected_experience_id INTEGER REFERENCES experiences(id)
);

CREATE TABLE IF NOT EXISTS certificate_options (
    certificate_id INTEGER REFERENCES certificates(id),
    experience_id INTEGER REFERENCES experiences(id),
    PRIMARY KEY (certificate_id, experience_id)
);

-- ── Accounts / customers (Google / Apple sign-in, plus guest buyers) ──
-- This table doubles as the lightweight built-in CRM "customer" record: it is
-- the system of record for who the customer is and their current consent state.
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,           -- e.g. google:123 / apple:abc / guest:<hash>
    email TEXT,
    name TEXT,
    phone TEXT,
    provider TEXT,                 -- google | apple | guest
    locale TEXT,                   -- he | ru (last seen UI language)
    -- Marketing consent (Israeli Communications Law Amendment 40 / anti-spam):
    -- opt-in must be explicit and revocable, and we keep the current state here
    -- plus a full audit trail in the consents table below.
    marketing_opt_in BOOLEAN DEFAULT FALSE,
    marketing_opt_in_at TIMESTAMP,
    -- Terms of Use / Privacy Policy acceptance (current state).
    terms_accepted_at TIMESTAMP,
    terms_version TEXT,
    privacy_version TEXT,
    -- Denormalized lifetime totals for fast CRM listing (kept in sync on order).
    orders_count INTEGER DEFAULT 0,
    total_spent INTEGER DEFAULT 0,
    currency TEXT DEFAULT 'ILS',
    first_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_order_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── Consent audit trail (append-only) ──
-- Every acceptance/refusal is recorded with when, from where, and which policy
-- version — the evidence required by Israeli privacy & anti-spam law.
CREATE TABLE IF NOT EXISTS consents (
    id SERIAL PRIMARY KEY,
    user_id TEXT REFERENCES users(id),
    email TEXT,
    kind TEXT NOT NULL,            -- terms | privacy | marketing
    granted BOOLEAN NOT NULL,      -- true = accepted/opted-in, false = revoked
    policy_version TEXT,
    source TEXT,                   -- checkout | account_settings | unsubscribe | ...
    ip TEXT,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_consents_user ON consents(user_id);

-- ── Payments (gateway records) ──
CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    provider TEXT,                 -- mock | stripe | ...
    provider_ref TEXT,             -- gateway payment/intent id
    amount INTEGER NOT NULL,
    currency TEXT DEFAULT 'ILS',
    method TEXT,                   -- card | apple_pay | google_pay
    status TEXT DEFAULT 'processing',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── Vouchers (e-vouchers with QR + barcode; personalized or bearer) ──
CREATE TABLE IF NOT EXISTS vouchers (
    id SERIAL PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    token TEXT NOT NULL,           -- opaque secret embedded in the QR link
    signature TEXT NOT NULL,       -- HMAC over code|token|type|recipient
    type TEXT NOT NULL DEFAULT 'bearer',      -- personalized (именной) | bearer (неименной)
    status TEXT NOT NULL DEFAULT 'active',     -- active | redeemed | expired
    recipient_ref TEXT,            -- hashed recipient email for personalized vouchers
    recipient_email TEXT,
    recipient_name TEXT,
    buyer_email TEXT,
    buyer_user_id TEXT REFERENCES users(id),
    payment_id INTEGER REFERENCES payments(id),
    option_ids INTEGER[] DEFAULT '{}',         -- experiences the recipient can choose from
    selected_experience_id INTEGER REFERENCES experiences(id),
    face_value INTEGER DEFAULT 0,              -- monetary value the voucher can be exchanged against
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    redeemed_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_vouchers_code ON vouchers(code);

-- ── Redemption attempts (fraud audit trail) ──
CREATE TABLE IF NOT EXISTS redemption_attempts (
    id SERIAL PRIMARY KEY,
    code TEXT,
    ip TEXT,
    result TEXT,                   -- ok | not_found | already_redeemed | bad_signature | ...
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── Orders (CRM purchase record: who bought what, for how much, when) ──
-- Defined last because it references both users and payments.
CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    user_id TEXT REFERENCES users(id),
    email TEXT,
    voucher_code TEXT,
    payment_id INTEGER REFERENCES payments(id),
    amount INTEGER NOT NULL,
    currency TEXT DEFAULT 'ILS',
    method TEXT,                   -- card | apple_pay | google_pay
    voucher_type TEXT,             -- personalized | bearer
    items JSONB DEFAULT '[]',      -- snapshot: [{id,title,price}] at purchase time
    status TEXT DEFAULT 'paid',    -- paid | refunded | ...
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_email ON orders(email);
