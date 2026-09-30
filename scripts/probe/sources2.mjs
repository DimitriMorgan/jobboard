// Structure détaillée des sites retenus (cartes, JSON embarqués, pages de détail).
import { probeFetch, sleep, stripTags, jsonLdBlocks } from './lib.mjs';

const only = process.argv.slice(2);
const want = (n) => !only.length || only.includes(n);
const around = (html, needle, before = 400, after = 1600) => {
  const i = html.indexOf(needle);
  return i < 0 ? '' : html.slice(Math.max(0, i - before), i + after).replace(/\s+/g, ' ');
};
const scripts = (html) => [...html.matchAll(/<script([^>]*)>/g)].map((m) => m[1].trim()).filter((a) => /id=|type=/.test(a)).slice(0, 15);
function walkKeys(obj, depth = 0, path = '$', out = []) {
  if (depth > 5 || !obj || typeof obj !== 'object') return out;
  if (Array.isArray(obj)) {
    if (obj.length && typeof obj[0] === 'object') out.push(`${path}[${obj.length}] {${Object.keys(obj[0] || {}).slice(0, 20).join(',')}}`);
    if (obj.length) walkKeys(obj[0], depth + 1, `${path}[0]`, out);
    return out;
  }
  for (const [k, v] of Object.entries(obj)) if (v && typeof v === 'object') walkKeys(v, depth + 1, `${path}.${k}`, out);
  return out;
}
async function show(name, url, fn) {
  if (!want(name)) return;
  const res = await probeFetch(url);
  console.log(`\n### ${name} ${url}\n  status=${res.status} len=${res.text.length} final=${res.finalUrl.slice(0, 100)}`);
  try {
    await fn(res.text, res);
  } catch (err) {
    console.log(`  ERREUR analyse : ${err.message}`);
  }
  await sleep(800);
}

await show('jobijoba', 'https://www.jobijoba.com/fr/query/?what=d%C3%A9veloppeur%20react&where=France&where_type=country', async (h) => {
  console.log(`  scripts: ${scripts(h).join(' | ')}`);
  console.log(`  carte: ${around(h, '/fr/annonce/', 600, 1800)}`);
  const ld = jsonLdBlocks(h);
  console.log(`  json-ld: ${ld.map((d) => d['@type']).join(',')}`);
  const next = h.match(/page=2[^"]*/);
  console.log(`  pagination: ${next ? next[0] : '-'}`);
});
await show('jobijoba-detail', 'https://www.jobijoba.com/fr/query/?what=d%C3%A9veloppeur%20php&where=France&where_type=country', async (h) => {
  const link = (h.match(/href="(https:\/\/www\.jobijoba\.com\/fr\/annonce\/[^"]+)"/) || [])[1];
  if (!link) return console.log('  pas de lien');
  const d = await probeFetch(link);
  const ld = jsonLdBlocks(d.text);
  const jp = ld.find((x) => [].concat(x['@type']).includes('JobPosting'));
  console.log(`  détail ${link} status=${d.status} final=${d.finalUrl.slice(0, 100)} json-ld=${ld.map((x) => x['@type']).join(',')}`);
  if (jp) console.log(`  JobPosting: ${JSON.stringify(jp).slice(0, 900)}`);
  else console.log(`  texte: ${stripTags(d.text).slice(0, 400)}`);
});
await show('talent', 'https://fr.talent.com/jobs?k=d%C3%A9veloppeur%20react&l=France', async (h) => {
  const ld = jsonLdBlocks(h);
  const list = ld.find((d) => d['@type'] === 'ItemList');
  console.log(`  ItemList: ${JSON.stringify(list).slice(0, 700)}`);
  const wp = ld.find((d) => d['@type'] === 'WebPage');
  console.log(`  WebPage: ${JSON.stringify(wp).slice(0, 500)}`);
  console.log(`  scripts: ${scripts(h).join(' | ')}`);
  console.log(`  carte: ${around(h, '/view?id=', 800, 1500)}`);
});
await show('meteojob', 'https://www.meteojob.com/jobs?what=d%C3%A9veloppeur%20react&where=France', async (h) => {
  console.log(`  scripts: ${scripts(h).join(' | ')}`);
  const state = h.match(/<script id="(?:serverApp-state|ng-state)"[^>]*>([\s\S]*?)<\/script>/);
  if (state) {
    const raw = state[1].replace(/&q;/g, '"').replace(/&a;/g, '&').replace(/&s;/g, "'").replace(/&l;/g, '<').replace(/&g;/g, '>');
    try {
      const j = JSON.parse(raw);
      console.log(`  state keys: ${Object.keys(j).slice(0, 20).join(', ')}`);
      console.log(`  state paths: ${walkKeys(j).slice(0, 20).join('\n    ')}`);
    } catch (err) {
      console.log(`  state illisible (${err.message}) début: ${raw.slice(0, 300)}`);
    }
  }
  console.log(`  carte: ${around(h, '/jobs/5', 700, 1500)}`);
});
await show('welovedevs', 'https://welovedevs.com/app/fr/jobs?query=react', async (h) => {
  const m = h.match(/__PRELOADED_STATE__\s*=\s*([\s\S]*?)<\/script>/);
  if (!m) return console.log(`  pas de state; scripts: ${scripts(h).join(' | ')}`);
  let raw = m[1].trim().replace(/;\s*$/, '');
  try {
    const j = JSON.parse(raw);
    console.log(`  state keys: ${Object.keys(j).join(', ')}`);
    console.log(`  paths:\n    ${walkKeys(j).slice(0, 30).join('\n    ')}`);
  } catch (err) {
    console.log(`  state non JSON (${err.message}) : ${raw.slice(0, 400)}`);
  }
});
await show('welovedevs-paris', 'https://welovedevs.com/app/job-paris', async (h) => {
  const m = h.match(/__PRELOADED_STATE__\s*=\s*([\s\S]*?)<\/script>/);
  if (!m) return;
  try {
    const j = JSON.parse(m[1].trim().replace(/;\s*$/, ''));
    console.log(`  paths:\n    ${walkKeys(j).slice(0, 30).join('\n    ')}`);
  } catch (err) {
    console.log(`  non JSON: ${err.message}`);
  }
  const link = (h.match(/href="(\/app\/job\/[^"]+)"/) || [])[1];
  if (link) {
    const d = await probeFetch(`https://welovedevs.com${link}`);
    const ld = jsonLdBlocks(d.text);
    const jp = ld.find((x) => [].concat(x['@type']).includes('JobPosting'));
    console.log(`  détail ${link}: status=${d.status} json-ld=${ld.map((x) => x['@type']).join(',')}`);
    if (jp) console.log(`  JobPosting: ${JSON.stringify(jp).slice(0, 900)}`);
  }
});
await show('freelance-informatique', 'https://www.freelance-informatique.fr/offres-freelance', async (h) => {
  console.log(`  carte: ${around(h, 'href="/mission-', 500, 1500)}`);
  const bad = [...h.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((x) => x[1].trim().slice(0, 300));
  console.log(`  ld+json bruts: ${bad.map((b) => b.replace(/\s+/g, ' ')).join('\n    ')}`);
  const link = (h.match(/href="(\/mission-[^"]+)"/) || [])[1];
  if (link) {
    const d = await probeFetch(`https://www.freelance-informatique.fr${link}`);
    const ld = jsonLdBlocks(d.text);
    const jp = ld.find((x) => [].concat(x['@type']).includes('JobPosting'));
    console.log(`  détail ${link}: status=${d.status} json-ld=${ld.map((x) => x['@type']).join(',')}`);
    if (jp) console.log(`  JobPosting: ${JSON.stringify(jp).slice(0, 1200)}`);
  }
  console.log(`  recherche ?q= : ${(await probeFetch('https://www.freelance-informatique.fr/offres-freelance?q=react')).text.match(/(\d+)\s*missions? actives?/)?.[0] || '?'}`);
});
await show('freelancerepublik', 'https://www.freelancerepublik.com/freelance', async (h) => {
  console.log(`  scripts: ${scripts(h).join(' | ')}`);
  console.log(`  carte: ${around(h, 'href="/missions/', 600, 1400)}`);
  const link = (h.match(/href="(\/missions\/[^"]+)"/) || [])[1];
  if (link) {
    const d = await probeFetch(`https://www.freelancerepublik.com${link}`);
    const ld = jsonLdBlocks(d.text);
    const jp = ld.find((x) => [].concat(x['@type']).includes('JobPosting'));
    console.log(`  détail ${link}: status=${d.status} json-ld=${ld.map((x) => x['@type']).join(',')}`);
    if (jp) console.log(`  JobPosting: ${JSON.stringify(jp).slice(0, 1200)}`);
    else console.log(`  texte: ${stripTags(d.text).slice(0, 500)}`);
  }
});
await show('collective', 'https://www.collective.work/jobs/fr', async (h) => {
  const m = h.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  const nd = JSON.parse(m[1]);
  const queries = nd.props.pageProps.dehydratedState?.queries || [];
  for (const q of queries.slice(0, 8)) console.log(`  query ${JSON.stringify(q.queryKey).slice(0, 120)} → ${walkKeys(q.state?.data).slice(0, 6).join(' ; ')}`);
  const job = JSON.stringify(queries.map((q) => q.state?.data)).match(/\{[^{}]*"title"[^{}]*\}/);
  console.log(`  exemple: ${job ? job[0].slice(0, 800) : '-'}`);
});
await show('codeur', 'https://www.codeur.com/projects.rss', async (h) => {
  console.log(`  item: ${around(h, '<item>', 0, 1800)}`);
});
await show('workingnomads', 'https://www.workingnomads.com/api/exposed_jobs/', async (h) => {
  const j = JSON.parse(h);
  console.log(`  ${j.length} offres ; catégories=${JSON.stringify([...new Set(j.map((x) => x.category_name))])}`);
  console.log(`  exemple: ${JSON.stringify({ ...j[0], description: j[0].description?.slice(0, 200) })}`);
});
await show('mindquest', 'https://mindquest.io/', async (h, res) => {
  console.log(`  titre: ${(h.match(/<title>([^<]*)/) || [])[1]} scripts: ${scripts(h).join(' | ')}`);
  console.log(`  liens: ${[...new Set([...h.matchAll(/href="([^"]*(?:mission|job|offre)[^"]*)"/g)].map((m) => m[1]))].slice(0, 8).join(' | ')}`);
});
await show('lesjeudis', 'https://lesjeudis.com/emploi/informatique/ile-de-france', async (h) => {
  const ld = jsonLdBlocks(h);
  console.log(`  json-ld: ${ld.map((d) => d['@type']).join(',')} scripts: ${scripts(h).join(' | ')}`);
  console.log(`  liens: ${[...new Set([...h.matchAll(/href="([^"]*(?:offre|job|annonce)[^"]*)"/g)].map((m) => m[1]))].slice(0, 8).join(' | ')}`);
  console.log(`  texte: ${stripTags(h).slice(0, 400)}`);
});
