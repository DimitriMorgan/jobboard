// Posts LinkedIn : annonces publiées sous forme de posts (« Je recrute un dev React freelance… »), invisibles dans LinkedIn Emplois.
//
// Deux entrées :
//  - URL ajoutées à la main (bouton « Ajouter un post LinkedIn » du site → workflow GitHub, ou POST /api/refresh) ;
//  - découverte automatique optionnelle via une API de recherche (TAVILY_API_KEY, gratuit 1 000 requêtes/mois,
//    ou SERPAPI_KEY) : les moteurs de recherche classiques bloquent les requêtes venant de GitHub Actions.
// Les posts publics se lisent sans connexion (JSON-LD SocialMediaPosting : texte, date, auteur).
import * as cheerio from 'cheerio';
import { getText, postJson, getJson, sleep, HttpError } from '../http.js';
import { jsonLd, isType, decodeText } from '../scrape.js';
import { parseDetail, linkedinContracts } from './linkedin.js';

const DETAIL = 'https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/';

/** Date d'un post d'après son identifiant d'activité (les 41 premiers bits = horodatage en ms). */
export function activityDate(id) {
  try {
    return new Date(Number(BigInt(id) >> 22n)).toISOString();
  } catch {
    return null;
  }
}

/** Normalise une URL LinkedIn fournie : post, activité ou offre. Renvoie { kind, id, url } ou null. */
export function parseLinkedinUrl(input) {
  const s = String(input || '').trim();
  let m = s.match(/linkedin\.com\/posts\/[^?#\s]*?activity-(\d{15,20})[^?#\s]*/i);
  if (m) return { kind: 'post', id: m[1], url: `https://www.linkedin.com/posts/${s.split('/posts/')[1].split(/[?#\s]/)[0]}` };
  // Post ouvert depuis le fil (clic sur la date) ou une notification : on garde le type d'URN, l'identifiant
  // d'un ugcPost ou d'un share n'est pas celui de l'activité. Les « : » sont parfois encodés (%3A).
  m = s.match(/urn(?::|%3A)li(?::|%3A)(activity|share|ugcPost)(?::|%3A)(\d{15,20})/i);
  if (m) {
    const type = { activity: 'activity', share: 'share', ugcpost: 'ugcPost' }[m[1].toLowerCase()];
    return { kind: 'post', id: m[2], url: `https://www.linkedin.com/feed/update/urn:li:${type}:${m[2]}/` };
  }
  m = s.match(/linkedin\.com\/feed\/update\/[^\s]*?(\d{15,20})/i);
  if (m) return { kind: 'post', id: m[1], url: `https://www.linkedin.com/feed/update/urn:li:activity:${m[1]}/` };
  m = s.match(/linkedin\.com\/jobs\/view\/(?:[^/?#\s]*-)?(\d{8,})/i) || s.match(/currentJobId=(\d{8,})/i);
  if (m) return { kind: 'job', id: m[1], url: `https://www.linkedin.com/jobs/view/${m[1]}/` };
  return null;
}

export function splitUrls(text) {
  return String(text || '')
    .split(/[\s,;]+/)
    .map(parseLinkedinUrl)
    .filter(Boolean)
    .filter((u, i, arr) => arr.findIndex((x) => x.kind === u.kind && x.id === u.id) === i);
}

const OFFER_RE = /\b(?:recrut\w*|je (?:re)?cherche|nous (?:re)?cherchons|on (?:re)?cherche|(?:re)?cherche (?:un|une|des) (?:dev|développeu|profil|freelance|consultant|ingénieur)|hiring|we'?re hiring|opportunit[ée]|mission|poste|cdi|freelance|tjm|rejoindre|rejoignez|candidat|postuler|envoie[zr]?-? ?(?:moi|nous)? ?(?:ton|votre) cv)/i;
const CANDIDATE_RE = /#?open ?to ?work|je suis (?:actuellement )?(?:disponible|à l[’']écoute|en recherche|freelance et disponible)|disponible (?:pour|dès|immédiatement|à partir)|à l[’']écoute (?:de nouvelles |d[’'])?opportunit|je (?:re)?cherche (?:une|un|ma|mon) (?:nouvelle? |prochaine? )?(?:mission|poste|opportunit|cdi|emploi|alternance|stage)|looking for (?:a|my next|new) (?:role|position|job|opportunit|mission)|mon profil|ma candidature/i;

/** Un post est-il une annonce (et pas un candidat / du contenu) ? */
export function looksLikeOffer(text) {
  const t = String(text || '');
  if (CANDIDATE_RE.test(t.slice(0, 600))) return false;
  return OFFER_RE.test(t);
}

/** Titre lisible : première phrase ou ligne significative du post. */
export function postTitle(text, fallback = '') {
  const clean = String(text || '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/(^|\s)#\w+/g, ' ')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, ' ');
  const first = clean.split(/\n+|(?<=[.!?])\s+/).map((s) => s.replace(/\s+/g, ' ').trim()).find((s) => s.length >= 12) || fallback;
  return first.length > 110 ? `${first.slice(0, 107).trim()}…` : first;
}

const CITIES = /\b(Paris|Lyon|Marseille|Toulouse|Nantes|Bordeaux|Lille|Rennes|Nice|Strasbourg|Montpellier|Grenoble|Aix-en-Provence|Sophia[- ]Antipolis|Rouen|Tours|Nancy|Metz|Brest|Caen|Dijon|Angers|Orléans|Clermont-Ferrand|Annecy|La Défense|Île-de-France|Ile-de-France|Luxembourg|Genève|Bruxelles)\b/i;

/** Lit un post public : texte, date, auteur (JSON-LD SocialMediaPosting, repli sur les balises og:). */
export function parsePost(html) {
  const $ = cheerio.load(html);
  const post = jsonLd($).find((d) => isType(d, 'SocialMediaPosting') || isType(d, 'DiscussionForumPosting') || isType(d, 'Article'));
  const og = (p) => $(`meta[property="og:${p}"], meta[name="og:${p}"]`).attr('content') || '';
  const text = post?.articleBody || post?.text || og('description') || '';
  return {
    text: decodeText(text) ? String(text).replace(/\r/g, '') : '',
    headline: decodeText(post?.headline || og('title')),
    author: decodeText([].concat(post?.author || [])[0]?.name || og('title').split('|').pop() || ''),
    datePublished: post?.datePublished || null,
  };
}

export function postToRaw(parsed, ref, { manual = false } = {}) {
  const text = parsed.text || parsed.headline;
  const hashtags = [...text.matchAll(/#(\w{2,30})/g)].map((m) => m[1]).slice(0, 12);
  const french = (text.match(/\b(?:le|la|les|des|une|pour|avec|nous|vous|mission|poste)\b/gi) || []).length >= 3;
  return {
    sourceId: ref.id,
    title: postTitle(text, parsed.headline || 'Post LinkedIn'),
    company: parsed.author || 'Post LinkedIn',
    location: text.match(CITIES)?.[0] || '',
    countryHint: french ? 'FR' : undefined,
    contractHints: [],
    url: ref.url,
    publishedAt: parsed.datePublished || activityDate(ref.id),
    descriptionText: text,
    tags: ['Post LinkedIn', ...(manual ? ['Ajout manuel'] : []), ...hashtags],
    forceKeep: manual,
  };
}

/** Découverte de posts via une API de recherche (Tavily ou SerpApi). */
async function discover(ctx) {
  const tavily = process.env.TAVILY_API_KEY;
  const serp = process.env.SERPAPI_KEY;
  if (!tavily && !serp) return [];
  const budget = Number(process.env.LINKEDIN_POSTS_QUERIES) || (tavily ? 8 : 3);
  const topics = [
    '(react OR "node.js" OR nodejs OR javascript OR typescript)',
    '(php OR symfony OR laravel)',
    '(".net" OR "c#" OR dotnet)',
    '(react OR node OR php OR ".net") freelance TJM',
    '(react OR node OR php OR ".net") CDI "nous recrutons"',
  ];
  const lead = ['"mission freelance"', '"je recrute"', '"recherche un développeur"', '"nous recherchons"'];
  const queries = [];
  for (const t of topics) for (const l of lead) queries.push(`${l} ${t}`);
  const found = new Map();
  for (const q of queries.slice(0, budget)) {
    try {
      let results = [];
      if (tavily) {
        const r = await postJson('https://api.tavily.com/search', { query: `${q} site:linkedin.com/posts`, search_depth: 'basic', topic: 'general', max_results: 20, time_range: 'week', include_domains: ['linkedin.com'] }, { headers: { authorization: `Bearer ${tavily}` }, retries: 1 });
        results = (r.results || []).map((x) => x.url);
      } else {
        const r = await getJson(`https://serpapi.com/search.json?${new URLSearchParams({ engine: 'google', q: `site:linkedin.com/posts ${q}`, tbs: 'qdr:w', num: '20', hl: 'fr', gl: 'fr', api_key: serp })}`, { retries: 1 });
        results = (r.organic_results || []).map((x) => x.link);
      }
      for (const u of results) {
        const ref = parseLinkedinUrl(u);
        if (ref?.kind === 'post') found.set(ref.id, ref);
      }
      ctx.progress?.(`Posts LinkedIn : « ${q.slice(0, 50)} » → ${results.length} résultats`);
    } catch (err) {
      ctx.progress?.(`Posts LinkedIn : recherche impossible (${err.message})`);
      if (err instanceof HttpError && (err.status === 401 || err.status === 403 || err.status === 432 || err.status === 429)) break;
    }
    await sleep(500);
  }
  return [...found.values()];
}

export default {
  id: 'linkedin-posts',
  name: 'Posts LinkedIn',
  site: 'https://www.linkedin.com/feed/',
  description: 'Annonces publiées en posts LinkedIn : ajout manuel depuis le site, découverte automatique avec une clé Tavily ou SerpApi.',
  async fetch(ctx) {
    const manual = splitUrls([...(ctx.manualUrls || []), process.env.LINKEDIN_POST_URLS || ''].join(' '));
    const discovered = ctx.manualOnly ? [] : await discover(ctx);
    const maxAge = Date.now() - (Number(process.env.LINKEDIN_POSTS_MAX_AGE_DAYS) || 21) * 86400e3;
    const refs = [...manual.map((r) => ({ ...r, manual: true })), ...discovered.filter((d) => !manual.some((m) => m.id === d.id) && !ctx.isKnown?.(d.id))];
    const jobs = [];
    let skipped = 0;
    for (const ref of refs) {
      try {
        if (ref.kind === 'job') {
          const d = parseDetail(await getText(DETAIL + ref.id, { retries: 1 }));
          jobs.push({
            sourceId: `job-${ref.id}`,
            title: d.title,
            company: d.company,
            location: d.location,
            countryHint: 'FR',
            contractHints: linkedinContracts(d.title, d.descriptionHtml, d.typeContract),
            salary: d.salary,
            url: ref.url,
            descriptionHtml: d.descriptionHtml,
            tags: ['Ajout manuel', ...Object.entries(d.criteria).map(([k, v]) => `${k} : ${v}`)],
            forceKeep: true,
          });
        } else {
          const parsed = parsePost(await getText(ref.url, { retries: 1 }));
          if (!parsed.text) {
            skipped++;
            continue;
          }
          const date = parsed.datePublished || activityDate(ref.id);
          if (!ref.manual && (!looksLikeOffer(parsed.text) || (date && Date.parse(date) < maxAge))) {
            skipped++;
            continue;
          }
          jobs.push(postToRaw(parsed, ref, { manual: !!ref.manual }));
        }
      } catch (err) {
        ctx.progress?.(`Posts LinkedIn : lecture impossible de ${ref.url} (${err.message})`);
      }
      await sleep(1200);
    }
    ctx.progress?.(`Posts LinkedIn : ${manual.length} ajout(s) manuel(s), ${discovered.length} découverts, ${jobs.length} retenus, ${skipped} écartés (candidats, contenu, trop anciens)`);
    return jobs;
  },
};
