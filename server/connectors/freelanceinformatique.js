// Freelance-Informatique : missions freelance IT (liste paginée avec JSON-LD JobPosting, fiche détaillée pour la description complète).
import * as cheerio from 'cheerio';
import { getText, sleep } from '../http.js';
import { jobPostings, fromJobPosting, fillFromJsonLd } from '../scrape.js';
import { detectTechs } from '../normalize.js';

const BASE = 'https://www.freelance-informatique.fr';

export function parseFreelanceInformatique(html) {
  const $ = cheerio.load(html);
  const tagsByPath = new Map();
  $('.job-card-line').each((_, el) => {
    const href = $(el).find('.job-title a').attr('href');
    if (href) tagsByPath.set(href.replace(BASE, ''), $(el).find('.tags span').map((__, t) => $(t).text().trim()).get().filter(Boolean));
  });
  return jobPostings(html).map((jp) => {
    const raw = fromJobPosting(jp);
    const path = String(jp.url || '').replace(BASE, '');
    const code = path.split('-').pop();
    return {
      ...raw,
      sourceId: jp.identifier?.value || jp.identifier || code || path,
      company: '', // l'organisation déclarée est la plateforme elle-même
      contractHints: raw.contractHints.length ? raw.contractHints : ['freelance'],
      url: jp.url?.startsWith('http') ? jp.url : `${BASE}${path}`,
      tags: tagsByPath.get(path) || [],
    };
  });
}

export default {
  id: 'freelanceinformatique',
  name: 'Freelance-Informatique',
  site: `${BASE}/offres-freelance`,
  description: 'Missions freelance IT en France (≈ 500 missions actives), compétences requises et description complète.',
  async fetch(ctx) {
    const jobs = new Map();
    const maxPages = Number(process.env.FREELANCEINFO_PAGES) || 16;
    let staleStreak = 0;
    for (let page = 1; page <= maxPages; page++) {
      const html = await getText(`${BASE}/offres-freelance${page > 1 ? `?page=${page}` : ''}`, { retries: 1 });
      const items = parseFreelanceInformatique(html);
      if (!items.length) break;
      let unknown = 0;
      for (const it of items) {
        if (jobs.has(String(it.sourceId))) continue;
        jobs.set(String(it.sourceId), it);
        if (!ctx.isKnown?.(it.sourceId)) unknown++;
      }
      staleStreak = unknown ? 0 : staleStreak + 1;
      ctx.progress?.(`Freelance-Informatique p${page} : ${items.length} missions (${unknown} nouvelles)`);
      if (staleStreak >= 3) break; // les pages suivantes sont déjà connues
      await sleep(600);
    }
    // Description complète pour les missions nouvelles qui semblent concerner nos technos (titre ou compétences).
    const relevant = (j) => detectTechs(`${j.title} ${j.tags.join(' ')} ${j.descriptionHtml}`).length > 0;
    const read = await fillFromJsonLd([...jobs.values()], ctx, { limit: Number(process.env.DETAIL_FETCH_LIMIT) || 60, keep: relevant, getText, fillCompany: false });
    ctx.progress?.(`Freelance-Informatique : ${jobs.size} missions, ${read} fiches lues`);
    return [...jobs.values()];
  },
};
