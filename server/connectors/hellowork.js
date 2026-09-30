// HelloWork : pages HTML de recherche (structure susceptible de changer ; extraction tolérante).
import * as cheerio from 'cheerio';
import { getText, sleep } from '../http.js';
import { TECH_QUERIES, resolveContracts, htmlToText } from '../normalize.js';

const SEARCH = 'https://www.hellowork.com/fr-fr/emploi/recherche.html';

function extractJsonLd($) {
  const found = [];
  $('script[type="application/ld+json"]').each((_, s) => {
    try {
      const data = JSON.parse($(s).text());
      const list = Array.isArray(data) ? data : [data];
      for (const d of list) {
        if (d['@type'] === 'JobPosting') found.push(d);
        if (d['@type'] === 'ItemList') for (const el of d.itemListElement || []) if (el.item?.['@type'] === 'JobPosting') found.push(el.item);
        if (Array.isArray(d['@graph'])) for (const g of d['@graph']) if (g['@type'] === 'JobPosting') found.push(g);
      }
    } catch {
      /* ignore */
    }
  });
  return found;
}

export default {
  id: 'hellowork',
  name: 'HelloWork',
  site: 'https://www.hellowork.com',
  description: 'Offres HelloWork (CDI/CDD/freelance) : pages de recherche et fiche JSON-LD (contrat, lieu, salaire).',
  async fetch(ctx) {
    const jobs = new Map();
    for (const [tech, keywords] of Object.entries(TECH_QUERIES)) {
      const kw = keywords[0];
      const params = new URLSearchParams({ k: `développeur ${kw}`, l: 'France', d: 'w' });
      const html = await getText(`${SEARCH}?${params}`, { retries: 1 });
      const $ = cheerio.load(html);
      let count = 0;

      for (const jp of extractJsonLd($)) {
        const url = jp.url || jp.sameAs;
        const id = (url || '').match(/(\d{6,})/)?.[1] || jp.identifier?.value || jp.identifier;
        if (!id || !url) continue;
        if (!jobs.has(String(id))) {
          jobs.set(String(id), {
            sourceId: id,
            title: jp.title,
            company: jp.hiringOrganization?.name,
            location: [jp.jobLocation?.address?.addressLocality, jp.jobLocation?.address?.postalCode].filter(Boolean).join(' '),
            countryHint: 'FR',
            contractHints: [/FULL_TIME/i.test(jp.employmentType) ? 'cdi' : /CONTRACTOR/i.test(jp.employmentType) ? 'freelance' : /TEMPORARY/i.test(jp.employmentType) ? 'cdd' : null].filter(Boolean),
            techHints: [tech],
            salary: jp.baseSalary?.value ? `${jp.baseSalary.value.minValue || ''}${jp.baseSalary.value.maxValue ? ' - ' + jp.baseSalary.value.maxValue : ''} ${jp.baseSalary.currency || '€'} / ${jp.baseSalary.value.unitText || ''}`.trim() : '',
            url,
            publishedAt: jp.datePosted,
            descriptionHtml: jp.description || '',
            tags: [],
          });
          count++;
        } else jobs.get(String(id)).techHints.push(tech);
      }

      // Fallback : liens vers /fr-fr/emplois/<id>.html
      $('a[href*="/fr-fr/emplois/"]').each((_, a) => {
        const href = $(a).attr('href') || '';
        const id = href.match(/\/emplois\/(\d+)\.html/)?.[1];
        if (!id) return;
        const card = $(a).closest('li, article, div[data-id-storage-target], div[class*="offer"], div');
        const title = ($(a).attr('title') || $(a).find('h3, [data-cy="offerTitle"], p').first().text() || $(a).text()).trim();
        if (!title) return;
        const url = href.startsWith('http') ? href : `https://www.hellowork.com${href}`;
        const existing = jobs.get(id);
        if (existing) {
          if (!existing.techHints.includes(tech)) existing.techHints.push(tech);
          return;
        }
        const texts = card.find('p, span, div').map((_, e) => $(e).text().trim()).get().filter((t) => t && t.length < 80);
        const company = card.find('[data-cy="offerCompany"], .company, [class*="company"]').first().text().trim() || texts[1] || '';
        const location =
          card.find('[data-cy="localisationCard"], [class*="localisation"], [class*="location"]').first().text().trim() ||
          texts.find((t) => t !== title && t.length < 50 && /\(\d{2,3}\)|\b\d{5}\b|^[A-ZÉ][\wéèêàâîôûç' -]+ - \d{2}$/.test(t)) ||
          '';
        const contractText = card.find('[data-cy="contractCard"], [class*="contract"]').first().text();
        jobs.set(id, {
          sourceId: id,
          title,
          company,
          location,
          countryHint: 'FR',
          contractHints: [/\bcdi\b/i.test(contractText) ? 'cdi' : /free-?lance|ind[ée]pendant/i.test(contractText) ? 'freelance' : /\bcdd\b/i.test(contractText) ? 'cdd' : null].filter(Boolean),
          techHints: [tech],
          url,
          tags: [],
        });
        count++;
      });
      ctx.progress?.(`HelloWork « ${kw} » : ${count} offres`);
      await sleep(800);
    }

    // Offres déjà connues dont le contrat est resté inconnu : relues (dans la limite du budget) pour compléter la fiche.
    const recent = Date.now() - 21 * 86400e3;
    for (const k of ctx.knownJobs?.() || []) {
      if (jobs.has(k.sourceId) || !k.contracts.every((c) => c === 'autre') || Date.parse(k.lastSeenAt) < recent || !k.url) continue;
      jobs.set(k.sourceId, { sourceId: k.sourceId, title: k.title, company: k.company, location: k.location, url: k.url, countryHint: 'FR', contractHints: [], techHints: [], tags: [], refreshOnly: true, recheck: true });
    }

    // Détail des nouvelles offres : la page d'une offre embarque un JobPosting JSON-LD (description, lieu, contrat, salaire).
    const limit = Number(process.env.DETAIL_FETCH_LIMIT ?? 60);
    let fetched = 0;
    for (const job of jobs.values()) {
      if (fetched >= limit) break;
      if (!job.recheck && (job.descriptionHtml || !ctx.needsDetail(job.sourceId))) continue;
      try {
        const html = await getText(job.url, { retries: 0 });
        const $ = cheerio.load(html);
        const jp = extractJsonLd($)[0];
        if (jp) {
          job.descriptionHtml = jp.description || '';
          const loc = [jp.jobLocation?.address?.addressLocality, jp.jobLocation?.address?.postalCode].filter(Boolean).join(' ');
          if (loc) job.location = loc;
          job.company = job.company || jp.hiringOrganization?.name || '';
          job.publishedAt = job.publishedAt || jp.datePosted;
          const et = String(Array.isArray(jp.employmentType) ? jp.employmentType.join(' ') : jp.employmentType || '');
          const sal = jp.baseSalary?.value;
          const unit = String(sal?.unitText || '').toUpperCase();
          if (sal && (sal.minValue || sal.maxValue || sal.value)) {
            const min = Number(sal.minValue || sal.value) || null;
            const max = Number(sal.maxValue || sal.value) || null;
            job.compensation = unit === 'DAY' ? { tjmMin: min, tjmMax: max, currency: '€' } : unit === 'MONTH' ? { salaryMin: min && min * 12, salaryMax: max && max * 12, currency: '€' } : unit === 'YEAR' ? { salaryMin: min, salaryMax: max, currency: '€' } : undefined;
          }
          const strong = [];
          if (/CONTRACTOR/i.test(et) || unit === 'DAY') strong.push('freelance');
          if (/TEMPORARY/i.test(et)) strong.push('cdd');
          if (/INTERN/i.test(et)) strong.push('stage');
          job.contractHints = resolveContracts({ title: job.title, description: htmlToText(job.descriptionHtml), strong, weak: /FULL_TIME/i.test(et) ? ['cdi'] : job.contractHints });
        } else {
          job.descriptionHtml = $('[class*="description"], section, article').first().html() || '';
        }
        fetched++;
        await sleep(600);
      } catch {
        /* détail indisponible */
      }
    }
    // Les offres relues sans succès ne sont pas renvoyées (elles ne doivent pas compter comme revues aujourd'hui).
    return [...jobs.values()].filter((j) => !j.recheck || j.descriptionHtml);
  },
};
