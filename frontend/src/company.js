// Central company / legal identity. Fill these in ONCE and every legal document
// (Terms, Privacy) updates automatically — the strings in legal.js reference
// these values by {token}.
//
// ⚠️ The four values marked TODO are legal facts that must come from the
// company's real registration. Do NOT guess them — an incorrect company number
// or address in published terms is misleading and legally risky. While any of
// them is blank, the site shows a "draft / pending attorney review" banner on
// the legal pages and renders a visible [placeholder] in the text.
export const COMPANY = {
  legalName: "", // TODO: registered legal name, e.g. "VAU Experiences Ltd." / «VAU Experiences בע״מ»
  companyNo: "", // TODO: ח.פ. / registration number
  address: "", // TODO: registered business address
  phone: "", // TODO: customer-support phone number

  // Sensible defaults on the project's own domain — override if different.
  supportEmail: "support@vaugift.com",
  dpoEmail: "privacy@vaugift.com",

  // Exclusive jurisdiction already chosen in the drafts (Tel Aviv-Yafo).
  jurisdiction: { he: "תל אביב-יפו", ru: "Тель-Авив-Яффо" },

  // "Last updated" date shown at the top of each document (YYYY-MM-DD).
  updated: "2026-08-14",
};

// Visible fall-backs used while a required field is still blank, so an
// unfinished document reads as an obvious draft rather than an empty gap.
const PLACEHOLDER = {
  legalName: { he: "[שם החברה]", ru: "[название компании]" },
  companyNo: { he: "[ח.פ.]", ru: "[ח.פ. / рег. №]" },
  address: { he: "[כתובת]", ru: "[адрес]" },
  phone: { he: "[טלפון]", ru: "[телефон]" },
};

// True while any registration fact the documents depend on is still missing.
export function legalDetailsIncomplete() {
  return !COMPANY.legalName || !COMPANY.companyNo || !COMPANY.address;
}

// Replace {token} occurrences in a legal string with the company's details for
// the given language. Empty required fields fall back to a visible placeholder.
export function fillLegal(str, lang) {
  if (typeof str !== "string") return str;
  const val = (key) => {
    if (key === "jurisdiction") return COMPANY.jurisdiction[lang] || COMPANY.jurisdiction.he;
    if (key === "updated") return COMPANY.updated;
    const v = COMPANY[key];
    if (v) return v;
    const ph = PLACEHOLDER[key];
    return ph ? ph[lang] || ph.he : `[${key}]`;
  };
  return str.replace(/\{(\w+)\}/g, (_, key) => val(key));
}
