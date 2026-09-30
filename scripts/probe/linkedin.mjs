// Expériences sur l'endpoint public (sans connexion) de recherche d'offres LinkedIn.
// Usage : node scripts/probe/linkedin.mjs [exp1,exp2,...]   (défaut : toutes)
import { probeFetch, sleep, stripTags } from './lib.mjs';

const SEARCH = 'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search';
const DETAIL = 'https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/';
const only = (process.argv[2] || '').split(',').filter(Boolean);
const want = (name) => !only.length || only.includes(name);
let requests = 0;
let throttled = 0;

async function li(url) {
  requests++;
  let res = await probeFetch(url);
  if (res.status === 429) {
    throttled++;
    console.log(`    429 (req #${requests}) → pause 30 s`);
    await sleep(30000);
    requests++;
    res = await probeFetch(url);
  }
  await sleep(1000);
  return res;
}

function parseCards(html) {
  const cards = [];
  for (const m of html.matchAll(/<li>([\s\S]*?)<\/li>/g)) {
    const block = m[1];
    const id = (block.match(/data-entity-urn="urn:li:jobPosting:(\d+)"/) || block.match(/jobs\/view\/[^"]*?-(\d{8,})/) || [])[1];
    if (!id) continue;
    const title = stripTags((block.match(/base-search-card__title[^>]*>([\s\S]*?)<\/h3>/) || [])[1] || '');
    const company = stripTags((block.match(/base-search-card__subtitle[^>]*>([\s\S]*?)<\/h4>/) || [])[1] || '');
    const date = (block.match(/datetime="([^"]+)"/) || [])[1] || '';
    cards.push({ id, title, company, date });
  }
  return cards;
}

async function search(params) {
  const res = await li(`${SEARCH}?${new URLSearchParams(params)}`);
  return { status: res.status, cards: res.ok ? parseCards(res.text) : [], len: res.text.length };
}

async function paginate(label, params, maxPages) {
  const seen = new Set();
  let start = 0;
  const perPage = [];
  for (let p = 0; p < maxPages; p++) {
    const r = await search({ ...params, start: String(start) });
    const fresh = r.cards.filter((c) => !seen.has(c.id));
    r.cards.forEach((c) => seen.add(c.id));
    perPage.push(`${r.status === 200 ? '' : r.status + ':'}${r.cards.length}/${fresh.length}`);
    if (!r.cards.length) break;
    start += r.cards.length;
  }
  console.log(`  ${label}: uniques=${seen.size} pages(cartes/nouvelles)=${perPage.join(' ')}`);
  return seen;
}

const base = { location: 'France', geoId: '105015875' };
const jaccard = (a, b) => {
  const inter = [...a].filter((x) => b.has(x)).length;
  return `${inter}/${new Set([...a, ...b]).size}`;
};

if (want('count')) {
  console.log('\n## Nombre total d’offres affiché par la recherche publique');
  for (const [kw, tpr] of [['react', 'r86400'], ['react', 'r604800'], ['php', 'r86400'], ['.net', 'r86400'], ['node.js', 'r86400'], ['javascript', 'r86400'], ['freelance développeur', 'r86400']]) {
    const res = await li(`https://www.linkedin.com/jobs/search?${new URLSearchParams({ keywords: kw, ...base, f_TPR: tpr })}`);
    const count = (res.text.match(/results-context-header__job-count[^>]*>([^<]+)</) || [])[1] || '?';
    console.log(`  ${kw} ${tpr}: status=${res.status} total=${count.trim()} final=${res.finalUrl.slice(0, 80)} cartes=${parseCards(res.text).length}`);
  }
}

let reactIds = new Set();
if (want('depth')) {
  console.log('\n## Profondeur de pagination (react, 7 jours, tri par date)');
  reactIds = await paginate('react r604800 DD', { keywords: 'react', ...base, f_TPR: 'r604800', sortBy: 'DD' }, 40);
}

if (want('day')) {
  console.log('\n## Volume sur 24 h / 48 h (pagination complète)');
  await paginate('react r86400 DD', { keywords: 'react', ...base, f_TPR: 'r86400', sortBy: 'DD' }, 30);
  await paginate('php r172800 DD', { keywords: 'php', ...base, f_TPR: 'r172800', sortBy: 'DD' }, 30);
}

if (want('jt')) {
  console.log('\n## Le filtre f_JT (type de contrat) est-il appliqué ?');
  const params = { keywords: 'développeur react', ...base, f_TPR: 'r604800', sortBy: 'DD' };
  const none = await paginate('sans f_JT', params, 2);
  const f = await paginate('f_JT=F', { ...params, f_JT: 'F' }, 2);
  const c = await paginate('f_JT=C', { ...params, f_JT: 'C' }, 2);
  console.log(`  recouvrement none∩F=${jaccard(none, f)} none∩C=${jaccard(none, c)} F∩C=${jaccard(f, c)}`);
  console.log('\n## f_WT=2 (télétravail)');
  const wt = await paginate('f_WT=2', { ...params, f_WT: '2' }, 2);
  console.log(`  recouvrement none∩WT2=${jaccard(none, wt)}`);
}

if (want('sort')) {
  console.log('\n## Tri par pertinence vs date');
  const params = { keywords: 'développeur php', ...base, f_TPR: 'r604800' };
  const r = await search({ ...params, start: '0' });
  const d = await search({ ...params, sortBy: 'DD', start: '0' });
  console.log(`  pertinence dates: ${r.cards.map((c) => c.date).join(' ')}`);
  console.log(`  date       dates: ${d.cards.map((c) => c.date).join(' ')}`);
}

if (want('bool')) {
  console.log('\n## Requête booléenne');
  await paginate('bool r86400', { keywords: 'react OR php OR "node.js" OR ".net" OR javascript OR typescript OR symfony OR laravel', ...base, f_TPR: 'r86400', sortBy: 'DD' }, 25);
}

if (want('detail')) {
  console.log('\n## Rafale de fiches détaillées');
  const ids = [...reactIds].slice(0, 25);
  if (!ids.length) {
    const r = await search({ keywords: 'react', ...base, f_TPR: 'r604800', sortBy: 'DD', start: '0' });
    ids.push(...r.cards.map((c) => c.id));
  }
  const statuses = [];
  for (const [i, id] of ids.entries()) {
    const res = await li(DETAIL + id);
    statuses.push(res.status);
    if (i < 3 && res.ok) {
      const crit = [...res.text.matchAll(/description__job-criteria-subheader[^>]*>([\s\S]*?)<\/h3>[\s\S]*?description__job-criteria-text[^>]*>([\s\S]*?)<\/span>/g)].map((m) => `${stripTags(m[1])}=${stripTags(m[2])}`);
      const desc = stripTags((res.text.match(/show-more-less-html__markup[^>]*>([\s\S]*?)<\/div>/) || [])[1] || '');
      console.log(`  ${id}: critères=${JSON.stringify(crit)} description=${desc.length} car.`);
    }
  }
  console.log(`  statuts: ${statuses.join(' ')}`);
}

console.log(`\nRequêtes LinkedIn : ${requests}, réponses 429 : ${throttled}`);
