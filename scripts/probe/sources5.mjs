// Structure HTML : ligne de méta des cartes LesJeudis, cartes Jobijoba sans contrat, résumé HelloWork.
import { probeFetch, sleep } from './lib.mjs';
import * as cheerio from 'cheerio';

const lj = await probeFetch('https://lesjeudis.com/emploi/developpement');
const $ = cheerio.load(lj.text);
const a = $('a[href^="/offers/"][aria-label]').first();
const card = a.parent();
console.log('### LesJeudis : HTML du second lien de la carte');
console.log(card.find('a[href^="/offers/"]').last().html().replace(/class="[^"]*"/g, '').replace(/\s+/g, ' ').slice(0, 3500));
console.log('\n### LesJeudis : feuilles de texte');
console.log(JSON.stringify(card.find('a[href^="/offers/"]').last().find('*').contents().filter((_, n) => n.type === 'text').map((_, n) => $(n).text().trim()).get().filter(Boolean)).slice(0, 1500));
await sleep(800);
const jj = await probeFetch('https://www.jobijoba.com/fr/query/?what=d%C3%A9veloppeur%20react&where=France&where_type=country');
const $$ = cheerio.load(jj.text);
let shown = 0;
$$('div.offer[data-id]').each((_, el) => {
  if (shown >= 2 || $$(el).find('.icon-register').length) return;
  shown++;
  console.log(`\n### Jobijoba : carte sans icône de contrat\n${$$(el).html().replace(/data-product="[^"]*"/, '').replace(/\s+/g, ' ').slice(0, 2500)}`);
});
console.log(`\nJobijoba : ${$$('div.offer[data-id]').length} cartes, ${$$('div.offer[data-id] .icon-register').length} avec contrat`);
