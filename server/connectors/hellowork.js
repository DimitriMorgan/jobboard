// HelloWork : pages HTML de recherche (structure susceptible de changer ; extraction tolérante).
import * as cheerio from 'cheerio';
import { getText, sleep } from '../http.js';
import { TECH_QUERIES } from '../normalize.js';

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
  description: 'Offres HelloWork (CDI/CDD/freelance) par analyse des pages de recherche.',
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
        const location = card.find('[data-cy="localisationCard"], [class*="localisation"], [class*="location"]').first().text().trim() || texts.find((t) => /\d{2}\b|\(\d+\)/.test(t)) || '';
        const contractText = card.find('[data-cy="contractCard"], [class*="contract"]').first().text() || texts.join(' ');
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

    // Détail des nouvelles offres : la page d'une offre embarque un JobPosting JSON-LD (description, lieu, contrat, salaire).
    const limit = Number(process.env.DETAIL_FETCH_LIMIT ?? 40);
    let fetched = 0;
    for (const job of jobs.values()) {
      if (fetched >= limit) break;
      if (job.descriptionHtml || ctx.isKnown(job.sourceId)) continue;
      try {
        const html = await getText(job.url, { retries: 0 });
        const $ = cheerio.load(html);
        const jp = extractJsonLd($)[0];
        if (jp) {
          job.descriptionHtml = jp.description || '';
          job.location = job.location || [jp.jobLocation?.address?.addressLocality, jp.jobLocation?.address?.postalCode].filter(Boolean).join(' ');
          job.company = job.company || jp.hiringOrganization?.name || '';
          job.publishedAt = job.publishedAt || jp.datePosted;
          const et = String(Array.isArray(jp.employmentType) ? jp.employmentType.join(' ') : jp.employmentType || '');
          const hint = /FULL_TIME/i.test(et) ? 'cdi' : /CONTRACTOR/i.test(et) ? 'freelance' : /TEMPORARY/i.test(et) ? 'cdd' : /INTERN/i.test(et) ? 'stage' : null;
          if (hint && !job.contractHints.includes(hint)) job.contractHints.push(hint);
          const sal = jp.baseSalary?.value;
          if (sal && (sal.minValue || sal.maxValue || sal.value)) {
            const unit = String(sal.unitText || '').toUpperCase();
            const min = Number(sal.minValue || sal.value) || null;
            const max = Number(sal.maxValue || sal.value) || null;
            job.compensation = unit === 'DAY' ? { tjmMin: min, tjmMax: max, currency: '€' } : unit === 'MONTH' ? { salaryMin: min && min * 12, salaryMax: max && max * 12, currency: '€' } : unit === 'YEAR' ? { salaryMin: min, salaryMax: max, currency: '€' } : undefined;
          }
        } else {
          job.descriptionHtml = $('[class*="description"], section, article').first().html() || '';
        }
        const contractText = $('body').text();
        if (!job.contractHints.length) {
          if (/\bCDI\b/.test(contractText)) job.contractHints.push('cdi');
          else if (/free-?lance|ind[ée]pendant/i.test(contractText)) job.contractHints.push('freelance');
        }
        fetched++;
        await sleep(600);
      } catch {
        /* détail indisponible */
      }
    }
    return [...jobs.values()];
  },
};
