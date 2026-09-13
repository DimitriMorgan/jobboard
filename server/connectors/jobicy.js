// Jobicy : API publique d'offres remote, filtrable par tag et zone géographique.
import { getJson } from '../http.js';

const TAGS = ['javascript', 'react', 'php', 'node', 'dotnet'];

export default {
  id: 'jobicy',
  name: 'Jobicy',
  site: 'https://jobicy.com',
  description: 'Offres remote Jobicy (API publique), Europe / France.',
  async fetch(ctx) {
    const jobs = new Map();
    for (const geo of ['france', 'europe']) {
      for (const tag of TAGS) {
        const data = await getJson(`https://jobicy.com/api/v2/remote-jobs?count=50&geo=${geo}&tag=${encodeURIComponent(tag)}`, { retries: 1 });
        for (const it of data?.jobs || []) {
          if (jobs.has(String(it.id))) continue;
          jobs.set(String(it.id), {
            sourceId: it.id,
            title: it.jobTitle,
            company: it.companyName,
            location: it.jobGeo || 'Remote',
            countryHint: /france/i.test(it.jobGeo || '') ? 'FR' : undefined,
            remoteHint: 'full',
            contractHints: (Array.isArray(it.jobType) ? it.jobType : [it.jobType]).map((t) => (/full/i.test(t || '') ? 'cdi' : /contract|freelance/i.test(t || '') ? 'freelance' : null)).filter(Boolean),
            salaryParts: { min: it.annualSalaryMin, max: it.annualSalaryMax, currency: it.salaryCurrency || '€', period: '/ an' },
            url: it.url,
            publishedAt: it.pubDate,
            descriptionHtml: it.jobDescription || it.jobExcerpt,
            tags: [it.jobIndustry, it.jobLevel].flat().filter(Boolean),
          });
        }
      }
    }
    ctx.progress?.(`Jobicy : ${jobs.size} offres`);
    return [...jobs.values()];
  },
};
