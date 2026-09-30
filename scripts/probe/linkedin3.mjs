// Tolérance de LinkedIn : combien de requêtes (recherche puis fiches) avant un 429, au rythme du connecteur ?
import { probeFetch, sleep } from './lib.mjs';

const MAX = Number(process.argv[2]) || 800;
const DELAY = Number(process.argv[3]) || 1100;
const SEARCH = 'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search';
const DETAIL = 'https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/';
const ids = [];
let n = 0;
const t0 = Date.now();
const statuses = {};
async function hit(url) {
  n++;
  const r = await probeFetch(url);
  statuses[r.status] = (statuses[r.status] || 0) + 1;
  if (r.status === 429 || r.status === 999 || r.status === 0) console.log(`  ⚠ requête #${n} → ${r.status} après ${Math.round((Date.now() - t0) / 1000)} s`);
  await sleep(DELAY + Math.random() * 400);
  return r;
}
for (const kw of ['javascript', 'typescript', '.net']) {
  for (let start = 0; start < 400 && n < MAX; start += 10) {
    const r = await hit(`${SEARCH}?${new URLSearchParams({ keywords: kw, location: 'France', geoId: '105015875', f_TPR: 'r108000', start: String(start) })}`);
    const found = [...r.text.matchAll(/urn:li:jobPosting:(\d+)/g)].map((m) => m[1]);
    if (!found.length) break;
    ids.push(...found);
  }
}
console.log(`recherche : ${n} requêtes, ${new Set(ids).size} offres, statuts ${JSON.stringify(statuses)}`);
let first429 = null;
for (const id of [...new Set(ids)]) {
  if (n >= MAX) break;
  const r = await hit(DETAIL + id);
  if (r.status === 429 && !first429) first429 = n;
  if (n % 100 === 0) console.log(`  … ${n} requêtes, ${Math.round((Date.now() - t0) / 1000)} s, statuts ${JSON.stringify(statuses)}`);
}
console.log(`total : ${n} requêtes en ${Math.round((Date.now() - t0) / 1000)} s, premier 429 : ${first429 ?? 'aucun'}, statuts ${JSON.stringify(statuses)}`);
