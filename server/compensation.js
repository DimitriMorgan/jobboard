// Extraction structurée de la rémunération : salaire annuel (CDI) et TJM (freelance).
// Renvoie { tjmMin, tjmMax, salaryMin, salaryMax, currency } — valeurs null si inconnues.

const NUM = '(\\d{1,3}(?:[ \\u00a0.]?\\d{3})*|\\d+(?:[.,]\\d+)?)';
const K = '\\s*[kK]\\s*(?:€|euros?|\\$|usd)?';
const SEP = '\\s*(?:-|–|—|à|a|/|et|to|and)\\s*';

function parseNum(s) {
  if (s == null) return null;
  const n = Number(String(s).replace(/[ \u00a0.]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function currencyOf(text) {
  if (/\$|usd/i.test(text)) return '$';
  if (/£|gbp/i.test(text)) return '£';
  if (/chf/i.test(text)) return 'CHF';
  return '€';
}

const DAILY_OK = (n) => n >= 150 && n <= 2500;
const ANNUAL_OK = (n) => n >= 18000 && n <= 400000;

/** TJM : "TJM 550", "550-650 €/jour", "600€ HT / j", "day rate 500", "500 à 600 € par jour". */
function extractTjm(text) {
  const patterns = [
    new RegExp(`\\b(?:tjm|taux journalier|day rate|daily rate|tarif journalier)\\b[^\\d]{0,25}${NUM}(?:${SEP}${NUM})?`, 'i'),
    new RegExp(`${NUM}(?:${SEP}${NUM})?\\s*(?:€|euros?|\\$|usd)?\\s*(?:ht|h\\.t\\.|brut)?\\s*(?:\\/|par|per|by)\\s*(?:j\\b|jour|jours|day|days|jr)`, 'i'),
    new RegExp(`${NUM}(?:${SEP}${NUM})?\\s*(?:€|euros?)\\s*(?:ht)?\\s*(?:\\/|par)?\\s*(?:j\\b|jour)`, 'i'),
    new RegExp(`\\b(?:tjm|tj)\\s*[:=]?\\s*${NUM}(?:${SEP}${NUM})?`, 'i'),
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    let a = parseNum(m[1]);
    let b = parseNum(m[2]);
    if (a != null && a < 10 && /k/i.test(m[0])) a *= 1000;
    if (!DAILY_OK(a)) continue;
    if (b != null && !DAILY_OK(b)) b = null;
    if (b != null && b < a) [a, b] = [b, a];
    return { min: a, max: b ?? a, currency: currencyOf(m[0]) };
  }
  return null;
}

/** Salaire annuel : "45k€", "45-55K€", "45 000 € brut annuel", "3 500 € / mois", "$90k - $110k". */
function extractSalary(text) {
  const patterns = [
    // 45-55k€ / 45k-55k€ (fourchette, k au moins sur le second nombre)
    { re: new RegExp(`(?:€|\\$|£)?\\s*${NUM}(?:${K})?${SEP}(?:€|\\$|£)?\\s*${NUM}${K}(?!\\s*(?:\\/|par|per)\\s*(?:j|jour|day|mois|month))`, 'i'), mult: 1000, requireContext: true },
    // 45k€ / $90k / 45K brut
    { re: new RegExp(`(?:€|\\$|£)?\\s*${NUM}${K}(?!\\s*(?:\\/|par|per)\\s*(?:j|jour|day|mois|month))`, 'i'), mult: 1000, requireContext: true },
    // 45 000 € (brut annuel) / 45000-55000 €
    { re: new RegExp(`${NUM}(?:${SEP}${NUM})?\\s*(?:€|euros?|\\$|usd|£)\\s*(?:brut|bruts|gross|net)?\\s*(?:\\/|par|per)?\\s*(?:an|annuel|annuels|year|yr|a\\b)?`, 'i'), mult: 1 },
    // 3 500 € / mois
    { re: new RegExp(`${NUM}(?:${SEP}${NUM})?\\s*(?:€|euros?|\\$|£)\\s*(?:brut|net)?\\s*(?:\\/|par|per)\\s*(?:mois|month)`, 'i'), mult: 12 },
  ];
  for (const { re, mult, requireContext } of patterns) {
    const global = new RegExp(re.source, 'gi');
    let m;
    while ((m = global.exec(text))) {
      const around = text.slice(Math.max(0, m.index - 60), m.index + m[0].length + 30);
      if (requireContext && !/€|\$|£|salaire|salary|rémunération|remuneration|package|brut|gross|annuel|annual|k€|\/an|per year|yearly/i.test(around)) continue;
      if (/\/\s*(?:j\b|jour|day)|tjm|par jour|per day/i.test(around) && mult !== 12 && !/k/i.test(m[0])) continue;
      let a = parseNum(m[1]);
      let b = parseNum(m[2]);
      if (a == null) continue;
      a *= mult;
      if (b != null) b *= mult;
      // "45-55k€" : le premier nombre n'a pas de k mais est en milliers
      if (mult === 1000 && b != null && a > 1000 && b < 1000) b *= 1000;
      if (mult === 1000 && b != null && a < 1000 && b < 1000 && b < a) b *= 1000;
      if (mult === 1 && a < 1000 && b != null && b >= 1000) continue;
      if (!ANNUAL_OK(a)) continue;
      if (b != null && !ANNUAL_OK(b)) b = null;
      if (b != null && b < a) [a, b] = [b, a];
      return { min: Math.round(a), max: Math.round(b ?? a), currency: currencyOf(m[0]) };
    }
  }
  return null;
}

/**
 * @param {{salaryText?: string, title?: string, description?: string, structured?: {tjmMin,tjmMax,salaryMin,salaryMax,currency}}} p
 */
export function extractCompensation({ salaryText = '', title = '', description = '', structured = {} } = {}) {
  const out = { tjmMin: null, tjmMax: null, salaryMin: null, salaryMax: null, currency: structured.currency || null };
  const norm = (v) => (v == null || v === '' || Number.isNaN(Number(v)) || Number(v) <= 0 ? null : Number(v));
  if (norm(structured.tjmMin) || norm(structured.tjmMax)) {
    out.tjmMin = norm(structured.tjmMin) ?? norm(structured.tjmMax);
    out.tjmMax = norm(structured.tjmMax) ?? norm(structured.tjmMin);
  }
  if (norm(structured.salaryMin) || norm(structured.salaryMax)) {
    out.salaryMin = norm(structured.salaryMin) ?? norm(structured.salaryMax);
    out.salaryMax = norm(structured.salaryMax) ?? norm(structured.salaryMin);
  }
  const sources = [salaryText, title, description.slice(0, 4000)].filter(Boolean);
  for (const text of sources) {
    if (out.tjmMin == null) {
      const t = extractTjm(text);
      if (t) Object.assign(out, { tjmMin: t.min, tjmMax: t.max, currency: out.currency || t.currency });
    }
    if (out.salaryMin == null) {
      const s = extractSalary(text);
      if (s) Object.assign(out, { salaryMin: s.min, salaryMax: s.max, currency: out.currency || s.currency });
    }
    if (out.tjmMin != null && out.salaryMin != null) break;
  }
  if (!out.currency && (out.tjmMin != null || out.salaryMin != null)) out.currency = '€';
  return out;
}

export function formatTjm(min, max, currency = '€') {
  if (min == null) return '';
  const f = (n) => Math.round(n).toLocaleString('fr-FR');
  return `${min === max || max == null ? f(min) : `${f(min)} - ${f(max)}`} ${currency}/j`;
}

export function formatAnnual(min, max, currency = '€') {
  if (min == null) return '';
  const f = (n) => (n >= 1000 ? `${Math.round(n / 1000)} k` : Math.round(n).toLocaleString('fr-FR'));
  return `${min === max || max == null ? f(min) : `${f(min)} - ${f(max)}`}${currency}/an`;
}
