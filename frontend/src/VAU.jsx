import { useState, useEffect } from "react";
import { useTranslation } from 'react-i18next';
import { useStore } from './StoreContext';
import { Globe, Package, Trash2, X, Star, Check, ArrowRight, Loader2, Award } from 'lucide-react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// ─── COMPONENTS ─────────────────────────────────────────────────────────────

function Badge({ children, className = "" }) {
  return (
    <span className={`inline-block px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-[0.1em] bg-gold-matte/10 text-gold-matte border border-gold-matte/20 animate-pulse-gold ${className}`}>
      {children}
    </span>
  );
}

function Button({ children, variant = "primary", className = "", loading = false, ...props }) {
  const variants = {
    primary: "bg-gradient-to-br from-slate-100 to-slate-300 text-ocean-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] hover:scale-[1.02] active:scale-95",
    ghost: "bg-transparent text-slate-400 border border-white/10 hover:border-turquoise-400/30 hover:text-turquoise-400",
    accent: "bg-gradient-to-br from-gold-matte to-gold-glow text-ocean-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] hover:brightness-110",
  };
  return (
    <button
      className={`px-6 py-3 rounded-xl font-black text-xs transition-all duration-300 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 ${variants[variant]} ${className}`}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading && <Loader2 size={14} className="animate-spin" />}
      {children}
    </button>
  );
}

export default function VAU() {
  const { t, i18n } = useTranslation();
  const { giftBox, addToGiftBox, removeFromGiftBox, clearGiftBox } = useStore();
  const [activeCat, setActiveCat] = useState("all");
  const [openCard, setOpenCard] = useState(null);
  const [page, setPage] = useState("home");
  const [code, setCode] = useState("");
  const [codeStep, setCodeStep] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const [experiences, setExperiences] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [orderCode, setOrderCode] = useState(null);
  const [redeemData, setRedeemData] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [expRes, catRes] = await Promise.all([
          axios.get(`${API_URL}/experiences?category=${activeCat}`),
          axios.get(`${API_URL}/categories`)
        ]);
        setExperiences(expRes.data);
        setCategories(catRes.data);
      } catch (err) {
        console.error("Failed to fetch data:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [activeCat]);

  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", h);
    return () => window.removeEventListener("scroll", h);
  }, []);

  const changeLanguage = (lng) => {
    i18n.changeLanguage(lng);
  };

  const getLocalized = (obj, field) => {
    const key = `${field}_${i18n.language}`;
    return obj[key] || obj[`${field}_he`];
  };

  const handleCheckout = async () => {
    if (giftBox.length === 0) return;
    setCheckoutLoading(true);
    try {
      const res = await axios.post(`${API_URL}/checkout`, {
        experienceIds: giftBox.map(e => e.id)
      });
      setOrderCode(res.data.code);
      clearGiftBox();
    } catch (err) {
      alert("Checkout failed.");
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handleActivate = async () => {
    try {
      const res = await axios.post(`${API_URL}/activate`, { code });
      setRedeemData(res.data);
      setCodeStep(1);
    } catch (err) {
      alert("Voucher not found.");
    }
  };

  const handleRedeem = async (expId) => {
    try {
      await axios.post(`${API_URL}/redeem`, { code, experienceId: expId });
      setCodeStep(2);
    } catch (err) {
      alert("Redemption failed.");
    }
  };

  if (page === "redeem") {
    return (
      <RedeemPage
        code={code}
        setCode={setCode}
        step={codeStep}
        setStep={setStep => setCodeStep(setStep)}
        goHome={() => setPage("home")}
        redeemData={redeemData}
        handleActivate={handleActivate}
        handleRedeem={handleRedeem}
        i18n={i18n}
        t={t}
        getLocalized={getLocalized}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 selection:bg-turquoise-400/30 font-manrope">

      {/* ── NAV ── */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 px-6 md:px-12 py-5 flex items-center justify-between gap-4 ${scrolled ? "bg-ocean-950/80 backdrop-blur-2xl border-b border-white/5 shadow-2xl" : "bg-transparent"}`}>
        <div className="flex items-center gap-10">
          <span className="text-2xl font-black tracking-[-0.05em] cursor-pointer font-sora" onClick={() => setPage("home")}>
            VAU
          </span>
          <div className="hidden lg:flex gap-2">
            <button onClick={() => setActiveCat("all")} className={`px-4 py-2 text-[11px] font-black uppercase tracking-widest transition-all ${activeCat === "all" ? "text-turquoise-400 bg-turquoise-400/10" : "text-slate-500 hover:text-slate-200"} rounded-lg`}>
              {i18n.language === 'he' ? 'הכל' : i18n.language === 'ru' ? 'Все' : 'All'}
            </button>
            {categories.map(c => (
              <button key={c.id} onClick={() => setActiveCat(c.slug)} className={`px-4 py-2 text-[11px] font-black uppercase tracking-widest transition-all ${activeCat === c.slug ? "text-turquoise-400 bg-turquoise-400/10" : "text-slate-500 hover:text-slate-200"} rounded-lg`}>
                {getLocalized(c, 'name')}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex bg-white/5 rounded-lg p-1">
            {['he', 'en', 'ru'].map(lang => (
              <button
                key={lang}
                onClick={() => changeLanguage(lang)}
                className={`px-2.5 py-1 text-[10px] font-black uppercase rounded transition-all ${i18n.language === lang ? "bg-white/10 text-turquoise-400" : "text-slate-600 hover:text-slate-400"}`}
              >
                {lang}
              </button>
            ))}
          </div>

          <Button variant="ghost" className="px-4 py-2 text-[10px] tracking-widest uppercase" onClick={() => { setPage("redeem"); setCodeStep(0); setRedeemData(null); }}>
             {t('redeem_voucher')}
          </Button>

          <div className="relative group">
            <Button variant="primary" className="px-5 py-2 text-[10px] flex items-center gap-2 font-black">
              <Package size={14} className="text-turquoise-500" />
              <span>{giftBox.length}</span>
            </Button>

            <div className="absolute top-full left-0 mt-3 w-72 bg-ocean-900 border border-white/10 rounded-2xl p-5 shadow-3xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 translate-y-2 group-hover:translate-y-0">
               <h4 className="text-xs font-black uppercase tracking-widest mb-4 text-slate-400">{t('gift_box')}</h4>
               {giftBox.length === 0 ? (
                 <p className="text-[10px] text-slate-600 italic">{t('empty_box')}</p>
               ) : (
                 <div className="space-y-4">
                   {giftBox.map(item => (
                     <div key={item.id} className="flex justify-between items-center gap-3 text-[11px]">
                       <span className="truncate font-bold text-slate-300">{getLocalized(item, 'title')}</span>
                       <button onClick={() => removeFromGiftBox(item.id)} className="text-slate-600 hover:text-red-400 transition-colors">
                         <Trash2 size={14} />
                       </button>
                     </div>
                   ))}
                   <div className="pt-4 border-t border-white/10 flex flex-col gap-2">
                     <Button loading={checkoutLoading} onClick={handleCheckout} variant="accent" className="w-full py-2.5">{t('checkout')}</Button>
                     <button onClick={clearGiftBox} className="text-[10px] font-black uppercase tracking-widest text-slate-600 hover:text-slate-400 transition-colors">{t('empty_box')}</button>
                   </div>
                 </div>
               )}
            </div>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="relative min-h-screen flex items-center pt-20 overflow-hidden vignette-grid">
        {/* Radial Aura */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-turquoise-500/10 rounded-full blur-[120px] pointer-events-none" />

        <div className="max-w-6xl mx-auto px-6 md:px-12 grid lg:grid-cols-2 gap-20 items-center relative z-10">
          <div className="animate-in fade-in slide-in-from-bottom-10 duration-1000">
            <Badge className="mb-8 bg-gold-matte/5 border-gold-matte/20">PREMIUM EDITION</Badge>
            <h1 className="text-6xl md:text-8xl font-black leading-[0.95] tracking-[-0.06em] mb-8 font-sora">
              {t('hero_title').split('. ').map((part, i) => (
                <span key={i} className={i === 2 ? "text-slate-100 block" : i === 1 ? "text-slate-600 block" : "block"}>
                  {part}{i < 2 ? "." : ""}
                </span>
              ))}
              <span className="text-2xl md:text-4xl italic font-light tracking-widest block mt-4 bg-gradient-to-r from-gold-matte via-turquoise-400 to-gold-glow bg-clip-text text-transparent font-frank">
                Exclusively Curated.
              </span>
            </h1>
            <p className="text-xl text-slate-500 leading-relaxed mb-12 max-w-lg font-medium">
              {t('hero_subtitle')}
            </p>
            <div className="flex flex-wrap gap-5">
              <Button variant="accent" className="text-sm px-10 py-5 tracking-widest uppercase">{t('select_bundle')}</Button>
              <Button variant="ghost" className="text-sm px-10 py-5 tracking-widest uppercase">{t('how_it_works')}</Button>
            </div>
          </div>

          <div className="hidden lg:block relative animate-in fade-in zoom-in-95 duration-1000">
             <div className="w-full aspect-square bg-gradient-to-br from-ocean-900 to-ocean-950 border border-white/5 rounded-[4rem] p-12 relative overflow-hidden shadow-3xl">
                <div className="absolute inset-0 bg-radial from-turquoise-500/5 to-transparent" />
                <div className="relative z-10 h-full flex flex-col justify-between">
                   <div className="flex justify-between items-start">
                      <div className="w-16 h-16 bg-gold-matte/10 rounded-2xl flex items-center justify-center border border-gold-matte/20">
                         <Award className="text-gold-matte" size={32} />
                      </div>
                      <div className="text-right">
                         <div className="text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] mb-1">Status</div>
                         <div className="text-xs font-black text-turquoise-400 uppercase tracking-widest">Verified Premium</div>
                      </div>
                   </div>
                   <div className="space-y-4">
                      <div className="h-2 w-3/4 bg-white/5 rounded-full" />
                      <div className="h-2 w-1/2 bg-white/5 rounded-full" />
                   </div>
                   <div className="text-center">
                      <div className="text-8xl mb-4 grayscale opacity-50 hover:grayscale-0 hover:opacity-100 transition-all duration-700 cursor-pointer">🎁</div>
                      <div className="text-[10px] font-black text-gold-matte uppercase tracking-[0.4em]">The Ultimate Choice</div>
                   </div>
                </div>
             </div>
          </div>
        </div>
      </section>

      {/* ── STATS STRIP ── */}
      <div className="bg-gradient-to-r from-ocean-950 via-ocean-900 to-ocean-950 border-y border-white/5 py-8">
         <div className="max-w-6xl mx-auto px-6 md:px-12 flex flex-wrap justify-between gap-10">
            {[["Experiences", "200+"], ["Reviews", "1200+"], ["Delivery", "48h"]].map(([label, val]) => (
              <div key={label} className="flex flex-col">
                 <span className="text-[9px] font-black text-slate-600 uppercase tracking-[0.3em] mb-1">{label}</span>
                 <span className="text-3xl font-black bg-gradient-to-b from-slate-100 to-slate-500 bg-clip-text text-transparent font-sora">{val}</span>
              </div>
            ))}
         </div>
      </div>

      {/* ── CATALOG ── */}
      <section className="px-6 md:px-12 py-32 bg-ocean-950">
        <div className="max-w-6xl mx-auto">
          <div className="flex justify-between items-end mb-20">
             <h2 className="text-5xl font-black tracking-tight font-sora">{t('best_sellers')}</h2>
             <div className="h-px flex-1 mx-10 bg-white/5 hidden md:block" />
          </div>

          {loading ? (
            <div className="flex justify-center py-40">
               <Loader2 size={48} className="text-turquoise-500 animate-spin" />
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {experiences.map(pkg => (
                <div
                  key={pkg.id}
                  className="bg-ocean-900/50 border border-white/5 rounded-[3rem] overflow-hidden group hover:border-turquoise-400/20 transition-all duration-500 hover:-translate-y-2 shadow-2xl"
                >
                  <div className="h-56 flex items-center justify-center relative bg-gradient-to-br from-ocean-900 to-ocean-950 overflow-hidden">
                    <div className="absolute inset-0 bg-radial from-turquoise-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                    <span className="text-7xl group-hover:scale-110 transition-transform duration-700 z-10">{pkg.emoji}</span>
                    {pkg.is_best_seller && (
                       <div className="absolute top-6 right-6">
                          <Badge className="bg-turquoise-400/10 text-turquoise-400 border-turquoise-400/20">BESTSELLER</Badge>
                       </div>
                    )}
                  </div>
                  <div className="p-10">
                    <h3 className="text-xl font-black mb-4 truncate font-sora">{getLocalized(pkg, 'title')}</h3>
                    <div className="flex justify-between items-center mb-8">
                      <span className="text-2xl font-black text-turquoise-400">₪{pkg.price}</span>
                      <div className="flex items-center gap-1.5 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                        <Star size={12} className="text-gold-matte" fill="currentColor" />
                        <span>{pkg.rating} ({pkg.reviews_count})</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                       <Button onClick={() => setOpenCard(pkg)} variant="ghost" className="py-3 px-0 tracking-widest uppercase">{t('details')}</Button>
                       <Button
                         onClick={() => addToGiftBox(pkg)}
                         variant="accent"
                         className="py-3 px-0 tracking-widest uppercase"
                         disabled={giftBox.length >= 5 || giftBox.find(item => item.id === pkg.id)}
                       >
                         {giftBox.find(item => item.id === pkg.id) ? <Check size={16} /> : t('add_to_gift')}
                       </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── MODAL ── */}
      {openCard && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6" onClick={() => setOpenCard(null)}>
          <div className="absolute inset-0 bg-ocean-950/90 backdrop-blur-3xl animate-in fade-in duration-500" />
          <div className="bg-ocean-900 border border-white/10 rounded-[3.5rem] w-full max-w-2xl p-14 relative z-10 animate-in zoom-in-95 duration-500 shadow-3xl" onClick={e => e.stopPropagation()}>
            <button className="absolute top-10 left-10 text-slate-600 hover:text-turquoise-400 transition-colors" onClick={() => setOpenCard(null)}><X size={32} /></button>
            <div className="text-8xl mb-10">{openCard.emoji}</div>
            <h2 className="text-4xl font-black mb-6 font-sora">{getLocalized(openCard, 'title')}</h2>
            <p className="text-lg text-slate-500 mb-10 leading-relaxed font-medium">{getLocalized(openCard, 'description')}</p>
            <div className="flex justify-between items-center pt-10 border-t border-white/10">
              <span className="text-5xl font-black text-turquoise-400 font-sora">₪{openCard.price}</span>
              <Button variant="accent" className="px-12 py-5 text-sm tracking-[0.2em] uppercase" onClick={() => { addToGiftBox(openCard); setOpenCard(null); }}>{t('buy_now')}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RedeemPage({ code, setCode, step, setStep, goHome, redeemData, handleActivate, handleRedeem, i18n, t, getLocalized }) {
  return (
    <div className="min-h-screen bg-ocean-950 text-slate-100 flex flex-col items-center px-6 py-20 vignette-grid">
      <div className="w-full max-w-xl">
        <button onClick={goHome} className="flex items-center gap-3 text-xs font-black uppercase tracking-widest text-slate-600 hover:text-turquoise-400 mb-20 transition-all">
          <ArrowRight size={18} className={i18n.language === 'he' ? "rotate-0" : "rotate-180"} /> {i18n.language === 'he' ? 'חזרה לאתר' : 'Back to site'}
        </button>

        {step === 0 && (
          <div className="text-center animate-in fade-in slide-in-from-bottom-10 duration-700">
            <div className="text-8xl mb-10 opacity-40">🎟</div>
            <h1 className="text-5xl font-black mb-6 tracking-tight font-sora uppercase">{t('redeem_step_0')}</h1>
            <input
              className="w-full bg-white/5 border border-white/10 rounded-3xl px-8 py-7 text-4xl text-center tracking-[0.6em] font-black text-turquoise-400 focus:border-turquoise-400/50 outline-none transition-all mb-8 placeholder:tracking-normal placeholder:text-slate-800"
              placeholder="VAU-XXXX"
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
            />
            <Button variant="accent" className="w-full py-6 text-base tracking-[0.2em] uppercase" onClick={handleActivate}>
              {t('redeem_voucher')}
            </Button>
          </div>
        )}

        {step === 1 && redeemData && (
          <div className="animate-in fade-in slide-in-from-bottom-10 duration-700">
            <div className="bg-turquoise-500/5 border border-turquoise-500/20 rounded-[2rem] p-8 mb-12 flex items-center gap-6">
              <div className="text-4xl">💎</div>
              <div className="text-right flex-1">
                <div className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-1">{i18n.language === 'he' ? 'שובר מאומת' : 'Verified Voucher'}</div>
                <div className="text-xl font-black text-turquoise-400">{t('redeem_step_1')}</div>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              {redeemData.options.map((x, i) => (
                <button
                  key={i}
                  onClick={() => handleRedeem(x.id)}
                  className="w-full bg-ocean-900/50 border border-white/5 rounded-[2rem] p-8 text-right flex items-center justify-between group hover:border-turquoise-400/30 transition-all duration-300"
                >
                  <div className="flex items-center gap-6">
                    <span className="text-3xl group-hover:scale-125 transition-transform duration-500">{x.emoji}</span>
                    <span className="text-lg font-black text-slate-300 group-hover:text-turquoise-400 transition-colors font-sora">{getLocalized(x, 'title')}</span>
                  </div>
                  <ArrowRight size={20} className="text-slate-800 group-hover:text-turquoise-400 transition-all rotate-180" />
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="text-center animate-in fade-in slide-in-from-bottom-10 duration-700">
            <div className="text-8xl mb-10">💠</div>
            <h2 className="text-5xl font-black mb-6 tracking-tight font-sora uppercase">{t('redeem_step_2')}</h2>
            <p className="text-lg text-slate-500 mb-12 leading-relaxed font-medium">
               {i18n.language === 'he' ? 'נציג פרימיום יצור איתך קשר לתיאום סופי.' : 'A premium representative will contact you for final coordination.'}
            </p>
            <Button variant="primary" className="w-full py-6 text-base tracking-[0.2em] uppercase" onClick={goHome}>{t('confirm_date')}</Button>
          </div>
        )}
      </div>
    </div>
  );
}
