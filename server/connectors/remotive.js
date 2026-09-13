// Remotive : API publique d'offres 100 % remote (catégorie développement logiciel).
import { getJson } from '../http.js';

export default {
  id: 'remotive',
  name: 'Remotive',
  site: 'https://remotive.com',
  description: 'Offres full remote (API publique Remotive, catégorie software-dev).',
  async fetch(ctx) {
    const data = await getJson('https://remotive.com/api/remote-jobs?category=software-dev&limit=300', { retries: 1 });
    const jobs = (data?.jobs || []).map((it) => ({
      sourceId: it.id,
      title: it.title,
      company: it.company_name,
      location: it.candidate_required_location || 'Remote',
      remoteHint: 'full',
      contractHints: [it.job_type === 'full_time' ? 'cdi' : /contract|freelance/i.test(it.job_type || '') ? 'freelance' : null].filter(Boolean),
      salary: it.salary,
      url: it.url,
      publishedAt: it.publication_date,
      descriptionHtml: it.description,
      tags: it.tags || [],
    }));
    ctx.progress?.(`Remotive : ${jobs.length} offres`);
    return jobs;
  },
};
