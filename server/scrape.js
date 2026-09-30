// Utilitaires d'extraction communs aux connecteurs qui lisent des pages HTML (JSON-LD, dates en français…).
import * as cheerio from 'cheerio';

/** Parse JSON tolérant : retire les caractères de contrôle bruts que certains sites laissent dans leurs blocs JSON-LD. */
export function looseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return JSON.parse(String(text).replace(/[\u0000-\u001f]+/g, ' '));
  }
}

/** Tous les objets JSON-LD d'une page, à plat (@graph et ItemList dépliés). */
export function jsonLd(html) {
  const $ = typeof html === 'string' ? cheerio.load(html) : html;
  const out = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    let data;
    try {
      data = looseJson($(el).contents().text().trim());
    } catch {
      return;
    }
    const stack = Array.isArray(data) ? [...data] : [data];
    while (stack.length) {
      const d = stack.shift();
      if (!d || typeof d !== 'object') continue;
      out.push(d);
      if (Array.isArray(d['@graph'])) stack.push(...d['@graph']);
      if (Array.isArray(d.itemListElement)) for (const it of d.itemListElement) stack.push(it?.item || it);
    }
  });
  return out;
}

export const isType = (d, type) => [].concat(d?.['@type'] || []).includes(type);
export const jobPostings = (html) => jsonLd(html).filter((d) => isType(d, 'JobPosting'));

/** Décode les entités HTML d'un texte court (titres JSON-LD du type « R&eacute;seaux »). */
export function decodeText(s) {
  if (!s) return '';
  return cheerio.load(`<p>${String(s)}</p>`)('p').text().replace(/\s+/g, ' ').trim();
}

const EMPLOYMENT = { FULL_TIME: 'cdi', CONTRACTOR: 'freelance', TEMPORARY: 'cdd', INTERN: 'stage', INTERNSHIP: 'stage', PER_DIEM: 'freelance' };

/** Convertit un JobPosting schema.org en offre brute (champs communs aux connecteurs). */
export function fromJobPosting(jp) {
  const addr = [].concat(jp.jobLocation || [])[0]?.address || {};
  const types = [].concat(jp.employmentType || []).map((t) => EMPLOYMENT[String(t).toUpperCase()]).filter(Boolean);
  const v = jp.baseSalary?.value || {};
  const unit = String(v.unitText || jp.baseSalary?.unitText || '').toUpperCase();
  const min = Number(v.minValue ?? v.value) || null;
  const max = Number(v.maxValue ?? v.value) || null;
  const currency = /USD/.test(jp.baseSalary?.currency || '') ? '$' : /GBP/.test(jp.baseSalary?.currency || '') ? '£' : '€';
  let compensation;
  if (min || max) {
    if (unit === 'DAY') compensation = { tjmMin: min, tjmMax: max, currency };
    else if (unit === 'MONTH') compensation = { salaryMin: min && min * 12, salaryMax: max && max * 12, currency };
    else if (unit === 'YEAR' || !unit) compensation = { salaryMin: min, salaryMax: max, currency };
  }
  return {
    title: decodeText(jp.title),
    company: decodeText(jp.hiringOrganization?.name),
    location: [addr.addressLocality, addr.postalCode].filter(Boolean).join(' ') || addr.addressRegion || '',
    countryHint: !addr.addressCountry || /^(FR|France)$/i.test(addr.addressCountry) ? 'FR' : undefined,
    contractHints: types,
    compensation,
    publishedAt: jp.datePosted,
    descriptionHtml: jp.description || '',
    remoteHint: /TELECOMMUTE/i.test(jp.jobLocationType || '') ? 'full' : undefined,
  };
}

const MONTHS = { janvier: 0, fevrier: 1, février: 1, mars: 2, avril: 3, mai: 4, juin: 5, juillet: 6, aout: 7, août: 7, septembre: 8, octobre: 9, novembre: 10, decembre: 11, décembre: 11 };

/** Dates en français : « 25 septembre », « 30 septembre 2026 », « il y a 5 jours », « aujourd'hui », « hier ». */
export function parseFrenchDate(text, now = new Date()) {
  const t = String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!t) return null;
  const day = 86400e3;
  if (/aujourd|à l'instant|il y a \d+ ?(?:min|h|heure)/.test(t)) return new Date(now).toISOString();
  if (/\bhier\b/.test(t)) return new Date(now - day).toISOString();
  let m = t.match(/il y a (\d+) ?(jours?|j\b|semaines?|sem\.?|mois)/);
  if (m) return new Date(now - Number(m[1]) * (/^j/.test(m[2]) ? day : /^sem/.test(m[2]) ? 7 * day : 30 * day)).toISOString();
  m = t.match(/(\d{1,2})(?:er)? (janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[ûu]t|septembre|octobre|novembre|d[ée]cembre)(?: (\d{4}))?/);
  if (m) {
    const month = MONTHS[m[2]] ?? MONTHS[m[2].normalize('NFD').replace(/[̀-ͯ]/g, '')];
    let year = m[3] ? Number(m[3]) : now.getUTCFullYear();
    let d = new Date(Date.UTC(year, month, Number(m[1]), 12));
    if (!m[3] && d - now > 2 * day) d = new Date(Date.UTC(year - 1, month, Number(m[1]), 12));
    return d.toISOString();
  }
  m = t.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12)).toISOString();
  return null;
}

/** Contrat d'après un libellé court (« CDI », « Intérim », « Indépendant », « Temps plein »…). */
export function contractFromLabel(label) {
  const l = String(label || '').toLowerCase();
  const out = [];
  if (/\bcdi\b|permanent|ind[ée]termin/.test(l)) out.push('cdi');
  if (/free-?lance|ind[ée]pendant|portage|contractor|mission/.test(l)) out.push('freelance');
  if (/\bcdd\b|d[ée]termin[ée]e|temporaire|temporary/.test(l)) out.push('cdd');
  if (/int[ée]rim/.test(l)) out.push('interim');
  if (/alternance|apprenti|professionnalisation/.test(l)) out.push('alternance');
  if (/\bstage\b|intern/.test(l)) out.push('stage');
  return out;
}

/** Télétravail d'après un libellé court. */
export function remoteFromLabel(label) {
  const l = String(label || '').toLowerCase();
  if (/full ?remote|100 ?%|t[ée]l[ée]travail (?:total|complet)|remote$/.test(l)) return 'full';
  if (/hybride|hybrid|partiel|occasionnel|t[ée]l[ée]travail/.test(l) && !/pas de t[ée]l[ée]travail|sans t[ée]l[ée]travail/.test(l)) return 'partial';
  if (/pas de t[ée]l[ée]travail|sans t[ée]l[ée]travail|pr[ée]sentiel|sur site|on[- ]site/.test(l)) return 'none';
  return undefined;
}

/**
 * Complète des offres avec la fiche JSON-LD de leur page (description, contrat, salaire…),
 * pour les offres nouvelles ou encore sans description. Renvoie le nombre de fiches lues.
 */
export async function fillFromJsonLd(jobs, ctx, { limit = 40, concurrency = 3, urlOf = (j) => j.url, keep = () => true, getText, fillCompany = true } = {}) {
  const todo = jobs.filter((j) => keep(j) && (!ctx?.needsDetail || ctx.needsDetail(j.sourceId))).slice(0, limit);
  let done = 0;
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, todo.length) }, async () => {
      while (next < todo.length) {
        const job = todo[next++];
        try {
          const html = await getText(urlOf(job), { retries: 0, timeoutMs: 20000 });
          const jp = jobPostings(html)[0];
          if (!jp) continue;
          const d = fromJobPosting(jp);
          if (d.descriptionHtml && d.descriptionHtml.length > (job.descriptionHtml || '').length) job.descriptionHtml = d.descriptionHtml;
          if (!job.contractHints?.length && d.contractHints.length) job.contractHints = d.contractHints;
          if (!job.compensation && d.compensation) job.compensation = d.compensation;
          job.publishedAt = job.publishedAt || d.publishedAt;
          job.location = job.location || d.location;
          if (fillCompany) job.company = job.company || d.company;
          done++;
        } catch {
          /* fiche indisponible : on garde la version courte */
        }
      }
    }),
  );
  return done;
}
