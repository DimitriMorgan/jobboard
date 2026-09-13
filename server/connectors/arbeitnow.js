// Arbeitnow : job board européen avec API publique (beaucoup d'offres remote / EU).
import { getJson } from '../http.js';

export default {
  id: 'arbeitnow',
  name: 'Arbeitnow',
  site: 'https://www.arbeitnow.com',
  description: 'Job board européen (API publique), offres remote et Europe.',
  async fetch(ctx) {
    const jobs = [];
    let url = 'https://www.arbeitnow.com/api/job-board-api?page=1';
    for (let page = 0; page < 4 && url; page++) {
      const data = await getJson(url, { retries: 1 });
      for (const it of data?.data || []) {
        jobs.push({
          sourceId: it.slug,
          title: it.title,
          company: it.company_name,
          location: it.location,
          remoteHint: it.remote ? 'full' : undefined,
          contractHints: (it.job_types || []).map((t) => (/full/i.test(t) ? 'cdi' : /contract|freelance/i.test(t) ? 'freelance' : /intern/i.test(t) ? 'stage' : null)).filter(Boolean),
          url: it.url,
          publishedAt: it.created_at,
          descriptionHtml: it.description,
          tags: it.tags || [],
        });
      }
      url = data?.links?.next || null;
    }
    ctx.progress?.(`Arbeitnow : ${jobs.length} offres`);
    return jobs;
  },
};
