// Normalisation des offres : détection des technos, du type de contrat, du télétravail, nettoyage HTML.
import sanitizeHtml from 'sanitize-html';
import * as cheerio from 'cheerio';

export const TECHS = [
  { id: 'javascript', label: 'JavaScript', re: /\b(?:javascript|typescript|ecmascript|es6|es20\d\d)\b|(?<![a-z])js\b|[a-z]js\b/i },
  { id: 'react', label: 'React', re: /\breact(?:js|\.js|-native)?\b|\bnext\.?js\b/i },
  { id: 'php', label: 'PHP', re: /\bphp\b|\bsymfony\b|\blaravel\b/i },
  { id: 'nodejs', label: 'Node.js', re: /\bnode(?:js|\.js)?\b|\bnest(?:js|\.js)\b|\bexpress(?:js|\.js)\b/i },
  { id: 'dotnet', label: '.NET', re: /(?:^|[^a-z0-9])\.net\b|\bdotnet\b|\basp\.net\b|\bc#|\bcsharp\b|\bblazor\b|\bvb\.net\b/i },
];
export const TECH_IDS = TECHS.map((t) => t.id);

/** Mots-clés de recherche envoyés aux plateformes, par techno. */
export const TECH_QUERIES = {
  javascript: ['javascript', 'typescript'],
  react: ['react'],
  php: ['php', 'symfony'],
  nodejs: ['node.js'],
  dotnet: ['.net', 'c#'],
};

export const CONTRACTS = ['freelance', 'cdi', 'cdd', 'interim', 'alternance', 'stage', 'autre'];

const CONTRACT_PATTERNS = [
  ['freelance', /\bfree-?lances?\b|\bfreelancers?\b|\bind[ée]pendante?s?\b|\btjm\b|\bportage\b|\bcontractor\b|\bday rate\b|\bauto-?entrepreneur\b|\bmission\b/i],
  ['cdi', /\bcdi\b|\bpermanent\b|\bfull[-_ ]?time\b|\bunbefristet\b/i],
  ['cdd', /\bcdd\b|\bfixed[- ]term\b|\btemporary\b|\bdur[ée]e d[ée]termin[ée]e\b/i],
  ['interim', /\bint[ée]rim\b/i],
  ['alternance', /\balternance\b|\bapprentissage\b|\bapprenticeship\b|\bapprentie?s?\b/i],
  ['stage', /\bstage\b|\bstagiaires?\b|\binternship\b|\binterns?\b/i],
];
const CONTRACT_PATTERNS_DESC = CONTRACT_PATTERNS.filter(([id]) => id === 'freelance' || id === 'cdi').map(
  ([id, re]) => [id, id === 'freelance' ? /\bfree-?lances?\b|\bfreelancers?\b|\btjm\b|\bportage salarial\b|\bcontractor\b|\bday rate\b/i : re],
);

export function detectTechs(text) {
  if (!text) return [];
  return TECHS.filter((t) => t.re.test(text)).map((t) => t.id);
}

/**
 * @param {{hints?: string[], title?: string, description?: string}} p
 * @returns {string[]}
 */
export function inferContracts({ hints = [], title = '', description = '' }) {
  const set = new Set(hints.filter((h) => CONTRACTS.includes(h)));
  if (set.size === 0) for (const [id, re] of CONTRACT_PATTERNS) if (re.test(title)) set.add(id);
  if (set.size === 0) for (const [id, re] of CONTRACT_PATTERNS_DESC) if (re.test(description)) set.add(id);
  if (set.size === 0) set.add('autre');
  return [...set];
}

export function inferRemote({ hint, text = '' }) {
  if (hint === 'full' || hint === 'partial' || hint === 'none') return hint;
  if (/\bfull[- ]?remote\b|\b100 ?% (?:remote|t[ée]l[ée]travail)\b|\bt[ée]l[ée]travail (?:total|complet|int[ée]gral|100)\b|\bfully remote\b|\bremote[- ]first\b|\bwork from anywhere\b/i.test(text)) return 'full';
  if (/\bhybrid[e]?\b|\bt[ée]l[ée]travail\b|\bremote\b|\bhome[- ]office\b/i.test(text)) return 'partial';
  return null;
}

const FR_RE =
  /\bfrance\b|\bparis\b|\blyon\b|\bmarseille\b|\btoulouse\b|\bnantes\b|\bbordeaux\b|\blille\b|\brennes\b|\bnice\b|\bstrasbourg\b|\bmontpellier\b|\bgrenoble\b|\bnancy\b|\brouen\b|\btours\b|\baix[- ]en[- ]provence\b|\bsophia[- ]antipolis\b|\bîle[- ]de[- ]france\b|\bile[- ]de[- ]france\b|\bidf\b|\bhauts[- ]de[- ]seine\b|\b\d{2} ?- ?[a-zé]|\b(?:0[1-9]|[1-8]\d|9[0-5]) ?\d{3}\b|\bfrançais\b|\bfrench\b/i;

/** Renvoie 'FR', 'REMOTE' (remote hors France) ou 'OTHER'. */
export function inferCountry({ hint, location = '', remote }) {
  if (hint === 'FR') return 'FR';
  if (FR_RE.test(location)) return 'FR';
  if (remote === 'full') return 'REMOTE';
  if (hint) return hint === 'REMOTE' ? 'REMOTE' : 'OTHER';
  return location ? 'OTHER' : 'REMOTE';
}

export function formatSalary({ min, max, currency = '€', period } = {}) {
  const fmt = (n) => Math.round(Number(n)).toLocaleString('fr-FR');
  if (!min && !max) return '';
  const range = min && max ? `${fmt(min)} - ${fmt(max)}` : fmt(min || max);
  const per = period ? ` ${period}` : '';
  return `${range} ${currency}${per}`.trim();
}

const SANITIZE_OPTS = {
  allowedTags: ['p', 'br', 'ul', 'ol', 'li', 'strong', 'b', 'em', 'i', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'blockquote', 'code', 'pre', 'hr', 'span', 'div', 'table', 'thead', 'tbody', 'tr', 'td', 'th'],
  allowedAttributes: { a: ['href', 'target', 'rel'] },
  allowedSchemes: ['http', 'https', 'mailto'],
  transformTags: { a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }) },
};

export function sanitize(html) {
  if (!html) return '';
  return sanitizeHtml(String(html), SANITIZE_OPTS).trim();
}

export function htmlToText(html) {
  if (!html) return '';
  const $ = cheerio.load(`<div id="__root">${String(html).replace(/</g, " <")}</div>`);
  return $('#__root').text().replace(/\s+/g, ' ').trim();
}

export function textToHtml(text) {
  if (!text) return '';
  const esc = String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('');
}

export function cleanText(s) {
  return String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function toIso(value) {
  if (!value) return null;
  if (typeof value === 'number') {
    const d = new Date(value < 1e12 ? value * 1000 : value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function slugify(s) {
  return cleanText(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Transforme une offre brute renvoyée par un connecteur en offre normalisée.
 * Renvoie null si l'offre ne concerne aucune des technos suivies.
 *
 * Champs bruts acceptés : sourceId, title, company, location, countryHint, remoteHint, contractHints[],
 * techHints[], salary (string) ou salaryParts {min,max,currency,period}, url, applyUrl, publishedAt,
 * descriptionHtml, descriptionText, tags[]
 */
export function normalizeJob(source, raw) {
  const title = cleanText(raw.title);
  if (!title || !raw.sourceId || !raw.url) return null;

  const descriptionHtml = sanitize(raw.descriptionHtml || (raw.descriptionText ? textToHtml(raw.descriptionText) : ''));
  const descriptionText = htmlToText(descriptionHtml);
  const tags = (raw.tags || []).map(cleanText).filter(Boolean);
  const haystack = [title, tags.join(' '), descriptionText].join('\n');

  const techs = new Set(detectTechs(haystack));
  if (techs.size === 0 && !descriptionText) for (const t of raw.techHints || []) if (TECH_IDS.includes(t)) techs.add(t);
  if (techs.size === 0) return null;

  const contracts = inferContracts({ hints: raw.contractHints || [], title, description: descriptionText.slice(0, 1500) });
  const remote = inferRemote({ hint: raw.remoteHint, text: `${title}\n${raw.location || ''}\n${descriptionText.slice(0, 2000)}` });
  const location = cleanText(raw.location);
  const country = inferCountry({ hint: raw.countryHint, location, remote });
  const company = cleanText(raw.company) || 'Entreprise non précisée';
  const salary = cleanText(raw.salary) || (raw.salaryParts ? formatSalary(raw.salaryParts) : '');

  return {
    id: `${source}:${String(raw.sourceId)}`,
    source,
    sourceId: String(raw.sourceId),
    title,
    company,
    location,
    country,
    remote,
    contracts,
    techs: [...techs],
    salary,
    url: raw.url,
    applyUrl: raw.applyUrl || null,
    publishedAt: toIso(raw.publishedAt),
    description: descriptionHtml,
    excerpt: descriptionText.slice(0, 280),
    tags: tags.slice(0, 40),
    fingerprint: `${slugify(company)}|${slugify(title)}`,
  };
}
