// LinkedIn : endpoint public (sans connexion) de la recherche d'offres, utilisé par la page « Emplois » hors connexion.
//
// Constats des diagnostics menés depuis GitHub Actions (scripts/probe/linkedin*.mjs, septembre 2026) :
//  - 10 offres par requête, pagination profonde possible (start = 0, 10, 20… plusieurs centaines d'offres) ;
//  - seuls les mots-clés, le lieu et la période (f_TPR) sont appliqués : les filtres type de contrat (f_JT),
//    télétravail (f_WT) et expérience (f_E) sont ignorés pour un visiteur non connecté ;
//  - le type de contrat se lit donc sur la fiche (« Type d’emploi : Temps plein / Contrat / Stage… ») ;
//  - 900 requêtes d'affilée à ~1,4 s d'intervalle n'ont déclenché aucun 429, mais LinkedIn peut limiter :
//    rythme et budget sont bornés (1 300 requêtes ≈ 30 min par actualisation).
import * as cheerio from 'cheerio';
import { getText, sleep, HttpError } from '../http.js';
import { inferContracts, htmlToText, detectTechs } from '../normalize.js';

const SEARCH = 'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search';
const DETAIL = 'https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/';
const GEO = { location: 'France', geoId: '105015875' };

/** Requêtes de recherche : techno associée (indice si la fiche n'est pas lue) et nombre maximal de pages de 10 offres. */
export const LINKEDIN_QUERIES = [
  { keywords: 'react', tech: 'react', maxPages: 40 },
  { keywords: 'node.js', tech: 'nodejs', maxPages: 40 },
  { keywords: 'php', tech: 'php', maxPages: 25 },
  { keywords: '.net', tech: 'dotnet', maxPages: 30 },
  { keywords: 'javascript', tech: 'javascript', maxPages: 50 },
  { keywords: 'freelance (react OR node OR javascript OR typescript OR php OR symfony OR laravel OR ".net" OR "c#")', tech: null, maxPages: 30 },
  { keywords: 'typescript', tech: 'javascript', maxPages: 25 },
  { keywords: 'symfony', tech: 'php', maxPages: 12 },
  { keywords: 'c#', tech: 'dotnet', maxPages: 20 },
  { keywords: 'nestjs', tech: 'nodejs', maxPages: 8 },
  { keywords: 'laravel', tech: 'php', maxPages: 8 },
];

const num = (v, d) => (Number.isFinite(Number(v)) && v !== '' && v != null ? Number(v) : d);

/**
 * Période de recherche (secondes) : depuis le dernier passage réussi + 6 h de marge, entre 24 h et 7 jours.
 * Rattrapage sur 7 jours tant que la base contient peu d'offres LinkedIn récentes (première exécution, longue coupure…).
 */
export function searchWindowSeconds(lastSuccessAt, now = Date.now(), recentKnown = Infinity) {
  const forced = num(process.env.LINKEDIN_WINDOW_HOURS, null);
  if (forced) return Math.round(forced * 3600);
  if (recentKnown < num(process.env.LINKEDIN_CATCHUP_BELOW, 800)) return 7 * 86400;
  const last = lastSuccessAt ? Date.parse(lastSuccessAt) : NaN;
  const seconds = Number.isFinite(last) ? Math.ceil((now - last) / 1000) + 6 * 3600 : 7 * 86400;
  return Math.min(Math.max(seconds, 86400), 7 * 86400);
}

export function parseList(html, tech) {
  const $ = cheerio.load(html);
  const out = [];
  $('li').each((_, li) => {
    const el = $(li);
    const card = el.find('[data-entity-urn]').first();
    const link = el.find('a.base-card__full-link, a[href*="/jobs/view/"]').first();
    const href = link.attr('href') || '';
    const urn = card.attr('data-entity-urn') || '';
    const id = urn.split(':').pop() || (href.match(/-(\d{6,})\b/) || [])[1];
    if (!id || !/^\d+$/.test(id)) return;
    out.push({
      sourceId: id,
      title: el.find('.base-search-card__title, h3').first().text(),
      company: el.find('.base-search-card__subtitle, h4').first().text(),
      location: el.find('.job-search-card__location').first().text(),
      countryHint: 'FR',
      contractHints: [],
      techHints: tech ? [tech] : [],
      url: `https://www.linkedin.com/jobs/view/${id}/`,
      publishedAt: el.find('time[datetime]').attr('datetime'),
      salary: el.find('.job-search-card__salary-info').first().text().replace(/,00\b/g, ''),
    });
  });
  return out;
}

const CRITERIA_CONTRACT = [
  [/contrat|contract|freelance|ind[ée]pendant|prestation/i, 'freelance'],
  [/temps plein|full[- ]?time|\bcdi\b/i, 'cdi'],
  [/temporaire|temporary|\bcdd\b/i, 'cdd'],
  [/stage|intern/i, 'stage'],
  [/alternance|apprenti/i, 'alternance'],
];

/** Lit une fiche détaillée : description, critères (« Type d’emploi »…), salaire, titre/entreprise/lieu. */
export function parseDetail(html) {
  const $ = cheerio.load(html);
  const criteria = {};
  $('.description__job-criteria-item').each((_, li) => {
    const k = $(li).find('.description__job-criteria-subheader').text().trim();
    const v = $(li).find('.description__job-criteria-text').text().trim();
    if (k && v) criteria[k] = v;
  });
  const type = Object.entries(criteria).find(([k]) => /type d.emploi|employment type|type/i.test(k))?.[1] || '';
  const typeContract = CRITERIA_CONTRACT.find(([re]) => re.test(type))?.[1] || null;
  return {
    descriptionHtml: $('.show-more-less-html__markup, .description__text').first().html() || '',
    criteria,
    typeContract,
    title: $('.top-card-layout__title, .topcard__title').first().text().trim(),
    company: $('.topcard__org-name-link, .topcard__flavor a').first().text().trim(),
    location: $('.topcard__flavor--bullet').first().text().trim(),
    salary: $('.compensation__salary, .salary').first().text().trim().replace(/,00\b/g, ''),
    closed: /n.accepte plus de candidatures|no longer accepting applications/i.test($('.closed-job, .top-card-layout__entity-info').text()),
  };
}

/** Contrat d'une offre LinkedIn : mention explicite (titre, description) prioritaire, sinon rubrique « Type d’emploi ». */
export function linkedinContracts(title, descriptionHtml, typeContract) {
  const explicit = inferContracts({ title, description: htmlToText(descriptionHtml) });
  if (!(explicit.length === 1 && explicit[0] === 'autre')) return explicit;
  return typeContract ? [typeContract] : [];
}

export default {
  id: 'linkedin',
  name: 'LinkedIn',
  site: 'https://www.linkedin.com/jobs',
  description: 'Offres LinkedIn France (recherche publique sans connexion, pagination profonde, fiche lue pour le type de contrat).',
  async fetch(ctx) {
    const maxRequests = num(process.env.LINKEDIN_MAX_REQUESTS, 1300);
    const detailLimit = num(process.env.LINKEDIN_DETAIL_LIMIT, 1000);
    const baseDelay = num(process.env.LINKEDIN_DELAY_MS, 1100);
    const weekAgo = Date.now() - 7 * 86400e3;
    const recentKnown = (ctx.knownJobs?.() || []).filter((k) => Date.parse(k.firstSeenAt) > weekAgo).length;
    const windowSec = searchWindowSeconds(ctx.lastSuccessAt, Date.now(), ctx.knownJobs ? recentKnown : Infinity);
    let requests = 0;
    let delay = baseDelay;
    let consecutive429 = 0;
    let stopped = false;

    /** GET avec rythme, budget et gestion des 429 (pause puis ralentissement, arrêt après 3 refus consécutifs). */
    const liGet = async (url) => {
      while (!stopped) {
        if (requests >= maxRequests) {
          stopped = true;
          break;
        }
        requests++;
        try {
          const html = await getText(url, { retries: 0, timeoutMs: 20000 });
          consecutive429 = 0;
          await sleep(delay + Math.random() * 400);
          return html;
        } catch (err) {
          if (err instanceof HttpError && err.status === 429) {
            consecutive429++;
            if (consecutive429 >= 3) {
              stopped = true;
              break;
            }
            delay = Math.min(delay * 2, 8000);
            ctx.progress?.(`LinkedIn limite le débit (429) : pause de ${30 * consecutive429} s, rythme ralenti à ${delay} ms`);
            await sleep(30000 * consecutive429);
            continue;
          }
          if (err instanceof HttpError && (err.status === 400 || err.status === 404)) return '';
          throw err;
        }
      }
      return null;
    };

    // 1. Recherche : pagination de chaque requête jusqu'à épuisement, plafond de pages ou rendements décroissants.
    const jobs = new Map();
    const searchBudget = Math.max(50, maxRequests - Math.min(detailLimit, Math.floor(maxRequests * 0.45)));
    for (const q of LINKEDIN_QUERIES) {
      if (stopped || requests >= searchBudget) break;
      let start = 0;
      let dry = 0;
      let pages = 0;
      let found = 0;
      for (let p = 0; p < q.maxPages && requests < searchBudget; p++) {
        const params = new URLSearchParams({ keywords: q.keywords, ...GEO, f_TPR: `r${windowSec}`, start: String(start) });
        const html = await liGet(`${SEARCH}?${params}`);
        if (html == null) break;
        const items = parseList(html, q.tech);
        pages++;
        if (!items.length) break;
        let fresh = 0;
        for (const it of items) {
          const prev = jobs.get(it.sourceId);
          if (prev) {
            if (q.tech && !prev.techHints.includes(q.tech)) prev.techHints.push(q.tech);
          } else {
            jobs.set(it.sourceId, it);
            fresh++;
          }
        }
        found += fresh;
        dry = fresh === 0 ? dry + 1 : 0;
        if (dry >= 4) break; // pages déjà couvertes par les requêtes précédentes
        start += items.length;
      }
      ctx.progress?.(`LinkedIn « ${q.keywords.slice(0, 40)} » : ${pages} pages, ${found} nouvelles offres (total ${jobs.size})`);
    }

    // 2. Fiches : nouvelles offres d'abord, puis offres déjà connues dont la fiche manque (description ou type d'emploi).
    const known = new Map((ctx.knownJobs?.() || []).map((k) => [k.sourceId, k]));
    const needsCriteria = (k) => k.descLen < 40 || (!k.tags.some((t) => /type d.emploi|employment type/i.test(t)) && k.contracts.every((c) => c === 'autre'));
    const fresh = [...jobs.values()].filter((j) => !known.has(j.sourceId) || needsCriteria(known.get(j.sourceId)));
    const recentLimit = Date.now() - 21 * 86400e3;
    const backfill = [...known.values()]
      .filter((k) => !jobs.has(k.sourceId) && needsCriteria(k) && Date.parse(k.lastSeenAt) > recentLimit)
      .sort((a, b) => Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt))
      .map((k) => ({ sourceId: k.sourceId, title: k.title, company: k.company, location: k.location, url: k.url, countryHint: 'FR', contractHints: [], techHints: [], refreshOnly: true }));
    // Priorité : offres dont l'intitulé cite une de nos technos, puis les autres ; un quart du budget pour compléter les anciennes.
    const titled = (j) => detectTechs(j.title || '').length > 0;
    const byRelevance = (list) => [...list.filter(titled), ...list.filter((j) => !titled(j))];
    const freshQ = byRelevance(fresh);
    const backQ = byRelevance(backfill);
    const backShare = backQ.length ? Math.min(backQ.length, Math.floor(detailLimit / 4)) : 0;
    const queue = [...freshQ.slice(0, detailLimit - backShare), ...backQ.slice(0, backShare)];
    if (queue.length < detailLimit) queue.push(...[...freshQ.slice(detailLimit - backShare), ...backQ.slice(backShare)].slice(0, detailLimit - queue.length));
    let details = 0;
    for (const job of queue) {
      if (stopped) break;
      const html = await liGet(DETAIL + job.sourceId);
      if (html == null) break;
      if (!html) continue;
      const d = parseDetail(html);
      if (d.descriptionHtml) job.descriptionHtml = d.descriptionHtml;
      job.title = job.title || d.title;
      job.company = job.company || d.company;
      job.location = job.location || d.location;
      if (d.salary && !job.salary) job.salary = d.salary;
      job.contractHints = linkedinContracts(job.title || d.title, d.descriptionHtml, d.typeContract);
      job.tags = Object.entries(d.criteria).map(([k, v]) => `${k} : ${v}`);
      details++;
      if (job.refreshOnly && !jobs.has(job.sourceId)) jobs.set(job.sourceId, job);
    }
    ctx.progress?.(`LinkedIn : ${jobs.size} offres, ${details} fiches lues (dont ${Math.max(0, details - fresh.length)} complétées a posteriori), ${requests} requêtes, fenêtre ${Math.round(windowSec / 3600)} h`);

    const result = [...jobs.values()];
    if (stopped && requests < maxRequests) result.warning = `LinkedIn a limité les requêtes (429) : résultats partiels (${result.length} offres, ${details} fiches lues). La suite sera récupérée à la prochaine actualisation.`;
    else if (stopped) result.warning = `Budget de ${maxRequests} requêtes LinkedIn atteint : ${result.length} offres, ${details} fiches lues (voir LINKEDIN_MAX_REQUESTS).`;
    return result;
  },
};
