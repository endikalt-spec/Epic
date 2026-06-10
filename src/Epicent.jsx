import { useState, useEffect } from "react";

// ─── DATA ───────────────────────────────────────────────────────────────────

const NAV_CATS = ["לגבר", "לאישה", "לזוג", "אקסטרים", "ספא ורילקס"];

const PACKAGES = [
  {
    id: 1, emoji: "🪂",
    title: "מארז אדרנלין באוויר",
    tag: "🔥 הכי נמכר",
    price: 450, oldPrice: 520,
    count: 12, rating: 4.9, reviews: 214,
    accent: "#FF5733", bg: "bg-[#1a0a00]", gradient: "from-[#FF5733] to-[#FF8C00]",
    desc: "צניחה חופשית · כדור פורח · פראפלייינג · טיסת חוויה",
    experiences: ["צניחה חופשית מ-4000 מ'", "כדור פורח בגלבוע", "פראפלייינג בנתניה", "טיסת חוויה בנגב", "קרוס-פיט אקסטרים", "טיפוס צוקים מודרך"],
    category: "אקסטרים",
  },
  {
    id: 2, emoji: "🧖‍♀️",
    title: "מארז רילקס זוגי",
    tag: "💆 הפופולרי",
    price: 350, oldPrice: null,
    count: 20, rating: 4.8, reviews: 389,
    accent: "#2dd4bf", bg: "bg-[#001a18]", gradient: "from-[#2dd4bf] to-[#008080]",
    desc: "עיסויים · אמבטיות יין · ספא גורמה · חוויות זוגיות",
    experiences: ["עיסוי שוודי זוגי", "טיפול בוץ ים-מלח", "ארוחה רומנטית + ספא", "מלון בוטיק ל-2 לילות", "אמבטיית שמנים זוגית", "יוגה ורוגע בטבע"],
    category: "ספא",
  },
  {
    id: 3, emoji: "🎈",
    title: "מארז פרימיום VIP",
    tag: "👑 VIP",
    price: 850, oldPrice: 1100,
    count: 8, rating: 5.0, reviews: 97,
    accent: "#F59E0B", bg: "bg-[#1a1100]", gradient: "from-[#F59E0B] to-[#DAA520]",
    desc: "יאכטה · ביקור בודא · קרוז · חוויות בלעדיות",
    experiences: ["שייט יאכטה פרטי", "ארוחה שף פרטי בבית", "הקפה במסוק", "חופשת בוטיק 5 כוכבים", "ערב גינס עם סומלייה", "כרטיסי VIP לאירוע"],
    category: "VIP",
  },
  {
    id: 4, emoji: "🏄",
    title: "מארז מים ואתגר",
    tag: "🌊 חדש",
    price: 380, oldPrice: null,
    count: 15, rating: 4.7, reviews: 156,
    accent: "#60A5FA", bg: "bg-[#00091a]", gradient: "from-[#60A5FA] to-[#0000FF]",
    desc: "גלישה · ראפטינג · דייג · ספורט מים",
    experiences: ["ראפטינג בנהר הירדן", "גלישת גלים בים", "צלילה מודרכת", "קיטסרפינג", "דייג מסורתי בים", "קיאקינג בכינרת"],
    category: "אקסטרים",
  },
  {
    id: 5, emoji: "🍷",
    title: "מארז גסטרונומיה",
    tag: "🍽️ טרנד",
    price: 480, oldPrice: null,
    count: 10, rating: 4.9, reviews: 201,
    accent: "#C084FC", bg: "bg-[#0d001a]", gradient: "from-[#C084FC] to-[#800080]",
    desc: "שפים · יקבים · סיורי אוכל · חוויות קולינריות",
    experiences: ["ארוחת שף 8 מנות", "סיור יקבים + טעימות", "סדנת בישול איטלקי", "אפטרנון טי בבוטיק", "סיור אוכל בשוק הכרמל", "מסעדת כוכב מישלן"],
    category: "ספא",
  },
  {
    id: 6, emoji: "🏍️",
    title: "מארז מהירות ואגרוף",
    tag: "⚡ אדרנלין",
    price: 520, oldPrice: 600,
    count: 9, rating: 4.8, reviews: 143,
    accent: "#F97316", bg: "bg-[#1a0500]", gradient: "from-[#F97316] to-[#FF4500]",
    desc: "מסלול מירוצים · ATV · קרטינג · לייזר טאג",
    experiences: ["נסיעת מירוצים במסלול", "ATV 2 שעות בשטח", "קרטינג מקצועי", "לייזר טאג אקסטרים", "אימון קרב מגע", "ירי בטווח ירי"],
    category: "אקסטרים",
  },
];

const STEPS = [
  { n: "01", icon: "🎁", title: "בוחרים מארז", desc: "קטגוריה ותקציב שמתאימים בדיוק לאדם ולאירוע" },
  { n: "02", icon: "📦", title: "אנחנו שולחים", desc: "מארז VIP פיזי מהודר מגיע עד בית המקבל — אותו יום" },
  { n: "03", icon: "✨", title: "הם בוחרים וחווים", desc: "סוכני AI מתאמים את התאריך מול הספקים בלי המתנה" },
];

const TRUST = ["🔒 תשלום מאובטח", "📦 משלוח ביום ההזמנה", "↩️ ביטול חינם עד 48 שעות", "⭐ 4.9 מתוך 5 (1,200+ ביקורות)"];

// ─── COMPONENTS ─────────────────────────────────────────────────────────────

function Badge({ children, className = "" }) {
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wider ${className}`}>
      {children}
    </span>
  );
}

function Button({ children, variant = "primary", className = "", ...props }) {
  const variants = {
    primary: "bg-[#EDE9E0] text-[#080811] hover:bg-white active:scale-95",
    ghost: "bg-transparent text-gray-400 border border-white/10 hover:border-white/30 hover:text-gray-200 active:scale-95",
    accent: "text-[#080811] hover:brightness-110 active:scale-95",
  };
  return (
    <button
      className={`px-6 py-3 rounded-xl font-extrabold text-sm transition-all duration-200 cursor-pointer disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export default function Epicent() {
  const [activeCat, setActiveCat] = useState("הכל");
  const [openCard, setOpenCard] = useState(null);
  const [page, setPage] = useState("home"); // home | redeem
  const [code, setCode] = useState("");
  const [codeStep, setCodeStep] = useState(0);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", h);
    return () => window.removeEventListener("scroll", h);
  }, []);

  const cats = ["הכל", ...new Set(PACKAGES.map(p => p.category))];
  const filtered = activeCat === "הכל" ? PACKAGES : PACKAGES.filter(p => p.category === activeCat);

  if (page === "redeem") {
    return <RedeemPage code={code} setCode={setCode} step={codeStep} setStep={setCodeStep} goHome={() => setPage("home")} />;
  }

  return (
    <div className="min-h-screen bg-[#080811] text-[#EDE9E0] selection:bg-[#FF5733]/30">

      {/* ── NAV ── */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 px-6 md:px-12 py-4 flex items-center justify-between gap-4 ${scrolled ? "bg-[#080811]/90 backdrop-blur-2xl border-b border-white/5" : "bg-transparent"}`}>
        <span className="text-2xl font-black tracking-tighter cursor-pointer" onClick={() => setPage("home")}>
          Epicent
        </span>

        <div className="hidden lg:flex gap-1">
          {NAV_CATS.map(c => (
            <button key={c} className="px-4 py-2 text-xs font-medium text-gray-500 hover:text-gray-200 hover:bg-white/5 rounded-lg transition-colors">
              {c}
            </button>
          ))}
          <button className="px-4 py-2 text-xs font-medium text-[#F59E0B] hover:bg-white/5 rounded-lg transition-colors">
            לארגונים
          </button>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="ghost" className="px-4 py-2 text-xs" onClick={() => { setPage("redeem"); setCodeStep(0); }}>
            🎟 מימוש שובר
          </Button>
          <Button variant="primary" className="px-4 py-2 text-xs">
            בחר מארז
          </Button>
        </div>
      </nav>

      {/* ── TICKER ── */}
      <div className="pt-24 pb-3 bg-[#0d0d1a] border-b border-white/5 overflow-hidden">
        <div className="flex gap-16 animate-[ticker_30s_linear_infinite] whitespace-nowrap">
          {[...TRUST, ...TRUST, ...TRUST].map((t, i) => (
            <span key={i} className="flex items-center gap-2 text-xs font-medium text-gray-500">
              {t}
            </span>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes ticker {
          0% { transform: translateX(0); }
          100% { transform: translateX(50%); }
        }
      `}</style>

      {/* ── HERO ── */}
      <section className="relative px-6 md:px-12 py-20 lg:py-32 overflow-hidden">
        {/* Background Blobs */}
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-radial from-[#FF5733]/10 to-transparent opacity-50 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-radial from-[#2dd4bf]/10 to-transparent opacity-50 blur-3xl pointer-events-none" />

        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-16 items-center relative z-10">
          <div className="animate-in fade-in slide-in-from-bottom-8 duration-700">
            <div className="inline-flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-full px-4 py-1.5 mb-8">
              <span className="w-2 h-2 rounded-full bg-green-400 shadow-[0_0_8px_#4ade80] animate-pulse" />
              <span className="text-xs font-bold text-green-400">משלוח VIP — אותו יום בכל הארץ</span>
            </div>

            <h1 className="text-5xl md:text-7xl font-black leading-[1.1] tracking-tight mb-6">
              מתנה אחת.<br />
              <span className="text-gray-600">עשרות חוויות.</span><br />
              <span className="bg-gradient-to-r from-[#FF5733] to-[#F59E0B] bg-clip-text text-transparent">הם מחליטים.</span>
            </h1>

            <p className="text-lg text-gray-500 leading-relaxed mb-10 max-w-md">
              שולחים מארז פרימיום — המקבל בוחר מה שמרגש אותו.
              סוכני AI מתאמים את התאריך מול הספקים. ללא המתנה לנציג.
            </p>

            <div className="flex flex-wrap gap-4 mb-12">
              <Button variant="primary" className="text-base px-8 py-4">גלה את המארזים ↓</Button>
              <Button variant="ghost" className="text-base px-8 py-4">איך זה עובד?</Button>
            </div>

            <div className="flex gap-10">
              {[["1,200+", "ביקורות 5 כוכבים"], ["200+", "חוויות זמינות"], ["48h", "משלוח מקסימלי"]].map(([n, l]) => (
                <div key={l}>
                  <div className="text-2xl font-black tracking-tight">{n}</div>
                  <div className="text-xs text-gray-600 mt-1">{l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Hero Featured Card */}
          <div className="relative animate-in fade-in slide-in-from-bottom-12 duration-700 delay-200">
            <div className="bg-gradient-to-br from-[#1a0a00] to-[#0f0f1e] border border-white/10 rounded-[2rem] p-8 relative overflow-hidden group hover:border-white/20 transition-all">
              <div className="absolute top-0 right-0 w-full h-full bg-radial from-[#FF5733]/5 to-transparent pointer-events-none" />

              <div className="text-[10px] text-gray-500 uppercase tracking-widest font-black mb-6">מארז מומלץ</div>

              <div className="flex items-center gap-6 mb-8">
                <div className="text-6xl group-hover:scale-110 transition-transform duration-500">🪂</div>
                <div>
                  <div className="text-2xl font-black tracking-tight">מארז אדרנלין באוויר</div>
                  <div className="text-sm text-gray-500 mt-1">12 חוויות לבחירה</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mb-8">
                {["צניחה חופשית", "כדור פורח", "פראפלייינג", "טיסת חוויה"].map(x => (
                  <div key={x} className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-gray-400">
                    ✓ {x}
                  </div>
                ))}
              </div>

              <div className="flex justify-between items-end">
                <div>
                  <div className="text-4xl font-black text-[#FF5733]">₪450</div>
                  <div className="text-sm text-gray-600 line-through">₪520</div>
                </div>
                <Button variant="primary">רכישה מיידית</Button>
              </div>

              <div className="mt-6 flex items-center gap-2">
                <span className="text-amber-500 text-xs">★★★★★</span>
                <span className="text-xs text-gray-600">4.9 (214 ביקורות)</span>
              </div>
            </div>

            {/* Floating Badge */}
            <div className="absolute -top-4 -left-4 bg-[#F59E0B] text-[#080811] rounded-xl px-4 py-2 text-xs font-black shadow-xl shadow-amber-500/20 rotate-[-5deg]">
              🔥 הכי נמכר
            </div>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="px-6 md:px-12 py-24 border-t border-white/5">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <div className="text-[10px] text-gray-600 uppercase tracking-widest font-black mb-3">התהליך</div>
            <h2 className="text-4xl font-black tracking-tight">פשוט לשלוש.</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {STEPS.map((s, i) => (
              <div key={i} className="bg-[#0f0f1e] border border-white/5 rounded-3xl p-10 text-center hover:border-white/10 transition-colors group">
                <div className="text-5xl mb-6 group-hover:scale-110 transition-transform duration-500">{s.icon}</div>
                <div className="text-[10px] text-gray-700 tracking-widest font-black mb-3">{s.n}</div>
                <h3 className="text-xl font-black mb-4">{s.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CATALOG ── */}
      <section className="px-6 md:px-12 py-24 border-t border-white/5 bg-[#090912]">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-8 mb-16">
            <div>
              <div className="text-[10px] text-gray-600 uppercase tracking-widest font-black mb-3">הקטלוג</div>
              <h2 className="text-4xl font-black tracking-tight">המארזים המובילים</h2>
            </div>

            <div className="flex flex-wrap gap-2">
              {cats.map(c => (
                <button
                  key={c}
                  onClick={() => setActiveCat(c)}
                  className={`px-5 py-2 rounded-full text-xs font-bold transition-all ${activeCat === c ? "bg-[#EDE9E0] text-[#080811]" : "bg-white/5 text-gray-500 hover:bg-white/10 hover:text-gray-300 border border-white/5"}`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map(pkg => (
              <div
                key={pkg.id}
                className="bg-[#0f0f1e] border border-white/5 rounded-[2rem] overflow-hidden cursor-pointer hover:border-white/20 hover:-translate-y-2 transition-all duration-300 group shadow-2xl shadow-black/50"
                onClick={() => setOpenCard(pkg)}
              >
                {/* Image Area */}
                <div className={`h-48 flex items-center justify-center relative overflow-hidden bg-gradient-to-br ${pkg.gradient} opacity-90 group-hover:opacity-100 transition-opacity`}>
                  <div className="absolute inset-0 bg-black/20" />
                  <span className="text-7xl group-hover:scale-110 transition-transform duration-500 relative z-10">{pkg.emoji}</span>

                  <div className="absolute top-4 right-4 z-20">
                    <Badge className="bg-black/50 backdrop-blur-md text-white border border-white/10">
                      {pkg.tag}
                    </Badge>
                  </div>

                  {pkg.oldPrice && (
                    <div className="absolute top-4 left-4 z-20">
                      <Badge className="bg-red-500 text-white shadow-lg shadow-red-500/20">
                        -{Math.round((1 - pkg.price / pkg.oldPrice) * 100)}%
                      </Badge>
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="p-7">
                  <div className="flex justify-between items-start gap-4 mb-4">
                    <h3 className="text-lg font-black leading-snug">{pkg.title}</h3>
                    <div className="text-right">
                      <div className="text-2xl font-black" style={{ color: pkg.accent }}>₪{pkg.price}</div>
                      {pkg.oldPrice && <div className="text-[10px] text-gray-600 line-through">₪{pkg.oldPrice}</div>}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-amber-500 text-[10px]">★★★★★</span>
                    <span className="text-[10px] text-gray-600 font-bold">{pkg.rating} ({pkg.reviews})</span>
                  </div>

                  <p className="text-xs text-gray-500 leading-relaxed mb-6 h-10 overflow-hidden line-clamp-2">
                    {pkg.desc}
                  </p>

                  <div className="flex justify-between items-center border-t border-white/5 pt-6">
                    <div className="text-xs text-gray-500">
                      <span className="font-black" style={{ color: pkg.accent }}>{pkg.count}</span> חוויות לבחירה
                    </div>
                    <Button variant="accent" className="px-4 py-2 text-xs" style={{ backgroundColor: pkg.accent }}>
                      לפרטים →
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── B2B BANNER ── */}
      <section className="px-6 md:px-12 py-24">
        <div className="max-w-6xl mx-auto">
          <div className="relative bg-gradient-to-br from-[#0f0f1e] to-[#131325] border border-white/10 rounded-[2.5rem] p-10 lg:p-20 overflow-hidden flex flex-col lg:flex-row justify-between items-center gap-12">
            <div className="absolute top-0 left-0 w-full h-full bg-radial from-[#F59E0B]/5 to-transparent pointer-events-none" />

            <div className="relative z-10 text-center lg:text-right">
              <div className="text-[10px] text-[#F59E0B] uppercase tracking-widest font-black mb-6">B2B — לארגונים</div>
              <h3 className="text-4xl md:text-5xl font-black mb-6 tracking-tight">מחלקים מתנות לעובדים?</h3>
              <p className="text-lg text-gray-500 max-w-xl leading-relaxed mb-10">
                פורטל עסקי מלא, ניהול מרוכז, חשבוניות, הנחות נפח ותמיכה אישית.
                כבר עובדים עם 80+ חברות בישראל.
              </p>

              <div className="flex flex-wrap justify-center lg:justify-start gap-6 text-sm text-gray-600 font-bold">
                <span>🏢 ניהול ריכוזי</span>
                <span>📊 דשבורד HR</span>
                <span>💳 חשבוניות מס</span>
              </div>
            </div>

            <div className="flex flex-col gap-3 relative z-10 w-full lg:w-auto">
              <Button variant="primary" className="text-base px-10 py-5 w-full">פורטל לארגונים →</Button>
              <Button variant="ghost" className="text-sm px-10 py-4 w-full">קבל הצעת מחיר</Button>
            </div>
          </div>
        </div>
      </section>

      {/* ── SUPPLIER CTA ── */}
      <section className="px-6 md:px-12 pb-24">
        <div className="max-w-6xl mx-auto">
          <div className="bg-[#0d0d1a] border border-white/5 rounded-3xl p-8 flex flex-col md:flex-row justify-between items-center gap-6">
            <span className="text-sm font-bold text-gray-500">🤝 בעל עסק חוויות? הצטרף לרשת הספקים שלנו</span>
            <Button variant="ghost" className="px-8 py-3 text-xs">הצטרף כספק →</Button>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="px-6 md:px-12 py-12 border-t border-white/5 bg-[#080811]">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-10">
          <span className="text-3xl font-black tracking-tighter opacity-20">Epicent</span>

          <div className="flex flex-wrap justify-center gap-8 text-xs font-bold text-gray-700">
            {["שירות לקוחות", "תקנון", "מדיניות ביטולים", "נגישות"].map(l => (
              <button key={l} className="hover:text-gray-400 transition-colors">{l}</button>
            ))}
          </div>

          <div className="text-[10px] text-gray-800 font-bold">
            לוגיסטיקה: <span className="text-gray-600">Vector 1 VIP</span>
          </div>
        </div>
      </footer>

      {/* ── PRODUCT MODAL ── */}
      {openCard && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6" onClick={() => setOpenCard(null)}>
          <div className="absolute inset-0 bg-black/80 backdrop-blur-xl animate-in fade-in duration-300" />

          <div
            className="bg-[#0f0f1e] border border-white/10 rounded-[2.5rem] w-full max-w-2xl max-h-[90vh] overflow-y-auto p-10 relative z-10 animate-in zoom-in-95 duration-300 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => setOpenCard(null)}
              className="absolute top-8 left-8 text-gray-500 hover:text-white text-2xl transition-colors"
            >
              ✕
            </button>

            <div className="flex items-center gap-8 mb-12">
              <div className="text-7xl">
                {openCard.emoji}
              </div>
              <div>
                <h2 className="text-3xl font-black tracking-tight mb-2">{openCard.title}</h2>
                <div className="flex items-center gap-2">
                  <span className="text-amber-500 text-xs">★★★★★</span>
                  <span className="text-xs text-gray-500 font-bold">{openCard.rating} · {openCard.reviews} ביקורות</span>
                </div>
              </div>
            </div>

            <div className="mb-10">
              <div className="text-[10px] text-gray-600 uppercase tracking-widest font-black mb-6">החוויות הכלולות במארז</div>
              <div className="grid md:grid-cols-2 gap-3">
                {openCard.experiences.map((x, i) => (
                  <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-4 text-sm text-gray-400 flex items-center gap-3">
                    <span style={{ color: openCard.accent }}>✓</span> {x}
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white/5 rounded-3xl p-8 mb-10 border border-white/5">
              <div className="text-[10px] text-gray-600 uppercase tracking-widest font-black mb-6">אריזה ומשלוח</div>
              <div className="grid md:grid-cols-2 gap-4">
                {[["📱 דיגיטלי", "מיידי — ₪0 תוספת"], ["📦 פיזי VIP", "מארז מהודר — +₪49"]].map(([t, d]) => (
                  <button key={t} className="text-right border border-white/10 rounded-2xl p-5 hover:border-white/30 transition-all group">
                    <div className="text-lg font-black mb-1 group-hover:text-white">{t}</div>
                    <div className="text-xs text-gray-500">{d}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-between items-center">
              <div>
                <div className="text-5xl font-black" style={{ color: openCard.accent }}>₪{openCard.price}</div>
                {openCard.oldPrice && <div className="text-sm text-gray-600 line-through">₪{openCard.oldPrice}</div>}
              </div>
              <Button variant="primary" className="px-10 py-5 text-lg">רכישה עכשיו →</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── REDEEM PAGE ─────────────────────────────────────────────────────────────

function RedeemPage({ code, setCode, step, setStep, goHome }) {
  const mockPkg = PACKAGES[0];

  return (
    <div className="min-h-screen bg-[#080811] text-[#EDE9E0] flex flex-col items-center px-6 py-20">
      <div className="w-full max-w-lg">
        <button onClick={goHome} className="flex items-center gap-2 text-sm text-gray-500 hover:text-white mb-16 transition-colors font-bold">
          ← חזרה לאתר
        </button>

        {step === 0 && (
          <div className="text-center animate-in fade-in slide-in-from-bottom-8 duration-700">
            <div className="text-7xl mb-8">🎟</div>
            <h1 className="text-4xl font-black mb-4 tracking-tight">מימוש שובר</h1>
            <p className="text-gray-500 mb-12 leading-relaxed">הזן את קוד השובר שקיבלת ובחר את החוויה שמרגשת אותך</p>

            <input
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-5 text-3xl text-center tracking-[0.5em] font-black focus:border-white/30 outline-none transition-all mb-6 placeholder:tracking-normal placeholder:text-gray-700"
              placeholder="EPIC-XXXX"
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
            />

            <Button variant="primary" className="w-full py-5 text-lg" onClick={() => code.length > 3 && setStep(1)}>
              בדוק שובר →
            </Button>
          </div>
        )}

        {step === 1 && (
          <div className="animate-in fade-in slide-in-from-bottom-8 duration-700">
            <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-6 mb-10 flex items-center gap-4">
              <span className="text-3xl">✅</span>
              <div>
                <div className="font-black">שובר תקין!</div>
                <div className="text-sm text-green-400 font-bold">מארז: {mockPkg.title}</div>
              </div>
            </div>

            <h2 className="text-2xl font-black mb-6 tracking-tight">בחר את החוויה שלך</h2>
            <div className="flex flex-col gap-3">
              {mockPkg.experiences.map((x, i) => (
                <button
                  key={i}
                  onClick={() => setStep(2)}
                  className="w-full bg-[#0f0f1e] border border-white/10 rounded-2xl p-6 text-right flex items-center justify-between group hover:border-white/30 transition-all"
                >
                  <div className="flex items-center gap-4">
                    <span className="text-2xl group-hover:scale-110 transition-transform">{mockPkg.emoji}</span>
                    <span className="font-bold text-gray-300 group-hover:text-white transition-colors">{x}</span>
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
            <h2 className="text-4xl font-black mb-4 tracking-tight">קובעים תאריך</h2>
            <p className="text-gray-500 mb-10 leading-relaxed">
              סוכן ה-AI שלנו מתאם את המועד מולך ומול הספק.<br />בדרך כלל 2-4 שעות עד לאישור סופי.
            </p>

            <div className="bg-[#0f0f1e] border border-white/10 rounded-3xl p-6 mb-10 text-right">
              {["ראשון", "שני", "שלישי", "רביעי", "חמישי"].map((d, i) => (
                <button
                  key={d}
                  className={`w-full flex justify-between items-center py-4 ${i < 4 ? "border-b border-white/5" : ""} hover:opacity-70 transition-opacity`}
                >
                  <span className="text-sm text-gray-400 font-bold">{d}, {25 + i} ביוני</span>
                  <span className="text-[10px] font-black text-green-400 bg-green-400/10 px-3 py-1 rounded-full uppercase tracking-widest">פנוי</span>
                </button>
              ))}
            </div>

            <Button variant="primary" className="w-full py-5 text-lg">אשר תאריך ←</Button>
          </div>
        )}
      </div>
    </div>
  );
}
