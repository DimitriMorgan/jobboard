// Diagnostic n° 2 des sites carrières : interfaces d'offres sur des entreprises réelles, réponse pour une entreprise
// inexistante (détection de l'existence d'un identifiant), index Common Crawl interrogé page par page.
import { probeFetch, sleep } from './lib.mjs';

const J = { accept: 'application/json' };
const NOPE = 'zz-entreprise-inexistante-4821';
const fr = (s) => /france|paris|lyon|marseille|toulouse|bordeaux|lille|nantes|rennes|nice|montpellier|strasbourg|grenoble|\bfr\b/i.test(String(s || ''));
const brief = (r) => `${r.status} ${r.ms}ms ${r.contentType.split(';')[0]} ${r.finalUrl !== undefined ? '' : ''}`;

const T = {
  lever: { slugs: ['dilitrust', 'airalo', 'asobostudio'], url: (s) => `https://api.lever.co/v0/postings/${s}?mode=json`, list: (d) => d, loc: (j) => `${j.categories?.location} ${j.country}` },
  'lever-eu': { slugs: ['dilitrust', 'asobostudio'], url: (s) => `https://api.eu.lever.co/v0/postings/${s}?mode=json`, list: (d) => d, loc: (j) => `${j.categories?.location} ${j.country}` },
  greenhouse: { slugs: ['gitlab', 'mozilla', 'alma31', 'alan'], url: (s) => `https://boards-api.greenhouse.io/v1/boards/${s}/jobs?content=true`, list: (d) => d.jobs, loc: (j) => j.location?.name },
  'greenhouse-board': { slugs: ['gitlab'], url: (s) => `https://boards-api.greenhouse.io/v1/boards/${s}`, list: () => [], loc: () => '' },
  ashby: { slugs: ['mui', 'ramp', 'dedale-intelligence'], url: (s) => `https://api.ashbyhq.com/posting-api/job-board/${s}?includeCompensation=true`, list: (d) => d.jobs, loc: (j) => `${j.location} ${j.address?.postalAddress?.addressCountry}` },
  recruitee: { slugs: ['hubvisory', 'deephealth', 'tether'], url: (s) => `https://${s}.recruitee.com/api/offers/`, list: (d) => d.offers, loc: (j) => `${j.location} ${j.country_code}` },
  workable: { slugs: ['seeq', 'burq', 'methods'], url: (s) => `https://apply.workable.com/api/v1/widget/accounts/${s}?details=true`, list: (d) => d.jobs, loc: (j) => `${j.city} ${j.country}` },
  smartrecruiters: { slugs: ['soprasteria1', 'rexel1', 'alten'], url: (s) => `https://api.smartrecruiters.com/v1/companies/${s}/postings?limit=100`, list: (d) => d.content, loc: (j) => `${j.location?.city} ${j.location?.country}` },
  breezy: { slugs: [], url: (s) => `https://${s}.breezy.hr/json`, list: (d) => d, loc: (j) => j.location?.name },
};
console.log('== Interfaces JSON ==');
for (const [ats, t] of Object.entries(T)) {
  for (const s of [...t.slugs, NOPE]) {
    const r = await probeFetch(t.url(s), { headers: J });
    let d = null;
    try { d = JSON.parse(r.text); } catch {}
    const list = (d && t.list(d)) || [];
    const j = list[0] || {};
    const extra = ats === 'greenhouse-board' ? ` board=${JSON.stringify(d).slice(0, 160)}` : '';
    console.log(`${ats.padEnd(16)} ${s.padEnd(30)} ${brief(r)} jobs ${Array.isArray(list) ? list.length : '?'} fr ${Array.isArray(list) ? list.filter((x) => fr(t.loc(x))).length : '?'} | ${s === NOPE ? r.text.slice(0, 100).replace(/\s+/g, ' ') : Object.keys(j).join(',').slice(0, 300)}${extra}`);
    if (s !== NOPE && list[0]) {
      const pick = ats.startsWith('lever') ? { loc: j.categories, wt: j.workplaceType, sal: j.salaryRange, url: j.hostedUrl } : ats === 'greenhouse' ? { loc: j.location, url: j.absolute_url, upd: j.updated_at, comp: j.company_name, offices: j.offices?.map((o) => o.name) } : ats === 'ashby' ? { loc: j.location, rem: j.isRemote, wt: j.workplaceType, et: j.employmentType, addr: j.address, url: j.jobUrl, comp: j.compensation?.compensationTierSummary } : ats === 'recruitee' ? { loc: j.location, cc: j.country_code, rem: j.remote, et: j.employment_type_code, comp: j.company_name, url: j.careers_url, sal: j.salary } : ats === 'workable' ? { loc: j.locations, rem: j.telecommuting, et: j.employment_type, url: j.url, desc: (j.description || '').length } : ats === 'smartrecruiters' ? { loc: j.location, et: j.typeOfEmployment, comp: j.company, ref: j.ref } : {};
      console.log('     ', JSON.stringify(pick).slice(0, 400));
    }
    await sleep(300);
  }
  if (ats === 'workable') {
    const r = await probeFetch(`https://apply.workable.com/api/v1/widget/accounts/seeq?details=true`, { headers: J });
    try { console.log('     workable top-level', Object.keys(JSON.parse(r.text)).join(','), 'name', JSON.parse(r.text).name); } catch {}
  }
}
// Détail SmartRecruiters
{
  const r = await probeFetch('https://api.smartrecruiters.com/v1/companies/alten/postings?limit=5', { headers: J });
  try {
    const p = JSON.parse(r.text).content[0];
    const d = await probeFetch(p.ref, { headers: J });
    const jd = JSON.parse(d.text);
    console.log('smartrecruiters détail', d.status, Object.keys(jd).join(','), 'postingUrl', jd.postingUrl, 'sections', Object.keys(jd.jobAd?.sections || {}).join(','));
  } catch (e) { console.log('smartrecruiters détail échec', e.message); }
  const t = await probeFetch('https://api.smartrecruiters.com/v1/companies/alten/postings?limit=1&country=fr', { headers: J });
  try { console.log('smartrecruiters filtre pays : totalFound', JSON.parse(t.text).totalFound); } catch {}
}
console.log('\n== Interfaces XML / HTML ==');
for (const [name, url] of [
  ['personio xml', 'https://eventfirst.jobs.personio.de/xml'],
  ['personio xml inexistant', `https://${NOPE}.jobs.personio.de/xml`],
  ['teamtailor rss', 'https://payplug.teamtailor.com/jobs.rss'],
  ['teamtailor rss 2', 'https://swanio.teamtailor.com/jobs.rss'],
  ['teamtailor jobs', 'https://payplug.teamtailor.com/jobs'],
  ['teamtailor inexistant', `https://${NOPE}.teamtailor.com/jobs.rss`],
  ['recruitee inexistant', `https://${NOPE}.recruitee.com/api/offers/`],
]) {
  const r = await probeFetch(url);
  console.log(`${name.padEnd(24)} ${r.status} ${r.ms}ms ${r.contentType.split(';')[0]} final=${r.finalUrl} items~${(r.text.match(/<item>|<position>/g) || []).length} fr~${(r.text.match(/France|Paris/g) || []).length} | ${r.text.slice(0, 160).replace(/\s+/g, ' ')}`);
  if (/teamtailor rss$/.test(name) && r.ok) console.log('   extrait :', r.text.match(/<item>[\s\S]{0,900}/)?.[0].replace(/\s+/g, ' '));
  await sleep(300);
}

console.log('\n== Common Crawl page par page ==');
for (const idx of ['CC-MAIN-2026-43', 'CC-MAIN-2026-39']) {
  for (const q of ['jobs.lever.co/*', 'boards.greenhouse.io/*', 'jobs.ashbyhq.com/*', '*.recruitee.com', '*.teamtailor.com']) {
    const base = `https://index.commoncrawl.org/${idx}-index?url=${encodeURIComponent(q)}&output=json&fl=url`;
    let pages = null;
    for (let a = 0; a < 3 && pages == null; a++) {
      const np = await probeFetch(`${base}&showNumPages=true`, { headers: J, timeoutMs: 60000 });
      try { pages = JSON.parse(np.text).pages; } catch { await sleep(4000); }
    }
    const set = new Set();
    let ok = 0;
    let fail = 0;
    for (let p = 0; p < Math.min(pages || 0, 4); p++) {
      let r = null;
      for (let a = 0; a < 3; a++) {
        r = await probeFetch(`${base}&page=${p}`, { headers: J, timeoutMs: 90000 });
        if (r.ok) break;
        await sleep(5000 * (a + 1));
      }
      if (!r.ok) { fail++; continue; }
      ok++;
      for (const line of r.text.split('\n')) {
        try {
          const u = new URL(JSON.parse(line).url);
          const s = q.startsWith('*') ? u.hostname.split('.')[0] : u.pathname.split('/')[1];
          if (s) set.add(s.toLowerCase());
        } catch {}
      }
      await sleep(1000);
    }
    console.log(`${idx} ${q.padEnd(24)} pages ${pages} lues ${ok} échecs ${fail} slugs ${set.size} ex. ${[...set].slice(0, 8).join(' ')}`);
  }
}
