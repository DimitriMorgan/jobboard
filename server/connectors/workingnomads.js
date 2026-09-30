// Working Nomads : offres 100 % remote (API JSON publique), catégorie développement.
import { getJson } from '../http.js';

export default {
  id: 'workingnomads',
  name: 'Working Nomads',
  site: 'https://www.workingnomads.com/jobs',
  description: 'Offres 100 % remote (API publique), catégorie développement.',
  async fetch(ctx) {
    const data = await getJson('https://www.workingnomads.com/api/exposed_jobs/', { retries: 1 });
    const jobs = (Array.isArray(data) ? data : [])
      .filter((it) => /develop|engineer|programm|software/i.test(`${it.category_name} ${it.title}`))
      .map((it) => ({
        sourceId: it.url?.match(/\/(\d+)\/?$/)?.[1] || it.url,
        title: it.title,
        company: it.company_name,
        location: it.location || 'Remote',
        remoteHint: 'full',
        countryHint: /france/i.test(it.location || '') ? 'FR' : undefined,
        contractHints: [],
        url: it.url,
        publishedAt: it.pub_date,
        descriptionHtml: it.description,
        tags: String(it.tags || '').split(',').map((t) => t.trim()).filter(Boolean),
      }));
    ctx.progress?.(`Working Nomads : ${jobs.length} offres développement`);
    return jobs;
  },
};
