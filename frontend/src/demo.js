// ─────────────────────────── DEMO BACKEND ───────────────────────────
// A fully client-side mock of the VAU API, used ONLY when the app is built with
// VITE_DEMO=1 (see api.js). It lets the whole site be explored end-to-end —
// login, checkout, loyalty, reviews, assistant — with no server, so the build
// can run as a standalone, self-contained demo page. Production builds never
// import this path.
import { EXPERIENCES, BUSINESSES } from "./data";

const LS = {
  user: "vau_demo_user",
  purchases: "vau_demo_purchases",
  reviews: "vau_demo_reviews",
  marketing: "vau_demo_marketing",
};
const readJSON = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const writeJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };
const delay = (ms = 320) => new Promise((r) => setTimeout(r, ms));
const rid = (p) => p + Math.random().toString(36).slice(2, 8).toUpperCase();

// ── Loyalty (mirrors backend: every 4th gift within the cycle is 50% off) ──
const LOYALTY = { threshold: 4, discountPct: 50 };
function loyaltyFor(count) {
  const cycle = count % LOYALTY.threshold;
  const rewardReady = cycle === LOYALTY.threshold - 1;
  return {
    windowMonths: 12, threshold: LOYALTY.threshold, discountPct: LOYALTY.discountPct,
    purchases: count, cycle, rewardReady,
    remaining: rewardReady ? 0 : LOYALTY.threshold - 1 - cycle,
  };
}

// ── Seed reviews so the section looks alive on first load ──
const SEED_REVIEWS = [
  { id: "r-seed-1", experience_id: 1, author_name: "דניאל", rating: 5, body: "החוויה הכי מרגשת שעשיתי! ממליץ בחום לכל אחד.", created_at: "2026-07-20T10:00:00Z" },
  { id: "r-seed-2", experience_id: 3, author_name: "Марина", rating: 5, body: "Идеальный подарок на годовщину. Спа выше всяких похвал!", created_at: "2026-07-18T10:00:00Z" },
  { id: "r-seed-3", experience_id: null, author_name: "יעל", rating: 5, body: "קניתי מתנה להורים והם היו המומים. שירות מעולה מ-VAU.", created_at: "2026-07-10T10:00:00Z" },
  { id: "r-seed-4", experience_id: null, author_name: "Сергей", rating: 4, body: "Удобно, красиво, получатель сам выбрал впечатление. Рекомендую.", created_at: "2026-07-05T10:00:00Z" },
];
function allReviews() { return [...readJSON(LS.reviews, []), ...SEED_REVIEWS]; }

const catalog = () => EXPERIENCES;

export default {
  // ── Auth ──
  async getAuthProviders() { await delay(120); return { google: { enabled: true, demo: true }, apple: { enabled: true, demo: true } }; },
  async getMe() { await delay(120); return { user: readJSON(LS.user, null) }; },
  async loginDemo({ provider = "google", name, email } = {}) {
    await delay(300);
    const user = {
      id: `${provider}:demo:${rid("")}`.toLowerCase(),
      email: email || `${(name || "guest").replace(/\s+/g, ".").toLowerCase()}@example.com`,
      name: name || "אורח / Guest", provider,
    };
    localStorage.setItem("vau_token", "demo-token");
    writeJSON(LS.user, user);
    return { token: "demo-token", user };
  },

  // ── Payments ──
  async getPaymentConfig() { await delay(120); return { provider: "mock", currency: "ILS", methods: ["card", "apple_pay", "google_pay"], demo: true }; },

  // ── Checkout → voucher (with loyalty discount) ──
  async checkout(payload = {}) {
    await delay(600);
    const { experienceIds = [], method = "card", marketingOptIn = false } = payload;
    const gross = catalog().filter((e) => experienceIds.includes(e.id)).reduce((s, e) => s + Number(e.price), 0)
      || Number(payload.amount) || 0;
    const signedIn = !!readJSON(LS.user, null);
    const count = Number(readJSON(LS.purchases, 0));
    const loy = loyaltyFor(count);
    const rewardReady = signedIn && loy.rewardReady;
    const discount = rewardReady ? Math.round(gross * LOYALTY.discountPct / 100) : 0;
    const charge = gross - discount;
    if (signedIn) writeJSON(LS.purchases, count + 1);
    if (marketingOptIn) writeJSON(LS.marketing, true);
    const code = "VAU-" + rid("");
    return {
      success: true, code,
      voucher: { code, type: payload.voucherType || "bearer", expiresAt: null },
      payment: { status: "succeeded", method, amount: charge, gross, discount, loyaltyReward: rewardReady },
      email: { delivered: false, demo: true, to: payload.buyerEmail },
    };
  },

  // ── Vouchers (light mocks so the redeem/exchange tabs work) ──
  async activateVoucher({ code } = {}) {
    await delay(400);
    if (!code) return Promise.reject(new Error("code required"));
    const options = catalog().slice(0, 4);
    return { ok: true, type: "bearer", options, faceValue: Math.max(...options.map((o) => o.price)) };
  },
  async redeemVoucher() { await delay(400); return { success: true }; },
  async exchangeVoucher({ quoteOnly, experienceId } = {}) {
    await delay(400);
    const target = catalog().find((e) => e.id === Number(experienceId));
    const faceValue = 450, newPrice = target ? Number(target.price) : 0;
    const topUp = Math.max(0, newPrice - faceValue);
    if (quoteOnly) return { ok: true, faceValue, newPrice, topUp, currency: "ILS" };
    return { ok: true, charged: topUp, faceValue: Math.max(faceValue, newPrice), newExperienceId: experienceId };
  },

  // ── Loyalty ──
  async getLoyalty() {
    await delay(120);
    if (!readJSON(LS.user, null)) return Promise.reject(new Error("auth_required"));
    return loyaltyFor(Number(readJSON(LS.purchases, 0)));
  },

  // ── Reviews ──
  async getReviews({ experienceId, limit = 12 } = {}) {
    await delay(200);
    let rows = allReviews();
    if (experienceId != null && experienceId !== "none") rows = rows.filter((r) => r.experience_id === Number(experienceId));
    return rows.slice(0, limit);
  },
  async postReview({ experienceId = null, authorName, rating, body } = {}) {
    await delay(300);
    const name = String(authorName || "").trim();
    const text = String(body || "").trim();
    if (!name) return Promise.reject(new Error("name_required"));
    if (text.length < 3) return Promise.reject(new Error("body_required"));
    const review = {
      id: rid("r-"), experience_id: experienceId != null ? Number(experienceId) : null,
      author_name: name, rating: Math.max(1, Math.min(5, Math.round(Number(rating) || 5))),
      body: text, status: "published", created_at: new Date().toISOString(),
    };
    writeJSON(LS.reviews, [review, ...readJSON(LS.reviews, [])]);
    return review;
  },

  // ── ADMIN (mocked so the whole security flow is clickable in the demo) ──
  // Demo credentials are shown on the login screen. Brute-force lock after 3
  // wrong tries (60s in the demo). Demo 2FA / recovery codes are surfaced on
  // screen since there's no real authenticator app or SMS here.
  async _adminState() {
    const st = readJSON("vau_demo_admin", null);
    if (st) return st;
    const seed = { email: "admin@vau.co.il", password: "vau-admin", phone: "+972500000000", failed: 0, lockedUntil: 0, twoFactor: false, recovery: null };
    writeJSON("vau_demo_admin", seed);
    return seed;
  },
  async adminLogin({ email, password, totp } = {}) {
    await delay(400);
    const st = await this._adminState();
    const now = Date.now();
    if (st.lockedUntil && st.lockedUntil > now) return Promise.reject({ response: { status: 423, data: { error: "locked", until: new Date(st.lockedUntil).toISOString() } } });
    if (String(email).toLowerCase() !== st.email || password !== st.password) {
      st.failed += 1;
      if (st.failed >= 3) { st.lockedUntil = now + 60000; st.failed = 0; writeJSON("vau_demo_admin", st); return Promise.reject({ response: { status: 423, data: { error: "locked", until: new Date(st.lockedUntil).toISOString(), message: "Слишком много попыток. Блокировка на 60 сек (демо)." } } }); }
      writeJSON("vau_demo_admin", st);
      return Promise.reject({ response: { status: 401, data: { error: "invalid_credentials", attemptsLeft: 3 - st.failed } } });
    }
    if (st.twoFactor) {
      if (!totp) return { needs2fa: true };
      if (totp !== "123456") return Promise.reject({ response: { status: 401, data: { error: "invalid_2fa", attemptsLeft: 3 } } });
    }
    st.failed = 0; st.lockedUntil = 0; writeJSON("vau_demo_admin", st);
    localStorage.setItem("vau_admin_token", "demo-admin-token");
    return { token: "demo-admin-token", admin: { email: st.email, role: "superadmin", twoFactorEnabled: st.twoFactor } };
  },
  async adminMe() {
    await delay(120);
    if (localStorage.getItem("vau_admin_token") !== "demo-admin-token") return Promise.reject({ response: { status: 401 } });
    const st = await this._adminState();
    return { admin: { email: st.email, role: "superadmin", phone: st.phone, twoFactorEnabled: st.twoFactor } };
  },
  async admin2faSetup() {
    await delay(200);
    return { secret: "DEMO-VAU-2FA-SECRET", uri: "otpauth://totp/VAU:admin (demo)", qr: null, demoCode: "123456" };
  },
  async admin2faEnable(totp) {
    await delay(200);
    if (totp !== "123456") return Promise.reject({ response: { status: 400, data: { error: "invalid_2fa" } } });
    const st = await this._adminState(); st.twoFactor = true; writeJSON("vau_demo_admin", st);
    return { ok: true };
  },
  async adminRecoverStart(email) {
    await delay(300);
    const st = await this._adminState();
    if (String(email).toLowerCase() !== st.email) return { ok: true, message: "Если аккаунт существует, код отправлен." };
    st.recovery = String(Math.floor(100000 + Math.random() * 900000)); writeJSON("vau_demo_admin", st);
    return { ok: true, demoCode: st.recovery, message: "Демо: код показан ниже (в проде придёт по SMS)." };
  },
  async adminRecoverVerify({ email, code, newPassword } = {}) {
    await delay(300);
    const st = await this._adminState();
    if (String(email).toLowerCase() !== st.email || !st.recovery || code !== st.recovery) return Promise.reject({ response: { status: 400, data: { error: "invalid_code" } } });
    if (!newPassword || newPassword.length < 8) return Promise.reject({ response: { status: 400, data: { error: "weak_password" } } });
    st.password = newPassword; st.recovery = null; st.failed = 0; st.lockedUntil = 0; writeJSON("vau_demo_admin", st);
    return { ok: true };
  },
  async _bizList() {
    let list = readJSON("vau_demo_biz", null);
    if (!list) {
      list = Object.entries(BUSINESSES).map(([slug, b], i) => ({ id: i + 1, slug, ...b, img: null, video_url: null }));
      writeJSON("vau_demo_biz", list);
    }
    return list;
  },
  async adminGetBusinesses() { await delay(200); return this._bizList(); },
  async adminCreateBusiness(b) {
    await delay(250); const list = await this._bizList();
    const row = { id: Math.max(0, ...list.map((x) => x.id)) + 1, ...b };
    writeJSON("vau_demo_biz", [...list, row]); return row;
  },
  async adminUpdateBusiness(id, patch) {
    await delay(250); const list = await this._bizList();
    const next = list.map((x) => (x.id === Number(id) ? { ...x, ...patch } : x));
    writeJSON("vau_demo_biz", next); return next.find((x) => x.id === Number(id));
  },
  async adminGetStats() {
    await delay(150);
    return { customers: 128, marketingOptIns: 74, orders: 203, revenue: 187400, currency: "ILS" };
  },

  // ── AI assistant (deterministic keyword recommender for the demo) ──
  async askAssistant({ messages = [], recipient = null, lang = "he" } = {}) {
    await delay(700);
    const text = (recipient?.about || messages.map((m) => m.content).join(" ") || "").toLowerCase();
    const rules = [
      [/(אקסטרים|adrenalin|адренал|экстрим|risk|סכנה)/, "extreme"],
      [/(רומנט|romantic|романт|couple|זוג|пары)/, "romance"],
      [/(אוכל|food|gastro|вино|wine|шеф|chef|קולינרי|кулинар)/, "gastro"],
      [/(ספא|spa|relax|спа|отдых|רגיעה)/, "spa"],
      [/(סדנה|workshop|мастер|craft|יצירה)/, "workshops"],
      [/(טיסה|fly|полёт|balloon|בלון|небо)/, "flights"],
    ];
    let cat = null;
    for (const [re, c] of rules) if (re.test(text)) { cat = c; break; }
    const picks = (cat ? catalog().filter((e) => e.category === cat) : catalog()).slice(0, 3);
    const ids = picks.map((e) => e.id);
    const reply = lang === "ru"
      ? `Вот ${picks.length} впечатления, которые отлично подойдут — посмотрите и добавьте в подарок:`
      : `הנה ${picks.length} חוויות שיתאימו מצוין — הציצו והוסיפו למתנה:`;
    return { reply, experienceIds: ids, demo: true };
  },
};
