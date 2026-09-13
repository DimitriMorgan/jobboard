// Himalayas : API publique d'offres remote.
import { getJson } from '../http.js';

export default {
  id: 'himalayas',
  name: 'Himalayas',
  site: 'https://himalayas.app',
  description: 'Offres remote Himalayas (API publique).',
  async fetch(ctx) {
    const jobs = [];
    for (let offset = 0; offset < 400; offset += 100) {
      const data = await getJson(`https://himalayas.app/jobs/api?limit=100&offset=${offset}`, { retries: 1 });
      const items = data?.jobs || [];
      for (const it of items) {
        const url = it.applicationLink || it.url;
        if (!url) continue;
        jobs.push({
          sourceId: it.guid || it.id || url,
          title: it.title,
          company: it.companyName,
          location: (it.locationRestrictions || []).join(', ') || 'Remote',
          countryHint: (it.locationRestrictions || []).some((l) => /france/i.test(l)) ? 'FR' : undefined,
          remoteHint: 'full',
          contractHints: [/full/i.test(it.employmentType || '') ? 'cdi' : /contract|freelance/i.test(it.employmentType || '') ? 'freelance' : null].filter(Boolean),
          salaryParts: { min: it.minSalary, max: it.maxSalary, currency: it.currency || '$', period: '/ an' },
          url,
          publishedAt: it.pubDate,
          descriptionHtml: it.description || it.excerpt,
          tags: [...(it.categories || []), it.seniority].flat().filter(Boolean),
        });
      }
      if (items.length < 100) break;
    }
    ctx.progress?.(`Himalayas : ${jobs.length} offres`);
    return jobs;
  },
};
