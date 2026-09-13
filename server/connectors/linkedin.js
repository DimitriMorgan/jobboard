// LinkedIn : endpoint "guest" (sans connexion) qui renvoie des fragments HTML de la recherche d'offres.
// Attention aux quotas : LinkedIn répond 429 si l'on enchaîne trop de requêtes.
import * as cheerio from 'cheerio';
import { getText, sleep, HttpError } from '../http.js';
import { TECH_QUERIES } from '../normalize.js';

const SEARCH = 'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search';
const DETAIL = 'https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/';
const JOB_TYPES = { F: 'cdi', C: 'freelance' }; // f_JT : F = temps plein, C = contrat/freelance

function parseList(html, tech, contract) {
  const $ = cheerio.load(html);
  const out = [];
  $('li').each((_, li) => {
    const el = $(li);
    const card = el.find('[data-entity-urn]').first();
    const link = el.find('a.base-card__full-link, a[href*="/jobs/view/"]').first();
    const href = link.attr('href') || '';
    const urn = card.attr('data-entity-urn') || '';
    const id = urn.split(':').pop() || (href.match(/-(\d{6,})\b/) || [])[1];
    if (!id || !href) return;
    out.push({
      sourceId: id,
      title: el.find('.base-search-card__title, h3').first().text(),
      company: el.find('.base-search-card__subtitle, h4').first().text(),
      location: el.find('.job-search-card__location').first().text(),
      countryHint: 'FR',
      contractHints: [contract],
      techHints: [tech],
      url: `https://www.linkedin.com/jobs/view/${id}/`,
      publishedAt: el.find('time[datetime]').attr('datetime'),
      salary: el.find('.job-search-card__salary-info').first().text(),
    });
  });
  return out;
}

export default {
  id: 'linkedin',
  name: 'LinkedIn',
  site: 'https://www.linkedin.com/jobs',
  description: 'Offres LinkedIn France (CDI + freelance/contrat), via la recherche publique sans connexion.',
  async fetch(ctx) {
    const pages = Math.max(1, Number(process.env.LINKEDIN_PAGES) || 1);
    const jobs = new Map();
    let rateLimited = false;
    outer: for (const [tech, keywords] of Object.entries(TECH_QUERIES)) {
      const kw = keywords[0];
      for (const [jt, contract] of Object.entries(JOB_TYPES)) {
        for (let p = 0; p < pages; p++) {
          const params = new URLSearchParams({ keywords: `${kw} développeur`, location: 'France', geoId: '105015875', f_TPR: 'r604800', f_JT: jt, start: String(p * 25) });
          try {
            const html = await getText(`${SEARCH}?${params}`, { retries: 1, retryDelayMs: 4000 });
            const items = parseList(html, tech, contract);
            for (const it of items) {
              const prev = jobs.get(it.sourceId);
              if (prev) {
                prev.techHints.push(tech);
                if (!prev.contractHints.includes(contract)) prev.contractHints.push(contract);
              } else jobs.set(it.sourceId, it);
            }
            ctx.progress?.(`LinkedIn « ${kw} » ${contract} p${p + 1} : ${items.length} offres`);
            if (items.length < 25) break;
          } catch (err) {
            if (err instanceof HttpError && err.status === 429) {
              rateLimited = true;
              break outer;
            }
            throw err;
          }
          await sleep(1500);
        }
      }
    }

    // Description complète pour les nouvelles offres uniquement (limité pour éviter le 429).
    const limit = Number(process.env.DETAIL_FETCH_LIMIT ?? 40);
    let fetched = 0;
    if (!rateLimited && limit > 0) {
      for (const job of jobs.values()) {
        if (fetched >= limit) break;
        if (ctx.isKnown(job.sourceId)) continue;
        try {
          const html = await getText(DETAIL + job.sourceId, { retries: 0 });
          const $ = cheerio.load(html);
          job.descriptionHtml = $('.show-more-less-html__markup, .description__text').first().html() || '';
          const criteria = {};
          $('.description__job-criteria-item').each((_, li) => {
            criteria[$(li).find('.description__job-criteria-subheader').text().trim()] = $(li).find('.description__job-criteria-text').text().trim();
          });
          const type = Object.entries(criteria).find(([k]) => /type|emploi/i.test(k))?.[1] || '';
          if (/contrat|contract|freelance|indépendant/i.test(type)) job.contractHints.push('freelance');
          if (/temps plein|full-time|full time/i.test(type)) job.contractHints.push('cdi');
          fetched++;
          await sleep(1200);
        } catch (err) {
          if (err instanceof HttpError && err.status === 429) {
            rateLimited = true;
            break;
          }
        }
      }
    }
    const result = [...jobs.values()];
    if (rateLimited) result.warning = `LinkedIn a limité les requêtes (429) : résultats partiels (${result.length} offres). Réessayez plus tard.`;
    return result;
  },
};
