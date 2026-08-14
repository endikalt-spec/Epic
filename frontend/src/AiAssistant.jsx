import { useState, useRef, useEffect } from "react";
import { Sparkles, X, Send, Loader2, Plus, Check } from "lucide-react";
import { askAssistant } from "./api";

// Floating gift concierge. The buyer describes the recipient; the assistant
// recommends experiences from the catalog and can add them to the gift box.
export default function AiAssistant({ experiences, lang, loc, onAdd, inBox, t, rtl }) {
  const [open, setOpen] = useState(false);
  // The greeting is derived from t() at render time (see below) so it re-translates
  // on a language switch; only the actual conversation is stored here.
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [recs, setRecs] = useState([]);
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, recs, loading]);

  const send = async (e) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text || loading) return;
    const next = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const out = await askAssistant({
        messages: next.filter((m) => m.role === "user" || m.role === "assistant").slice(-8),
        catalog: experiences,
        lang,
      });
      setMessages((m) => [...m, { role: "assistant", content: out.reply || t("assistant_fallback") }]);
      setRecs((out.experienceIds || []).map((id) => experiences.find((e) => e.id === id)).filter(Boolean));
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: t("assistant_error") }]);
    } finally {
      setLoading(false);
    }
  };

  const suggestions = [t("assistant_chip_1"), t("assistant_chip_2"), t("assistant_chip_3")];

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 1.5rem)" }}
          className="fixed start-6 z-40 inline-flex items-center gap-2 rounded-full bg-ink-900 text-white ps-4 pe-5 py-3.5 font-bold shadow-pop hover:-translate-y-0.5 transition-transform"
        >
          <span className="grid place-items-center h-7 w-7 rounded-full bg-gradient-to-br from-coral-400 to-coral-600"><Sparkles size={16} /></span>
          {t("assistant_button")}
        </button>
      )}

      {open && (
        <div className="fixed start-4 end-4 sm:end-auto z-50 w-auto sm:w-[380px] max-w-[calc(100vw-2rem)] bg-cream-50 rounded-3xl shadow-pop flex flex-col overflow-hidden animate-rise" style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)", height: "min(70vh, 560px)" }}>
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 bg-ink-900 text-white">
            <div className="flex items-center gap-2">
              <span className="grid place-items-center h-8 w-8 rounded-full bg-gradient-to-br from-coral-400 to-coral-600"><Sparkles size={16} /></span>
              <div>
                <div className="font-display font-bold leading-tight">{t("assistant_title")}</div>
                <div className="text-[11px] text-cream-300">{t("assistant_subtitle")}</div>
              </div>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close" className="grid place-items-center h-10 w-10 rounded-full bg-white/10 hover:bg-white/20"><X size={18} /></button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {/* Live-translated greeting bubble (not stored in state). */}
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed bg-white text-ink-800 shadow-soft">{t("assistant_welcome")}</div>
            </div>
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${m.role === "user" ? "bg-coral-500 text-white" : "bg-white text-ink-800 shadow-soft"}`}>
                  {m.content}
                </div>
              </div>
            ))}

            {recs.length > 0 && !loading && (
              <div className="space-y-2">
                {recs.map((e) => (
                  <div key={e.id} className="flex items-center gap-3 bg-white rounded-2xl p-2.5 shadow-soft">
                    <div className="h-12 w-12 rounded-xl overflow-hidden shrink-0 bg-gradient-to-br from-coral-400 to-coral-600 grid place-items-center text-xl">
                      {e.img ? <img src={e.img} alt="" className="h-full w-full object-cover" onError={(ev) => { ev.currentTarget.style.display = "none"; }} /> : e.emoji}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-ink-900 text-sm truncate">{loc(e, "title")}</div>
                      <div className="font-display font-extrabold text-coral-600 text-sm">₪{Number(e.price).toLocaleString(lang === "ru" ? "ru-RU" : "he-IL")}</div>
                    </div>
                    <button
                      onClick={() => onAdd(e)}
                      disabled={inBox(e.id)}
                      className={`shrink-0 inline-flex items-center gap-1 rounded-full px-3 py-2 text-xs font-bold ${inBox(e.id) ? "bg-teal-500 text-white" : "bg-coral-50 text-coral-700 hover:bg-coral-500 hover:text-white"}`}
                    >
                      {inBox(e.id) ? <Check size={14} /> : <Plus size={14} />}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-white text-ink-500 shadow-soft rounded-2xl px-4 py-2.5 text-sm inline-flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" /> {t("assistant_thinking")}
                </div>
              </div>
            )}

            {messages.length === 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {suggestions.map((s) => (
                  <button key={s} onClick={() => setInput(s)} className="rounded-full bg-white shadow-soft px-3 py-1.5 text-xs font-semibold text-ink-600 hover:text-coral-600">{s}</button>
                ))}
              </div>
            )}
          </div>

          {/* Input */}
          <form onSubmit={send} className="p-3 border-t border-cream-200 bg-white flex items-center gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t("assistant_placeholder")}
              className="flex-1 rounded-full bg-cream-100 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-coral-300 min-w-0"
            />
            <button type="submit" disabled={loading || !input.trim()} className="grid place-items-center h-10 w-10 rounded-full bg-coral-500 text-white disabled:opacity-50 shrink-0">
              <Send size={16} className={rtl ? "-scale-x-100" : ""} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
