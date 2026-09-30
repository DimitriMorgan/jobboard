// Moteurs de recherche utilisables sans clé depuis GitHub Actions pour trouver des posts LinkedIn publics.
// Usage : node scripts/probe/search.mjs [moteur1 moteur2 ...]
import { probeFetch, sleep, stripTags, jsonLdBlocks, BLOCK_RE } from './lib.mjs';

const QUERIES = [
  'site:linkedin.com/posts freelance react',
  'site:linkedin.com/posts "mission freelance" développeur',
  'site:linkedin.com/posts recrute développeur php symfony',
  'site:linkedin.com/posts TJM node.js',
];

const e = encodeURIComponent;
const ENGINES = {
  'ddg-html': (q) => `https://html.duckduckgo.com/html/?q=${e(q)}&df=w&kl=fr-fr`,
  'ddg-lite': (q) => `https://lite.duckduckgo.com/lite/?q=${e(q)}&df=w&kl=fr-fr`,
  bing: (q) => `https://www.bing.com/search?q=${e(q)}&filters=ex1%3a%22ez2%22&setlang=fr&cc=FR&count=30`,
  'bing-rss': (q) => `https://www.bing.com/search?format=rss&q=${e(q)}&setlang=fr&cc=FR&count=30`,
  yahoo: (q) => `https://search.yahoo.com/search?p=${e(q)}&btf=w&n=30`,
  mojeek: (q) => `https://www.mojeek.com/search?q=${e(q)}&since=7`,
  brave: (q) => `https://search.brave.com/search?q=${e(q)}&tf=pw`,
  startpage: (q) => `https://www.startpage.com/do/search?q=${e(q)}&with_date=w`,
  google: (q) => `https://www.google.com/search?q=${e(q)}&tbs=qdr:w&hl=fr&num=30`,
  qwant: (q) => `https://api.qwant.com/v3/search/web?q=${e(q)}&count=10&locale=fr_FR&offset=0&device=desktop`,
  ecosia: (q) => `https://www.ecosia.org/search?method=index&q=${e(q)}`,
  yandex: (q) => `https://yandex.com/search/?text=${e(q)}&lr=124`,
};

/** Extrait les URL de posts LinkedIn, y compris depuis les liens de redirection encodés des moteurs. */
export function extractPostUrls(html) {
  const chunks = [html];
  for (const m of html.matchAll(/(?:uddg|RU|q|url|u)=([^&"'\s<>]+)/g)) {
    try {
      chunks.push(decodeURIComponent(m[1]));
    } catch {
      /* ignore */
    }
  }
  for (const m of html.matchAll(/[?&;]u=a1([A-Za-z0-9_-]+)/g)) {
    try {
      chunks.push(Buffer.from(m[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    } catch {
      /* ignore */
    }
  }
  const urls = new Set();
  for (const c of chunks) {
    for (const m of c.replace(/&amp;/g, '&').matchAll(/https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/posts\/[A-Za-z0-9_%\-.~]+/g)) urls.add(m[0].replace(/^https?:\/\/[a-z]{2,3}\.linkedin/, 'https://www.linkedin').replace(/^http:/, 'https:'));
  }
  return [...urls];
}

const only = process.argv.slice(2);
const engines = Object.entries(ENGINES).filter(([name]) => !only.length || only.includes(name));
const working = [];
const allUrls = new Set();

for (const [name, build] of engines) {
  const res = await probeFetch(build(QUERIES[0]));
  const urls = res.ok ? extractPostUrls(res.text) : [];
  const blocked = BLOCK_RE.test(res.text.slice(0, 30000));
  console.log(`\n### ${name}: status=${res.status}${res.error ? ' ' + res.error : ''} len=${res.text.length} posts=${urls.length}${blocked ? ' ⚠ blocage probable' : ''}`);
  if (urls.length) {
    console.log(`  ex: ${urls.slice(0, 3).join('\n      ')}`);
    working.push(name);
    urls.forEach((u) => allUrls.add(u));
  } else console.log(`  texte: ${stripTags(res.text).slice(0, 200)}`);
  await sleep(1500);
}

console.log(`\n## Requêtes supplémentaires sur les moteurs qui répondent : ${working.join(', ') || 'aucun'}`);
for (const name of working) {
  for (const q of QUERIES.slice(1)) {
    const res = await probeFetch(ENGINES[name](q));
    const urls = res.ok ? extractPostUrls(res.text) : [];
    urls.forEach((u) => allUrls.add(u));
    console.log(`  ${name} « ${q} » → status=${res.status} posts=${urls.length}`);
    await sleep(2000);
  }
}

console.log(`\n## Lecture directe de posts publics (${allUrls.size} URL trouvées)`);
for (const url of [...allUrls].slice(0, 6)) {
  const res = await probeFetch(url);
  const ld = jsonLdBlocks(res.text);
  const post = ld.find((d) => /Posting|Article/.test([].concat(d['@type']).join(' ')));
  const og = (p) => (res.text.match(new RegExp(`<meta[^>]+property="og:${p}"[^>]+content="([^"]*)"`)) || [])[1] || '';
  console.log(`\n  ${url.slice(0, 120)}`);
  console.log(`    status=${res.status} final=${res.finalUrl.slice(0, 90)} authwall=${/authwall|login/.test(res.finalUrl)}`);
  console.log(`    og:title=${og('title').slice(0, 100)}`);
  console.log(`    og:description=${og('description').slice(0, 160)}`);
  console.log(`    json-ld=${ld.map((d) => [].concat(d['@type']).join('|')).join(',')} articleBody=${post?.articleBody?.length || 0} date=${post?.datePublished || ''} auteur=${post?.author?.name || ''}`);
  if (post?.articleBody) console.log(`    extrait: ${post.articleBody.slice(0, 200).replace(/\s+/g, ' ')}`);
  await sleep(1500);
}
