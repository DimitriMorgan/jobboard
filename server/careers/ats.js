// Lecteurs des plateformes de recrutement utilisées par les sites carrières des entreprises.
// Chaque plateforme expose publiquement la liste des offres d'une entreprise (c'est ce qu'affiche sa page carrière).
//
// Un lecteur renvoie { name, careersUrl, jobs: [{ id, title, location, country, remote, url, descriptionHtml,
// publishedAt, employment, compensation }] } et lève une HttpError 404 si l'entreprise n'existe pas sur la plateforme.
import * as cheerio from 'cheerio';
import { getJson, getText, HttpError } from '../http.js';

const OPTS = { retries: 1, timeoutMs: 20000 };
const iso = (v) => {
  if (v == null || v === '') return undefined;
  const d = new Date(typeof v === 'number' || /^\d+$/.test(String(v)) ? Number(v) : v);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
};
const prettyName = (slug) =>
  String(slug)
    .replace(/[-_]+/g, ' ')
    .replace(/\d+$/, '')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());

/** Rémunération annuelle ou journalière à partir de min / max / période. */
function comp(min, max, currency, period) {
  const lo = Number(min) || null;
  const hi = Number(max) || null;
  if (!lo && !hi) return undefined;
  const p = String(period || '').toLowerCase();
  const cur = currency === 'EUR' || !currency ? '€' : currency;
  if (/day|jour|daily/.test(p)) return { tjmMin: lo, tjmMax: hi, currency: cur };
  if (/month|mois/.test(p)) return { salaryMin: lo && lo * 12, salaryMax: hi && hi * 12, currency: cur };
  if (/hour|heure/.test(p)) return undefined;
  return { salaryMin: lo, salaryMax: hi, currency: cur };
}

function lever(region) {
  const api = region === 'eu' ? 'https://api.eu.lever.co' : 'https://api.lever.co';
  const site = region === 'eu' ? 'https://jobs.eu.lever.co' : 'https://jobs.lever.co';
  return {
    id: region === 'eu' ? 'lever-eu' : 'lever',
    label: 'Lever',
    careersUrl: (slug) => `${site}/${slug}`,
    async fetch(slug) {
      const data = await getJson(`${api}/v0/postings/${encodeURIComponent(slug)}?mode=json`, OPTS);
      const jobs = (Array.isArray(data) ? data : []).map((j) => ({
        id: j.id,
        title: j.text,
        location: [j.categories?.location, ...(j.categories?.allLocations || [])].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' · '),
        country: j.country,
        remote: j.workplaceType === 'remote',
        workplace: j.workplaceType,
        url: j.hostedUrl,
        descriptionHtml: [j.description || j.opening, ...(j.lists || []).map((l) => `<h3>${l.text}</h3><ul>${l.content}</ul>`), j.additional].filter(Boolean).join('\n'),
        publishedAt: iso(j.createdAt),
        employment: j.categories?.commitment,
        compensation: j.salaryRange ? comp(j.salaryRange.min, j.salaryRange.max, j.salaryRange.currency, j.salaryRange.interval) : undefined,
      }));
      return { name: null, careersUrl: `${site}/${slug}`, jobs };
    },
  };
}

const greenhouse = {
  id: 'greenhouse',
  label: 'Greenhouse',
  careersUrl: (slug) => `https://job-boards.greenhouse.io/${slug}`,
  async fetch(slug) {
    const data = await getJson(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`, OPTS);
    const decode = (html) => cheerio.load(`<t>${html || ''}</t>`, null, false)('t').text();
    const jobs = (data.jobs || []).map((j) => ({
      id: String(j.id),
      title: j.title,
      location: [j.location?.name, ...(j.offices || []).map((o) => o.location || o.name)].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' · '),
      remote: /remote/i.test(j.location?.name || ''),
      url: j.absolute_url,
      descriptionHtml: decode(j.content),
      publishedAt: iso(j.first_published || j.updated_at),
      employment: (j.metadata || []).map((m) => (typeof m.value === 'string' ? m.value : '')).join(' '),
    }));
    const origin = data.jobs?.[0]?.absolute_url ? new URL(data.jobs[0].absolute_url).origin : 'https://job-boards.greenhouse.io';
    return { name: data.jobs?.[0]?.company_name || null, careersUrl: `${origin}/${slug}`, jobs };
  },
};

const ashby = {
  id: 'ashby',
  label: 'Ashby',
  careersUrl: (slug) => `https://jobs.ashbyhq.com/${slug}`,
  async fetch(slug) {
    const data = await getJson(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}?includeCompensation=true`, OPTS);
    const jobs = (data.jobs || [])
      .filter((j) => j.isListed !== false)
      .map((j) => {
        const sal = (j.compensation?.summaryComponents || []).find((c) => /salary/i.test(c.compensationType || ''));
        return {
          id: j.id,
          title: j.title,
          location: [j.location, ...(j.secondaryLocations || []).map((l) => l.location)].filter(Boolean).join(' · '),
          country: j.address?.postalAddress?.addressCountry,
          remote: !!j.isRemote || /remote/i.test(j.workplaceType || ''),
          url: j.jobUrl,
          descriptionHtml: j.descriptionHtml,
          publishedAt: iso(j.publishedAt),
          employment: j.employmentType,
          compensation: sal ? comp(sal.minValue, sal.maxValue, sal.currencyCode, sal.interval) : undefined,
        };
      });
    return { name: data.organizationName || data.name || null, careersUrl: `https://jobs.ashbyhq.com/${slug}`, jobs };
  },
};

const recruitee = {
  id: 'recruitee',
  label: 'Recruitee',
  careersUrl: (slug) => `https://${slug}.recruitee.com/`,
  async fetch(slug) {
    const data = await getJson(`https://${slug}.recruitee.com/api/offers/`, OPTS);
    const jobs = (data.offers || []).map((j) => ({
      id: String(j.id),
      title: j.title,
      location: j.location || [j.city, j.country].filter(Boolean).join(', '),
      country: j.country_code,
      remote: !!j.remote,
      url: j.careers_url,
      descriptionHtml: [j.description, j.requirements].filter(Boolean).join('\n'),
      publishedAt: iso(j.published_at || j.created_at),
      employment: j.employment_type_code,
      compensation: j.salary ? comp(j.salary.min, j.salary.max, j.salary.currency, j.salary.period) : undefined,
    }));
    return { name: data.offers?.[0]?.company_name || null, careersUrl: `https://${slug}.recruitee.com/`, jobs };
  },
};

const workable = {
  id: 'workable',
  label: 'Workable',
  careersUrl: (slug) => `https://apply.workable.com/${slug}/`,
  async fetch(slug) {
    const data = await getJson(`https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(slug)}?details=true`, OPTS);
    const jobs = (data.jobs || []).map((j) => ({
      id: j.shortcode || j.code || j.url,
      title: j.title,
      location: (j.locations?.length ? j.locations.map((l) => [l.city, l.region, l.country].filter(Boolean).join(', ')) : [[j.city, j.state, j.country].filter(Boolean).join(', ')]).join(' · '),
      country: j.locations?.[0]?.countryCode || j.country,
      remote: !!j.telecommuting,
      url: j.url || j.shortlink,
      descriptionHtml: j.description,
      publishedAt: iso(j.published_on || j.created_at),
      employment: j.employment_type,
    }));
    return { name: data.name || null, careersUrl: `https://apply.workable.com/${slug}/`, jobs };
  },
};

const smartrecruiters = {
  id: 'smartrecruiters',
  label: 'SmartRecruiters',
  careersUrl: (slug) => `https://jobs.smartrecruiters.com/${slug}`,
  async fetch(slug) {
    const all = [];
    for (let offset = 0; offset < 1000; offset += 100) {
      const data = await getJson(`https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(slug)}/postings?limit=100&offset=${offset}`, OPTS);
      all.push(...(data.content || []));
      if (!data.content?.length || all.length >= (data.totalFound || 0)) break;
    }
    // Entreprise inexistante : l'API répond une liste vide plutôt qu'une 404.
    if (!all.length) throw new HttpError(404, slug, 'aucune offre');
    const jobs = all.map((j) => ({
      id: j.id,
      title: j.name,
      location: j.location?.fullLocation || [j.location?.city, j.location?.country].filter(Boolean).join(', '),
      country: j.location?.country,
      remote: !!j.location?.remote,
      url: `https://jobs.smartrecruiters.com/${slug}/${j.id}`,
      detailUrl: j.ref,
      descriptionHtml: '',
      publishedAt: iso(j.releasedDate),
      employment: j.typeOfEmployment?.label,
    }));
    return { name: all[0]?.company?.name || null, careersUrl: `https://jobs.smartrecruiters.com/${slug}`, jobs };
  },
  /** La liste ne contient pas la description : lue offre par offre, seulement pour les offres retenues. */
  async detail(job) {
    if (!job.detailUrl) return job;
    const d = await getJson(job.detailUrl, OPTS);
    const s = d.jobAd?.sections || {};
    job.descriptionHtml = [s.jobDescription, s.qualifications, s.additionalInformation].map((x) => x?.text).filter(Boolean).join('\n');
    if (d.postingUrl) job.url = d.postingUrl;
    return job;
  },
};

const personio = {
  id: 'personio',
  label: 'Personio',
  careersUrl: (slug) => `https://${slug}.jobs.personio.de/`,
  async fetch(slug) {
    const xml = await getText(`https://${slug}.jobs.personio.de/xml?language=fr`, OPTS);
    const $ = cheerio.load(xml, { xmlMode: true });
    if (!$('workzag-jobs').length && !$('position').length) throw new HttpError(404, slug, 'pas de flux');
    const jobs = $('position')
      .toArray()
      .map((el) => {
        const p = $(el);
        const desc = p
          .find('jobDescription')
          .toArray()
          .map((d) => `<h3>${$(d).find('name').text()}</h3>${$(d).find('value').text()}`)
          .join('\n');
        const id = p.find('id').first().text();
        return {
          id,
          title: p.find('name').first().text(),
          location: [p.find('office').first().text(), ...p.find('additionalOffices office').toArray().map((o) => $(o).text())].filter(Boolean).join(' · '),
          remote: /remote/i.test(p.find('office').text()),
          url: `https://${slug}.jobs.personio.de/job/${id}`,
          descriptionHtml: desc,
          publishedAt: iso(p.find('createdAt').first().text()),
          employment: `${p.find('employmentType').first().text()} ${p.find('schedule').first().text()}`,
        };
      });
    return { name: $('position subcompany').first().text() || null, careersUrl: `https://${slug}.jobs.personio.de/`, jobs };
  },
};

const teamtailor = {
  id: 'teamtailor',
  label: 'Teamtailor',
  careersUrl: (slug) => `https://${slug}.teamtailor.com/jobs`,
  async fetch(slug) {
    const xml = await getText(`https://${slug}.teamtailor.com/jobs.rss`, OPTS);
    const $ = cheerio.load(xml, { xmlMode: true });
    if (!$('rss').length) throw new HttpError(404, slug, 'pas de flux');
    const jobs = $('item')
      .toArray()
      .map((el) => {
        const it = $(el);
        // Lieux dans l'espace de noms tt: (tt:locations > tt:location > ville, pays…) : on prend tout leur texte.
        const places = it
          .children()
          .toArray()
          .filter((c) => /location/i.test(c.tagName || c.name || ''))
          .map((c) => $(c).text().replace(/\s+/g, ' ').trim())
          .filter(Boolean);
        const link = it.find('link').first().text().trim();
        const raw = $.xml(el);
        return {
          id: (it.find('guid').first().text() || link).split('/').filter(Boolean).pop(),
          title: it.find('title').first().text().trim(),
          location: places.join(' · '),
          remote: /remote|t[ée]l[ée]travail|fully_remote/i.test(raw.replace(/<description>[\s\S]*?<\/description>/, '')),
          url: link,
          descriptionHtml: it.find('description').first().text(),
          publishedAt: iso(it.find('pubDate').first().text()),
          employment: it.children().toArray().filter((c) => /employment|type/i.test(c.tagName || '')).map((c) => $(c).text()).join(' '),
        };
      });
    return { name: $('channel > title').first().text().trim() || null, careersUrl: `https://${slug}.teamtailor.com/jobs`, jobs };
  },
};

export const ATS = { lever: lever('us'), 'lever-eu': lever('eu'), greenhouse, ashby, recruitee, teamtailor, workable, smartrecruiters, personio };

/** Libellé de la plateforme pour l'affichage. */
export const atsLabel = (id) => ATS[id]?.label || id;
export { prettyName };

/** Reconnaît l'adresse d'une page carrière hébergée par une plateforme : { ats, slug } ou null. */
export function parseCareersUrl(input) {
  let u;
  try {
    u = new URL(String(input).trim());
  } catch {
    return null;
  }
  const h = u.hostname.toLowerCase();
  const seg = u.pathname.split('/').filter(Boolean);
  const sub = h.split('.')[0];
  if (h === 'jobs.lever.co' && seg[0]) return { ats: 'lever', slug: seg[0].toLowerCase() };
  if (h === 'jobs.eu.lever.co' && seg[0]) return { ats: 'lever-eu', slug: seg[0].toLowerCase() };
  if (/(^|\.)greenhouse\.io$/.test(h) && seg[0] && !/^(embed|v1)$/.test(seg[0])) return { ats: 'greenhouse', slug: seg[0].toLowerCase() };
  if (/(^|\.)greenhouse\.io$/.test(h) && u.searchParams.get('for')) return { ats: 'greenhouse', slug: u.searchParams.get('for').toLowerCase() };
  if (h === 'jobs.ashbyhq.com' && seg[0]) return { ats: 'ashby', slug: decodeURIComponent(seg[0]).toLowerCase() };
  if (h.endsWith('.recruitee.com') && sub !== 'www') return { ats: 'recruitee', slug: sub };
  if (h.endsWith('.teamtailor.com') && !/^(www|app|career|assets|status|support|docs)$/.test(sub)) return { ats: 'teamtailor', slug: sub };
  if (h === 'apply.workable.com' && seg[0] && seg[0] !== 'api') return { ats: 'workable', slug: seg[0].toLowerCase() };
  // SmartRecruiters ignore la casse (« ALTEN » = « alten ») : identifiant en minuscules pour éviter les doublons.
  if (/^(jobs|careers)\.smartrecruiters\.com$/.test(h) && seg[0]) return { ats: 'smartrecruiters', slug: seg[0].toLowerCase() };
  if (/\.jobs\.personio\.(de|com)$/.test(h)) return { ats: 'personio', slug: sub };
  return null;
}

/** Repère les liens vers des plateformes de recrutement dans un texte ou une page HTML (page carrière d'un site maison…). */
export function findCareersLinks(text) {
  const out = new Map();
  const re = /https?:\/\/(?:jobs\.(?:eu\.)?lever\.co\/[\w.-]+|(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io\/(?:embed\/job_board\?for=)?[\w.-]+|jobs\.ashbyhq\.com\/[\w.%-]+|[\w-]+\.recruitee\.com|[\w-]+\.teamtailor\.com|apply\.workable\.com\/[\w-]+|(?:jobs|careers)\.smartrecruiters\.com\/[\w-]+|[\w-]+\.jobs\.personio\.(?:de|com))/gi;
  for (const m of String(text || '').matchAll(re)) {
    const p = parseCareersUrl(m[0]);
    if (p && !/^(api|www|embed|static|assets|jobs|careers|v0|v1|search)$/i.test(p.slug)) out.set(`${p.ats}:${p.slug}`, p);
  }
  return [...out.values()];
}
