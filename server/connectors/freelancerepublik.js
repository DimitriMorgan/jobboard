// Freelance Republik : missions freelance tech (≈ 100 par semaine), cartes de la page « /freelance » + fiche JSON-LD.
import * as cheerio from 'cheerio';
import { getText } from '../http.js';
import { parseFrenchDate, remoteFromLabel, contractFromLabel, fillFromJsonLd } from '../scrape.js';

const BASE = 'https://www.freelancerepublik.com';

export function parseFreelanceRepublik(html, now = new Date()) {
  const $ = cheerio.load(html);
  const out = [];
  const seen = new Set();
  $('a.jobboard-card[href^="/missions/"]').each((_, el) => {
    const card = $(el);
    const href = card.attr('href');
    if (seen.has(href)) return;
    seen.add(href);
    const jb = (k) => card.find(`[data-jb="${k}"]`).first().text().replace(/\s+/g, ' ').trim();
    const contract = contractFromLabel(jb('contrat'));
    out.push({
      sourceId: href.split('-').pop() || href,
      title: card.find('.jobboard-card-title').first().text(),
      company: '',
      location: jb('localisation'),
      countryHint: /france/i.test(jb('localisation')) || !jb('localisation') ? 'FR' : undefined,
      remoteHint: remoteFromLabel(jb('lieu')),
      contractHints: contract.length ? contract : ['freelance'],
      url: `${BASE}${href}`,
      publishedAt: parseFrenchDate(jb('date'), now),
      descriptionText: card.find('.jobboard-card-excerpt').first().text().trim(),
      tags: [jb('contrat'), jb('lieu')].filter(Boolean),
    });
  });
  return out;
}

export default {
  id: 'freelancerepublik',
  name: 'Freelance Republik',
  site: `${BASE}/freelance`,
  description: 'Missions freelance tech (développement, data, produit…), fiche détaillée lue pour les nouvelles missions.',
  async fetch(ctx) {
    const html = await getText(`${BASE}/freelance`, { retries: 1 });
    const jobs = parseFreelanceRepublik(html);
    const read = await fillFromJsonLd(jobs, ctx, { limit: Number(process.env.DETAIL_FETCH_LIMIT) || 60, getText });
    ctx.progress?.(`Freelance Republik : ${jobs.length} missions, ${read} fiches lues`);
    return jobs;
  },
};
