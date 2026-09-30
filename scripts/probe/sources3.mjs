// Détails d'implémentation : posts LinkedIn publics, pagination et formats précis des sites retenus.
import { probeFetch, sleep, stripTags, jsonLdBlocks } from './lib.mjs';

const only = process.argv.slice(2);
const want = (n) => !only.length || only.includes(n);
const around = (h, needle, before = 300, after = 1200) => {
  const i = h.indexOf(needle);
  return i < 0 ? '(absent)' : h.slice(Math.max(0, i - before), i + after).replace(/\s+/g, ' ');
};
function walkKeys(obj, depth = 0, path = '$', out = []) {
  if (depth > 6 || !obj || typeof obj !== 'object') return out;
  if (Array.isArray(obj)) {
    if (obj.length && obj[0] && typeof obj[0] === 'object') out.push(`${path}[${obj.length}] {${Object.keys(obj[0]).slice(0, 25).join(',')}}`);
    if (obj.length) walkKeys(obj[0], depth + 1, `${path}[0]`, out);
    return out;
  }
  for (const [k, v] of Object.entries(obj)) if (v && typeof v === 'object') walkKeys(v, depth + 1, `${path}.${k}`, out);
  return out;
}
/** Extrait un objet JSON commençant à `start` par comptage d'accolades (gère les chaînes). */
function sliceJson(text, start) {
  let depth = 0;
  let inStr = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (c === '\\') i++;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}
async function step(name, fn) {
  if (!want(name)) return;
  console.log(`\n### ${name}`);
  try {
    await fn();
  } catch (err) {
    console.log(`  ERREUR : ${err.message}`);
  }
  await sleep(700);
}

await step('linkedin-posts', async () => {
  const urls = [
    'https://fr.linkedin.com/posts/chrisscholly_je-cherche-un-dev-phpsymfony-freelance-pour-activity-7348282755333451776-dCAQ',
    'https://fr.linkedin.com/posts/simon-boezennec-b094b5146_freelance-php-symfony-activity-7084193129246912512-smnd',
    'https://www.linkedin.com/posts/clement-bonnet-nonstopconsulting_d%C3%A9veloppeur-fullstack-javascript-activity-6885218488944791553-RcQX',
  ];
  for (const url of urls) {
    const res = await probeFetch(url);
    const ld = jsonLdBlocks(res.text);
    const post = ld.find((d) => /Posting|Article/.test([].concat(d['@type']).join(' ')));
    const og = (p) => (res.text.match(new RegExp(`<meta[^>]+(?:property|name)="og:${p}"[^>]+content="([^"]*)"`)) || [])[1] || '';
    console.log(`  ${url.slice(0, 90)}\n    status=${res.status} final=${res.finalUrl.slice(0, 80)} len=${res.text.length}`);
    console.log(`    og:title=${og('title').slice(0, 90)} | og:description=${og('description').slice(0, 140)}`);
    console.log(`    json-ld=${ld.map((d) => [].concat(d['@type']).join('|')).join(',')} articleBody=${post?.articleBody?.length || 0} text=${(post?.text || '').length} date=${post?.datePublished || ''} auteur=${post?.author?.name || ''}`);
    if (post) console.log(`    clés=${Object.keys(post).join(',')}`);
    const body = post?.articleBody || post?.text || '';
    if (body) console.log(`    extrait=${body.slice(0, 220).replace(/\s+/g, ' ')}`);
    else console.log(`    texte=${stripTags(res.text).slice(0, 200)}`);
    await sleep(1500);
  }
});

await step('collective', async () => {
  for (const url of ['https://www.collective.work/jobs/fr?query=react', 'https://www.collective.work/jobs/fr?query=react&page=2', 'https://www.collective.work/jobs/fr?search=symfony']) {
    const res = await probeFetch(url);
    const m = res.text.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!m) {
      console.log(`  ${url}: status=${res.status} pas de __NEXT_DATA__`);
      continue;
    }
    const nd = JSON.parse(m[1]);
    const q = (nd.props.pageProps.dehydratedState?.queries || []).find((x) => JSON.stringify(x.queryKey).includes('SearchJobs'));
    const projects = q?.state?.data?.results?.projects || [];
    console.log(`  ${url}: status=${res.status} queryKey=${JSON.stringify(q?.queryKey).slice(0, 200)} projets=${projects.length} total=${JSON.stringify(q?.state?.data?.results?.total ?? q?.state?.data?.results?.count ?? '?')}`);
    console.log(`    résultats clés=${Object.keys(q?.state?.data?.results || {}).join(',')}`);
    if (projects[0]) {
      const p = projects[0];
      console.log(`    exemple: ${JSON.stringify({ ...p, description: String(p.description || '').slice(0, 150), sumUp: String(p.sumUp || '').slice(0, 120) }).slice(0, 1500)}`);
      console.log(`    titres: ${projects.slice(0, 8).map((x) => x.name).join(' | ')}`);
    }
    await sleep(1000);
  }
});

await step('welovedevs', async () => {
  for (const url of ['https://welovedevs.com/app/job-paris', 'https://welovedevs.com/app/job-remote', 'https://welovedevs.com/app/job-lyon']) {
    const res = await probeFetch(url);
    const i = res.text.indexOf('__PRELOADED_STATE__');
    if (i < 0) {
      console.log(`  ${url}: status=${res.status} pas de state`);
      continue;
    }
    const json = sliceJson(res.text, res.text.indexOf('{', i));
    const state = JSON.parse(json);
    console.log(`  ${url}: status=${res.status} clés=${Object.keys(state).join(',')}`);
    console.log(`    chemins:\n      ${walkKeys(state).slice(0, 25).join('\n      ')}`);
    const str = JSON.stringify(state);
    const jobLike = str.match(/\{[^{}]*"title":"[^"]+"[^{}]*\}/);
    console.log(`    objet avec title: ${jobLike ? jobLike[0].slice(0, 700) : '-'}`);
    await sleep(1000);
  }
});

await step('meteojob', async () => {
  const res = await probeFetch('https://www.meteojob.com/jobs?what=d%C3%A9veloppeur%20react&where=France');
  const m = res.text.match(/<script id="candidate-front-state" type="application\/json">([\s\S]*?)<\/script>/);
  if (m) {
    const s = JSON.parse(m[1]);
    console.log(`  state clés=${Object.keys(s).slice(0, 15).join(',')}`);
    console.log(`  chemins:\n    ${walkKeys(s).slice(0, 25).join('\n    ')}`);
    const str = JSON.stringify(s);
    const offer = str.match(/\{[^{}]*"title":"[^"]+"[^{}]*\}/);
    console.log(`  objet avec title: ${offer ? offer[0].slice(0, 900) : '-'}`);
  }
  const ids = [...new Set([...res.text.matchAll(/href="\/jobs\/(\d+)"/g)].map((x) => x[1]))];
  console.log(`  cartes=${ids.length} ex. id=${ids[0]} date: ${around(res.text, `${ids[0]}-salary`, 0, 600).match(/Il y a [^<]+|Aujourd'hui|Hier/)?.[0] || '?'}`);
  const p2 = await probeFetch('https://www.meteojob.com/jobs?what=d%C3%A9veloppeur%20react&where=France&page=2');
  const ids2 = [...new Set([...p2.text.matchAll(/href="\/jobs\/(\d+)"/g)].map((x) => x[1]))];
  console.log(`  page=2 : status=${p2.status} cartes=${ids2.length} communes=${ids2.filter((x) => ids.includes(x)).length}`);
  const d = await probeFetch(`https://www.meteojob.com/jobs/${ids[0]}`);
  const ld = jsonLdBlocks(d.text);
  const jp = ld.find((x) => [].concat(x['@type']).includes('JobPosting'));
  console.log(`  détail status=${d.status} json-ld=${ld.map((x) => x['@type']).join(',')}`);
  if (jp) console.log(`  JobPosting: ${JSON.stringify(jp).slice(0, 700)}`);
});

await step('jobijoba', async () => {
  const u = 'https://www.jobijoba.com/fr/query/?what=d%C3%A9veloppeur%20react&where=France&where_type=country';
  const r1 = await probeFetch(u);
  const r2 = await probeFetch(`${u}&page=2`);
  const ids = (h) => [...new Set([...h.matchAll(/data-id="ad_([a-f0-9]+)"/g)].map((x) => x[1]))];
  console.log(`  page1=${ids(r1.text).length} page2=${ids(r2.text).length} communes=${ids(r2.text).filter((x) => ids(r1.text).includes(x)).length}`);
  const card = around(r1.text, 'class="offer" data-id', 0, 3500);
  console.log(`  carte complète: ${card.replace(/data-product="[^"]*"/, 'data-product=…')}`);
  console.log(`  total: ${(r1.text.match(/(\d[\d\s]*)\s*offres?/) || [])[0] || '?'}`);
});

await step('talent', async () => {
  const res = await probeFetch('https://fr.talent.com/jobs?k=d%C3%A9veloppeur%20react&l=France');
  const flight = [...res.text.matchAll(/self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)/g)].map((m) => m[1]).join('');
  console.log(`  flight RSC: ${flight.length} car. ; contient "jobTitle"=${flight.includes('jobTitle')} "title"=${flight.includes('title')}`);
  const idx = flight.indexOf('611506553645178754');
  console.log(`  autour du 1er id: ${flight.slice(Math.max(0, idx - 300), idx + 900).replace(/\\"/g, '"')}`);
  const d = await probeFetch('https://fr.talent.com/view?id=611506553645178754');
  const ld = jsonLdBlocks(d.text);
  const jp = ld.find((x) => [].concat(x['@type']).includes('JobPosting'));
  console.log(`  détail status=${d.status} final=${d.finalUrl.slice(0, 80)} json-ld=${ld.map((x) => x['@type']).join(',')}`);
  if (jp) console.log(`  JobPosting: ${JSON.stringify(jp).slice(0, 600)}`);
});

await step('lesjeudis', async () => {
  const res = await probeFetch('https://lesjeudis.com/emploi/informatique/ile-de-france');
  const ld = jsonLdBlocks(res.text);
  const cp = ld.find((d) => d['@type'] === 'CollectionPage');
  console.log(`  CollectionPage: ${JSON.stringify(cp).slice(0, 900)}`);
  const hrefs = [...new Set([...res.text.matchAll(/href="(\/[^"#?]+)"/g)].map((m) => m[1]))];
  console.log(`  liens (échantillon) : ${hrefs.filter((h) => h.split('/').length > 2).slice(0, 40).join(' | ')}`);
  console.log(`  carte: ${around(res.text, 'Groupe Osmozium', 1200, 600)}`);
  for (const u of ['https://lesjeudis.com/emploi/react', 'https://lesjeudis.com/emploi/informatique/france', 'https://lesjeudis.com/emploi?q=react', 'https://lesjeudis.com/offres?q=react']) {
    const r = await probeFetch(u);
    console.log(`  ${u}: status=${r.status} titre=${(r.text.match(/<title>([^<]*)/) || [])[1] || ''}`);
    await sleep(500);
  }
});

await step('mindquest', async () => {
  const res = await probeFetch('https://mindquest.io/fr/missions-freelance-offres-emploi-it-finance?employmentType=Contract');
  const ld = jsonLdBlocks(res.text);
  console.log(`  status=${res.status} json-ld=${ld.map((d) => d['@type']).join(',')}`);
  const jp = ld.find((x) => [].concat(x['@type']).includes('JobPosting'));
  if (jp) console.log(`  JobPosting: ${JSON.stringify(jp).slice(0, 500)}`);
  const links = [...new Set([...res.text.matchAll(/href="(\/fr\/[^"]*(?:mission|offre|job)[^"]*)"/g)].map((m) => m[1]))];
  console.log(`  liens: ${links.slice(0, 12).join(' | ')}`);
  const flight = [...res.text.matchAll(/self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)/g)].map((m) => m[1]).join('');
  const k = flight.indexOf('title');
  console.log(`  flight=${flight.length} autour de "title": ${flight.slice(Math.max(0, k - 200), k + 700).replace(/\\"/g, '"')}`);
});

await step('freelancerepublik', async () => {
  const res = await probeFetch('https://www.freelancerepublik.com/freelance');
  const cards = [...res.text.matchAll(/href="(\/missions\/[^"]+)" class="jobboard-card/g)].map((m) => m[1]);
  const next = [...res.text.matchAll(/href="(\?[^"]*_page=\d+)"/g)].map((m) => m[1]);
  console.log(`  cartes=${cards.length} pagination=${[...new Set(next)].join(' ')} compteur=${(res.text.match(/Aperçu de[^<]+/) || [])[0]}`);
  const other = [...new Set([...res.text.matchAll(/href="(\/missions\/[^"]+)"/g)].map((m) => m[1]))];
  console.log(`  liens /missions/ uniques=${other.length}`);
  const script = res.text.match(/freelance-republik-sync\.vercel\.app\/[^"]+/g);
  console.log(`  scripts sync: ${script?.join(' ')}`);
  for (const u of ['https://www.freelancerepublik.com/missions', 'https://freelance-republik-sync.vercel.app/api/jobs', 'https://freelance-republik-sync.vercel.app/jobboard.json']) {
    const r = await probeFetch(u);
    console.log(`  ${u}: status=${r.status} type=${r.contentType} len=${r.text.length} début=${r.text.slice(0, 160).replace(/\s+/g, ' ')}`);
  }
});

await step('freelance-informatique', async () => {
  const res = await probeFetch('https://www.freelance-informatique.fr/offres-freelance');
  const blocks = [...res.text.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  for (const b of blocks) {
    try {
      const j = JSON.parse(b.replace(/[\u0000-\u001f]+/g, ' '));
      if (j['@type'] === 'ItemList') {
        const first = j.itemListElement?.[0]?.item;
        console.log(`  ItemList n=${j.itemListElement?.length} clés item=${Object.keys(first || {}).join(',')}`);
        console.log(`  item: ${JSON.stringify({ ...first, description: String(first?.description || '').slice(0, 200) }).slice(0, 900)}`);
      }
    } catch (err) {
      console.log(`  bloc illisible même nettoyé: ${err.message}`);
    }
  }
  const pages = [...res.text.matchAll(/offres-freelance\?page=(\d+)/g)].map((m) => Number(m[1]));
  console.log(`  pages max=${Math.max(...pages)}`);
});
