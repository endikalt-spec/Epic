import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "./StoreContext";
import { CATEGORIES as FALLBACK_CATS, EXPERIENCES as FALLBACK_EXPS } from "./data";
import {
  Gift, Search, Star, Check, X, Trash2, ArrowLeft, ArrowRight, Clock, Users,
  ShieldCheck, RefreshCw, Headphones, CalendarClock, Sparkles, Loader2,
  ChevronLeft, Menu, Copy, Ticket, Building2, PartyPopper, Plus
} from "lucide-react";
import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001/api";
const nis = (n) => `₪${Number(n).toLocaleString("en-US")}`;

/* ─────────────────────────── UI PRIMITIVES ─────────────────────────── */

function Btn({ children, variant = "primary", size = "md", className = "", loading, ...props }) {
  const variants = {
    primary: "bg-coral-500 text-white hover:bg-coral-600 glow-coral hover:-translate-y-0.5",
    dark: "bg-ink-900 text-white hover:bg-ink-800 hover:-translate-y-0.5",
    soft: "bg-coral-50 text-coral-700 hover:bg-coral-100",
    ghost: "bg-transparent text-ink-700 border border-cream-300 hover:border-coral-300 hover:text-coral-600",
    white: "bg-white text-ink-900 hover:bg-cream-100 shadow-soft",
  };
  const sizes = {
    sm: "px-4 py-2 text-xs",
    md: "px-6 py-3 text-sm",
    lg: "px-8 py-4 text-base",
  };
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-full font-bold transition-all duration-300 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading && <Loader2 size={16} className="animate-spin" />}
      {children}
    </button>
  );
}

function Pill({ children, className = "" }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-extrabold uppercase tracking-wide ${className}`}>
      {children}
    </span>
  );
}

function Stars({ rating, count, className = "" }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-bold text-ink-600 ${className}`}>
      <Star size={13} className="text-sun-500" fill="currentColor" />
      {rating}
      {count != null && <span className="text-ink-400 font-medium">({count})</span>}
    </span>
  );
}

// Image with skeleton loader + graceful gradient/emoji fallback on error.
function SmartImg({ src, alt, emoji, tint = "from-coral-400 to-coral-600", className = "", imgClass = "" }) {
  const [status, setStatus] = useState("loading"); // loading | ok | error
  // Safety net: if an image neither loads nor errors within a few seconds
  // (slow network / blocked host), fall back to the branded gradient so a
  // card is never left blank.
  useEffect(() => {
    if (status !== "loading") return;
    const id = setTimeout(() => setStatus((s) => (s === "loading" ? "error" : s)), 6000);
    return () => clearTimeout(id);
  }, [status]);
  return (
    <div className={`relative overflow-hidden ${className}`}>
      {status === "loading" && <div className="absolute inset-0 skeleton" />}
      {status === "error" ? (
        <div className={`absolute inset-0 bg-gradient-to-br ${tint} flex items-center justify-center`}>
          <span className="text-6xl drop-shadow-lg">{emoji}</span>
        </div>
      ) : (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          onLoad={() => setStatus("ok")}
          onError={() => setStatus("error")}
          className={`h-full w-full object-cover transition-all duration-700 ${status === "ok" ? "opacity-100" : "opacity-0"} ${imgClass}`}
        />
      )}
    </div>
  );
}

/* ─────────────────────────── MAIN APP ─────────────────────────── */

export default function Vau() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith("ru") ? "ru" : "he";
  const rtl = lang === "he";
  const { giftBox, addToGiftBox, removeFromGiftBox, clearGiftBox } = useStore();

  const [experiences, setExperiences] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCat, setActiveCat] = useState("all");
  const [scrolled, setScrolled] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [modalExp, setModalExp] = useState(null);
  const [view, setView] = useState("home"); // home | redeem
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [orderCode, setOrderCode] = useState(null);
  const [checkoutError, setCheckoutError] = useState("");

  const loc = (obj, field) => obj?.[`${field}_${lang}`] ?? obj?.[`${field}_he`] ?? "";

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const [expRes, catRes] = await Promise.all([
          axios.get(`${API_URL}/experiences`, { timeout: 4000 }),
          axios.get(`${API_URL}/categories`, { timeout: 4000 }),
        ]);
        if (!alive) return;
        const exps = Array.isArray(expRes.data) && expRes.data.length ? expRes.data : FALLBACK_EXPS;
        const cats = Array.isArray(catRes.data) && catRes.data.length ? catRes.data : FALLBACK_CATS;
        setExperiences(exps);
        setCategories(cats);
      } catch {
        if (!alive) return;
        setExperiences(FALLBACK_EXPS);
        setCategories(FALLBACK_CATS);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", h);
    return () => window.removeEventListener("scroll", h);
  }, []);

  // Lock body scroll when an overlay is open
  useEffect(() => {
    const open = drawerOpen || modalExp || menuOpen;
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [drawerOpen, modalExp, menuOpen]);

  const catSlug = (e) => e.category ?? e.category_slug ?? null;
  const filtered = useMemo(() => {
    if (activeCat === "all") return experiences;
    // API rows may not carry a slug; fall back to matching category_id via categories list
    return experiences.filter((e) => {
      if (catSlug(e)) return catSlug(e) === activeCat;
      const cat = categories.find((c) => c.slug === activeCat);
      return cat && e.category_id === cat.id;
    });
  }, [experiences, activeCat, categories]);

  const inBox = (id) => giftBox.some((i) => i.id === id);
  const boxFull = giftBox.length >= 5;

  const handleCheckout = async () => {
    if (!giftBox.length) return;
    setCheckoutLoading(true);
    setCheckoutError("");
    try {
      const res = await axios.post(`${API_URL}/checkout`, { experienceIds: giftBox.map((e) => e.id) }, { timeout: 8000 });
      // Only surface a code the server actually persisted; only then clear the
      // cart. Never fabricate a voucher — an un-recorded code can't be redeemed.
      setOrderCode(res.data.code);
      clearGiftBox();
    } catch {
      setCheckoutError(t("checkout_error"));
    } finally {
      setCheckoutLoading(false);
    }
  };

  const goRedeem = () => { setView("redeem"); setDrawerOpen(false); setMenuOpen(false); window.scrollTo(0, 0); };
  const goHome = () => { setView("home"); window.scrollTo(0, 0); };
  const changeLang = (l) => i18n.changeLanguage(l);

  if (view === "redeem") {
    return <RedeemView goHome={goHome} loc={loc} t={t} rtl={rtl} />;
  }

  return (
    <div className="min-h-screen bg-cream-50 text-ink-900 overflow-x-hidden">
      <Header
        {...{ t, lang, rtl, scrolled, categories, activeCat, setActiveCat, loc,
          giftCount: giftBox.length, openDrawer: () => setDrawerOpen(true),
          goRedeem, changeLang, menuOpen, setMenuOpen }}
      />

      <Hero {...{ t, rtl, experiences }} />

      <StatsStrip t={t} />

      <CategorySection {...{ t, categories, loc, setActiveCat }} />

      <HowItWorks t={t} />

      <Catalog
        {...{ t, loc, loading, filtered, categories, activeCat, setActiveCat,
          openModal: setModalExp, addToGiftBox, inBox, boxFull, rtl }}
      />

      <OccasionsBar t={t} />

      <Reviews t={t} />

      <BusinessBanner t={t} rtl={rtl} />

      <Guarantees t={t} />

      <Newsletter t={t} />

      <Footer t={t} lang={lang} goRedeem={goRedeem} />

      {/* Gift box drawer */}
      <GiftDrawer
        {...{ open: drawerOpen, close: () => { setDrawerOpen(false); setCheckoutError(""); }, t, loc, giftBox,
          removeFromGiftBox, clearGiftBox, checkoutLoading, handleCheckout,
          orderCode, setOrderCode, checkoutError, rtl }}
      />

      {/* Experience modal */}
      {modalExp && (
        <ExperienceModal
          {...{ exp: modalExp, close: () => setModalExp(null), t, loc,
            add: () => { addToGiftBox(modalExp); setModalExp(null); setDrawerOpen(true); },
            added: inBox(modalExp.id), boxFull, rtl }}
        />
      )}

      {/* Floating box button (mobile) */}
      {giftBox.length > 0 && !drawerOpen && (
        <button
          onClick={() => setDrawerOpen(true)}
          className="fixed bottom-6 end-6 z-40 lg:hidden flex items-center gap-2 rounded-full bg-coral-500 text-white px-5 py-4 font-bold glow-coral animate-pop"
        >
          <Gift size={20} />
          <span>{giftBox.length}</span>
        </button>
      )}
    </div>
  );
}

/* ─────────────────────────── HEADER ─────────────────────────── */

function Header({ t, lang, scrolled, giftCount, openDrawer, goRedeem, changeLang, menuOpen, setMenuOpen }) {
  const links = [
    { key: "nav_experiences", href: "#catalog" },
    { key: "nav_how", href: "#how" },
    { key: "nav_reviews", href: "#reviews" },
    { key: "nav_business", href: "#business" },
  ];
  return (
    <header className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${scrolled ? "bg-cream-50/90 backdrop-blur-xl shadow-soft" : "bg-transparent"}`}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 h-18 py-3.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-8">
          <a href="#top" className="flex items-center gap-2 select-none">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-coral-400 to-coral-600 text-white font-display font-extrabold text-lg shadow-lift">V</span>
            <span className="font-display text-2xl font-extrabold tracking-tight text-ink-900">VAU</span>
          </a>
          <nav className="hidden lg:flex items-center gap-1">
            {links.map((l) => (
              <a key={l.key} href={l.href} className="px-3 py-2 text-sm font-bold text-ink-600 hover:text-coral-600 transition-colors rounded-lg">
                {t(l.key)}
              </a>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex items-center rounded-full bg-white shadow-soft p-1">
            {["he", "ru"].map((l) => (
              <button
                key={l}
                onClick={() => changeLang(l)}
                className={`px-3 py-1.5 text-xs font-extrabold rounded-full transition-all ${lang === l ? "bg-ink-900 text-white" : "text-ink-500 hover:text-ink-900"}`}
              >
                {l === "he" ? "עב" : "RU"}
              </button>
            ))}
          </div>

          <button onClick={goRedeem} className="hidden sm:inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold text-ink-700 hover:text-coral-600 transition-colors">
            <Ticket size={16} /> {t("redeem_voucher")}
          </button>

          <button onClick={openDrawer} className="relative inline-flex items-center gap-2 rounded-full bg-ink-900 text-white px-4 py-2.5 text-sm font-bold hover:bg-ink-800 transition-colors">
            <Gift size={17} />
            <span className="hidden sm:inline">{t("gift_box")}</span>
            {giftCount > 0 && (
              <span className="grid place-items-center min-w-5 h-5 px-1 rounded-full bg-coral-500 text-white text-[11px] font-extrabold">{giftCount}</span>
            )}
          </button>

          <button onClick={() => setMenuOpen(true)} className="lg:hidden grid place-items-center h-10 w-10 rounded-full bg-white shadow-soft text-ink-900">
            <Menu size={20} />
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-ink-900/40 backdrop-blur-sm" onClick={() => setMenuOpen(false)}>
          <div className="absolute top-0 inset-x-0 bg-cream-50 rounded-b-3xl p-6 shadow-pop animate-rise" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <span className="font-display text-xl font-extrabold">VAU</span>
              <button onClick={() => setMenuOpen(false)} className="grid place-items-center h-10 w-10 rounded-full bg-white shadow-soft"><X size={20} /></button>
            </div>
            <nav className="flex flex-col gap-1">
              {links.map((l) => (
                <a key={l.key} href={l.href} onClick={() => setMenuOpen(false)} className="px-3 py-3 text-lg font-bold text-ink-800 hover:text-coral-600 rounded-xl hover:bg-white">
                  {t(l.key)}
                </a>
              ))}
              <button onClick={goRedeem} className="mt-2 flex items-center gap-2 px-3 py-3 text-lg font-bold text-coral-600">
                <Ticket size={20} /> {t("redeem_voucher")}
              </button>
            </nav>
          </div>
        </div>
      )}
    </header>
  );
}

/* ─────────────────────────── HERO ─────────────────────────── */

function Hero({ t, experiences }) {
  const pics = experiences.length ? experiences : FALLBACK_EXPS;
  const feat = pics[1] || pics[0];
  const feat2 = pics[2] || pics[0];
  return (
    <section id="top" className="relative pt-28 sm:pt-32 pb-16 mesh-warm overflow-hidden">
      <div className="absolute -top-24 -start-24 w-96 h-96 rounded-full bg-coral-300/30 blur-3xl pointer-events-none" />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 grid lg:grid-cols-2 gap-12 items-center relative">
        <div className="animate-rise text-center lg:text-start">
          <Pill className="bg-white text-coral-600 shadow-soft mb-6">
            <Sparkles size={13} /> {t("hero_badge")}
          </Pill>
          <h1 className="font-display font-extrabold leading-[0.95] tracking-tight text-5xl sm:text-6xl xl:text-7xl text-ink-900 text-balance">
            <span className="block">{t("hero_title_1")}</span>
            <span className="block text-coral-500">{t("hero_title_2")}</span>
            <span className="block">{t("hero_title_3")}</span>
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-ink-600 max-w-xl mx-auto lg:mx-0 leading-relaxed">
            {t("hero_subtitle")}
          </p>

          {/* Search */}
          <div className="mt-8 flex items-center gap-2 bg-white rounded-full p-2 shadow-lift max-w-xl mx-auto lg:mx-0">
            <span className="ps-4 text-ink-400"><Search size={20} /></span>
            <input
              className="flex-1 bg-transparent outline-none px-2 py-2 text-ink-900 placeholder:text-ink-400 min-w-0"
              placeholder={t("search_placeholder")}
            />
            <a href="#catalog"><Btn size="md" className="whitespace-nowrap">{t("search_button")}</Btn></a>
          </div>

          {/* Trust row */}
          <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 justify-center lg:justify-start text-sm font-semibold text-ink-600">
            {[["trust_secure", ShieldCheck], ["trust_validity", CalendarClock], ["trust_exchange", RefreshCw]].map(([k, Icon]) => (
              <span key={k} className="inline-flex items-center gap-1.5"><Icon size={16} className="text-teal-500" /> {t(k)}</span>
            ))}
          </div>
        </div>

        {/* Collage */}
        <div className="relative h-[420px] sm:h-[500px] hidden md:block">
          <div className="absolute top-4 end-6 w-64 h-80 rounded-[2rem] shadow-pop rotate-3 animate-float overflow-hidden bg-white">
            <SmartImg src={feat.img} alt={feat.title_he} emoji={feat.emoji} tint={feat.tint} className="w-full h-full" />
            <div className="absolute bottom-3 start-3 bg-white/95 backdrop-blur rounded-2xl px-3 py-2 shadow-soft">
              <div className="text-[11px] font-bold text-ink-400">{t("card_from")}</div>
              <div className="font-display font-extrabold text-coral-600">{nis(feat.price)}</div>
            </div>
          </div>
          <div className="absolute bottom-2 start-2 w-52 h-64 rounded-[2rem] shadow-pop -rotate-6 animate-float-slow overflow-hidden bg-white">
            <SmartImg src={feat2.img} alt={feat2.title_he} emoji={feat2.emoji} tint={feat2.tint} className="w-full h-full" />
          </div>
          <div className="absolute top-1/2 start-1/2 -translate-x-1/2 -translate-y-1/2 z-10 grid place-items-center h-28 w-28 rounded-full bg-white shadow-pop animate-float">
            <div className="text-center">
              <Gift size={30} className="mx-auto text-coral-500" />
              <div className="font-display font-extrabold text-ink-900 mt-1">WOW</div>
            </div>
          </div>
          <div className="absolute top-8 start-4 bg-white rounded-2xl px-4 py-3 shadow-lift -rotate-6 animate-float-slow">
            <div className="flex items-center gap-1 text-sun-500">
              {[...Array(5)].map((_, i) => <Star key={i} size={14} fill="currentColor" />)}
            </div>
            <div className="text-xs font-bold text-ink-600 mt-1">4.9 / 5</div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── STATS ─────────────────────────── */

function StatsStrip({ t }) {
  const stats = [
    ["200+", "stat_experiences"],
    ["48,000+", "stat_reviews"],
    ["350+", "stat_partners"],
    [null, "stat_delivery"],
  ];
  return (
    <section className="bg-ink-900 text-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8 grid grid-cols-2 md:grid-cols-4 gap-6">
        {stats.map(([val, key], i) => (
          <div key={i} className="text-center md:text-start">
            <div className="font-display text-3xl sm:text-4xl font-extrabold text-coral-400">
              {val ?? t("stat_delivery_val")}
            </div>
            <div className="text-sm font-medium text-cream-300 mt-1">{t(key)}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─────────────────────────── CATEGORIES ─────────────────────────── */

function CategorySection({ t, categories, loc, setActiveCat }) {
  const cats = categories.length ? categories : FALLBACK_CATS;
  const scrollToCatalog = (slug) => {
    setActiveCat(slug);
    document.getElementById("catalog")?.scrollIntoView({ behavior: "smooth" });
  };
  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 py-16 sm:py-20">
      <SectionHead title={t("categories_title")} subtitle={t("categories_subtitle")} />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {cats.map((c) => (
          <button
            key={c.id ?? c.slug}
            onClick={() => scrollToCatalog(c.slug)}
            className="group relative aspect-[3/4] rounded-3xl overflow-hidden shadow-soft hover:shadow-lift hover:-translate-y-1 transition-all duration-300"
          >
            <SmartImg src={c.img} alt={loc(c, "name")} emoji={c.emoji} tint={c.tint} className="absolute inset-0" imgClass="group-hover:scale-110" />
            <div className="absolute inset-0 bg-gradient-to-t from-ink-900/80 via-ink-900/10 to-transparent" />
            <div className="absolute bottom-0 inset-x-0 p-4 text-white text-start">
              <div className="text-2xl mb-1">{c.emoji}</div>
              <div className="font-display font-bold text-lg leading-tight">{loc(c, "name")}</div>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

function SectionHead({ title, subtitle, center = false }) {
  return (
    <div className={`mb-10 ${center ? "text-center max-w-2xl mx-auto" : ""}`}>
      <h2 className="font-display text-4xl sm:text-5xl font-extrabold tracking-tight text-ink-900">{title}</h2>
      {subtitle && <p className="mt-3 text-lg text-ink-500">{subtitle}</p>}
    </div>
  );
}

/* ─────────────────────────── HOW IT WORKS ─────────────────────────── */

function HowItWorks({ t }) {
  const steps = [
    { icon: Gift, key: 1, color: "bg-coral-500" },
    { icon: Ticket, key: 2, color: "bg-sun-500" },
    { icon: Sparkles, key: 3, color: "bg-teal-500" },
    { icon: PartyPopper, key: 4, color: "bg-berry-500" },
  ];
  return (
    <section id="how" className="bg-cream-100 py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHead title={t("how_title")} subtitle={t("how_subtitle")} center />
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={s.key} className="relative bg-white rounded-3xl p-7 shadow-soft hover:shadow-lift hover:-translate-y-1 transition-all duration-300">
                <div className="absolute top-6 end-6 font-display text-5xl font-extrabold text-cream-200">{i + 1}</div>
                <div className={`grid place-items-center h-14 w-14 rounded-2xl ${s.color} text-white mb-5`}>
                  <Icon size={26} />
                </div>
                <h3 className="font-display text-xl font-bold text-ink-900 mb-2">{t(`how_${s.key}_title`)}</h3>
                <p className="text-ink-500 leading-relaxed">{t(`how_${s.key}_text`)}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── CATALOG ─────────────────────────── */

function Catalog({ t, loc, loading, filtered, categories, activeCat, setActiveCat, openModal, addToGiftBox, inBox, boxFull, rtl }) {
  const cats = categories.length ? categories : FALLBACK_CATS;
  return (
    <section id="catalog" className="mx-auto max-w-7xl px-4 sm:px-6 py-16 sm:py-20">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-8">
        <SectionHead title={t("bestsellers_title")} subtitle={t("bestsellers_subtitle")} />
      </div>

      {/* Filter chips */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 mb-8 -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap">
        <FilterChip active={activeCat === "all"} onClick={() => setActiveCat("all")}>{t("cat_all")}</FilterChip>
        {cats.map((c) => (
          <FilterChip key={c.id ?? c.slug} active={activeCat === c.slug} onClick={() => setActiveCat(c.slug)}>
            <span className="me-1">{c.emoji}</span>{loc(c, "name")}
          </FilterChip>
        ))}
      </div>

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="rounded-3xl overflow-hidden bg-white shadow-soft">
              <div className="h-56 skeleton" />
              <div className="p-6 space-y-3">
                <div className="h-5 w-2/3 skeleton rounded-full" />
                <div className="h-4 w-1/3 skeleton rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((exp) => (
            <ExperienceCard
              key={exp.id}
              {...{ exp, t, loc, openModal, add: () => addToGiftBox(exp), added: inBox(exp.id), boxFull, rtl }}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function FilterChip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`whitespace-nowrap rounded-full px-5 py-2.5 text-sm font-bold transition-all ${active ? "bg-coral-500 text-white glow-coral" : "bg-white text-ink-600 shadow-soft hover:text-coral-600"}`}
    >
      {children}
    </button>
  );
}

function ExperienceCard({ exp, t, loc, openModal, add, added, boxFull }) {
  return (
    <article className="group flex flex-col rounded-3xl overflow-hidden bg-white shadow-soft hover:shadow-lift hover:-translate-y-1 transition-all duration-300">
      <button onClick={() => openModal(exp)} className="relative h-56 block text-start cursor-pointer">
        <SmartImg src={exp.img} alt={loc(exp, "title")} emoji={exp.emoji} tint={exp.tint} className="absolute inset-0" imgClass="group-hover:scale-105" />
        {exp.is_best_seller && (
          <span className="absolute top-3 start-3"><Pill className="bg-coral-500 text-white shadow-lift"><Sparkles size={12} /> Bestseller</Pill></span>
        )}
        {exp.old_price && (
          <span className="absolute top-3 end-3"><Pill className="bg-sun-400 text-ink-900">-{Math.round((1 - exp.price / exp.old_price) * 100)}%</Pill></span>
        )}
      </button>
      <div className="flex flex-col flex-1 p-6">
        <div className="flex items-start justify-between gap-3 mb-3">
          <h3 className="font-display text-lg font-bold text-ink-900 leading-snug">{loc(exp, "title")}</h3>
        </div>
        <p className="text-sm text-ink-500 leading-relaxed line-clamp-2 mb-4">{loc(exp, "description")}</p>
        <div className="flex items-center gap-4 text-xs font-semibold text-ink-500 mb-5">
          {loc(exp, "duration") && <span className="inline-flex items-center gap-1"><Clock size={14} className="text-teal-500" />{loc(exp, "duration")}</span>}
          {loc(exp, "participants") && <span className="inline-flex items-center gap-1"><Users size={14} className="text-teal-500" />{loc(exp, "participants")}</span>}
          <Stars rating={exp.rating} count={exp.reviews_count} className="ms-auto" />
        </div>
        <div className="mt-auto flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-bold text-ink-400">{t("card_from")}</div>
            <div className="flex items-baseline gap-2">
              <span className="font-display text-2xl font-extrabold text-coral-600">{nis(exp.price)}</span>
              {exp.old_price && <span className="text-sm text-ink-400 line-through">{nis(exp.old_price)}</span>}
            </div>
          </div>
          <button
            onClick={add}
            disabled={added || boxFull}
            className={`inline-flex items-center gap-1.5 rounded-full px-4 py-3 text-sm font-bold transition-all ${added ? "bg-teal-500 text-white" : boxFull ? "bg-cream-200 text-ink-400" : "bg-coral-50 text-coral-700 hover:bg-coral-500 hover:text-white"}`}
          >
            {added ? <><Check size={16} /> {t("card_added")}</> : <><Plus size={16} /> {t("card_add")}</>}
          </button>
        </div>
      </div>
    </article>
  );
}

/* ─────────────────────────── OCCASIONS ─────────────────────────── */

function OccasionsBar({ t }) {
  const items = [
    ["occasion_birthday", "🎂"], ["occasion_anniversary", "💍"], ["occasion_love", "❤️"],
    ["occasion_thanks", "🙏"], ["occasion_corporate", "💼"], ["occasion_family", "👨‍👩‍👧"],
  ];
  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 pb-4">
      <div className="rounded-3xl bg-gradient-to-br from-coral-500 to-coral-700 p-8 sm:p-10 text-white">
        <h2 className="font-display text-2xl sm:text-3xl font-extrabold mb-6">{t("occasions_title")}</h2>
        <div className="flex flex-wrap gap-3">
          {items.map(([k, e]) => (
            <a key={k} href="#catalog" className="inline-flex items-center gap-2 rounded-full bg-white/15 hover:bg-white hover:text-coral-600 backdrop-blur px-5 py-3 font-bold transition-all">
              <span className="text-lg">{e}</span> {t(k)}
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── REVIEWS ─────────────────────────── */

function Reviews({ t }) {
  const items = [1, 2, 3];
  return (
    <section id="reviews" className="mx-auto max-w-7xl px-4 sm:px-6 py-16 sm:py-24">
      <SectionHead title={t("reviews_title")} subtitle={t("reviews_subtitle")} center />
      <div className="grid md:grid-cols-3 gap-6">
        {items.map((n) => (
          <figure key={n} className="bg-white rounded-3xl p-7 shadow-soft flex flex-col">
            <div className="flex gap-1 text-sun-500 mb-4">
              {[...Array(5)].map((_, i) => <Star key={i} size={16} fill="currentColor" />)}
            </div>
            <blockquote className="text-ink-700 leading-relaxed flex-1">"{t(`review_${n}`)}"</blockquote>
            <figcaption className="mt-6 flex items-center gap-3">
              <div className="grid place-items-center h-11 w-11 rounded-full bg-gradient-to-br from-coral-400 to-berry-500 text-white font-display font-bold">
                {t(`review_${n}_name`).charAt(0)}
              </div>
              <div>
                <div className="font-bold text-ink-900">{t(`review_${n}_name`)}</div>
                <div className="text-sm text-ink-400">{t(`review_${n}_role`)}</div>
              </div>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

/* ─────────────────────────── BUSINESS ─────────────────────────── */

function BusinessBanner({ t, rtl }) {
  const points = ["business_point_1", "business_point_2", "business_point_3"];
  return (
    <section id="business" className="mx-auto max-w-7xl px-4 sm:px-6 py-8">
      <div className="relative rounded-[2.5rem] mesh-dark text-white overflow-hidden p-8 sm:p-14 grid lg:grid-cols-2 gap-10 items-center">
        <div>
          <Pill className="bg-coral-500/20 text-coral-300 mb-5"><Building2 size={13} /> {t("business_badge")}</Pill>
          <h2 className="font-display text-3xl sm:text-4xl font-extrabold leading-tight mb-4">{t("business_title")}</h2>
          <p className="text-cream-300 text-lg leading-relaxed mb-6 max-w-lg">{t("business_text")}</p>
          <ul className="space-y-3 mb-8">
            {points.map((p) => (
              <li key={p} className="flex items-center gap-3 font-semibold">
                <span className="grid place-items-center h-6 w-6 rounded-full bg-teal-500 text-white shrink-0"><Check size={14} /></span>
                {t(p)}
              </li>
            ))}
          </ul>
          <Btn variant="primary" size="lg">{t("business_cta")} <ArrowRight size={18} className={rtl ? "rotate-180" : ""} /></Btn>
        </div>
        <div className="hidden lg:grid grid-cols-2 gap-4">
          {FALLBACK_EXPS.slice(0, 4).map((e) => (
            <div key={e.id} className="rounded-3xl overflow-hidden h-40 shadow-pop">
              <SmartImg src={e.img} alt="" emoji={e.emoji} tint={e.tint} className="w-full h-full" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── GUARANTEES ─────────────────────────── */

function Guarantees({ t }) {
  const items = [
    [CalendarClock, "guarantee_1", "text-coral-500"],
    [RefreshCw, "guarantee_2", "text-teal-500"],
    [ShieldCheck, "guarantee_3", "text-berry-500"],
    [Headphones, "guarantee_4", "text-sun-500"],
  ];
  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 py-16">
      <SectionHead title={t("guarantee_title")} center />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        {items.map(([Icon, k, color]) => (
          <div key={k} className="text-center px-4">
            <div className={`inline-grid place-items-center h-16 w-16 rounded-2xl bg-cream-100 mb-4 ${color}`}>
              <Icon size={28} />
            </div>
            <h3 className="font-display text-lg font-bold text-ink-900 mb-1">{t(`${k}_title`)}</h3>
            <p className="text-sm text-ink-500 leading-relaxed">{t(`${k}_text`)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─────────────────────────── NEWSLETTER ─────────────────────────── */

function Newsletter({ t }) {
  const [sent, setSent] = useState(false);
  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 py-8">
      <div className="rounded-[2.5rem] bg-sun-400 p-8 sm:p-14 text-center overflow-hidden relative">
        <div className="absolute -top-10 -end-10 w-48 h-48 rounded-full bg-white/20 blur-2xl" />
        <h2 className="font-display text-3xl sm:text-4xl font-extrabold text-ink-900 mb-3 relative">{t("newsletter_title")}</h2>
        <p className="text-ink-800 text-lg mb-7 relative max-w-xl mx-auto">{t("newsletter_text")}</p>
        <form
          onSubmit={(e) => { e.preventDefault(); setSent(true); }}
          className="relative flex flex-col sm:flex-row gap-3 max-w-lg mx-auto"
        >
          <input
            type="email"
            required
            placeholder={t("newsletter_placeholder")}
            className="flex-1 rounded-full bg-white px-6 py-4 outline-none text-ink-900 placeholder:text-ink-400 shadow-soft"
          />
          <Btn type="submit" variant="dark" size="lg" className="whitespace-nowrap">
            {sent ? <><Check size={18} /> {t("copied")}</> : t("newsletter_button")}
          </Btn>
        </form>
      </div>
    </section>
  );
}

/* ─────────────────────────── FOOTER ─────────────────────────── */

function Footer({ t, lang, goRedeem }) {
  const explore = ["nav_experiences", "nav_how", "nav_reviews", "nav_business"];
  const support = ["footer_faq", "footer_terms", "footer_privacy", "footer_contact"];
  return (
    <footer className="bg-ink-900 text-cream-300 mt-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-14 grid gap-10 md:grid-cols-4">
        <div className="md:col-span-2 max-w-sm">
          <div className="flex items-center gap-2 mb-4">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-coral-400 to-coral-600 text-white font-display font-extrabold text-lg">V</span>
            <span className="font-display text-2xl font-extrabold text-white">VAU</span>
          </div>
          <p className="leading-relaxed text-cream-300/80">{t("footer_about")}</p>
          <button onClick={goRedeem} className="mt-6 inline-flex items-center gap-2 rounded-full bg-white/10 hover:bg-coral-500 px-5 py-3 font-bold text-white transition-colors">
            <Ticket size={17} /> {t("redeem_voucher")}
          </button>
        </div>
        <div>
          <h4 className="font-display font-bold text-white mb-4">{t("footer_explore")}</h4>
          <ul className="space-y-2.5">
            {explore.map((k) => (
              <li key={k}><a href="#catalog" className="hover:text-coral-400 transition-colors">{t(k)}</a></li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="font-display font-bold text-white mb-4">{t("footer_support")}</h4>
          <ul className="space-y-2.5">
            {support.map((k) => (
              <li key={k}><a href="#" className="hover:text-coral-400 transition-colors">{t(k)}</a></li>
            ))}
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-cream-300/60">
          <span>© {new Date().getFullYear()} VAU · {t("footer_rights")}</span>
          <span>{lang === "he" ? "נבנה באהבה בישראל 🇮🇱" : "Сделано с любовью в Израиле 🇮🇱"}</span>
        </div>
      </div>
    </footer>
  );
}

/* ─────────────────────────── GIFT DRAWER ─────────────────────────── */

function GiftDrawer({ open, close, t, loc, giftBox, removeFromGiftBox, clearGiftBox, checkoutLoading, handleCheckout, orderCode, setOrderCode, checkoutError, rtl }) {
  const [copied, setCopied] = useState(false);
  const total = giftBox.reduce((s, e) => s + Number(e.price), 0);

  const copy = () => {
    navigator.clipboard?.writeText(orderCode).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 1800);
    }).catch(() => {});
  };
  const closeAll = () => { setOrderCode(null); close(); };

  return (
    <div className={`fixed inset-0 z-[60] ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
      <div onClick={close} className={`absolute inset-0 bg-ink-900/50 backdrop-blur-sm transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`} />
      <aside
        className={`absolute inset-y-0 end-0 w-full max-w-md bg-cream-50 shadow-pop flex flex-col transition-transform duration-300 ${open ? "translate-x-0" : (rtl ? "-translate-x-full" : "translate-x-full")}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-cream-200">
          <h3 className="font-display text-xl font-extrabold flex items-center gap-2"><Gift size={20} className="text-coral-500" /> {t("drawer_title")}</h3>
          <button onClick={close} className="grid place-items-center h-9 w-9 rounded-full bg-white shadow-soft hover:text-coral-600"><X size={18} /></button>
        </div>

        {orderCode ? (
          /* Success state */
          <div className="flex-1 flex flex-col items-center justify-center text-center px-8 animate-pop">
            <div className="text-6xl mb-5">🎉</div>
            <h4 className="font-display text-2xl font-extrabold mb-2">{t("order_success_title")}</h4>
            <p className="text-ink-500 mb-6">{t("order_success_text")}</p>
            <div className="w-full rounded-2xl border-2 border-dashed border-coral-300 bg-white p-5 mb-4">
              <div className="text-xs font-bold text-ink-400 mb-1">{t("order_code_label")}</div>
              <div className="font-display text-2xl font-extrabold tracking-widest text-coral-600">{orderCode}</div>
            </div>
            <Btn variant="soft" onClick={copy} className="mb-3 w-full">
              {copied ? <><Check size={16} /> {t("copied")}</> : <><Copy size={16} /> {t("copy_code")}</>}
            </Btn>
            <button onClick={closeAll} className="text-sm font-bold text-ink-500 hover:text-coral-600">{t("continue_shopping")}</button>
          </div>
        ) : giftBox.length === 0 ? (
          /* Empty state */
          <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
            <div className="grid place-items-center h-24 w-24 rounded-full bg-cream-100 mb-5"><Gift size={40} className="text-coral-300" /></div>
            <p className="text-ink-500 mb-6">{t("empty_box")}</p>
            <Btn onClick={close} variant="primary">{t("continue_shopping")}</Btn>
          </div>
        ) : (
          /* Items */
          <>
            <div className="px-6 py-3 text-sm font-semibold text-ink-500 bg-cream-100">{t("box_hint")}</div>
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {giftBox.map((e) => (
                <div key={e.id} className="flex gap-3 items-center bg-white rounded-2xl p-3 shadow-soft">
                  <div className="h-16 w-16 rounded-xl overflow-hidden shrink-0">
                    <SmartImg src={e.img} alt="" emoji={e.emoji} tint={e.tint} className="w-full h-full" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-ink-900 truncate">{loc(e, "title")}</div>
                    <div className="font-display font-extrabold text-coral-600">{nis(e.price)}</div>
                  </div>
                  <button onClick={() => removeFromGiftBox(e.id)} className="grid place-items-center h-9 w-9 rounded-full hover:bg-coral-50 text-ink-400 hover:text-coral-600 shrink-0">
                    <Trash2 size={17} />
                  </button>
                </div>
              ))}
              {giftBox.length < 5 && (
                <button onClick={close} className="w-full rounded-2xl border-2 border-dashed border-cream-300 py-4 text-ink-400 font-bold hover:border-coral-300 hover:text-coral-600 flex items-center justify-center gap-2">
                  <Plus size={18} /> {5 - giftBox.length}
                </button>
              )}
            </div>
            <div className="border-t border-cream-200 px-6 py-5 space-y-4 bg-white">
              <div className="flex items-center justify-between">
                <span className="font-bold text-ink-500">{t("total")}</span>
                <span className="font-display text-2xl font-extrabold text-ink-900">{nis(total)}</span>
              </div>
              {checkoutError && (
                <p className="rounded-xl bg-coral-50 text-coral-700 text-sm font-semibold px-4 py-3 text-center">{checkoutError}</p>
              )}
              <Btn variant="primary" size="lg" className="w-full" loading={checkoutLoading} onClick={handleCheckout}>{t("checkout")}</Btn>
              <button onClick={clearGiftBox} className="w-full text-sm font-bold text-ink-400 hover:text-coral-600">{t("clear_box")}</button>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

/* ─────────────────────────── EXPERIENCE MODAL ─────────────────────────── */

function ExperienceModal({ exp, close, t, loc, add, added, boxFull }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-6" onClick={close}>
      <div className="absolute inset-0 bg-ink-900/60 backdrop-blur-sm animate-pop" />
      <div className="relative bg-cream-50 w-full max-w-2xl rounded-t-[2rem] sm:rounded-[2rem] overflow-hidden shadow-pop animate-rise max-h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="relative h-64 shrink-0">
          <SmartImg src={exp.img} alt={loc(exp, "title")} emoji={exp.emoji} tint={exp.tint} className="absolute inset-0" />
          <button onClick={close} className="absolute top-4 end-4 grid place-items-center h-10 w-10 rounded-full bg-white/90 backdrop-blur text-ink-900 hover:text-coral-600 shadow-soft"><X size={20} /></button>
          {exp.is_best_seller && <span className="absolute top-4 start-4"><Pill className="bg-coral-500 text-white"><Sparkles size={12} /> Bestseller</Pill></span>}
        </div>
        <div className="p-7 overflow-y-auto">
          <div className="flex items-center gap-3 mb-3">
            <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-ink-900">{loc(exp, "title")}</h2>
          </div>
          <Stars rating={exp.rating} count={exp.reviews_count} className="mb-4" />
          <p className="text-ink-600 leading-relaxed mb-6">{loc(exp, "description")}</p>
          <div className="flex flex-wrap gap-3 mb-6">
            {loc(exp, "duration") && <span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-ink-600 shadow-soft"><Clock size={16} className="text-teal-500" /> {t("duration")}: {loc(exp, "duration")}</span>}
            {loc(exp, "participants") && <span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-ink-600 shadow-soft"><Users size={16} className="text-teal-500" /> {t("participants")}: {loc(exp, "participants")}</span>}
          </div>
        </div>
        <div className="border-t border-cream-200 bg-white p-5 flex items-center justify-between gap-4 shrink-0">
          <div>
            <div className="text-xs font-bold text-ink-400">{t("card_from")}</div>
            <div className="flex items-baseline gap-2">
              <span className="font-display text-3xl font-extrabold text-coral-600">{nis(exp.price)}</span>
              {exp.old_price && <span className="text-ink-400 line-through">{nis(exp.old_price)}</span>}
            </div>
          </div>
          <Btn variant="primary" size="lg" onClick={add} disabled={added || boxFull}>
            {added ? <><Check size={18} /> {t("card_added")}</> : <><Gift size={18} /> {t("card_add")}</>}
          </Btn>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── REDEEM VIEW ─────────────────────────── */

function RedeemView({ goHome, loc, t, rtl }) {
  const [step, setStep] = useState(0); // 0 enter code, 1 choose, 2 done
  const [code, setCode] = useState("");
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [choosing, setChoosing] = useState(null);
  const [error, setError] = useState("");

  const activate = async (e) => {
    e?.preventDefault();
    if (!code.trim()) return;
    setLoading(true); setError("");
    try {
      const res = await axios.post(`${API_URL}/activate`, { code: code.trim() }, { timeout: 8000 });
      // Only a code the server recognises unlocks the options. A 404 for a
      // mistyped/nonexistent voucher must stay an error, not open selection.
      setOptions(res.data.options || []);
      setStep(1);
    } catch {
      setError(t("redeem_error"));
    } finally {
      setLoading(false);
    }
  };

  const choose = async (exp) => {
    setChoosing(exp.id); setError("");
    try {
      // Only confirm once the backend has recorded the selection; otherwise the
      // recipient would think scheduling is done while nothing was persisted.
      await axios.post(`${API_URL}/redeem`, { code: code.trim(), experienceId: exp.id }, { timeout: 8000 });
      setStep(2);
    } catch {
      setError(t("redeem_select_error"));
    } finally {
      setChoosing(null);
    }
  };

  return (
    <div className="min-h-screen mesh-warm">
      <div className="mx-auto max-w-2xl px-4 sm:px-6 py-10">
        <button onClick={goHome} className="inline-flex items-center gap-2 text-sm font-bold text-ink-500 hover:text-coral-600 mb-10">
          {rtl ? <ArrowRight size={18} /> : <ArrowLeft size={18} />} {t("back_home")}
        </button>

        <div className="flex items-center gap-2 mb-8">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-coral-400 to-coral-600 text-white font-display font-extrabold">V</span>
          <span className="font-display text-2xl font-extrabold">VAU</span>
        </div>

        {step === 0 && (
          <form onSubmit={activate} className="bg-white rounded-3xl shadow-lift p-8 sm:p-10 text-center animate-rise">
            <div className="inline-grid place-items-center h-16 w-16 rounded-2xl bg-coral-50 text-coral-500 mb-5"><Ticket size={30} /></div>
            <h1 className="font-display text-3xl font-extrabold mb-2">{t("redeem_title")}</h1>
            <p className="text-ink-500 mb-7">{t("redeem_intro")}</p>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder={t("redeem_code_placeholder")}
              className="w-full rounded-2xl bg-cream-100 px-6 py-5 text-center text-2xl font-display font-extrabold tracking-widest text-ink-900 outline-none focus:ring-2 focus:ring-coral-400 mb-3 placeholder:text-ink-300 placeholder:tracking-normal"
            />
            {error && <p className="text-coral-600 text-sm font-semibold mb-3">{error}</p>}
            <Btn type="submit" variant="primary" size="lg" className="w-full" loading={loading}>{t("redeem_activate")}</Btn>
          </form>
        )}

        {step === 1 && (
          <div className="animate-rise">
            <div className="bg-teal-500/10 border border-teal-500/30 rounded-2xl p-4 mb-6 flex items-center gap-3">
              <span className="grid place-items-center h-9 w-9 rounded-full bg-teal-500 text-white"><Check size={18} /></span>
              <div>
                <div className="font-display font-bold text-ink-900">{t("redeem_choose_title")}</div>
                <div className="text-sm text-ink-500">{t("redeem_choose_text")}</div>
              </div>
            </div>
            {error && <p className="rounded-xl bg-coral-50 text-coral-700 text-sm font-semibold px-4 py-3 text-center mb-4">{error}</p>}
            <div className="space-y-3">
              {options.map((exp) => (
                <button
                  key={exp.id}
                  onClick={() => choose(exp)}
                  disabled={choosing != null}
                  className="group w-full bg-white rounded-2xl shadow-soft hover:shadow-lift p-3 flex items-center gap-4 text-start transition-all hover:-translate-y-0.5 disabled:opacity-60"
                >
                  <div className="h-16 w-16 rounded-xl overflow-hidden shrink-0">
                    <SmartImg src={exp.img} alt="" emoji={exp.emoji} tint={exp.tint} className="w-full h-full" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-display font-bold text-ink-900 truncate">{loc(exp, "title")}</div>
                    <Stars rating={exp.rating} count={exp.reviews_count} />
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-coral-50 text-coral-700 px-4 py-2 font-bold group-hover:bg-coral-500 group-hover:text-white transition-all shrink-0">
                    {choosing === exp.id
                      ? <Loader2 size={16} className="animate-spin" />
                      : <>{t("select")} {rtl ? <ChevronLeft size={16} /> : <ArrowRight size={16} />}</>}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="bg-white rounded-3xl shadow-lift p-8 sm:p-12 text-center animate-pop">
            <div className="text-6xl mb-5">🎊</div>
            <h2 className="font-display text-3xl font-extrabold mb-3">{t("redeem_done_title")}</h2>
            <p className="text-ink-500 mb-8 max-w-md mx-auto">{t("redeem_done_text")}</p>
            <Btn variant="primary" size="lg" onClick={goHome}>{t("back_home")}</Btn>
          </div>
        )}
      </div>
    </div>
  );
}
