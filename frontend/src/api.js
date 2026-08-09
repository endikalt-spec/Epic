// Thin API layer for the VAU backend. Attaches the session token when present.
// When built with VITE_DEMO=1, every call is served by a client-side mock
// (demo.js) so the site runs as a standalone, self-contained demo with no server.
import axios from "axios";
import demo from "./demo";

export const DEMO = import.meta.env.VITE_DEMO === "1";
export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

export const api = axios.create({ baseURL: API_URL, timeout: 15000 });

api.interceptors.request.use((cfg) => {
  const t = localStorage.getItem("vau_token");
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

// ── Auth ──
export const getAuthProviders = () => DEMO ? demo.getAuthProviders() : api.get("/auth/providers").then((r) => r.data);
export const getMe = () => DEMO ? demo.getMe() : api.get("/auth/me").then((r) => r.data);
export const loginDemo = (payload) => DEMO ? demo.loginDemo(payload) : api.post("/auth/demo", payload).then((r) => r.data);
export const providerStartUrl = (provider) => `${API_URL}/auth/${provider}/start`;

// ── Payments ──
export const getPaymentConfig = () => DEMO ? demo.getPaymentConfig() : api.get("/payments/config").then((r) => r.data);

// ── Checkout / vouchers ──
export const checkout = (payload) => DEMO ? demo.checkout(payload) : api.post("/checkout", payload).then((r) => r.data);
export const activateVoucher = (payload) => DEMO ? demo.activateVoucher(payload) : api.post("/vouchers/activate", payload).then((r) => r.data);
export const redeemVoucher = (payload) => DEMO ? demo.redeemVoucher(payload) : api.post("/vouchers/redeem", payload).then((r) => r.data);
export const exchangeVoucher = (payload) => DEMO ? demo.exchangeVoucher(payload) : api.post("/vouchers/exchange", payload).then((r) => r.data);

// ── Loyalty (VAU Club) ──
export const getLoyalty = () => DEMO ? demo.getLoyalty() : api.get("/me/loyalty").then((r) => r.data);

// ── Reviews ──
export const getReviews = (params) => DEMO ? demo.getReviews(params || {}) : api.get("/reviews", { params }).then((r) => r.data);
export const postReview = (payload) => DEMO ? demo.postReview(payload) : api.post("/reviews", payload).then((r) => r.data);

// ── Assistant ──
export const askAssistant = (payload) => DEMO ? demo.askAssistant(payload) : api.post("/assistant", payload).then((r) => r.data);
