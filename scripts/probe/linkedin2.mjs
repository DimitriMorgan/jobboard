// Page de recherche publique LinkedIn (HTML) : filtres de contrat appliqués ? pagination ?
import { probeFetch, sleep, stripTags } from './lib.mjs';

const base = { location: 'France', geoId: '105015875' };
let requests = 0;
async function get(url) {
  requests++;
  const res = await probeFetch(url);
  await sleep(1200);
  return res;
}
function cards(html) {
  const ids = [];
  for (const m of html.matchAll(/data-entity-urn="urn:li:jobPosting:(\d+)"/g)) ids.push(m[1]);
  return [...new Set(ids)];
}
const count = (html) => ((html.match(/results-context-header__job-count[^>]*>([^<]+)</) || [])[1] || '?').trim();
const inter = (a, b) => a.filter((x) => b.includes(x)).length;

console.log('\n## Page HTML /jobs/search : le filtre f_JT change-t-il les résultats ?');
const kw = 'développeur react';
const sets = {};
for (const jt of ['', 'F', 'C', 'T', 'I']) {
  const params = new URLSearchParams({ keywords: kw, ...base, f_TPR: 'r604800', ...(jt ? { f_JT: jt } : {}) });
  const res = await get(`https://www.linkedin.com/jobs/search?${params}`);
  sets[jt || 'aucun'] = cards(res.text);
  console.log(`  f_JT=${jt || '-'}: status=${res.status} total=${count(res.text)} cartes=${sets[jt || 'aucun'].length}`);
}
console.log(`  recouvrement aucun∩F=${inter(sets.aucun, sets.F)} aucun∩C=${inter(sets.aucun, sets.C)} F∩C=${inter(sets.F, sets.C)}`);

console.log('\n## Page HTML : f_WT (télétravail) et f_E');
for (const [k, v] of [['f_WT', '2'], ['f_WT', '3'], ['f_E', '4']]) {
  const res = await get(`https://www.linkedin.com/jobs/search?${new URLSearchParams({ keywords: kw, ...base, f_TPR: 'r604800', [k]: v })}`);
  console.log(`  ${k}=${v}: total=${count(res.text)} cartes=${cards(res.text).length} ∩aucun=${inter(cards(res.text), sets.aucun)}`);
}

console.log('\n## Endpoint seeMoreJobPostings avec f_JT=C comparé à la page HTML f_JT=C');
{
  const res = await get(`https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?${new URLSearchParams({ keywords: kw, ...base, f_TPR: 'r604800', f_JT: 'C', start: '0' })}`);
  const ids = cards(res.text);
  console.log(`  api f_JT=C: ${ids.length} cartes, ∩HTML C=${inter(ids, sets.C)} ∩HTML aucun=${inter(ids, sets.aucun)}`);
  const res2 = await get(`https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?${new URLSearchParams({ keywords: kw, ...base, f_TPR: 'r604800', f_JT: 'C', start: '60' })}`);
  const ids2 = cards(res2.text);
  console.log(`  api f_JT=C start=60: ${ids2.length} cartes, ∩HTML C=${inter(ids2, sets.C)}`);
}

console.log('\n## Pagination de la page HTML (start / pageNum)');
{
  const p0 = sets.C;
  for (const extra of [{ start: '25' }, { start: '60' }, { pageNum: '1' }, { pageNum: '2' }]) {
    const res = await get(`https://www.linkedin.com/jobs/search?${new URLSearchParams({ keywords: kw, ...base, f_TPR: 'r604800', f_JT: 'C', ...extra })}`);
    const ids = cards(res.text);
    console.log(`  ${JSON.stringify(extra)}: cartes=${ids.length} ∩page0=${inter(ids, p0)}`);
  }
}

console.log('\n## Échantillon de titres f_JT=C (freelance/contrat ?)');
{
  const res = await get(`https://www.linkedin.com/jobs/search?${new URLSearchParams({ keywords: 'développeur', ...base, f_TPR: 'r86400', f_JT: 'C' })}`);
  const titles = [...res.text.matchAll(/base-search-card__title[^>]*>([\s\S]*?)<\/h3>/g)].map((m) => stripTags(m[1])).slice(0, 12);
  console.log(`  total=${count(res.text)}\n   - ${titles.join('\n   - ')}`);
}
console.log(`\nRequêtes : ${requests}`);
