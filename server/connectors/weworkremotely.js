// We Work Remotely : flux RSS de la catégorie programmation.
import * as cheerio from 'cheerio';
import { getText } from '../http.js';

const FEEDS = ['https://weworkremotely.com/categories/remote-programming-jobs.rss', 'https://weworkremotely.com/categories/remote-full-stack-programming-jobs.rss', 'https://weworkremotely.com/categories/remote-back-end-programming-jobs.rss', 'https://weworkremotely.com/categories/remote-front-end-programming-jobs.rss'];

export default {
  id: 'weworkremotely',
  name: 'We Work Remotely',
  site: 'https://weworkremotely.com',
  description: 'Offres remote We Work Remotely (flux RSS).',
  async fetch(ctx) {
    const jobs = new Map();
    for (const feed of FEEDS) {
      let xml;
      try {
        xml = await getText(feed, { retries: 1 });
      } catch (err) {
        if (jobs.size) continue;
        throw err;
      }
      const $ = cheerio.load(xml, { xml: true });
      $('item').each((_, item) => {
        const el = $(item);
        const link = el.find('link').first().text().trim();
        const guid = el.find('guid').first().text().trim() || link;
        if (!link || jobs.has(guid)) return;
        const rawTitle = el.find('title').first().text().trim();
        const [company, ...rest] = rawTitle.split(': ');
        const type = el.find('type').first().text().trim();
        jobs.set(guid, {
          sourceId: guid.replace(/^https?:\/\/[^/]+/, ''),
          title: rest.length ? rest.join(': ') : rawTitle,
          company: rest.length ? company : '',
          location: el.find('region').first().text().trim() || 'Remote',
          remoteHint: 'full',
          contractHints: [/full/i.test(type) ? 'cdi' : /contract/i.test(type) ? 'freelance' : null].filter(Boolean),
          url: link,
          publishedAt: el.find('pubDate').first().text().trim(),
          descriptionHtml: el.find('description').first().text(),
          tags: [el.find('category').first().text().trim()].filter(Boolean),
        });
      });
    }
    ctx.progress?.(`We Work Remotely : ${jobs.size} offres`);
    return [...jobs.values()];
  },
};
