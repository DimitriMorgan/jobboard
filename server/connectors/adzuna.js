// Adzuna : agrégateur (Indeed-like) avec API officielle gratuite (ADZUNA_APP_ID / ADZUNA_APP_KEY).
import { getJson } from '../http.js';
import { TECH_QUERIES } from '../normalize.js';

export default {
  id: 'adzuna',
  name: 'Adzuna',
  site: 'https://www.adzuna.fr',
  description: 'Agrégateur Adzuna France via API officielle (nécessite ADZUNA_APP_ID / ADZUNA_APP_KEY).',
  requiresEnv: ['ADZUNA_APP_ID', 'ADZUNA_APP_KEY'],
  async fetch(ctx) {
    const jobs = new Map();
    for (const [tech, keywords] of Object.entries(TECH_QUERIES)) {
      for (const kw of keywords) {
        const params = new URLSearchParams({
          app_id: process.env.ADZUNA_APP_ID, app_key: process.env.ADZUNA_APP_KEY, what: kw, results_per_page: '50', max_days_old: '14', sort_by: 'date', 'content-type': 'application/json',
        });
        const data = await getJson(`https://api.adzuna.com/v1/api/jobs/fr/search/1?${params}`, { retries: 1 });
        for (const it of data?.results || []) {
          const prev = jobs.get(String(it.id));
          if (prev) {
            prev.techHints.push(tech);
            continue;
          }
          jobs.set(String(it.id), {
            sourceId: it.id,
            title: it.title,
            company: it.company?.display_name,
            location: it.location?.display_name,
            countryHint: 'FR',
            contractHints: [it.contract_type === 'permanent' ? 'cdi' : it.contract_type === 'contract' ? 'freelance' : null].filter(Boolean),
            techHints: [tech],
            salaryParts: { min: it.salary_min, max: it.salary_max, currency: '€', period: '/ an' },
            compensation: { salaryMin: it.salary_min, salaryMax: it.salary_max, currency: '€' },
            url: it.redirect_url,
            publishedAt: it.created,
            descriptionText: it.description,
            tags: [it.category?.label].filter(Boolean),
          });
        }
        ctx.progress?.(`Adzuna « ${kw} » : ${(data?.results || []).length} offres`);
      }
    }
    return [...jobs.values()];
  },
};
