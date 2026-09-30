// LesJeudis : job board IT français (catégorie « Développement », ≈ 3 000 offres), cartes HTML + fiche JSON-LD.
import * as cheerio from 'cheerio';
import { getText, sleep } from '../http.js';
import { contractFromLabel, remoteFromLabel, parseFrenchDate, fillFromJsonLd } from '../scrape.js';
import { detectTechs, textToHtml } from '../normalize.js';

const BASE = 'https://lesjeudis.com';

export function parseLesJeudis(html, now = new Date()) {
  const $ = cheerio.load(html);
  const out = [];
  const seen = new Set();
  $('a[href^="/offers/"][aria-label]').each((_, el) => {
    const a = $(el);
    const href = a.attr('href');
    if (seen.has(href)) return;
    seen.add(href);
    const card = a.parent();
    const company = card.find('img[alt]').filter((__, img) => $(img).attr('alt')).first().attr('alt') || '';
    const texts = card
      .find('a[href^="/offers/"]')
      .last()
      .find('*')
      .contents()
      .filter((__, n) => n.type === 'text')
      .map((__, n) => $(n).text().replace(/\s+/g, ' ').trim())
      .get()
      .filter(Boolean);
    // Ligne de méta : « Lieu · CDI · Hybride · 50 – 65 k€/an » (chaque valeur et chaque « · » sont des nœuds distincts)
    const dot = texts.indexOf('·');
    const meta = [];
    let metaEnd = dot;
    if (dot > 0) {
      meta.push(texts[dot - 1]);
      let i = dot;
      while (texts[i] === '·' && i + 1 < texts.length) {
        meta.push(texts[i + 1]);
        i += 2;
      }
      metaEnd = i;
    }
    const pubIdx = texts.findIndex((t) => /^publi[ée]e/i.test(t));
    const published = pubIdx < 0 ? '' : /^publi[ée]e$/i.test(texts[pubIdx]) ? texts[pubIdx + 1] || '' : texts[pubIdx].replace(/^publi[ée]e\s*(le\s*)?/i, '');
    const skills = dot > 0 ? texts.slice(metaEnd, pubIdx < 0 ? texts.length : pubIdx).filter((t) => t.length <= 30 && !/^\+\d+$/.test(t)) : [];
    const category = dot > 1 ? texts[dot - 2] : '';
    const rest = meta.slice(1).join(' ');
    out.push({
      sourceId: href.split('-').pop(),
      title: a.attr('aria-label'),
      company,
      location: meta[0] || '',
      countryHint: 'FR',
      contractHints: contractFromLabel(rest),
      remoteHint: remoteFromLabel(rest),
      salary: meta.slice(1).find((p) => /€/.test(p)) || '',
      url: `${BASE}${href}`,
      publishedAt: parseFrenchDate(published, now),
      tags: [...skills, category].filter(Boolean),
    });
  });
  return out;
}

export default {
  id: 'lesjeudis',
  name: 'LesJeudis',
  site: `${BASE}/emploi/developpement`,
  description: 'Job board IT français (catégorie Développement) : contrat, salaire, télétravail et compétences.',
  async fetch(ctx) {
    const jobs = new Map();
    const maxPages = Number(process.env.LESJEUDIS_PAGES) || 12;
    let staleStreak = 0;
    for (let page = 1; page <= maxPages; page++) {
      const html = await getText(`${BASE}/emploi/developpement${page > 1 ? `?page=${page}` : ''}`, { retries: 1 });
      const items = parseLesJeudis(html);
      if (!items.length) break;
      let unknown = 0;
      for (const it of items) {
        if (jobs.has(it.sourceId)) continue;
        jobs.set(it.sourceId, it);
        if (!ctx.isKnown?.(it.sourceId)) unknown++;
      }
      staleStreak = unknown ? 0 : staleStreak + 1;
      ctx.progress?.(`LesJeudis p${page} : ${items.length} offres (${unknown} nouvelles)`);
      if (staleStreak >= 3) break;
      await sleep(600);
    }
    const relevant = (j) => detectTechs(`${j.title} ${j.tags.join(' ')}`).length > 0;
    const list = [...jobs.values()];
    const read = await fillFromJsonLd(list, ctx, { limit: Number(process.env.DETAIL_FETCH_LIMIT) || 60, keep: relevant, getText });
    for (const j of list) if (j.descriptionHtml && !/<[a-z]/i.test(j.descriptionHtml)) j.descriptionHtml = textToHtml(j.descriptionHtml.replace(/^#+\s*/gm, ''));
    ctx.progress?.(`LesJeudis : ${list.length} offres, ${read} fiches lues`);
    return list;
  },
};
