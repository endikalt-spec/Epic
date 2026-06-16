import { useState, useEffect } from "react";
import { useTranslation } from 'react-i18next';
import { useStore } from './StoreContext';
import { Globe, Package, Trash2, X, Star, Check, ArrowRight, Loader2 } from 'lucide-react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// ─── COMPONENTS ─────────────────────────────────────────────────────────────

function Badge({ children, className = "" }) {
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wider ${className}`}>
      {children}
    </span>
  );
}

function Button({ children, variant = "primary", className = "", loading = false, ...props }) {
  const variants = {
    primary: "bg-[#EDE9E0] text-[#080811] hover:bg-white active:scale-95",
    ghost: "bg-transparent text-gray-400 border border-white/10 hover:border-white/30 hover:text-gray-200 active:scale-95",
    accent: "text-[#080811] hover:brightness-110 active:scale-95",
  };
  return (
    <button
      className={`px-6 py-3 rounded-xl font-extrabold text-sm transition-all duration-200 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 ${variants[variant]} ${className}`}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading && <Loader2 size={16} className="animate-spin" />}
      {children}
    </button>
  );
}

export default function Epicent() {
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
      alert("Checkout failed. Please try again.");
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
    <div className="min-h-screen bg-[#080811] text-[#EDE9E0] selection:bg-[#FF5733]/30 font-['Heebo','Assistant',sans-serif]">

      {/* ── NAV ── */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 px-6 md:px-12 py-4 flex items-center justify-between gap-4 ${scrolled ? "bg-[#080811]/90 backdrop-blur-2xl border-b border-white/5" : "bg-transparent"}`}>
        <div className="flex items-center gap-8">
          <span className="text-2xl font-black tracking-tighter cursor-pointer" onClick={() => setPage("home")}>
            Epicent
          </span>
          <div className="hidden lg:flex gap-1">
            <button onClick={() => setActiveCat("all")} className={`px-4 py-2 text-xs font-medium ${activeCat === "all" ? "text-[#EDE9E0] bg-white/10" : "text-gray-500 hover:text-gray-200 hover:bg-white/5"} rounded-lg transition-colors`}>
              {i18n.language === 'he' ? 'הכל' : i18n.language === 'ru' ? 'Все' : 'All'}
            </button>
            {categories.map(c => (
              <button key={c.id} onClick={() => setActiveCat(c.slug)} className={`px-4 py-2 text-xs font-medium ${activeCat === c.slug ? "text-[#EDE9E0] bg-white/10" : "text-gray-500 hover:text-gray-200 hover:bg-white/5"} rounded-lg transition-colors`}>
                {getLocalized(c, 'name')}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex bg-white/5 rounded-lg p-1 mr-4">
            {['he', 'en', 'ru'].map(lang => (
              <button
                key={lang}
                onClick={() => changeLanguage(lang)}
                className={`px-2 py-1 text-[10px] font-bold uppercase rounded ${i18n.language === lang ? "bg-white/10 text-white" : "text-gray-600 hover:text-gray-400"}`}
              >
                {lang}
              </button>
            ))}
          </div>

          <Button variant="ghost" className="px-4 py-2 text-xs" onClick={() => { setPage("redeem"); setCodeStep(0); setRedeemData(null); }}>
            🎟 {t('redeem_voucher')}
          </Button>

          <div className="relative group">
            <Button variant="primary" className="px-4 py-2 text-xs flex items-center gap-2">
              <Package size={14} />
              <span>{giftBox.length}</span>
            </Button>

            <div className="absolute top-full left-0 mt-2 w-64 bg-[#0f0f1e] border border-white/10 rounded-2xl p-4 shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
               <h4 className="text-sm font-black mb-4">{t('gift_box')}</h4>
               {giftBox.length === 0 ? (
                 <p className="text-xs text-gray-600">{t('empty_box')}</p>
               ) : (
                 <div className="space-y-3">
                   {giftBox.map(item => (
                     <div key={item.id} className="flex justify-between items-center gap-2 text-xs">
                       <span className="truncate">{getLocalized(item, 'title')}</span>
                       <button onClick={() => removeFromGiftBox(item.id)} className="text-gray-600 hover:text-red-500">
                         <Trash2 size={12} />
                       </button>
                     </div>
                   ))}
                   <div className="pt-3 border-t border-white/5 flex flex-col gap-2">
                     <Button loading={checkoutLoading} onClick={handleCheckout} className="w-full py-2 text-[10px]">{t('checkout')}</Button>
                     <button onClick={clearGiftBox} className="text-[10px] text-gray-600 hover:text-white transition-colors">{t('empty_box')}</button>
                   </div>
                 </div>
               )}
            </div>
          </div>
        </div>
      </nav>

      {/* ── SUCCESS MODAL ── */}
      {orderCode && (
        <div className="fixed inset-0 z-[101] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-md" />
          <div className="bg-[#0f0f1e] border border-green-500/20 rounded-[2.5rem] w-full max-w-md p-10 relative z-10 text-center">
            <div className="text-6xl mb-6">✅</div>
            <h2 className="text-2xl font-black mb-4">{i18n.language === 'he' ? 'הזמנה הושלמה!' : 'Order Completed!'}</h2>
            <p className="text-gray-500 mb-8">{i18n.language === 'he' ? 'קוד השובר שלך:' : 'Your voucher code:'}</p>
            <div className="bg-white/5 p-4 rounded-xl text-3xl font-black tracking-widest mb-8">{orderCode}</div>
            <Button className="w-full" onClick={() => setOrderCode(null)}>סגור</Button>
          </div>
        </div>
      )}

      {/* ── HERO ── */}
      <section className="relative px-6 md:px-12 py-20 lg:py-40 overflow-hidden">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-16 items-center relative z-10">
          <div>
            <h1 className="text-5xl md:text-7xl font-black leading-[1.1] tracking-tight mb-6">
              {t('hero_title').split('. ').map((part, i) => (
                <span key={i} className={i === 2 ? "bg-gradient-to-r from-[#FF5733] to-[#F59E0B] bg-clip-text text-transparent block" : i === 1 ? "text-gray-600 block" : "block"}>
                  {part}{i < 2 ? "." : ""}
                </span>
              ))}
            </h1>
            <p className="text-lg text-gray-500 leading-relaxed mb-10 max-w-md">
              {t('hero_subtitle')}
            </p>
            <div className="flex flex-wrap gap-4">
              <Button variant="primary" className="text-base px-8 py-4">{t('select_bundle')}</Button>
              <Button variant="ghost" className="text-base px-8 py-4">{t('how_it_works')}</Button>
            </div>
          </div>
        </div>
      </section>

      {/* ── CATALOG ── */}
      <section className="px-6 md:px-12 py-24 border-t border-white/5 bg-[#090912]">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-black tracking-tight mb-16">{t('best_sellers')}</h2>

          {loading ? (
            <div className="flex justify-center py-20">
               <div className="w-8 h-8 border-4 border-[#FF5733] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {experiences.map(pkg => (
                <div
                  key={pkg.id}
                  className="bg-[#0f0f1e] border border-white/5 rounded-[2rem] overflow-hidden group shadow-2xl transition-all hover:border-white/10"
                >
                  <div className="h-48 flex items-center justify-center relative bg-gradient-to-br from-[#1a1a1a] to-[#0f0f1e]">
                    <span className="text-7xl group-hover:scale-110 transition-transform duration-500">{pkg.emoji}</span>
                  </div>
                  <div className="p-7">
                    <h3 className="text-lg font-black mb-4 truncate">{getLocalized(pkg, 'title')}</h3>
                    <div className="flex justify-between items-center mb-6">
                      <span className="text-2xl font-black text-[#FF5733]">₪{pkg.price}</span>
                      <div className="flex items-center gap-1 text-[10px] text-gray-600">
                        <Star size={10} className="text-amber-500" fill="currentColor" />
                        <span>{pkg.rating} ({pkg.reviews_count})</span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                       <Button onClick={() => setOpenCard(pkg)} variant="ghost" className="w-full text-xs py-2">{t('details')}</Button>
                       <Button
                         onClick={() => addToGiftBox(pkg)}
                         className="w-full text-xs py-2"
                         variant="accent"
                         style={{ backgroundColor: pkg.is_best_seller ? '#FF5733' : '#F59E0B' }}
                         disabled={giftBox.length >= 5 || giftBox.find(item => item.id === pkg.id)}
                       >
                         {giftBox.find(item => item.id === pkg.id) ? <Check size={14} /> : t('add_to_gift')}
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
          <div className="absolute inset-0 bg-black/80 backdrop-blur-xl" />
          <div className="bg-[#0f0f1e] border border-white/10 rounded-[2.5rem] w-full max-w-2xl p-10 relative z-10" onClick={e => e.stopPropagation()}>
            <button className="absolute top-8 left-8 text-gray-500 hover:text-white" onClick={() => setOpenCard(null)}><X size={24} /></button>
            <div className="text-6xl mb-6">{openCard.emoji}</div>
            <h2 className="text-3xl font-black mb-4">{getLocalized(openCard, 'title')}</h2>
            <p className="text-gray-500 mb-8 leading-relaxed">{getLocalized(openCard, 'description')}</p>
            <div className="flex justify-between items-center pt-8 border-t border-white/5">
              <span className="text-4xl font-black text-[#FF5733]">₪{openCard.price}</span>
              <Button onClick={() => { addToGiftBox(openCard); setOpenCard(null); }}>{t('buy_now')}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RedeemPage({ code, setCode, step, setStep, goHome, redeemData, handleActivate, handleRedeem, i18n, t, getLocalized }) {
  return (
    <div className="min-h-screen bg-[#080811] text-[#EDE9E0] flex flex-col items-center px-6 py-20">
      <div className="w-full max-w-lg">
        <button onClick={goHome} className="flex items-center gap-2 text-sm text-gray-500 hover:text-white mb-16 transition-colors font-bold">
          <ArrowRight size={16} className={i18n.language === 'he' ? "rotate-0" : "rotate-180"} /> {i18n.language === 'he' ? 'חזרה לאתר' : 'Back to site'}
        </button>

        {step === 0 && (
          <div className="text-center animate-in fade-in slide-in-from-bottom-8 duration-700">
            <div className="text-7xl mb-8">🎟</div>
            <h1 className="text-4xl font-black mb-4 tracking-tight">{t('redeem_step_0')}</h1>
            <input
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-5 text-3xl text-center tracking-[0.5em] font-black focus:border-white/30 outline-none transition-all mb-6 placeholder:tracking-normal placeholder:text-gray-700"
              placeholder="EPIC-XXXX"
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
            />
            <Button variant="primary" className="w-full py-5 text-lg" onClick={handleActivate}>
              {t('redeem_voucher')} →
            </Button>
          </div>
        )}

        {step === 1 && redeemData && (
          <div className="animate-in fade-in slide-in-from-bottom-8 duration-700">
            <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-6 mb-10 flex items-center gap-4">
              <span className="text-3xl">✅</span>
              <div className="text-right">
                <div className="font-black">{i18n.language === 'he' ? 'שובר תקין!' : 'Voucher valid!'}</div>
                <div className="text-sm text-green-400 font-bold">{t('redeem_step_1')}</div>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              {redeemData.options.map((x, i) => (
                <button
                  key={i}
                  onClick={() => handleRedeem(x.id)}
                  className="w-full bg-[#0f0f1e] border border-white/10 rounded-2xl p-6 text-right flex items-center justify-between group hover:border-white/30 transition-all"
                >
                  <div className="flex items-center gap-4">
                    <span className="text-2xl group-hover:scale-110 transition-transform">{x.emoji}</span>
                    <span className="font-bold text-gray-300 group-hover:text-white transition-colors">{getLocalized(x, 'title')}</span>
                  </div>
                  <span className="text-gray-600 group-hover:text-white transition-colors">←</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="text-center animate-in fade-in slide-in-from-bottom-8 duration-700">
            <div className="text-7xl mb-8">🗓</div>
            <h2 className="text-4xl font-black mb-4 tracking-tight">{t('redeem_step_2')}</h2>
            <p className="text-gray-500 mb-10 leading-relaxed">
               {i18n.language === 'he' ? 'סוכן ה-AI שלנו יתאם את המועד מולך ומול הספק.' : 'Our AI agent will coordinate the date with you and the supplier.'}
            </p>
            <Button variant="primary" className="w-full py-5 text-lg" onClick={goHome}>{t('confirm_date')} ←</Button>
          </div>
        )}
      </div>
    </div>
  );
}
