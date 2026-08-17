import { useEffect, useRef, useState, useCallback } from "react";
import { Loader2, ArrowLeft, ArrowRight, Gift, CalendarClock, AlertTriangle } from "lucide-react";
import { activateVoucher } from "./api";
import { LOGO_FULL, LOGO_WORDMARK } from "./logo";

// The page the gift box in the e-voucher email links to. Email clients can't run
// scripts, so the unwrapping happens here: a closed VAU box, a tap, the lid lifts
// with a confetti burst, and the voucher card appears.
//
// Stages: loading → closed → opening → open   (or "error" when the code is bad)

const DD_MM_YYYY = (value) => {
  const d = new Date(value);
  if (!value || Number.isNaN(d.getTime())) return null;
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
};

// ── Confetti burst on a canvas (cheap, no dependency, stops on its own) ──
function Confetti({ fire }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!fire) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
    };
    resize();
    window.addEventListener("resize", resize);

    const COLORS = ["#ED3A1C", "#FF9C82", "#D9B45F", "#1F3160", "#0E9E86", "#F0A93B"];
    const N = reduce ? 40 : 150;
    const cx = canvas.width / 2;
    const cy = canvas.height * 0.42;
    const parts = Array.from({ length: N }, () => {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2.1;
      const speed = (6 + Math.random() * 11) * dpr;
      return {
        x: cx + (Math.random() - 0.5) * 40 * dpr,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        w: (5 + Math.random() * 6) * dpr,
        h: (8 + Math.random() * 9) * dpr,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        color: COLORS[(Math.random() * COLORS.length) | 0],
        life: 0,
      };
    });

    let raf;
    const GRAVITY = 0.28 * dpr;
    const MAX_LIFE = reduce ? 60 : 150;
    const tick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;
      for (const p of parts) {
        p.life += 1;
        if (p.life > MAX_LIFE) continue;
        alive = true;
        p.vy += GRAVITY;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = Math.max(0, 1 - p.life / MAX_LIFE);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (alive) raf = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [fire]);

  return <canvas ref={ref} aria-hidden="true" className="pointer-events-none absolute inset-0 w-full h-full" />;
}

// ── The VAU gift box (pure CSS, brand navy + gold ribbon) ──
function GiftBox({ stage, onOpen, hint }) {
  const opening = stage === "opening" || stage === "open";
  return (
    <button
      type="button"
      onClick={stage === "closed" ? onOpen : undefined}
      disabled={stage !== "closed"}
      aria-label={hint}
      className={`group relative block mx-auto ${stage === "closed" ? "cursor-pointer" : "cursor-default"}`}
      style={{ width: 240, height: 230 }}
    >
      {/* bow */}
      <div
        className="absolute left-1/2 -translate-x-1/2 text-5xl transition-all duration-700 ease-out z-20"
        style={{
          top: opening ? -70 : 4,
          opacity: opening ? 0 : 1,
          transform: `translateX(-50%) rotate(${opening ? -25 : 0}deg)`,
        }}
      >
        🎀
      </div>

      {/* lid */}
      <div
        className="absolute left-1/2 z-10 transition-all duration-700 ease-out"
        style={{
          width: 224,
          height: 44,
          top: opening ? -96 : 44,
          transform: `translateX(-50%) rotate(${opening ? -14 : 0}deg)`,
          opacity: opening ? 0 : 1,
        }}
      >
        <div className="w-full h-full rounded-xl shadow-lift grid place-items-center" style={{ background: "#1F3160" }}>
          <img src={LOGO_WORDMARK} alt="" className="h-4 w-auto opacity-0" />
          <span className="absolute text-[13px] font-extrabold tracking-[0.35em]" style={{ color: "#D9B45F" }}>
            VAU
          </span>
        </div>
      </div>

      {/* body */}
      <div
        className={`absolute left-1/2 -translate-x-1/2 rounded-2xl overflow-hidden shadow-pop transition-transform duration-300 ${
          stage === "closed" ? "group-hover:-translate-y-1 group-active:scale-95" : ""
        }`}
        style={{ width: 200, height: 140, top: 90, background: "#25396F" }}
      >
        {/* vertical gold ribbon */}
        <div className="absolute inset-y-0 left-1/2 -translate-x-1/2" style={{ width: 40, background: "#D9B45F" }} />
        {/* soft inner light */}
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg,rgba(255,255,255,.18),transparent 60%)" }} />
      </div>

      {/* the voucher peeking out as the lid leaves */}
      <div
        className="absolute left-1/2 -translate-x-1/2 transition-all duration-700 ease-out"
        style={{ width: 150, top: opening ? 34 : 92, opacity: opening ? 1 : 0 }}
      >
        <div className="rounded-xl bg-white shadow-lift px-3 py-3 text-center">
          <img src={LOGO_WORDMARK} alt="VAU" className="h-4 w-auto mx-auto" />
        </div>
      </div>
    </button>
  );
}

export default function GiftReveal({ t, rtl, goHome, goRedeemWithCode }) {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code") || "";
  const token = params.get("t") || undefined;
  const signature = params.get("s") || undefined;

  // A link without a code can be judged before the first render, so start in the
  // error state rather than setting it from inside the effect.
  const [stage, setStage] = useState(() => (code ? "loading" : "error")); // loading | closed | opening | open | error
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(() => (code ? "" : t("gift_no_code")));

  useEffect(() => {
    let cancelled = false;
    if (!code) return undefined;
    activateVoucher({ code, token, signature })
      .then((d) => {
        if (cancelled) return;
        setInfo(d);
        setStage("closed");
      })
      .catch((e) => {
        if (cancelled) return;
        const err = e?.response?.data?.error;
        setError(
          err === "already_redeemed" ? t("gift_already_used")
            : err === "expired" ? t("gift_expired")
            : t("gift_invalid")
        );
        setStage("error");
      });
    return () => { cancelled = true; };
  }, [code, token, signature, t]);

  const open = useCallback(() => {
    setStage("opening");
    // let the lid animation play, then settle into the revealed state
    setTimeout(() => setStage("open"), 750);
  }, []);

  const expiry = DD_MM_YYYY(info?.expiresAt);
  const Back = rtl ? ArrowRight : ArrowLeft;

  return (
    <div className="min-h-screen bg-cream-50">
      <div className="mesh-warm">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 pt-10 pb-6">
          <button onClick={goHome} className="inline-flex items-center gap-2 text-sm font-bold text-ink-500 hover:text-coral-600 mb-6">
            <Back size={18} /> {t("back_home")}
          </button>
          <img src={LOGO_FULL} alt="VAU" className="h-20 w-auto mx-auto" />
        </div>
      </div>

      <div className="relative mx-auto max-w-3xl px-4 sm:px-6 pb-20 -mt-2">
        {/* confetti sits above the whole reveal area */}
        <div className="absolute inset-0 overflow-hidden">
          <Confetti fire={stage === "opening" || stage === "open"} />
        </div>

        {stage === "loading" && (
          <div className="relative flex flex-col items-center gap-3 py-20 text-ink-500">
            <Loader2 className="animate-spin text-coral-400" /> {t("gift_checking")}
          </div>
        )}

        {stage === "error" && (
          <div className="relative max-w-md mx-auto mt-6 rounded-3xl bg-white shadow-soft p-8 text-center">
            <div className="grid place-items-center h-14 w-14 rounded-2xl bg-coral-50 text-coral-600 mx-auto mb-4">
              <AlertTriangle size={26} />
            </div>
            <h1 className="font-display text-xl font-extrabold mb-2">{t("gift_problem_title")}</h1>
            <p className="text-ink-500 text-sm mb-6 break-words">{error}</p>
            <button onClick={goHome} className="rounded-full bg-ink-900 text-white px-6 py-3 font-bold">{t("back_home")}</button>
          </div>
        )}

        {(stage === "closed" || stage === "opening" || stage === "open") && (
          <div className="relative text-center">
            <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-ink-900 text-balance break-words">
              {stage === "open" ? t("gift_open_title") : t("gift_closed_title")}
            </h1>
            <p className="text-ink-600 mt-2 mb-8 break-words">
              {stage === "open" ? t("gift_open_text") : t("gift_tap_hint")}
            </p>

            <GiftBox stage={stage} onOpen={open} hint={t("gift_tap_hint")} />

            {/* the voucher card, revealed after the lid comes off */}
            <div
              aria-hidden={stage !== "open"}
              className="mx-auto mt-10 transition-all duration-500 ease-out"
              style={{
                maxWidth: 460,
                opacity: stage === "open" ? 1 : 0,
                transform: `translateY(${stage === "open" ? 0 : 24}px)`,
                pointerEvents: stage === "open" ? "auto" : "none",
              }}
            >
              <div className="rounded-3xl bg-white shadow-pop p-6 sm:p-7 text-start">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <img src={LOGO_WORDMARK} alt="VAU" className="h-6 w-auto" />
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-coral-50 text-coral-700 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wide break-words">
                    <Gift size={13} /> {t("gift_badge")}
                  </span>
                </div>

                <div className="rounded-2xl border-2 border-dashed border-coral-300 px-4 py-4 text-center">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-ink-400">{t("order_code_label")}</div>
                  <div className="font-display text-2xl sm:text-3xl font-extrabold text-coral-600 tracking-[0.15em] break-all mt-1">{code}</div>
                </div>

                {info?.faceValue > 0 && (
                  <div className="flex items-baseline justify-between gap-3 mt-4">
                    <span className="text-sm font-semibold text-ink-500">{t("gift_value")}</span>
                    <span className="font-display text-xl font-extrabold text-ink-900">
                      ₪{Number(info.faceValue).toLocaleString(rtl ? "he-IL" : "ru-RU")}
                    </span>
                  </div>
                )}

                {expiry && (
                  <div className="flex items-center gap-2 mt-3 text-sm font-semibold text-ink-600">
                    <CalendarClock size={16} className="text-teal-500 shrink-0" />
                    <span className="break-words">{t("gift_valid_until")}: <b className="text-ink-900">{expiry}</b></span>
                  </div>
                )}

                <button
                  onClick={() => goRedeemWithCode(code)}
                  className="w-full mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-coral-500 text-white px-6 py-4 font-bold hover:bg-coral-600 glow-coral"
                >
                  <Gift size={18} /> {t("gift_choose_cta")}
                </button>
                <p className="text-xs text-ink-400 text-center mt-3 break-words">{t("gift_exchange_note")}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
