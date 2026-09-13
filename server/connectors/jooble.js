// Jooble : agrégateur mondial, API gratuite sur demande (JOOBLE_API_KEY).
import { postJson } from '../http.js';
import { TECH_QUERIES } from '../normalize.js';

export default {
  id: 'jooble',
  name: 'Jooble',
  site: 'https://fr.jooble.org',
  description: 'Agrégateur Jooble France via API (nécessite JOOBLE_API_KEY).',
  requiresEnv: ['JOOBLE_API_KEY'],
  async fetch(ctx) {
    const jobs = new Map();
    for (const [tech, keywords] of Object.entries(TECH_QUERIES)) {
      for (const kw of keywords) {
        const data = await postJson(`https://fr.jooble.org/api/${process.env.JOOBLE_API_KEY}`, { keywords: `développeur ${kw}`, location: 'France', page: 1, datecreatedfrom: new Date(Date.now() - 14 * 86400e3).toISOString().slice(0, 10) }, { retries: 1 });
        for (const it of data?.jobs || []) {
          const prev = jobs.get(String(it.id));
          if (prev) {
            prev.techHints.push(tech);
            continue;
          }
          jobs.set(String(it.id), {
            sourceId: it.id,
            title: it.title,
            company: it.company,
            location: it.location,
            countryHint: 'FR',
            contractHints: [/cdi|permanent|full/i.test(it.type || '') ? 'cdi' : /free|contract|ind/i.test(it.type || '') ? 'freelance' : null].filter(Boolean),
            techHints: [tech],
            salary: it.salary,
            url: it.link,
            publishedAt: it.updated,
            descriptionHtml: it.snippet,
            tags: [it.source ? `via ${it.source}` : null].filter(Boolean),
          });
        }
        ctx.progress?.(`Jooble « ${kw} » : ${(data?.jobs || []).length} offres`);
      }
    }
    return [...jobs.values()];
  },
};
