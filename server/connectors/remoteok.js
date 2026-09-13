// Remote OK : API JSON publique (le premier élément est une notice légale).
import { getJson } from '../http.js';

export default {
  id: 'remoteok',
  name: 'Remote OK',
  site: 'https://remoteok.com',
  description: 'Offres full remote Remote OK (API publique).',
  async fetch(ctx) {
    const data = await getJson('https://remoteok.com/api', { retries: 1 });
    const jobs = (Array.isArray(data) ? data : []).filter((it) => it && it.id && it.position).map((it) => ({
      sourceId: it.id,
      title: it.position,
      company: it.company,
      location: it.location || 'Remote',
      remoteHint: 'full',
      contractHints: [],
      salaryParts: { min: it.salary_min, max: it.salary_max, currency: '$', period: '/ an' },
      compensation: { salaryMin: it.salary_min, salaryMax: it.salary_max, currency: '$' },
      url: it.url || `https://remoteok.com/remote-jobs/${it.slug || it.id}`,
      publishedAt: it.date || (it.epoch ? Number(it.epoch) : null),
      descriptionHtml: it.description,
      tags: it.tags || [],
    }));
    ctx.progress?.(`Remote OK : ${jobs.length} offres`);
    return jobs;
  },
};
