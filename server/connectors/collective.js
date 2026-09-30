// Collective.work : missions freelance et CDI tech (données de recherche embarquées dans la page, __NEXT_DATA__).
import { getText, sleep } from '../http.js';
import { contractFromLabel } from '../scrape.js';

const BASE = 'https://www.collective.work/jobs/fr';
const QUERIES = ['react', 'node', 'javascript', 'typescript', 'php', 'symfony', 'laravel', '.net', 'c#'];
const REMOTE = { REMOTE: 'full', FULL_REMOTE: 'full', HYBRID: 'partial', ON_SITE: 'none', ONSITE: 'none', OFFICE: 'none' };

export function parseCollective(html) {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return [];
  const nd = JSON.parse(m[1]);
  const q = (nd.props?.pageProps?.dehydratedState?.queries || []).find((x) => JSON.stringify(x.queryKey || '').includes('SearchJobs'));
  return q?.state?.data?.results?.projects || [];
}

function toRaw(p) {
  const contracts = new Set();
  for (const c of p.contractTypes || []) contractFromLabel(String(c).replace(/_/g, ' ')).forEach((x) => contracts.add(x));
  if (p.isPermanentContract) contracts.add('cdi');
  const prefs = (p.workPreferences || []).map((w) => REMOTE[String(w).toUpperCase()]).filter(Boolean);
  const remoteHint = prefs.includes('full') ? 'full' : prefs.includes('partial') ? 'partial' : prefs[0];
  const compensation = {};
  const budget = String(p.budgetBrief || '').match(/\d+(?:[.,]\d+)?/g)?.map(Number) || [];
  if (budget.length && budget[0] >= 100 && budget[0] <= 3000) Object.assign(compensation, { tjmMin: Math.min(...budget), tjmMax: Math.max(...budget) });
  if (p.minSalary || p.maxSalary) {
    const freq = String(p.salaryFrequency || 'Yearly').toLowerCase();
    const mult = /month/.test(freq) ? 12 : 1;
    if (/day|daily/.test(freq)) Object.assign(compensation, { tjmMin: p.minSalary || p.maxSalary, tjmMax: p.maxSalary || p.minSalary });
    else Object.assign(compensation, { salaryMin: (p.minSalary || p.maxSalary) * mult, salaryMax: (p.maxSalary || p.minSalary) * mult });
  }
  return {
    sourceId: p.id,
    title: p.name,
    company: p.company?.name,
    location: p.location?.fullNameFrench || p.location?.fullNameEnglish || '',
    countryHint: /france/i.test(p.location?.fullNameFrench || '') ? 'FR' : undefined,
    remoteHint,
    contractHints: [...contracts],
    compensation: Object.keys(compensation).length ? { ...compensation, currency: '€' } : undefined,
    url: `${BASE}/${p.slug}`,
    publishedAt: p.publishedAt,
    descriptionHtml: p.description || '',
    tags: [...(p.projectTypes || []).map((t) => String(t).replace(/_/g, ' ').toLowerCase()), ...(p.projectTypeSuggestions || [])],
  };
}

export default {
  id: 'collective',
  name: 'Collective.work',
  site: 'https://www.collective.work/jobs/fr',
  description: 'Missions freelance et CDI tech (TJM, télétravail et description complète).',
  async fetch(ctx) {
    const jobs = new Map();
    const pages = Number(process.env.COLLECTIVE_PAGES) || 2;
    for (const q of QUERIES) {
      for (let page = 1; page <= pages; page++) {
        const html = await getText(`${BASE}?search=${encodeURIComponent(q)}${page > 1 ? `&page=${page}` : ''}`, { retries: 1 });
        const projects = parseCollective(html);
        for (const p of projects) if (p?.id && p.slug && !jobs.has(p.id)) jobs.set(p.id, toRaw(p));
        ctx.progress?.(`Collective « ${q} » p${page} : ${projects.length} missions`);
        if (projects.length < 30) break;
        await sleep(600);
      }
      await sleep(500);
    }
    return [...jobs.values()];
  },
};
