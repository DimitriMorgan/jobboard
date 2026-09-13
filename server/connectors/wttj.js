// Welcome to the Jungle : recherche via l'index Algolia public utilisé par le site,
// puis détail (description) via l'API publique api.welcometothejungle.com.
import { postJson, getJson, getText, mapLimit, HttpError } from '../http.js';
import { TECH_QUERIES } from '../normalize.js';

const CONTRACT_MAP = { full_time: 'cdi', freelance: 'freelance', temporary: 'cdd', internship: 'stage', apprenticeship: 'alternance', part_time: 'autre', vie: 'autre' };
const REMOTE_MAP = { fulltime: 'full', partial: 'partial', punctual: 'partial', no: 'none' };

function wttjCompensation(hit) {
  const min = Number(hit.salary_minimum) || null;
  const max = Number(hit.salary_maximum) || null;
  if (!min && !max) return {};
  const period = String(hit.salary_period || 'year').toLowerCase();
  const currency = /usd|\$/i.test(hit.salary_currency || '') ? '$' : /gbp|£/i.test(hit.salary_currency || '') ? '£' : '€';
  if (/day|jour|daily/.test(period)) return { tjmMin: min, tjmMax: max, currency };
  const mult = /month|mois/.test(period) ? 12 : 1;
  return { salaryMin: min && min * mult, salaryMax: max && max * mult, currency };
}

const WTTJ_HEADERS = { origin: 'https://www.welcometothejungle.com', referer: 'https://www.welcometothejungle.com/fr/jobs' };

/** Cherche des clés Algolia (32 hex) dans le HTML de WTTJ et ses bundles JS, à proximité du mot « algolia ». */
async function discoverAlgoliaKeys(appId, log) {
  const candidates = new Set();
  const scan = (text) => {
    const re = /algolia/gi;
    let m;
    while ((m = re.exec(text))) {
      const window = text.slice(Math.max(0, m.index - 400), m.index + 400);
      for (const k of window.match(/\b[a-f0-9]{32}\b/g) || []) candidates.add(k);
    }
  };
  try {
    const html = await getText('https://www.welcometothejungle.com/fr/jobs', { retries: 0 });
    scan(html);
    const scripts = [...html.matchAll(/<script[^>]+src="([^"]+\.js[^"]*)"/g)].map((m) => m[1]).filter((u) => /_next|static|chunks|app/i.test(u)).slice(0, 12);
    await mapLimit(scripts, 4, async (src) => {
      try {
        const url = src.startsWith('http') ? src : `https://www.welcometothejungle.com${src}`;
        const js = await getText(url, { retries: 0, timeoutMs: 15000 });
        if (js.includes(appId) || /algolia/i.test(js)) scan(js);
      } catch {
        /* bundle inaccessible */
      }
    });
  } catch (err) {
    log?.(`Découverte de clé WTTJ impossible : ${err.message}`);
  }
  return [...candidates];
}

export default {
  id: 'wttj',
  name: 'Welcome to the Jungle',
  site: 'https://www.welcometothejungle.com',
  description: 'Offres WTTJ en France (CDI, freelance…), via l’index de recherche Algolia du site.',
  async fetch(ctx) {
    const appId = process.env.WTTJ_ALGOLIA_APP_ID || 'CSEKHVMS53';
    const apiKey = process.env.WTTJ_ALGOLIA_API_KEY || '4bd8f6215d0cc52b26430765769e65a0';
    const index = process.env.WTTJ_ALGOLIA_INDEX || 'wttj_jobs_production_fr';
    const endpoint = `https://${appId.toLowerCase()}-dsn.algolia.net/1/indexes/*/queries`;

    const requests = [];
    const meta = [];
    for (const [tech, keywords] of Object.entries(TECH_QUERIES)) {
      for (const kw of keywords) {
        for (const filters of ['offices.country_code:FR', 'remote:fulltime']) {
          requests.push({
            indexName: index,
            params: new URLSearchParams({ query: kw, hitsPerPage: '100', page: '0', filters, attributesToHighlight: '[]' }).toString(),
          });
          meta.push(tech);
        }
      }
    }
    const query = (key) => postJson(endpoint, { requests }, { headers: { 'x-algolia-application-id': appId, 'x-algolia-api-key': key, ...WTTJ_HEADERS }, retries: 0 });
    let data;
    try {
      data = await query(apiKey);
    } catch (err) {
      if (!(err instanceof HttpError) || (err.status !== 403 && err.status !== 400)) throw err;
      ctx.progress?.('Clé Algolia refusée, recherche d’une clé à jour dans le site WTTJ…');
      const keys = (await discoverAlgoliaKeys(appId, ctx.progress)).filter((k) => k !== apiKey);
      for (const key of keys) {
        try {
          data = await query(key);
          ctx.progress?.(`Clé Algolia WTTJ trouvée automatiquement (${key.slice(0, 6)}…). Pensez à la reporter dans WTTJ_ALGOLIA_API_KEY.`);
          break;
        } catch {
          /* clé suivante */
        }
      }
      if (!data) throw new Error(`Algolia WTTJ : clé refusée (${err.status}) et aucune clé valide trouvée dans le site. Mettez à jour WTTJ_ALGOLIA_API_KEY (variable du dépôt ou .env).`);
    }
    const jobs = new Map();
    (data.results || []).forEach((res, i) => {
      const tech = meta[i];
      for (const hit of res.hits || []) {
        const id = hit.objectID || hit.reference || hit.slug;
        if (!id) continue;
        const prev = jobs.get(String(id));
        if (prev) {
          prev.techHints.push(tech);
          continue;
        }
        const orgSlug = hit.organization?.slug;
        const offices = (hit.offices || []).map((o) => [o.city, o.country_code].filter(Boolean).join(' ')).filter(Boolean);
        const hasFR = (hit.offices || []).some((o) => o.country_code === 'FR');
        jobs.set(String(id), {
          sourceId: id,
          title: hit.name,
          company: hit.organization?.name,
          location: offices.slice(0, 3).join(' · '),
          countryHint: hasFR ? 'FR' : undefined,
          remoteHint: REMOTE_MAP[hit.remote],
          contractHints: [CONTRACT_MAP[hit.contract_type] || 'autre'],
          techHints: [tech],
          salaryParts: { min: hit.salary_minimum, max: hit.salary_maximum, currency: hit.salary_currency || '€', period: hit.salary_period ? `/ ${hit.salary_period}` : '' },
          compensation: wttjCompensation(hit),
          url: orgSlug && hit.slug ? `https://www.welcometothejungle.com/fr/companies/${orgSlug}/jobs/${hit.slug}` : `https://www.welcometothejungle.com/fr/jobs?query=${encodeURIComponent(hit.name)}`,
          publishedAt: hit.published_at,
          descriptionHtml: hit.description || '',
          tags: [hit.profession?.name, hit.experience_level_minimum ? `Expérience min. ${hit.experience_level_minimum} an(s)` : null].filter(Boolean),
          _orgSlug: orgSlug,
          _slug: hit.slug,
        });
      }
    });
    ctx.progress?.(`WTTJ : ${jobs.size} offres uniques`);

    // Détails (description) pour les nouvelles offres.
    const limit = Number(process.env.DETAIL_FETCH_LIMIT ?? 40);
    const toDetail = [...jobs.values()].filter((j) => j._orgSlug && j._slug && !ctx.isKnown(j.sourceId)).slice(0, limit);
    await mapLimit(toDetail, 3, async (job) => {
      try {
        const d = await getJson(`https://api.welcometothejungle.com/api/v1/organizations/${job._orgSlug}/jobs/${job._slug}`, { retries: 0 });
        const j = d.job || d;
        job.descriptionHtml = [j.description, j.profile, j.recruitment_process].filter(Boolean).join('<hr>') || job.descriptionHtml;
        job.applyUrl = j.apply_url || null;
      } catch {
        /* détail indisponible : on garde la fiche courte */
      }
    });
    return [...jobs.values()].map(({ _orgSlug, _slug, ...j }) => j);
  },
};
