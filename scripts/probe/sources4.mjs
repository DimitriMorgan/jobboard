// Derniers détails : posts LinkedIn publics, WeLoveDevs (algoliaSSR/jobData), LesJeudis (cartes, fiches, pagination).
import { probeFetch, sleep, stripTags, jsonLdBlocks } from './lib.mjs';

const only = process.argv.slice(2);
const want = (n) => !only.length || only.includes(n);
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

if (want('posts')) {
  console.log('\n### posts');
  for (const url of [
    'https://fr.linkedin.com/posts/chrisscholly_je-cherche-un-dev-phpsymfony-freelance-pour-activity-7348282755333451776-dCAQ',
    'https://fr.linkedin.com/posts/simon-boezennec-b094b5146_freelance-php-symfony-activity-7084193129246912512-smnd',
    'https://www.linkedin.com/posts/yoanntyt_yoann-chocteau-d%C3%A9veloppeur-full-stack-activity-6864849031718293504-bs6F',
  ]) {
    const res = await probeFetch(url);
    const ld = jsonLdBlocks(res.text);
    const post = ld.find((d) => /Posting|Article/.test([].concat(d['@type']).join(' ')));
    const og = (p) => (res.text.match(new RegExp(`<meta[^>]+(?:property|name)="og:${p}"[^>]+content="([^"]*)"`)) || [])[1] || '';
    console.log(`  ${url.slice(28, 100)} status=${res.status} final=${res.finalUrl.slice(0, 70)} len=${res.text.length}`);
    console.log(`    og:title=${og('title').slice(0, 80)}`);
    console.log(`    json-ld=${ld.map((d) => [].concat(d['@type']).join('|')).join(',')} corps=${(post?.articleBody || post?.text || '').length} date=${post?.datePublished || ''} auteur=${post?.author?.name || ''}`);
    if (post) console.log(`    clés=${Object.keys(post).join(',')}`);
    const body = post?.articleBody || post?.text || '';
    console.log(`    extrait=${(body || stripTags(res.text)).slice(0, 200).replace(/\s+/g, ' ')}`);
    await sleep(2000);
  }
}

if (want('welovedevs')) {
  console.log('\n### welovedevs');
  const res = await probeFetch('https://welovedevs.com/app/job-paris');
  const i = res.text.indexOf('__PRELOADED_STATE__');
  const state = JSON.parse(sliceJson(res.text, res.text.indexOf('{', i)));
  for (const key of ['algoliaSSR', 'jobData', 'seo']) {
    const v = state[key];
    const s = JSON.stringify(v) || '';
    console.log(`  ${key}: taille=${s.length} clés=${v && typeof v === 'object' ? Object.keys(v).slice(0, 20).join(',') : typeof v}`);
    console.log(`    début=${s.slice(0, 900)}`);
  }
  const all = JSON.stringify(state);
  const hit = all.indexOf('"objectID"');
  console.log(`  objectID: ${hit >= 0 ? all.slice(Math.max(0, hit - 200), hit + 1500) : 'absent'}`);
  const app = all.match(/"(?:appId|applicationId|algoliaAppId)":"([A-Z0-9]{10})"/);
  const key = all.match(/"(?:apiKey|searchApiKey|algoliaSearchKey|searchKey)":"([a-zA-Z0-9]{20,})"/);
  console.log(`  algolia app=${app?.[1] || '-'} key=${key?.[1] ? key[1].slice(0, 8) + '…' : '-'}`);
}

if (want('lesjeudis')) {
  console.log('\n### lesjeudis');
  const res = await probeFetch('https://lesjeudis.com/emploi/developpement');
  const ld = jsonLdBlocks(res.text);
  console.log(`  /emploi/developpement status=${res.status} titre=${(res.text.match(/<title>([^<]*)/) || [])[1]} json-ld=${ld.map((d) => d['@type']).join(',')}`);
  const offers = [...new Set([...res.text.matchAll(/href="(\/offers\/[^"]+)"/g)].map((m) => m[1]))];
  console.log(`  liens offres=${offers.length}`);
  const i = res.text.indexOf(`href="${offers[0]}"`);
  console.log(`  carte: ${res.text.slice(Math.max(0, i - 600), i + 2200).replace(/\s+/g, ' ')}`);
  const flight = [...res.text.matchAll(/self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)/g)].map((m) => m[1]).join('');
  const k = flight.indexOf('/offers/');
  console.log(`  flight=${flight.length} autour d'une offre: ${flight.slice(Math.max(0, k - 900), k + 600).replace(/\\"/g, '"')}`);
  for (const q of ['?page=2', '?p=2', '?q=react', '?keywords=react', '?search=react', '?competences=react']) {
    const r = await probeFetch(`https://lesjeudis.com/emploi/developpement${q}`);
    const o2 = [...new Set([...r.text.matchAll(/href="(\/offers\/[^"]+)"/g)].map((m) => m[1]))];
    console.log(`  ${q}: status=${r.status} offres=${o2.length} communes=${o2.filter((x) => offers.includes(x)).length} titre=${(r.text.match(/<title>([^<]*)/) || [])[1]}`);
    await sleep(500);
  }
  const d = await probeFetch(`https://lesjeudis.com${offers[0]}`);
  const dl = jsonLdBlocks(d.text);
  const jp = dl.find((x) => [].concat(x['@type']).includes('JobPosting'));
  console.log(`  fiche ${offers[0]} status=${d.status} json-ld=${dl.map((x) => x['@type']).join(',')}`);
  if (jp) console.log(`  JobPosting: ${JSON.stringify({ ...jp, description: String(jp.description || '').slice(0, 200) }).slice(0, 1400)}`);
  for (const u of ['https://lesjeudis.com/emploi/developpement/react', 'https://lesjeudis.com/emploi/react-js', 'https://lesjeudis.com/emploi/competence/react', 'https://lesjeudis.com/emploi/developpement/ile-de-france']) {
    const r = await probeFetch(u);
    const o3 = [...new Set([...r.text.matchAll(/href="(\/offers\/[^"]+)"/g)].map((m) => m[1]))];
    console.log(`  ${u}: status=${r.status} offres=${o3.length} titre=${(r.text.match(/<title>([^<]*)/) || [])[1]}`);
    await sleep(500);
  }
  const cats = [...new Set([...res.text.matchAll(/href="(\/emploi\/[^"]+)"/g)].map((m) => m[1]))];
  console.log(`  liens /emploi/ : ${cats.slice(0, 60).join(' | ')}`);
}
