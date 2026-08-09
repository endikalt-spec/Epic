// Thin API layer for the VAU backend. Attaches the session token when present.
import axios from "axios";

export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

export const api = axios.create({ baseURL: API_URL, timeout: 15000 });

api.interceptors.request.use((cfg) => {
  const t = localStorage.getItem("vau_token");
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

// ── Auth ──
export const getAuthProviders = () => api.get("/auth/providers").then((r) => r.data);
export const getMe = () => api.get("/auth/me").then((r) => r.data);
export const loginDemo = (payload) => api.post("/auth/demo", payload).then((r) => r.data);
export const providerStartUrl = (provider) => `${API_URL}/auth/${provider}/start`;

// ── Payments ──
export const getPaymentConfig = () => api.get("/payments/config").then((r) => r.data);

// ── Checkout / vouchers ──
export const checkout = (payload) => api.post("/checkout", payload).then((r) => r.data);
export const activateVoucher = (payload) => api.post("/vouchers/activate", payload).then((r) => r.data);
export const redeemVoucher = (payload) => api.post("/vouchers/redeem", payload).then((r) => r.data);

// ── Assistant ──
export const askAssistant = (payload) => api.post("/assistant", payload).then((r) => r.data);
