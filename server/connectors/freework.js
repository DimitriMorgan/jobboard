// Free-Work (ex Freelance-info / Carrière-info) : API JSON publique utilisée par le site.
import { getJson } from '../http.js';
import { TECH_QUERIES } from '../normalize.js';

const API = 'https://www.free-work.com/api/job_postings';
const CONTRACT_MAP = { contractor: 'freelance', permanent: 'cdi', 'fixed-term': 'cdd', internship: 'stage', apprenticeship: 'alternance', temporary: 'interim' };
const REMOTE_MAP = { full: 'full', partial: 'partial', none: 'none' };

export default {
  id: 'freework',
  name: 'Free-Work',
  site: 'https://www.free-work.com',
  description: 'Missions freelance et CDI IT en France (API JSON du site).',
  async fetch(ctx) {
    const jobs = new Map();
    for (const [tech, keywords] of Object.entries(TECH_QUERIES)) {
      for (const kw of keywords) {
        const url = `${API}?page=1&itemsPerPage=100&searchKeywords=${encodeURIComponent(kw)}&contracts=contractor,permanent,fixed-term&order=date`;
        const data = await getJson(url, { headers: { accept: 'application/ld+json, application/json' }, retries: 1 });
        const items = data?.['hydra:member'] || data?.member || data?.items || (Array.isArray(data) ? data : []);
        for (const it of items) {
          const id = it.id ?? it['@id']?.split('/').pop();
          if (!id) continue;
          const prev = jobs.get(String(id));
          if (prev) {
            prev.techHints.push(tech);
            continue;
          }
          const jobSlug = it.job?.slug || it.jobProfile?.slug || 'developpeur';
          const daily = it.minDailySalary || it.maxDailySalary;
          const annual = it.minAnnualSalary || it.maxAnnualSalary;
          const salaryBits = [];
          if (daily) salaryBits.push(`${[it.minDailySalary, it.maxDailySalary].filter(Boolean).map((n) => Math.round(n).toLocaleString('fr-FR')).join(' - ')} €/jour`);
          if (annual) salaryBits.push(`${[it.minAnnualSalary, it.maxAnnualSalary].filter(Boolean).map((n) => Math.round(n).toLocaleString('fr-FR')).join(' - ')} €/an`);
          jobs.set(String(id), {
            sourceId: id,
            title: it.title,
            company: it.company?.name,
            location: it.location?.label || [it.location?.locality, it.location?.adminLevel1, it.location?.country].filter(Boolean).join(', '),
            countryHint: !it.location?.countryCode || it.location.countryCode === 'FR' ? 'FR' : undefined,
            remoteHint: REMOTE_MAP[it.remoteMode],
            contractHints: (it.contracts || []).map((c) => CONTRACT_MAP[c] || 'autre'),
            techHints: [tech],
            salary: salaryBits.join(' · '),
            url: it.slug ? `https://www.free-work.com/fr/tech-it/${jobSlug}/job-mission/${it.slug}` : `https://www.free-work.com/fr/tech-it/jobs?query=${encodeURIComponent(it.title)}`,
            publishedAt: it.publishedAt || it.createdAt || it.updatedAt,
            descriptionHtml: [it.description, it.candidateProfile, it.companyDescription].filter(Boolean).join('<hr>'),
            tags: [...(it.skills || []).map((s) => s.name || s), ...(it.softSkills || []).map((s) => s.name || s)].filter((s) => typeof s === 'string'),
          });
        }
        ctx.progress?.(`Free-Work « ${kw} » : ${items.length} offres`);
      }
    }
    return [...jobs.values()];
  },
};
