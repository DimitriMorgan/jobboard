// Diagnostic « sites carrières » : découverte d'entreprises par plateforme de recrutement (index Common Crawl)
// puis test de l'interface publique d'offres de chaque plateforme sur quelques entreprises trouvées.
// Usage : node scripts/probe/careers.mjs [limite d'URL par motif=3000]
import { probeFetch, sleep } from './lib.mjs';

const LIMIT = Number(process.argv[2]) || 3000;
const J = { accept: 'application/json' };

const PATTERNS = [
  { ats: 'lever', q: 'jobs.lever.co/*', slug: (u) => u.pathname.split('/')[1] },
  { ats: 'lever-eu', q: 'jobs.eu.lever.co/*', slug: (u) => u.pathname.split('/')[1] },
  { ats: 'greenhouse', q: 'boards.greenhouse.io/*', slug: (u) => u.pathname.split('/')[1] },
  { ats: 'greenhouse', q: 'job-boards.greenhouse.io/*', slug: (u) => u.pathname.split('/')[1] },
  { ats: 'greenhouse-eu', q: 'job-boards.eu.greenhouse.io/*', slug: (u) => u.pathname.split('/')[1] },
  { ats: 'ashby', q: 'jobs.ashbyhq.com/*', slug: (u) => u.pathname.split('/')[1] },
  { ats: 'recruitee', q: '*.recruitee.com', slug: (u) => u.hostname.split('.')[0] },
  { ats: 'teamtailor', q: '*.teamtailor.com', slug: (u) => u.hostname.split('.')[0] },
  { ats: 'workable', q: 'apply.workable.com/*', slug: (u) => u.pathname.split('/')[1] },
  { ats: 'smartrecruiters', q: 'jobs.smartrecruiters.com/*', slug: (u) => u.pathname.split('/')[1] },
  { ats: 'personio', q: '*.jobs.personio.de', slug: (u) => u.hostname.split('.')[0] },
  { ats: 'personio', q: '*.jobs.personio.com', slug: (u) => u.hostname.split('.')[0] },
  { ats: 'breezy', q: '*.breezy.hr', slug: (u) => u.hostname.split('.')[0] },
  { ats: 'workday', q: '*.myworkdayjobs.com', slug: (u) => { const seg = u.pathname.split('/').filter(Boolean).filter((s) => !/^[a-z]{2}-[A-Z]{2}$/.test(s)); return seg[0] && !/^(wday|job|details)$/i.test(seg[0]) ? `${u.hostname}|${seg[0]}` : ''; } },
  { ats: 'taleez', q: 'taleez.com/careers/*', slug: (u) => u.pathname.split('/')[2] },
  { ats: 'jobaffinity', q: '*.jobaffinity.fr', slug: (u) => u.hostname.split('.')[0] },
  { ats: 'flatchr', q: 'careers.flatchr.io/*', slug: (u) => u.pathname.split('/')[2] || u.pathname.split('/')[1] },
  { ats: 'welcomekit', q: '*.welcomekit.co', slug: (u) => u.hostname.split('.')[0] },
  { ats: 'jobvite', q: 'jobs.jobvite.com/*', slug: (u) => u.pathname.split('/')[1] },
  { ats: 'join', q: 'join.com/companies/*', slug: (u) => u.pathname.split('/')[2] },
  { ats: 'bamboohr', q: '*.bamboohr.com', slug: (u) => u.hostname.split('.')[0] },
];
const JUNK = /^(|www|api|jobs|careers|app|help|support|static|assets|embed|v0|v1|search|robots\.txt|sitemap.*|favicon.*|signin|login|en|fr|de)$/i;

const info = await probeFetch('https://index.commoncrawl.org/collinfo.json', { headers: J });
const indexes = info.ok ? JSON.parse(info.text) : [];
console.log('Common Crawl', info.status, info.ms + ' ms', 'index', indexes.slice(0, 3).map((i) => i.id).join(', '));
const idx = indexes[0]?.id;
const slugs = {};
for (const p of PATTERNS) {
  if (!idx) break;
  const base = `https://index.commoncrawl.org/${idx}-index?url=${encodeURIComponent(p.q)}&output=json&fl=url`;
  let pages = '?';
  const np = await probeFetch(`${base}&showNumPages=true`, { headers: J, timeoutMs: 60000 });
  try { pages = JSON.parse(np.text).pages; } catch {}
  let r = null;
  for (let a = 0; a < 3; a++) {
    r = await probeFetch(`${base}&limit=${LIMIT}`, { headers: J, timeoutMs: 90000 });
    if (r.ok || r.status === 404) break;
    await sleep(5000 * (a + 1));
  }
  const set = (slugs[p.ats] ||= new Set());
  let lines = 0;
  for (const line of (r.text || '').split('\n')) {
    if (!line.trim()) continue;
    lines++;
    try {
      const s = p.slug(new URL(JSON.parse(line).url));
      if (s && !JUNK.test(s)) set.add(decodeURIComponent(s).toLowerCase());
    } catch {}
  }
  console.log(`${p.ats.padEnd(16)} ${p.q.padEnd(32)} statut ${r.status} ${String(r.ms).padStart(6)} ms  pages ${pages}  urls ${lines}  slugs cumulés ${set.size}  ex. ${[...set].slice(0, 6).join(' ')}`);
  await sleep(1500);
}

const pick = (ats, n = 4) => [...(slugs[ats] || [])].filter((s) => !s.includes('|') || ats === 'workday').slice(0, n * 3);
const fr = (s) => /france|paris|lyon|marseille|toulouse|bordeaux|lille|nantes|rennes|nice|montpellier|strasbourg|grenoble|\bfr\b/i.test(s || '');
const TESTS = {
  lever: (s) => ({ url: `https://api.lever.co/v0/postings/${s}?mode=json`, list: (d) => d, loc: (j) => j.categories?.location }),
  'lever-eu': (s) => ({ url: `https://api.eu.lever.co/v0/postings/${s}?mode=json`, list: (d) => d, loc: (j) => j.categories?.location }),
  greenhouse: (s) => ({ url: `https://boards-api.greenhouse.io/v1/boards/${s}/jobs?content=true`, list: (d) => d.jobs, loc: (j) => j.location?.name }),
  'greenhouse-eu': (s) => ({ url: `https://boards-api.eu.greenhouse.io/v1/boards/${s}/jobs?content=true`, list: (d) => d.jobs, loc: (j) => j.location?.name }),
  ashby: (s) => ({ url: `https://api.ashbyhq.com/posting-api/job-board/${s}?includeCompensation=true`, list: (d) => d.jobs, loc: (j) => j.location }),
  recruitee: (s) => ({ url: `https://${s}.recruitee.com/api/offers/`, list: (d) => d.offers, loc: (j) => `${j.location} ${j.country_code}` }),
  teamtailor: (s) => ({ url: `https://${s}.teamtailor.com/jobs.rss`, raw: true }),
  workable: (s) => ({ url: `https://apply.workable.com/api/v1/widget/accounts/${s}?details=true`, list: (d) => d.jobs, loc: (j) => `${j.city} ${j.country}` }),
  smartrecruiters: (s) => ({ url: `https://api.smartrecruiters.com/v1/companies/${s}/postings?limit=100`, list: (d) => d.content, loc: (j) => `${j.location?.city} ${j.location?.country}` }),
  personio: (s) => ({ url: `https://${s}.jobs.personio.de/xml`, raw: true }),
  breezy: (s) => ({ url: `https://${s}.breezy.hr/json`, list: (d) => d, loc: (j) => j.location?.name || j.location?.country?.name }),
  taleez: (s) => ({ url: `https://taleez.com/careers/${s}`, raw: true }),
  jobaffinity: (s) => ({ url: `https://${s}.jobaffinity.fr/`, raw: true }),
  welcomekit: (s) => ({ url: `https://${s}.welcomekit.co/`, raw: true }),
  join: (s) => ({ url: `https://join.com/companies/${s}`, raw: true }),
  bamboohr: (s) => ({ url: `https://${s}.bamboohr.com/careers/list`, list: (d) => d.result, loc: (j) => `${j.location?.city} ${j.location?.state}` }),
  jobvite: (s) => ({ url: `https://jobs.jobvite.com/${s}/jobs`, raw: true }),
};
console.log('\n== Interfaces d’offres ==');
for (const [ats, mk] of Object.entries(TESTS)) {
  const cands = pick(ats);
  let shown = 0;
  for (const s of cands) {
    if (shown >= 4) break;
    const t = mk(s);
    const r = await probeFetch(t.url, { headers: t.raw ? {} : J });
    shown++;
    if (t.raw) {
      console.log(`${ats.padEnd(16)} ${s.padEnd(26)} ${r.status} ${r.ms} ms ${r.contentType.split(';')[0]} items~${(r.text.match(/<item>|<position>|<job[ >]/g) || []).length} fr~${(r.text.match(/France|Paris/g) || []).length} ${r.text.slice(0, 120).replace(/\s+/g, ' ')}`);
      continue;
    }
    let d = null;
    try { d = JSON.parse(r.text); } catch {}
    const list = d ? t.list(d) || [] : [];
    const j = list[0] || {};
    console.log(`${ats.padEnd(16)} ${s.padEnd(26)} ${r.status} ${r.ms} ms jobs ${list.length} fr ${list.filter((x) => fr(t.loc(x))).length} clés: ${Object.keys(j).slice(0, 18).join(',')}`);
  }
  await sleep(500);
}
// Workday : recherche par mots-clés
const wd = [...(slugs.workday || [])].slice(0, 6);
for (const s of wd) {
  const [host, site] = s.split('|');
  const tenant = host.split('.')[0];
  const r = await probeFetch(`https://${host}/wday/cxs/${tenant}/${site}/jobs`, { method: 'POST', headers: { ...J, 'content-type': 'application/json' }, body: JSON.stringify({ appliedFacets: {}, limit: 20, offset: 0, searchText: 'developer' }) });
  let d = null; try { d = JSON.parse(r.text); } catch {}
  console.log(`workday ${s.padEnd(50)} ${r.status} ${r.ms} ms total ${d?.total ?? '-'} ex. ${(d?.jobPostings || []).slice(0, 2).map((p) => `${p.title} @ ${p.locationsText}`).join(' ; ')}`);
}
