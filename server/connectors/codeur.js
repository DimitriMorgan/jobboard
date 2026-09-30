// Codeur.com : projets freelance (souvent de petite taille) publiés par des entreprises françaises, flux RSS.
import * as cheerio from 'cheerio';
import { getText, sleep } from '../http.js';

export function parseCodeur(xml) {
  const $ = cheerio.load(xml, { xml: true });
  const out = [];
  $('item').each((_, item) => {
    const el = $(item);
    const link = el.find('link').first().text().trim();
    const guid = el.find('guid').first().text().trim() || link.match(/projects\/(\d+)/)?.[1];
    if (!link || !guid) return;
    const desc = el.find('description').first().text();
    const head = cheerio.load(desc)('p').first().text();
    const budget = head.match(/Budget\s*:\s*([^-]+?)\s*(?:-|$)/)?.[1]?.trim() || '';
    const categories = (head.match(/Catégories\s*:\s*(.+)$/)?.[1] || '').split(',').map((c) => c.trim()).filter(Boolean);
    out.push({
      sourceId: guid,
      title: el.find('title').first().text(),
      company: 'Client Codeur.com',
      location: 'Télétravail',
      countryHint: 'FR',
      remoteHint: 'full',
      contractHints: ['freelance'],
      url: link,
      publishedAt: el.find('pubDate').first().text(),
      descriptionHtml: desc.replace(/<a [^>]*>Voir ce projet sur Codeur<\/a>/, ''),
      tags: [...categories, budget ? `Budget : ${budget}` : null].filter(Boolean),
    });
  });
  return out;
}

export default {
  id: 'codeur',
  name: 'Codeur.com',
  site: 'https://www.codeur.com/projects',
  description: 'Projets freelance publiés par des entreprises françaises (flux RSS), budget indiqué.',
  async fetch(ctx) {
    const jobs = new Map();
    for (let page = 1; page <= (Number(process.env.CODEUR_PAGES) || 3); page++) {
      const xml = await getText(`https://www.codeur.com/projects?format=rss${page > 1 ? `&page=${page}` : ''}`, { retries: 1 });
      const items = parseCodeur(xml);
      let added = 0;
      for (const it of items) if (!jobs.has(it.sourceId)) (jobs.set(it.sourceId, it), added++);
      ctx.progress?.(`Codeur p${page} : ${items.length} projets (${added} inédits)`);
      if (!added) break;
      await sleep(500);
    }
    return [...jobs.values()];
  },
};
