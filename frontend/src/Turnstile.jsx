import { useEffect, useRef } from "react";
import { TURNSTILE_SITE_KEY, TURNSTILE_ON } from "./turnstileEnv";

// Cloudflare Turnstile — the "prove you're human" widget shown on the checkout
// and admin-login forms. The site key is public and baked into the build.
//
// When VITE_TURNSTILE_SITE_KEY is unset the component renders nothing and
// immediately reports an empty token, so the forms behave exactly as before
// (the backend gate is off too until its secret is set) — nothing to configure
// for local/demo builds. The TURNSTILE_ON flag lives in ./turnstileEnv so
// callers can import it without pulling in this component.

const SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let scriptPromise;
function loadTurnstile() {
  if (typeof window !== "undefined" && window.turnstile) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = SRC;
      s.async = true;
      s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("turnstile_script_failed"));
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

// onToken(token) is called with a fresh token on success, and with "" when the
// widget resets, expires, or errors (so the parent can disable its submit).
export default function Turnstile({ onToken, action, className = "" }) {
  const boxRef = useRef(null);
  const widgetRef = useRef(null);

  useEffect(() => {
    if (!TURNSTILE_ON) { onToken?.(""); return undefined; }
    let cancelled = false;
    loadTurnstile()
      .then(() => {
        if (cancelled || !boxRef.current || !window.turnstile) return;
        widgetRef.current = window.turnstile.render(boxRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          action,
          callback: (token) => onToken?.(token),
          "expired-callback": () => onToken?.(""),
          "error-callback": () => onToken?.(""),
        });
      })
      .catch(() => onToken?.(""));
    return () => {
      cancelled = true;
      try {
        if (widgetRef.current && window.turnstile) window.turnstile.remove(widgetRef.current);
      } catch {
        /* widget already gone */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!TURNSTILE_ON) return null;
  return <div ref={boxRef} className={className} />;
}
