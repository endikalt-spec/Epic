import { useState, useEffect } from "react";
import { X, Loader2 } from "lucide-react";
import { getAuthProviders, loginDemo, providerStartUrl } from "./api";
import { LOGO_WORDMARK } from "./logo";
import { useFocusTrap } from "./useFocusTrap";

// Sign in with Google / Apple. Real OAuth redirects when the provider is
// configured on the backend; otherwise a one-tap demo login is used.
export default function LoginModal({ open, onClose, onLogin, t }) {
  const [providers, setProviders] = useState(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState("");
  const trapRef = useFocusTrap(open, onClose);

  useEffect(() => {
    if (open && !providers) getAuthProviders().then(setProviders).catch(() => setProviders({ google: { demo: true }, apple: { demo: true } }));
  }, [open, providers]);

  if (!open) return null;

  const signIn = async (provider) => {
    const demo = providers?.[provider]?.demo ?? true;
    if (!demo) {
      window.location.href = providerStartUrl(provider);
      return;
    }
    setBusy(provider);
    try {
      const { token, user } = await loginDemo({ provider, name: name.trim() || undefined });
      localStorage.setItem("vau_token", token);
      onLogin(user);
      onClose();
    } catch {
      // ignore — keep modal open
    } finally {
      setBusy("");
    }
  };

  const GoogleIcon = (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.2 13.4 17.6 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.4-4.7 7l7.3 5.7c4.3-4 6.8-9.9 6.8-17.2z"/><path fill="#FBBC05" d="M10.4 28.3c-.5-1.4-.7-2.8-.7-4.3s.3-2.9.7-4.3l-7.8-6.1C1 16.9 0 20.3 0 24s1 7.1 2.6 10.4l7.8-6.1z"/><path fill="#34A853" d="M24 48c6.2 0 11.5-2 15.3-5.5l-7.3-5.7c-2 1.4-4.7 2.3-8 2.3-6.4 0-11.8-3.9-13.6-9.3l-7.8 6.1C6.5 42.6 14.6 48 24 48z"/></svg>
  );
  const AppleIcon = (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M16.365 1.43c0 1.14-.417 2.2-1.11 2.98-.83.94-2.18 1.66-3.29 1.57-.14-1.1.43-2.28 1.1-3.02.75-.83 2.06-1.46 3.3-1.53zM20.5 17.02c-.56 1.3-.83 1.88-1.55 3.03-1 1.6-2.4 3.6-4.15 3.62-1.55.02-1.95-1.02-4.05-1-2.1.01-2.54 1.02-4.1 1-1.75-.02-3.08-1.82-4.08-3.42C.34 17.9-.03 14.6.9 12.5c.66-1.5 1.9-2.44 3.28-2.46 1.42-.02 2.46.98 4.05.98 1.56 0 2.5-.98 4.15-1 1.47-.02 2.6.76 3.28 2.02-2.88 1.58-2.4 5.72.84 6.98z"/></svg>
  );

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-ink-900/60 backdrop-blur-sm" />
      <div ref={trapRef} role="dialog" aria-modal="true" aria-label={t("login_title")} tabIndex={-1} className="relative bg-cream-50 w-full max-w-sm rounded-3xl p-8 shadow-pop" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} aria-label="Close" className="absolute top-4 end-4 grid place-items-center h-11 w-11 rounded-full bg-white shadow-soft"><X size={20} /></button>
        <div className="mb-3">
          <img src={LOGO_WORDMARK} alt="VAU" className="h-8 w-auto" />
        </div>
        <h2 className="font-display text-xl font-extrabold mb-1">{t("login_title")}</h2>
        <p className="text-sm text-ink-500 mb-6">{t("login_subtitle")}</p>

        {providers && (providers.google?.demo || providers.apple?.demo) && (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("login_name_placeholder")}
            className="w-full rounded-xl bg-white border border-cream-300 px-4 py-3 mb-3 outline-none focus:border-coral-300"
          />
        )}

        <button onClick={() => signIn("google")} disabled={busy} className="w-full flex items-center justify-center gap-3 rounded-full bg-white border border-cream-300 px-5 py-3 font-bold text-ink-800 hover:bg-cream-100 mb-3 disabled:opacity-50">
          {busy === "google" ? <Loader2 size={18} className="animate-spin" /> : GoogleIcon} {t("login_google")}
        </button>
        <button onClick={() => signIn("apple")} disabled={busy} className="w-full flex items-center justify-center gap-3 rounded-full bg-ink-900 text-white px-5 py-3 font-bold hover:bg-ink-800 disabled:opacity-50">
          {busy === "apple" ? <Loader2 size={18} className="animate-spin" /> : AppleIcon} {t("login_apple")}
        </button>

        {providers && (providers.google?.demo || providers.apple?.demo) && (
          <p className="text-[11px] text-ink-400 text-center mt-4">{t("login_demo_note")}</p>
        )}
      </div>
    </div>
  );
}
