// Bing : pourquoi 0 post LinkedIn ? Affiche les résultats bruts pour plusieurs formulations.
import { probeFetch, sleep, stripTags } from './lib.mjs';

const e = encodeURIComponent;
const QUERIES = [
  'site:linkedin.com/posts freelance react',
  'site:linkedin.com freelance react mission',
  'linkedin.com/posts mission freelance développeur react',
  'site:fr.linkedin.com/posts freelance développeur',
  'inurl:posts site:linkedin.com recrute développeur',
  '"linkedin.com/posts" TJM développeur',
];
for (const q of QUERIES) {
  for (const [label, url] of [
    ['html', `https://www.bing.com/search?q=${e(q)}&setlang=fr&cc=FR&count=30`],
    ['html-semaine', `https://www.bing.com/search?q=${e(q)}&setlang=fr&cc=FR&count=30&filters=ex1%3a%22ez2%22`],
    ['rss', `https://www.bing.com/search?format=rss&q=${e(q)}&setlang=fr&cc=FR&count=30`],
  ]) {
    const res = await probeFetch(url);
    let links = [];
    if (label === 'rss') links = [...res.text.matchAll(/<item>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<link>([\s\S]*?)<\/link>/g)].map((m) => `${m[2]} :: ${stripTags(m[1]).slice(0, 60)}`);
    else links = [...res.text.matchAll(/<li class="b_algo"[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => `${m[1].replace(/&amp;/g, '&').slice(0, 110)} :: ${stripTags(m[2]).slice(0, 60)}`);
    const noRes = /Aucun résultat|There are no results|b_no/.test(res.text);
    console.log(`\n### [${label}] ${q}\n  status=${res.status} len=${res.text.length} résultats=${links.length}${noRes ? ' (page « aucun résultat »)' : ''}`);
    for (const l of links.slice(0, 5)) console.log(`   - ${l}`);
    if (!links.length && label !== 'rss') {
      const i = res.text.indexOf('b_results');
      console.log(`  extrait b_results: ${stripTags(res.text.slice(i, i + 3000)).slice(0, 300)}`);
    }
    if (!links.length && label === 'rss') console.log(`  rss: ${res.text.slice(0, 600).replace(/\s+/g, ' ')}`);
    await sleep(2500);
  }
}
