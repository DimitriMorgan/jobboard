// Hacker News "Who is hiring?" : commentaires du fil mensuel via l'API Algolia de HN.
import { getJson } from '../http.js';
import { htmlToText } from '../normalize.js';

export default {
  id: 'hackernews',
  name: 'HN Who is hiring',
  site: 'https://news.ycombinator.com',
  description: 'Fil mensuel « Who is hiring? » de Hacker News, filtré sur France / remote.',
  async fetch(ctx) {
    const search = await getJson('https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&query=%22who%20is%20hiring%22&hitsPerPage=2', { retries: 1 });
    const threads = (search?.hits || []).filter((h) => /who is hiring/i.test(h.title)).slice(0, 2);
    const jobs = [];
    for (const thread of threads) {
      const item = await getJson(`https://hn.algolia.com/api/v1/items/${thread.objectID}`, { retries: 1 });
      for (const c of item?.children || []) {
        if (!c.text) continue;
        const text = htmlToText(c.text);
        if (!/\b(france|paris|remote|europe|emea|lyon|nantes|bordeaux|lille|toulouse)\b/i.test(text)) continue;
        // Posts de candidats (format « Who wants to be hired ») glissés dans le fil
        if (/^\s*location\s*:|willing to relocate|seeking (?:work|freelance)|looking for (?:a )?(?:job|role|work)/i.test(text.slice(0, 200))) continue;
        const firstLine = text.split(/\s\|\s|\n/)[0].slice(0, 120);
        const parts = text.split('|').map((s) => s.trim());
        if (parts.length < 2 || parts[0].length > 80) continue;
        jobs.push({
          sourceId: c.id,
          title: parts[1] && parts[1].length < 90 ? parts[1] : firstLine,
          company: parts[0].slice(0, 80),
          location: parts.slice(1, 5).find((p) => /remote|france|paris|europe|onsite|hybrid/i.test(p)) || '',
          remoteHint: /\bremote\b/i.test(text.slice(0, 300)) ? 'full' : undefined,
          contractHints: [],
          url: `https://news.ycombinator.com/item?id=${c.id}`,
          publishedAt: c.created_at,
          descriptionHtml: c.text,
          tags: [thread.title],
        });
      }
    }
    ctx.progress?.(`HN : ${jobs.length} annonces France / remote`);
    return jobs;
  },
};
