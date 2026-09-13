// The Muse : API publique (offres internationales, catégorie Software Engineering).
import { getJson } from '../http.js';

export default {
  id: 'themuse',
  name: 'The Muse',
  site: 'https://www.themuse.com',
  description: 'Offres The Muse (API publique), filtrées sur France + remote.',
  async fetch(ctx) {
    const jobs = [];
    for (let page = 1; page <= 4; page++) {
      const params = new URLSearchParams({ page: String(page), category: 'Software Engineering', descending: 'true' });
      for (const loc of ['Paris, France', 'Flexible / Remote']) params.append('location', loc);
      const data = await getJson(`https://www.themuse.com/api/public/jobs?${params}`, { retries: 1 });
      const items = data?.results || [];
      for (const it of items) {
        jobs.push({
          sourceId: it.id,
          title: it.name,
          company: it.company?.name,
          location: (it.locations || []).map((l) => l.name).join(' · '),
          remoteHint: (it.locations || []).some((l) => /remote/i.test(l.name)) ? 'full' : undefined,
          contractHints: [],
          url: it.refs?.landing_page,
          publishedAt: it.publication_date,
          descriptionHtml: it.contents,
          tags: [...(it.levels || []).map((l) => l.name), ...(it.categories || []).map((c) => c.name)],
        });
      }
      if (!items.length || page >= (data?.page_count || 1)) break;
    }
    ctx.progress?.(`The Muse : ${jobs.length} offres`);
    return jobs;
  },
};
