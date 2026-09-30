// Outils communs aux scripts de diagnostic (exécutés sur les serveurs GitHub Actions).
export const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
export const HTML_HEADERS = {
  'user-agent': UA,
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'accept-language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
};
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Requête brute : ne lève pas d'exception sur les statuts HTTP, renvoie tout ce qu'il faut pour diagnostiquer. */
export async function probeFetch(url, { method = 'GET', headers = {}, body, timeoutMs = 25000 } = {}) {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method, headers: { ...HTML_HEADERS, ...headers }, body, signal: ctrl.signal, redirect: 'follow' });
    const text = await res.text();
    return { ok: res.ok, status: res.status, ms: Date.now() - t0, finalUrl: res.url, contentType: res.headers.get('content-type') || '', text, headers: res.headers };
  } catch (err) {
    return { ok: false, status: 0, ms: Date.now() - t0, finalUrl: url, contentType: '', text: '', error: err.cause?.code || err.message };
  } finally {
    clearTimeout(timer);
  }
}

export const BLOCK_RE = /captcha|cf-chl|just a moment|access denied|unusual traffic|are you a robot|attention required|px-captcha|datadome|verify you are human|request unsuccessful|enable javascript and cookies|authwall/i;

export function stripTags(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export function jsonLdBlocks(html) {
  const out = [];
  for (const m of String(html).matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(m[1].trim());
      const stack = Array.isArray(data) ? [...data] : [data];
      while (stack.length) {
        const d = stack.shift();
        if (!d || typeof d !== 'object') continue;
        out.push(d);
        if (Array.isArray(d['@graph'])) stack.push(...d['@graph']);
        if (Array.isArray(d.itemListElement)) for (const el of d.itemListElement) stack.push(el.item || el);
      }
    } catch {
      out.push({ '@type': 'INVALID_JSON' });
    }
  }
  return out;
}

/** Résumé compact d'une page HTML / d'une réponse JSON ou RSS. */
export function summarize(res, { linkRe } = {}) {
  const t = res.text || '';
  const lines = [];
  const ct = res.contentType.split(';')[0];
  lines.push(`status=${res.status}${res.error ? ` error=${res.error}` : ''} ms=${res.ms} type=${ct} len=${t.length}${res.finalUrl ? ` final=${res.finalUrl.slice(0, 140)}` : ''}`);
  if (!t) return lines;
  if (/json/.test(ct) || /^\s*[[{]/.test(t)) {
    try {
      const j = JSON.parse(t);
      const describe = (v) => (Array.isArray(v) ? `array(${v.length})` : v && typeof v === 'object' ? `{${Object.keys(v).slice(0, 12).join(',')}}` : JSON.stringify(v)?.slice(0, 40));
      if (Array.isArray(j)) {
        lines.push(`json array(${j.length}) first=${describe(j[0])}`);
        if (j[1]) lines.push(`  second=${describe(j[1])}`);
      } else lines.push(`json keys: ${Object.entries(j).slice(0, 15).map(([k, v]) => `${k}=${describe(v)}`).join(' ')}`);
      return lines;
    } catch {
      /* pas du JSON */
    }
  }
  const title = (t.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1];
  if (title) lines.push(`title: ${title.replace(/\s+/g, ' ').trim().slice(0, 120)}`);
  const items = t.match(/<item[\s>]/gi);
  if (items) lines.push(`rss items=${items.length} first=${((t.match(/<item[\s\S]*?<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i) || [])[1] || '').slice(0, 100)}`);
  const ld = jsonLdBlocks(t);
  if (ld.length) {
    const types = {};
    for (const d of ld) {
      const ty = [].concat(d['@type'] || '?').join('|');
      types[ty] = (types[ty] || 0) + 1;
    }
    lines.push(`json-ld: ${JSON.stringify(types)}`);
    const jp = ld.find((d) => [].concat(d['@type']).includes('JobPosting'));
    if (jp) lines.push(`  JobPosting keys=${Object.keys(jp).join(',').slice(0, 200)} title=${String(jp.title || '').slice(0, 80)}`);
  }
  const next = t.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (next) {
    try {
      const nd = JSON.parse(next[1]);
      lines.push(`__NEXT_DATA__ page=${nd.page} pageProps=${Object.keys(nd.props?.pageProps || {}).slice(0, 15).join(',')} size=${next[1].length}`);
    } catch {
      lines.push('__NEXT_DATA__ (illisible)');
    }
  }
  for (const marker of ['__NUXT__', '__INITIAL_STATE__', '__APOLLO_STATE__', '__PRELOADED_STATE__', 'window.__data', 'ng-state', 'data-page=']) if (t.includes(marker)) lines.push(`marker: ${marker}`);
  const algoliaIds = new Set([...t.matchAll(/(?:appId|applicationId|application_id|ALGOLIA_APP(?:LICATION)?_ID|algoliaAppId)["']?\s*[:=]\s*["']([A-Z0-9]{10})["']/g)].map((m) => m[1]));
  const algoliaKeys = new Set([...t.matchAll(/(?:apiKey|searchApiKey|search_api_key|ALGOLIA_(?:SEARCH_)?API_KEY|algoliaApiKey|searchKey)["']?\s*[:=]\s*["']([a-f0-9]{32}|[A-Za-z0-9=]{60,})["']/g)].map((m) => m[1]));
  const indexes = new Set([...t.matchAll(/(?:indexName|index_name|ALGOLIA_INDEX\w*)["']?\s*[:=]\s*["']([\w.-]+)["']/g)].map((m) => m[1]));
  if (/algolia/i.test(t)) lines.push(`algolia: ids=${[...algoliaIds].join(',') || '-'} keys=${[...algoliaKeys].map((k) => k.slice(0, 12) + '…').join(',') || '-'} indexes=${[...indexes].slice(0, 5).join(',') || '-'}`);
  if (linkRe) {
    const links = [...new Set([...t.matchAll(/href="([^"]+)"/g)].map((m) => m[1]).filter((h) => linkRe.test(h)))];
    lines.push(`links /${linkRe.source}/ : ${links.length}${links.length ? ' ex: ' + links.slice(0, 3).join(' | ') : ''}`);
  }
  if (BLOCK_RE.test(t.slice(0, 20000))) lines.push(`⚠ blocage probable (${(t.match(BLOCK_RE) || [])[0]})`);
  const text = stripTags(t);
  lines.push(`texte: ${text.slice(0, 220)}`);
  return lines;
}

export function print(name, lines) {
  console.log(`\n### ${name}`);
  for (const l of lines) console.log(`  ${l}`);
}

export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i], i);
      }
    }),
  );
  return results;
}
