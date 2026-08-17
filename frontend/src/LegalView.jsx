import { ArrowLeft, ArrowRight, AlertTriangle } from "lucide-react";
import { LEGAL } from "./legal";
import { fillLegal, legalDetailsIncomplete } from "./company";
import { LOGO_WORDMARK } from "./logo";

// Renders the Terms / Privacy documents with a tab switcher. Content and
// language come from legal.js; company-specific {tokens} are filled from
// company.js at render time.
export default function LegalView({ doc, setDoc, goHome, lang, t, rtl }) {
  const L = LEGAL[lang] || LEGAL.he;
  const d = L[doc] || L.terms;
  const fill = (s) => fillLegal(s, lang);
  const draft = legalDetailsIncomplete();
  const tabs = [
    ["terms", t("footer_terms")],
    ["privacy", t("footer_privacy")],
  ];

  return (
    <div className="min-h-screen bg-cream-50">
      <div className="mesh-warm">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 pt-10 pb-8">
          <button onClick={goHome} className="inline-flex items-center gap-2 text-sm font-bold text-ink-500 hover:text-coral-600 mb-8">
            {rtl ? <ArrowRight size={18} /> : <ArrowLeft size={18} />} {t("back_home")}
          </button>
          <div className="mb-6">
            <img src={LOGO_WORDMARK} alt="VAU" className="h-9 w-auto" />
          </div>
          {/* Long single words ("Пользовательское", "конфиденциальности") overflow a
              narrow column at text-4xl, so step the size down and allow breaking. */}
          <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-ink-900 break-words">{d.title}</h1>
          <p className="text-ink-500 mt-2">{fill(d.updated)}</p>

          <div className="flex gap-2 mt-6">
            {tabs.map(([key, label]) => (
              <button
                key={key}
                onClick={() => setDoc(key)}
                className={`rounded-full px-5 py-2.5 text-sm font-bold transition-all ${doc === key ? "bg-coral-500 text-white glow-coral" : "bg-white text-ink-600 shadow-soft hover:text-coral-600"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-10">
        {/* Draft disclaimer — shown only while the company's registration
            details are still unfilled (see company.js). */}
        {draft && (
          <div className="flex items-start gap-3 rounded-2xl bg-sun-400/20 border border-sun-400/40 px-4 py-3 mb-8 text-sm text-ink-700">
            <AlertTriangle size={18} className="text-sun-500 shrink-0 mt-0.5" />
            <span>{L.disclaimer}</span>
          </div>
        )}

        <article className="space-y-7">
          {d.sections.map((s, i) => (
            <section key={i}>
              <h2 className="font-display text-xl font-bold text-ink-900 mb-2">{s.h}</h2>
              <div className="space-y-2">
                {s.p.map((para, j) => (
                  <p key={j} className="text-ink-600 leading-relaxed break-words">{fill(para)}</p>
                ))}
              </div>
            </section>
          ))}
        </article>
      </div>
    </div>
  );
}
