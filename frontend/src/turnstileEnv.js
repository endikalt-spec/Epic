// Cloudflare Turnstile public site key, baked into the build. Kept in its own
// module (not the component file) so importing the flag doesn't pull in a
// component — which keeps fast-refresh happy. Empty key => the bot gate is off.
export const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || "";
export const TURNSTILE_ON = !!TURNSTILE_SITE_KEY;
