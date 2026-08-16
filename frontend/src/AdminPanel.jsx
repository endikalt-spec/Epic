import { useState, useEffect } from "react";
import { ShieldCheck, Lock, LogOut, Loader2, Building2, Plus, Check, Image as ImageIcon, KeyRound, ArrowLeft } from "lucide-react";
import { DEMO, adminLogin, adminMe, admin2faSetup, admin2faEnable, adminRecoverStart, adminRecoverVerify, adminGetBusinesses, adminCreateBusiness, adminUpdateBusiness, adminGetStats } from "./api";

// Bilingual micro-dictionary (internal tool — kept local to avoid bloating i18n).
const TXT = {
  title: { he: "ניהול VAU", ru: "Админ-панель VAU" },
  subtitle: { he: "כניסה מאובטחת", ru: "Защищённый вход" },
  email: { he: "אימייל", ru: "Email" },
  password: { he: "סיסמה", ru: "Пароль" },
  signin: { he: "התחברות", ru: "Войти" },
  code2fa: { he: "קוד אימות דו-שלבי", ru: "Код двухфакторной аутентификации" },
  verify: { he: "אימות", ru: "Подтвердить" },
  forgot: { he: "שכחת סיסמה?", ru: "Забыли пароль?" },
  recover: { he: "שחזור חשבון", ru: "Восстановление доступа" },
  sendCode: { he: "שליחת קוד", ru: "Отправить код" },
  code: { he: "קוד", ru: "Код" },
  newPass: { he: "סיסמה חדשה", ru: "Новый пароль" },
  reset: { he: "איפוס סיסמה", ru: "Сбросить пароль" },
  back: { he: "חזרה", ru: "Назад" },
  logout: { he: "יציאה", ru: "Выйти" },
  businesses: { he: "עסקים", ru: "Бизнесы" },
  security: { he: "אבטחה", ru: "Безопасность" },
  overview: { he: "סקירה", ru: "Обзор" },
  addBiz: { he: "הוספת עסק", ru: "Добавить бизнес" },
  save: { he: "שמירה", ru: "Сохранить" },
  photo: { he: "תמונה", ru: "Фото" },
  video: { he: "קישור וידאו", ru: "Ссылка на видео" },
  descRu: { he: "תיאור (רוסית)", ru: "Описание (рус.)" },
  descHe: { he: "תיאור (עברית)", ru: "Описание (иврит)" },
  nameRu: { he: "שם (רוסית)", ru: "Название (рус.)" },
  nameHe: { he: "שם (עברית)", ru: "Название (иврит)" },
  enable2fa: { he: "הפעלת אימות דו-שלבי", ru: "Включить 2FA" },
  twoFaOn: { he: "אימות דו-שלבי פעיל ✓", ru: "2FA включена ✓" },
  scan: { he: "סרקו עם Google Authenticator והזינו את הקוד", ru: "Отсканируйте в Google Authenticator и введите код" },
  saved: { he: "נשמר ✓", ru: "Сохранено ✓" },
  customers: { he: "לקוחות", ru: "Клиенты" },
  orders: { he: "הזמנות", ru: "Заказы" },
  revenue: { he: "הכנסה", ru: "Выручка" },
  optins: { he: "הסכמות דיוור", ru: "Согласий на рассылку" },
};

export default function AdminPanel({ lang = "he", goHome }) {
  const T = (k) => TXT[k]?.[lang] ?? TXT[k]?.he ?? k;
  const rtl = lang === "he";
  const [step, setStep] = useState("login");     // login | twofa | recover | recoverVerify | dashboard
  const [email, setEmail] = useState(DEMO ? "admin@vaugift.com" : "");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [admin, setAdmin] = useState(null);
  const [recCode, setRecCode] = useState("");
  const [recNewPass, setRecNewPass] = useState("");
  const [recDemo, setRecDemo] = useState("");

  useEffect(() => {
    if (localStorage.getItem("vau_admin_token")) adminMe().then((d) => { setAdmin(d.admin); setStep("dashboard"); }).catch(() => {});
  }, []);

  const doLogin = async (withTotp) => {
    setBusy(true); setError("");
    try {
      const res = await adminLogin({ email, password, totp: withTotp ? totp : undefined });
      if (res.needs2fa) { setStep("twofa"); return; }
      localStorage.setItem("vau_admin_token", res.token);
      setAdmin(res.admin); setStep("dashboard");
    } catch (e) {
      const d = e?.response?.data; const s = e?.response?.status;
      if (s === 423) setError(d?.message || (lang === "ru" ? "Аккаунт заблокирован. Попробуйте позже или восстановите доступ." : "החשבון נעול. נסו מאוחר יותר או שחזרו גישה."));
      else if (d?.error === "invalid_2fa") setError(lang === "ru" ? "Неверный код 2FA." : "קוד דו-שלבי שגוי.");
      else setError((lang === "ru" ? "Неверный логин или пароль." : "אימייל או סיסמה שגויים.") + (d?.attemptsLeft != null ? ` (${d.attemptsLeft})` : ""));
    } finally { setBusy(false); }
  };

  const startRecover = async () => {
    setBusy(true); setError("");
    try { const r = await adminRecoverStart(email); setRecDemo(r.demoCode || ""); setStep("recoverVerify"); }
    catch { setError(lang === "ru" ? "Не удалось отправить код." : "שליחת הקוד נכשלה."); }
    finally { setBusy(false); }
  };
  const doRecover = async () => {
    setBusy(true); setError("");
    try { await adminRecoverVerify({ email, code: recCode, newPassword: recNewPass }); setStep("login"); setPassword(recNewPass); setError(""); }
    catch (e) { setError(e?.response?.data?.error === "weak_password" ? (lang === "ru" ? "Пароль слишком короткий (мин. 8)." : "סיסמה קצרה מדי (מינ' 8).") : (lang === "ru" ? "Неверный код." : "קוד שגוי.")); }
    finally { setBusy(false); }
  };

  const logout = () => { localStorage.removeItem("vau_admin_token"); setAdmin(null); setStep("login"); setPassword(""); setTotp(""); };

  // ── Auth screens ──
  if (step !== "dashboard") {
    return (
      <Shell rtl={rtl} goHome={goHome}>
        <div className="flex items-center gap-2 mb-1"><ShieldCheck className="text-coral-500" size={22} /><h1 className="font-display text-2xl font-extrabold">{T("title")}</h1></div>
        <p className="text-ink-500 text-sm mb-6">{T("subtitle")}</p>

        {DEMO && step === "login" && (
          <div className="rounded-xl bg-teal-50 text-teal-800 text-xs px-4 py-3 mb-4">
            {lang === "ru" ? "Демо-доступ: " : "גישת דמו: "}<b>admin@vaugift.com</b> / <b>vau-admin</b>
          </div>
        )}
        {error && <div className="rounded-xl bg-coral-50 text-coral-700 text-sm font-semibold px-4 py-3 mb-4">{error}</div>}

        {step === "login" && (
          <div className="space-y-3">
            <Field label={T("email")}><input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="username" className={inp} /></Field>
            <Field label={T("password")}><input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" className={inp} onKeyDown={(e) => e.key === "Enter" && doLogin(false)} /></Field>
            <Btn onClick={() => doLogin(false)} busy={busy}><Lock size={16} /> {T("signin")}</Btn>
            <button onClick={() => { setError(""); setStep("recover"); }} className="text-sm text-ink-500 hover:text-coral-600 w-full text-center pt-1">{T("forgot")}</button>
          </div>
        )}

        {step === "twofa" && (
          <div className="space-y-3">
            {DEMO && <div className="rounded-xl bg-sun-400/20 text-ink-700 text-xs px-4 py-3">{lang === "ru" ? "Демо-код 2FA: " : "קוד דמו: "}<b>123456</b></div>}
            <Field label={T("code2fa")}><input value={totp} onChange={(e) => setTotp(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="000000" className={`${inp} tracking-[0.4em] text-center text-lg`} onKeyDown={(e) => e.key === "Enter" && doLogin(true)} /></Field>
            <Btn onClick={() => doLogin(true)} busy={busy}><KeyRound size={16} /> {T("verify")}</Btn>
          </div>
        )}

        {step === "recover" && (
          <div className="space-y-3">
            <p className="text-sm text-ink-500">{lang === "ru" ? "Код будет отправлен на привязанный телефон." : "קוד יישלח לטלפון המקושר."}</p>
            <Field label={T("email")}><input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className={inp} /></Field>
            <Btn onClick={startRecover} busy={busy}>{T("sendCode")}</Btn>
            <button onClick={() => setStep("login")} className="text-sm text-ink-500 hover:text-coral-600 w-full text-center pt-1">{T("back")}</button>
          </div>
        )}

        {step === "recoverVerify" && (
          <div className="space-y-3">
            {recDemo && <div className="rounded-xl bg-sun-400/20 text-ink-700 text-xs px-4 py-3">{lang === "ru" ? "Демо-код: " : "קוד דמו: "}<b>{recDemo}</b></div>}
            <Field label={T("code")}><input value={recCode} onChange={(e) => setRecCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" className={inp} /></Field>
            <Field label={T("newPass")}><input value={recNewPass} onChange={(e) => setRecNewPass(e.target.value)} type="password" className={inp} /></Field>
            <Btn onClick={doRecover} busy={busy}>{T("reset")}</Btn>
            <button onClick={() => setStep("login")} className="text-sm text-ink-500 hover:text-coral-600 w-full text-center pt-1">{T("back")}</button>
          </div>
        )}
      </Shell>
    );
  }

  // ── Dashboard ──
  return <Dashboard lang={lang} T={T} rtl={rtl} admin={admin} logout={logout} goHome={goHome} />;
}

function Dashboard({ lang, T, rtl, admin, logout, goHome }) {
  const [tab, setTab] = useState("businesses");
  return (
    <div className="min-h-screen bg-cream-50">
      <header className="bg-ink-900 text-white">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2"><ShieldCheck size={20} className="text-coral-400" /><span className="font-display font-extrabold">{T("title")}</span></div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-cream-300 hidden sm:inline">{admin?.email}</span>
            <button onClick={goHome} className="text-cream-300 hover:text-white">{rtl ? "לאתר" : "На сайт"}</button>
            <button onClick={logout} className="inline-flex items-center gap-1 rounded-full bg-white/10 hover:bg-coral-500 px-3 py-1.5 font-bold"><LogOut size={14} /> {T("logout")}</button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6">
        <div className="flex gap-2 mb-6">
          {[["businesses", Building2, T("businesses")], ["security", ShieldCheck, T("security")], ["overview", null, T("overview")]].map(([k, Icon, label]) => (
            <button key={k} onClick={() => setTab(k)} className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${tab === k ? "bg-coral-500 text-white" : "bg-white text-ink-600 shadow-soft"}`}>{Icon && <Icon size={15} />} {label}</button>
          ))}
        </div>
        {tab === "businesses" && <Businesses lang={lang} T={T} />}
        {tab === "security" && <Security lang={lang} T={T} admin={admin} />}
        {tab === "overview" && <Overview T={T} />}
      </div>
    </div>
  );
}

function Businesses({ lang, T }) {
  const [list, setList] = useState(null);
  const [editing, setEditing] = useState(null);   // business object or {} for new
  const [saved, setSaved] = useState(false);
  const load = () => adminGetBusinesses().then(setList).catch(() => setList([]));
  useEffect(() => { load(); }, []);

  const onFile = (e, setForm, form) => {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader(); r.onload = () => setForm({ ...form, img: r.result }); r.readAsDataURL(f);
  };
  const save = async (form) => {
    if (form.id) await adminUpdateBusiness(form.id, form);
    else await adminCreateBusiness({ slug: form.slug || `biz-${Date.now()}`, ...form });
    setSaved(true); setTimeout(() => setSaved(false), 2000); setEditing(null); load();
  };

  if (list === null) return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-coral-400" /></div>;

  if (editing) return <BizForm T={T} initial={editing} onFile={onFile} onSave={save} onCancel={() => setEditing(null)} />;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-xl font-extrabold">{T("businesses")} · {list.length}</h2>
        <button onClick={() => setEditing({})} className="inline-flex items-center gap-2 rounded-full bg-ink-900 text-white px-4 py-2 text-sm font-bold"><Plus size={15} /> {T("addBiz")}</button>
      </div>
      {saved && <div className="rounded-xl bg-teal-50 text-teal-700 text-sm font-bold px-4 py-2 mb-3 inline-flex items-center gap-1"><Check size={15} /> {T("saved")}</div>}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {list.map((b) => (
          <button key={b.id} onClick={() => setEditing(b)} className="text-start bg-white rounded-2xl shadow-soft hover:shadow-lift overflow-hidden transition-all">
            <div className="h-28 bg-gradient-to-br from-teal-400 to-teal-600 grid place-items-center text-4xl relative">
              {b.img ? <img src={b.img} alt="" className="h-full w-full object-cover" /> : (b.emoji || "🏢")}
              {b.video_url && <span className="absolute top-2 end-2 text-[10px] bg-ink-900/70 text-white rounded-full px-2 py-0.5">▶ video</span>}
            </div>
            <div className="p-3">
              <div className="font-bold text-ink-900 truncate">{b[`name_${lang}`] || b.name_ru || b.name_he}</div>
              <div className="text-xs text-ink-400 line-clamp-2">{b[`description_${lang}`] || b.description_ru || b.description_he || "—"}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function BizForm({ T, initial, onFile, onSave, onCancel }) {
  const [form, setForm] = useState(initial);
  const f = (k) => ({ value: form[k] || "", onChange: (e) => setForm({ ...form, [k]: e.target.value }) });
  return (
    <div className="max-w-2xl">
      <button onClick={onCancel} className="inline-flex items-center gap-1 text-sm font-bold text-ink-500 hover:text-coral-600 mb-4"><ArrowLeft size={16} /> {T("back")}</button>
      <div className="bg-white rounded-2xl shadow-soft p-6 space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label={T("nameRu")}><input {...f("name_ru")} className={inp} /></Field>
          <Field label={T("nameHe")}><input {...f("name_he")} className={inp} dir="rtl" /></Field>
        </div>
        <Field label={T("descRu")}><textarea {...f("description_ru")} rows={2} className={inp} /></Field>
        <Field label={T("descHe")}><textarea {...f("description_he")} rows={2} className={inp} dir="rtl" /></Field>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label={T("photo")}>
            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-2 rounded-xl bg-cream-100 px-4 py-2.5 text-sm font-bold cursor-pointer hover:bg-cream-200">
                <ImageIcon size={16} /> {form.img ? "✓" : "…"}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e, setForm, form)} />
              </label>
              {form.img && <img src={form.img} alt="" className="h-10 w-10 rounded-lg object-cover" />}
            </div>
          </Field>
          <Field label={T("video")}><input {...f("video_url")} placeholder="https://youtu.be/…" className={inp} /></Field>
        </div>
        <button onClick={() => onSave(form)} className="inline-flex items-center gap-2 rounded-full bg-coral-500 text-white px-6 py-3 font-bold"><Check size={16} /> {T("save")}</button>
      </div>
    </div>
  );
}

function Security({ lang, T, admin }) {
  const [enabled, setEnabled] = useState(admin?.twoFactorEnabled);
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const start = async () => {
    setErr(""); setBusy(true);
    try { setSetup(await admin2faSetup()); }
    catch { setErr(lang === "ru" ? "Не удалось начать настройку. Попробуйте ещё раз." : "לא ניתן היה להתחיל בהגדרה. נסו שוב."); }
    finally { setBusy(false); }
  };
  const enable = async () => {
    setErr(""); setBusy(true);
    try { await admin2faEnable(code); setEnabled(true); setSetup(null); }
    catch { setErr(lang === "ru" ? "Неверный код." : "קוד שגוי."); }
    finally { setBusy(false); }
  };
  return (
    <div className="max-w-xl bg-white rounded-2xl shadow-soft p-6">
      <h2 className="font-display text-xl font-extrabold mb-1 flex items-center gap-2"><ShieldCheck size={20} className="text-coral-500" /> {T("security")}</h2>
      <p className="text-sm text-ink-500 mb-5">{lang === "ru" ? "Двухфакторная аутентификация (TOTP) — второй рубеж защиты аккаунта." : "אימות דו-שלבי (TOTP) — שכבת הגנה נוספת."}</p>
      {enabled ? (
        <div className="rounded-xl bg-teal-50 text-teal-700 font-bold px-4 py-3 inline-flex items-center gap-2"><Check size={16} /> {T("twoFaOn")}</div>
      ) : !setup ? (
        <>
          {err && <div className="text-coral-600 text-sm font-semibold mb-3">{err}</div>}
          <button onClick={start} disabled={busy} className="inline-flex items-center gap-2 rounded-full bg-ink-900 text-white px-5 py-2.5 font-bold disabled:opacity-60">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />} {T("enable2fa")}
          </button>
        </>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-ink-600">{T("scan")}</p>
          {setup.qr ? <img src={setup.qr} alt="2FA QR" className="w-40 h-40 rounded-xl border" /> : <div className="rounded-xl bg-cream-100 px-4 py-3 text-sm">Secret: <b className="font-mono">{setup.secret}</b>{setup.demoCode && <> · {lang === "ru" ? "демо-код" : "קוד דמו"}: <b>{setup.demoCode}</b></>}</div>}
          {err && <div className="text-coral-600 text-sm font-semibold">{err}</div>}
          <div className="flex gap-2">
            <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" inputMode="numeric" className={`${inp} tracking-[0.3em] text-center max-w-[140px]`} />
            <button onClick={enable} disabled={busy} className="rounded-full bg-coral-500 text-white px-5 py-2.5 font-bold disabled:opacity-60">{busy ? <Loader2 size={16} className="animate-spin" /> : T("verify")}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Overview({ T }) {
  const [s, setS] = useState(null);
  useEffect(() => { adminGetStats().then(setS).catch(() => setS({})); }, []);
  if (!s) return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-coral-400" /></div>;
  const cards = [[T("customers"), s.customers], [T("optins"), s.marketingOptIns], [T("orders"), s.orders], [T("revenue"), s.revenue != null ? `₪${Number(s.revenue).toLocaleString("he-IL")}` : "—"]];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map(([label, val]) => (
        <div key={label} className="bg-white rounded-2xl shadow-soft p-5">
          <div className="text-sm text-ink-500 mb-1">{label}</div>
          <div className="font-display text-3xl font-extrabold text-ink-900">{val}</div>
        </div>
      ))}
    </div>
  );
}

// ── Small shared bits ──
const inp = "w-full rounded-xl bg-cream-100 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-coral-300";
function Field({ label, children }) {
  return <label className="block"><span className="text-xs font-bold text-ink-500 mb-1 block">{label}</span>{children}</label>;
}
function Btn({ onClick, busy, children }) {
  return <button onClick={onClick} disabled={busy} className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-coral-500 text-white px-5 py-3 font-bold disabled:opacity-60">{busy ? <Loader2 size={16} className="animate-spin" /> : children}</button>;
}
function Shell({ children, rtl, goHome }) {
  return (
    <div dir={rtl ? "rtl" : "ltr"} className="min-h-screen bg-cream-50 grid place-items-center px-4">
      <div className="w-full max-w-sm">
        <button onClick={goHome} className="text-sm text-ink-400 hover:text-coral-600 mb-4 inline-flex items-center gap-1">← {rtl ? "לאתר" : "На сайт"}</button>
        <div className="bg-white rounded-3xl shadow-pop p-8">{children}</div>
      </div>
    </div>
  );
}
