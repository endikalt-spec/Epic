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
