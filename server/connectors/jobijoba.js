// Jobijoba : agrégateur français (offres d'Adzuna, Collective, jobtome…), pages de résultats HTML.
import * as cheerio from 'cheerio';
import { getText, sleep } from '../http.js';
import { contractFromLabel, remoteFromLabel, parseFrenchDate } from '../scrape.js';

const QUERIES = ['développeur react', 'développeur node', 'développeur javascript', 'développeur php', 'développeur symfony', 'développeur .net', 'freelance développeur'];

export function parseJobijoba(html, now = new Date()) {
  const $ = cheerio.load(html);
  const out = [];
  $('div.offer[data-id]').each((_, el) => {
    const card = $(el);
    const id = String(card.attr('data-id') || '').replace(/^ad_/, '');
    const link = card.find('a.offer-link').first();
    const href = link.attr('href') || '';
    if (!id || !href) return;
    let product = {};
    try {
      product = JSON.parse(link.attr('data-product') || '{}')?.ecommerce?.click?.products?.[0] || {};
    } catch {
      /* ignore */
    }
    const feature = (icon) => card.find(`.feature:has(.${icon})`).first().text().replace(/\s+/g, ' ').trim();
    out.push({
      sourceId: id,
      title: card.find('.offer-header-title').first().text() || product.name,
      company: feature('icon-apartment') || product.brand || '',
      location: feature('icon-map-marker'),
      countryHint: 'FR',
      contractHints: contractFromLabel(feature('icon-register')),
      remoteHint: remoteFromLabel(feature('icon-home')),
      salary: feature('icon-banknot'),
      url: href.startsWith('http') ? href : `https://www.jobijoba.com${href}`,
      publishedAt: parseFrenchDate(card.find('.publication_date').first().text(), now),
      descriptionText: card.find('.description').first().text().replace(/\s+/g, ' ').trim(),
      tags: [product.category, product.dimension24 ? `via ${String(product.dimension24).replace(/_orga$/, '')}` : null].filter(Boolean),
    });
  });
  return out;
}

export default {
  id: 'jobijoba',
  name: 'Jobijoba',
  site: 'https://www.jobijoba.com/fr',
  description: 'Agrégateur d’offres françaises (CDI, CDD, intérim, indépendant) : titre, contrat, salaire et télétravail.',
  async fetch(ctx) {
    const jobs = new Map();
    const pages = Number(process.env.JOBIJOBA_PAGES) || 2;
    for (const q of QUERIES) {
      for (let page = 1; page <= pages; page++) {
        const html = await getText(`https://www.jobijoba.com/fr/query/?what=${encodeURIComponent(q)}&where=France&where_type=country${page > 1 ? `&page=${page}` : ''}`, { retries: 1 });
        const items = parseJobijoba(html);
        for (const it of items) if (!jobs.has(it.sourceId)) jobs.set(it.sourceId, it);
        ctx.progress?.(`Jobijoba « ${q} » p${page} : ${items.length} offres`);
        if (items.length < 30) break;
        await sleep(700);
      }
    }
    return [...jobs.values()];
  },
};
