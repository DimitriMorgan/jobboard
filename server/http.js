// Petits utilitaires HTTP au-dessus de fetch (Node >= 18) : timeout, retries, User-Agent réaliste.

export const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

export class HttpError extends Error {
  constructor(status, url, body) {
    super(`HTTP ${status} sur ${url}`);
    this.status = status;
    this.url = url;
    this.body = body;
  }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function doFetch(url, { method = 'GET', headers = {}, body, timeoutMs = 25000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method,
      headers: { 'user-agent': BROWSER_UA, 'accept-language': 'fr-FR,fr;q=0.9,en;q=0.8', ...headers },
      body,
      signal: ctrl.signal,
      redirect: 'follow',
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Requête HTTP avec retries sur erreurs réseau / 5xx / 429.
 * @param {string} url
 * @param {object} opts  { method, headers, body, timeoutMs, retries, as: 'text'|'json' }
 */
export async function request(url, opts = {}) {
  const { retries = 1, as = 'text', retryDelayMs = 1500, ...fetchOpts } = opts;
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await doFetch(url, fetchOpts);
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        const err = new HttpError(res.status, url, text.slice(0, 500));
        if ((res.status === 429 || res.status >= 500) && attempt < retries) {
          lastErr = err;
          await sleep(retryDelayMs * (attempt + 1));
          continue;
        }
        throw err;
      }
      if (as === 'json') {
        const text = await res.text();
        try {
          return JSON.parse(text);
        } catch {
          throw new Error(`Réponse non JSON sur ${url} (début : ${text.slice(0, 120).replace(/\s+/g, ' ')})`);
        }
      }
      return await res.text();
    } catch (err) {
      if (err instanceof HttpError) throw err;
      lastErr = err;
      if (attempt < retries) {
        await sleep(retryDelayMs * (attempt + 1));
        continue;
      }
    }
  }
  throw lastErr;
}

export const getText = (url, opts = {}) => request(url, { ...opts, as: 'text' });
export const getJson = (url, opts = {}) =>
  request(url, { ...opts, as: 'json', headers: { accept: 'application/json', ...(opts.headers || {}) } });
export const postJson = (url, body, opts = {}) =>
  request(url, {
    ...opts,
    method: 'POST',
    as: 'json',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', accept: 'application/json', ...(opts.headers || {}) },
  });

/** Exécute des tâches asynchrones avec une concurrence maximale. */
export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}
