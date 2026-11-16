// Découverte d'entreprises dans l'index public Common Crawl : adresses de pages carrière hébergées par les plateformes
// de recrutement. L'index répond lentement et expire souvent : il est lu page par page, en reprenant d'une
// actualisation à l'autre là où on s'était arrêté, et chaque page n'est lue qu'une fois par index.
import { getJson, getText, sleep } from '../http.js';

const CC = 'https://index.commoncrawl.org';

/** Motifs recherchés et extraction de l'identifiant de l'entreprise depuis l'adresse trouvée. */
export const HARVEST_PATTERNS = [
  { ats: 'lever', q: 'jobs.lever.co/*', slug: (u) => u.pathname.split('/')[1] },
  { ats: 'lever-eu', q: 'jobs.eu.lever.co/*', slug: (u) => u.pathname.split('/')[1] },
  { ats: 'greenhouse', q: 'boards.greenhouse.io/*', slug: (u) => u.pathname.split('/')[1] },
  { ats: 'greenhouse', q: 'job-boards.greenhouse.io/*', slug: (u) => u.pathname.split('/')[1] },
  { ats: 'greenhouse', q: 'job-boards.eu.greenhouse.io/*', slug: (u) => u.pathname.split('/')[1] },
  { ats: 'ashby', q: 'jobs.ashbyhq.com/*', slug: (u) => u.pathname.split('/')[1] },
  { ats: 'recruitee', q: '*.recruitee.com', slug: (u) => u.hostname.split('.')[0] },
  { ats: 'teamtailor', q: '*.teamtailor.com', slug: (u) => u.hostname.split('.')[0] },
  { ats: 'workable', q: 'apply.workable.com/*', slug: (u) => u.pathname.split('/')[1] },
];
const JUNK = /^(|www|api|app|jobs|careers|career|help|support|static|assets|embed|v0|v1|j|search|robots\.txt|sitemap.*|favicon.*|signin|login|status|docs|blog|en|fr|de|es|it|nl)$/i;

/**
 * Lit des pages de l'index tant que `timeLeft()` est vrai. `progress` : { indexes, done: { "<index>|<motif>|<page>": date },
 * pages: { "<index>|<motif>": n } } (conservé dans l'annuaire). Renvoie la liste { ats, slug } trouvée.
 */
export async function harvestCommonCrawl(progress, { timeLeft, log = () => {}, maxIndexes = 3 } = {}) {
  const found = [];
  if (!progress.indexes?.length || Date.now() - Date.parse(progress.indexesAt || 0) > 7 * 86400e3) {
    const info = await getJson(`${CC}/collinfo.json`, { retries: 1, timeoutMs: 30000 });
    progress.indexes = info.slice(0, maxIndexes).map((i) => i.id);
    progress.indexesAt = new Date().toISOString();
  }
  progress.done ||= {};
  progress.pages ||= {};
  // Pages d'anciens index : oubliées pour que l'annuaire ne grossisse pas indéfiniment.
  for (const k of Object.keys(progress.done)) if (!progress.indexes.includes(k.split('|')[0])) delete progress.done[k];
  for (const k of Object.keys(progress.pages)) if (!progress.indexes.includes(k.split('|')[0])) delete progress.pages[k];
  for (const idx of progress.indexes) {
    for (const p of HARVEST_PATTERNS) {
      if (!timeLeft()) return found;
      const base = `${CC}/${idx}-index?url=${encodeURIComponent(p.q)}&output=json&fl=url`;
      const key = `${idx}|${p.q}`;
      if (progress.pages[key] == null) {
        try {
          progress.pages[key] = Number((await getJson(`${base}&showNumPages=true`, { retries: 1, timeoutMs: 60000 })).pages) || 0;
        } catch {
          continue; // index surchargé : on réessaiera à la prochaine actualisation
        }
      }
      for (let page = 0; page < Math.min(progress.pages[key], 20); page++) {
        const pk = `${key}|${page}`;
        if (progress.done[pk] || !timeLeft()) continue;
        try {
          const text = await getText(`${base}&page=${page}`, { retries: 1, timeoutMs: 90000, retryDelayMs: 5000 });
          let n = 0;
          for (const line of text.split('\n')) {
            try {
              const slug = decodeURIComponent(p.slug(new URL(JSON.parse(line).url)) || '').toLowerCase();
              if (slug && !JUNK.test(slug) && /^[a-z0-9][a-z0-9._-]{1,60}$/.test(slug)) {
                found.push({ ats: p.ats, slug });
                n++;
              }
            } catch {
              /* ligne illisible */
            }
          }
          progress.done[pk] = new Date().toISOString();
          log(`Common Crawl ${idx} ${p.q} page ${page + 1}/${progress.pages[key]} : ${n} adresses`);
        } catch {
          /* page en échec : retentée la prochaine fois */
        }
        await sleep(1000);
      }
    }
  }
  return found;
}
