// AI Gift Assistant. The client describes the person they want to gift; the
// assistant recommends experiences from VAU's own catalog instead of the buyer
// browsing manually.
//
// Uses the Anthropic API (Claude) when ANTHROPIC_API_KEY is set; otherwise a
// deterministic keyword recommender keeps the feature working with no key.
const config = require('./config');

const loc = (obj, field, lang) => obj?.[`${field}_${lang}`] ?? obj?.[`${field}_he`] ?? obj?.[field] ?? '';

// ── Deterministic fallback recommender ──
const INTEREST_MAP = {
  he: {
    extreme: ['אקסטרים', 'אדרנלין', 'ריגוש', 'גובה', 'מהירות', 'הרפתקה'],
    flights: ['טיסה', 'שמיים', 'נוף', 'בלון', 'מצנח'],
    spa: ['ספא', 'רוגע', 'פינוק', 'עיסוי', 'שקט'],
    gastro: ['אוכל', 'יין', 'שף', 'קולינרי', 'טעים'],
    romance: ['רומנטי', 'זוגי', 'אהבה', 'שקיעה', 'יאכטה'],
    workshops: ['סדנה', 'יצירה', 'ללמוד', 'אמנות', 'בישול'],
  },
  ru: {
    extreme: ['экстрим', 'адреналин', 'острые', 'высота', 'скорость', 'приключен'],
    flights: ['полёт', 'полет', 'небо', 'вид', 'шар', 'параплан'],
    spa: ['спа', 'релакс', 'отдых', 'массаж', 'спокой'],
    gastro: ['еда', 'вино', 'шеф', 'кулинар', 'вкус', 'гастро'],
    romance: ['романт', 'двоих', 'любов', 'закат', 'яхт'],
    workshops: ['мастер', 'класс', 'творч', 'научит', 'готов'],
  },
};

function scoreExperience(exp, text, lang) {
  const t = text.toLowerCase();
  let score = 0;
  const map = INTEREST_MAP[lang] || INTEREST_MAP.he;
  for (const [slug, words] of Object.entries(map)) {
    const hit = words.some((w) => t.includes(w));
    if (hit && (exp.category === slug || exp.category_slug === slug)) score += 5;
    if (hit) score += 1;
  }
  // Light nudge from title/description keyword overlap.
  const hay = (loc(exp, 'title', lang) + ' ' + loc(exp, 'description', lang)).toLowerCase();
  for (const w of t.split(/\s+/).filter((x) => x.length > 3)) if (hay.includes(w)) score += 1;
  if (exp.is_best_seller) score += 0.5;
  return score;
}

function ruleBasedRecommend({ text, recipient, catalog, lang }) {
  const profile = [text, recipient?.interests, recipient?.occasion, recipient?.relation].filter(Boolean).join(' ');
  const ranked = [...catalog]
    .map((e) => ({ e, s: scoreExperience(e, profile, lang) }))
    .sort((a, b) => b.s - a.s);
  const top = (ranked[0]?.s > 0 ? ranked.filter((r) => r.s > 0) : ranked).slice(0, 3).map((r) => r.e);
  const names = top.map((e) => loc(e, 'title', lang)).join(lang === 'ru' ? ', ' : ' · ');
  const reply =
    lang === 'ru'
      ? `Судя по описанию, вот что вызовет «вау»: ${names}. Хотите, добавлю их в подарочный бокс или уточним детали получателя?`
      : `לפי מה שתיארתם, אלה יגרמו וואו: ${names}. להוסיף אותם למארז המתנה או לחדד עוד פרטים על המקבל?`;
  return { reply, experienceIds: top.map((e) => e.id), source: 'rules' };
}

// ── Claude path ──
function systemPrompt(catalog, lang) {
  const compact = catalog.map((e) => ({
    id: e.id,
    category: e.category || e.category_slug,
    title: loc(e, 'title', lang),
    desc: loc(e, 'description', lang),
    price: e.price,
    best_seller: !!e.is_best_seller,
  }));
  return [
    'You are VAU\'s in-store gift concierge. VAU sells experience gifts in Israel.',
    `Reply in ${lang === 'ru' ? 'Russian' : 'Hebrew'}. Be warm, concise, and practical.`,
    'The buyer describes the recipient (interests, occasion, relationship, budget). Your job:',
    '1) Ask at most one short clarifying question if key info is missing.',
    '2) Recommend 1–3 experiences BY ID from the catalog below that best fit the recipient.',
    'Never invent experiences that are not in the catalog. Prefer variety and match to interests.',
    'Catalog (JSON):',
    JSON.stringify(compact),
  ].join('\n');
}

async function claudeRecommend({ messages, recipient, catalog, lang }) {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic();
  const recipientNote = recipient
    ? `Recipient profile: ${JSON.stringify(recipient)}`
    : 'No structured recipient profile provided yet.';
  const resp = await client.messages.create({
    model: config.assistant.model,
    max_tokens: 1024,
    system: systemPrompt(catalog, lang),
    output_config: {
      format: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: {
            reply: { type: 'string' },
            experienceIds: { type: 'array', items: { type: 'integer' } },
          },
          required: ['reply', 'experienceIds'],
          additionalProperties: false,
        },
      },
    },
    messages: [
      ...messages.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
      { role: 'user', content: recipientNote },
    ],
  });
  if (resp.stop_reason === 'refusal') throw new Error('refusal');
  const text = resp.content.find((b) => b.type === 'text')?.text || '{}';
  const parsed = JSON.parse(text);
  const validIds = new Set(catalog.map((e) => e.id));
  return {
    reply: parsed.reply,
    experienceIds: (parsed.experienceIds || []).filter((id) => validIds.has(id)).slice(0, 3),
    source: 'claude',
  };
}

async function recommend({ messages = [], recipient = null, catalog = [], lang = 'he' }) {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content || '';
  if (!catalog.length) return { reply: '', experienceIds: [], source: 'empty' };
  if (config.assistant.hasKey) {
    try {
      return await claudeRecommend({ messages, recipient, catalog, lang });
    } catch (e) {
      // Fall back to the deterministic recommender on any API failure/refusal —
      // but log it, so a misconfigured key/model/billing is visible in the
      // deploy logs instead of silently degrading to the rule-based path.
      console.error('[assistant] Claude call failed, using rule-based fallback:', e.message);
    }
  }
  return ruleBasedRecommend({ text: lastUser, recipient, catalog, lang });
}

module.exports = { recommend };
