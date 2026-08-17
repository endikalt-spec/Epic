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

-- ── Businesses / partners (each experience is provided by a business) ──
-- This is the "add a new business" model: register a partner once, then attach
-- experiences to it. Each business gets its own presentable profile block.
CREATE TABLE IF NOT EXISTS businesses (
    id SERIAL PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    name_he TEXT NOT NULL,
    name_ru TEXT NOT NULL,
    description_he TEXT,
    description_ru TEXT,
    location_he TEXT,
    location_ru TEXT,
    emoji TEXT,
    logo TEXT,
    since INTEGER,                 -- year the partner joined / was founded
    rating DECIMAL(3,2) DEFAULT 5.0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

-- ── Additive columns (idempotent — safe to re-run on an existing database) ──
ALTER TABLE experiences ADD COLUMN IF NOT EXISTS business_id INTEGER REFERENCES businesses(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount INTEGER DEFAULT 0;         -- amount discounted (e.g. loyalty)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS loyalty_reward BOOLEAN DEFAULT FALSE;

-- ── Reviews (customers write what they liked about an experience) ──
CREATE TABLE IF NOT EXISTS reviews (
    id SERIAL PRIMARY KEY,
    experience_id INTEGER REFERENCES experiences(id),  -- NULL = general site review
    user_id TEXT REFERENCES users(id),
    author_name TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'published',           -- published | pending | hidden
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_reviews_experience ON reviews(experience_id);
CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(status);

-- Businesses can carry a short description (exists) + media managed from the
-- admin panel: a hero photo, a logo (exists) and a promo video URL.
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS img TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS video_url TEXT;

-- ── Admin accounts (separate from customer users; strong auth) ──
CREATE TABLE IF NOT EXISTS admin_users (
    id SERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    password_hash TEXT NOT NULL,        -- scrypt: "salt:hash" (hex)
    phone TEXT,                         -- for SMS account recovery
    totp_secret TEXT,                   -- base32 shared secret (set when enrolling 2FA)
    totp_enabled BOOLEAN DEFAULT FALSE,
    role TEXT DEFAULT 'admin',          -- superadmin | admin
    failed_attempts INTEGER DEFAULT 0,  -- consecutive wrong passwords
    locked_until TIMESTAMP,             -- lockout expiry after too many fails
    last_login_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Audit trail of every admin login attempt (brute-force forensics).
CREATE TABLE IF NOT EXISTS admin_login_attempts (
    id SERIAL PRIMARY KEY,
    email TEXT,
    ip TEXT,
    result TEXT,                        -- ok | bad_password | locked | no_2fa | bad_2fa | unknown_user
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_admin_attempts_email ON admin_login_attempts(email);

-- Single-use, short-lived SMS recovery codes (hashed).
CREATE TABLE IF NOT EXISTS admin_recovery (
    id SERIAL PRIMARY KEY,
    admin_id INTEGER REFERENCES admin_users(id),
    code_hash TEXT NOT NULL,            -- HMAC of the OTP (never stored in clear)
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── Category tile artwork: portrait crop with a different focal region ──
-- Five category tiles share their source photo with an experience card, so the
-- same picture appeared twice on the home page. Tiles are 3:4, so ask the CDN
-- for that crop directly and let it pick the busiest region (crop=entropy)
-- instead of the centre the cards use — same photo, visibly different frame.
-- The seed only loads into an empty catalog, so existing databases need this.
-- One-time normalization: matches only the original landscape parameters, so
-- re-running it is a no-op.
UPDATE categories
   SET img = replace(img, 'auto=format&fit=crop&w=900&q=80',
                          'auto=format&fit=crop&crop=entropy&w=600&h=800&q=80')
 WHERE img LIKE '%auto=format&fit=crop&w=900&q=80%';

-- ── Real branded photography (replaces stock) — applied to already-seeded DBs ──
-- These point category tiles and their flagship experience cards at owned images
-- served from the SPA (/img/*.jpg), add the "Tours of Israel" category, and
-- realign the Jordan experience from kayaking to rafting.
--
-- This block runs ONLY when the catalog is already populated — i.e. on a live
-- database where seed.sql is skipped. On a fresh, empty database it is a no-op
-- and seed.sql (which already carries all of the below) does the full load;
-- otherwise the two would collide on the unique category slug. Every statement
-- is idempotent (fixed value, or insert-only-when-missing), so re-applying the
-- schema on every deploy is safe.
DO $migrate_photos$
BEGIN
  IF EXISTS (SELECT 1 FROM categories) THEN
    -- Category tiles → owned photos.
    UPDATE categories SET img = '/img/extreme.jpg' WHERE slug = 'extreme';
    UPDATE categories SET img = '/img/gastro.jpg'  WHERE slug = 'gastro';

    -- New "Tours of Israel" category (guided history/nature tours).
    INSERT INTO categories (name_he, name_ru, name_en, slug, emoji, img, tint)
    SELECT 'סיורים בישראל', 'Экскурсии по Израилю', 'Tours of Israel', 'tours', '🏛️', '/img/tours.jpg', 'from-sun-500 to-teal-600'
     WHERE NOT EXISTS (SELECT 1 FROM categories WHERE slug = 'tours');

    -- Experience cards → owned photos (matched by their Russian title).
    UPDATE experiences SET img = '/img/extreme.jpg'     WHERE title_ru = 'Прыжок с парашютом над побережьем';
    UPDATE experiences SET img = '/img/gastro.jpg'      WHERE title_ru = 'Ужин с личным шефом дома';
    UPDATE experiences SET img = '/img/paragliding.jpg' WHERE title_ru = 'Параглайдинг над Кармелем';

    -- The Jordan-river experience: the owned photo is a group raft, so the copy
    -- is realigned from kayaking to rafting (matched on the old title; a no-op
    -- once renamed).
    UPDATE experiences
       SET title_he = 'שיט רפטינג בנהר הירדן', title_ru = 'Рафтинг по реке Иордан', title_en = 'Rafting on the Jordan River',
           description_he = 'שיט קבוצתי בסירת רפטינג לאורך אשדות הירדן בצפון, מתאים למשפחות ולחובבי אקשן.',
           description_ru = 'Групповой сплав на рафте по порогам Иордана на севере — для семей и любителей экшена.',
           description_en = 'A group raft down the Jordan rapids in the north, great for families and thrill-seekers.',
           participants_he = 'עד 6 משתתפים', participants_ru = 'до 6 участников', emoji = '🚣'
     WHERE title_ru = 'Сплав на каяках по Иордану';
    UPDATE experiences SET img = '/img/rafting.jpg' WHERE title_ru = 'Рафтинг по реке Иордан';

    -- Flagship experience for the new Tours category (guided tour of Old Akko).
    INSERT INTO experiences (title_he, title_ru, title_en, description_he, description_ru, description_en, price, old_price, rating, reviews_count, duration_he, duration_ru, participants_he, participants_ru, emoji, img, tint, category_id, is_best_seller)
    SELECT 'סיור מודרך במבצר האבירים בעכו', 'Экскурсия по крепости крестоносцев в Акко', 'Guided tour of the Crusader fortress in Akko',
           'סיור מודרך באולמות האבירים ובמנהרות של העיר העתיקה בעכו — אתר מורשת עולמית של אונסק"ו.',
           'Экскурсия с гидом по залам крестоносцев и подземным ходам Старого Акко — объекта Всемирного наследия ЮНЕСКО.',
           'A guided walk through the Knights’ Halls and tunnels of Old Akko, a UNESCO World Heritage site.',
           180, NULL, 4.8, 340, 'כשעתיים וחצי', 'около 2,5 часов', 'עד 6 משתתפים', 'до 6 участников', '🏛️', '/img/tours.jpg', 'from-sun-500 to-teal-600',
           (SELECT id FROM categories WHERE slug = 'tours'), TRUE
     WHERE NOT EXISTS (SELECT 1 FROM experiences WHERE title_ru = 'Экскурсия по крепости крестоносцев в Акко');
  END IF;
END
$migrate_photos$;
