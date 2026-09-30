// Meteojob : moteur de recherche d'emploi français (données de recherche embarquées : script « candidate-front-state »).
import { getText, sleep } from '../http.js';
import { contractFromLabel, remoteFromLabel } from '../scrape.js';

const QUERIES = ['développeur react', 'développeur node.js', 'développeur javascript', 'développeur php', 'développeur symfony', 'développeur .net', 'développeur c#'];

export function parseMeteojob(html) {
  const m = html.match(/<script id="candidate-front-state" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) return [];
  const state = JSON.parse(m[1]);
  return state['app:search:offers']?.content || [];
}

const pick = (o, re) => Object.entries(o || {}).find(([k, v]) => re.test(k) && v != null && v !== '')?.[1];

function salaryOf(o) {
  const s = pick(o, /salary/i);
  if (!s) return {};
  if (typeof s === 'string') return { salary: s };
  const min = Number(s.min ?? s.minimum ?? s.from ?? s.value) || null;
  const max = Number(s.max ?? s.maximum ?? s.to ?? s.value) || null;
  const period = String(s.period ?? s.unit ?? s.frequency ?? '').toLowerCase();
  if (!min && !max) return {};
  if (/day|jour/.test(period)) return { compensation: { tjmMin: min, tjmMax: max, currency: '€' } };
  const mult = /month|mois/.test(period) ? 12 : 1;
  return { compensation: { salaryMin: min && min * mult, salaryMax: max && max * mult, currency: '€' } };
}

function toRaw(o) {
  const loc = (o.locations || [])[0] || {};
  const contractLabels = (o.labels?.contractTypeList || []).map((c) => c.value).join(' ');
  const telework = [o.labels?.teleworkList?.map?.((t) => t.value).join(' '), pick(o, /telework/i)?.label, typeof pick(o, /telework/i) === 'string' ? pick(o, /telework/i) : ''].filter(Boolean).join(' ');
  const company = typeof o.company === 'string' ? o.company : o.company?.name || o.company?.label || '';
  return {
    sourceId: o.id,
    title: o.title,
    company,
    location: loc.name && /\(\d{2,3}\)/.test(loc.name) ? loc.name : [loc.name, loc.admin2Code ? `(${loc.admin2Code})` : ''].filter(Boolean).join(' '),
    countryHint: !loc.countryCode || loc.countryCode === 'FR' ? 'FR' : undefined,
    contractHints: contractFromLabel(contractLabels),
    remoteHint: remoteFromLabel(telework),
    url: `https://www.meteojob.com/jobs/${o.id}`,
    publishedAt: o.publicationDate || o.lastModification,
    descriptionHtml: [o.description, o.profileDescription, o.companyDescription].filter(Boolean).join('<hr>'),
    tags: [...(o.labels?.jobList || []).map((j) => j.value), ...(o.labels?.experienceLevelList || []).map((e) => e.value)].filter(Boolean),
    ...salaryOf(o),
  };
}

export default {
  id: 'meteojob',
  name: 'Meteojob',
  site: 'https://www.meteojob.com',
  description: 'Moteur de recherche d’emploi français (CDI, CDD, intérim, freelance), description complète.',
  async fetch(ctx) {
    const jobs = new Map();
    const pages = Number(process.env.METEOJOB_PAGES) || 2;
    for (const q of QUERIES) {
      for (let page = 1; page <= pages; page++) {
        const html = await getText(`https://www.meteojob.com/jobs?what=${encodeURIComponent(q)}&where=France${page > 1 ? `&page=${page}` : ''}`, { retries: 1 });
        const offers = parseMeteojob(html);
        for (const o of offers) if (o?.id && !jobs.has(String(o.id))) jobs.set(String(o.id), toRaw(o));
        ctx.progress?.(`Meteojob « ${q} » p${page} : ${offers.length} offres`);
        if (offers.length < 20) break;
        await sleep(700);
      }
    }
    return [...jobs.values()];
  },
};
