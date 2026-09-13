// Filtrage / tri côté navigateur (mode statique) — mêmes règles que db.listJobs côté serveur.
const DAY = 86400e3;

export function filterJobs(jobs, f = {}) {
  const now = Date.now();
  const q = (f.q || '').trim().toLowerCase();
  const since = f.sinceDays ? now - Number(f.sinceDays) * DAY : 0;
  const staleLimit = now - 7 * DAY;
  let out = jobs.filter((j) => {
    if (f.techs?.length && !f.techs.some((t) => j.techs.includes(t))) return false;
    if (f.contracts?.length && !f.contracts.some((c) => j.contracts.includes(c))) return false;
    if (f.sources?.length && !f.sources.includes(j.source)) return false;
    if (f.statuses?.length && !f.statuses.includes(j.status)) return false;
    if (f.country === 'FR' && j.country !== 'FR') return false;
    if (f.country === 'REMOTE' && j.remote !== 'full') return false;
    if (f.country === 'FR_OR_REMOTE' && !(j.country === 'FR' || j.remote === 'full')) return false;
    if (f.remote === 'full' && j.remote !== 'full') return false;
    if (f.remote === 'any' && !(j.remote === 'full' || j.remote === 'partial')) return false;
    if (q && ![j.title, j.company, j.location, j.excerpt, (j.tags || []).join(' ')].some((s) => (s || '').toLowerCase().includes(q))) return false;
    if (since && new Date(j.publishedAt || j.firstSeenAt).getTime() < since) return false;
    if (f.onlyNew && !j.isNew) return false;
    if (f.favorite && !j.favorite) return false;
    if (f.hideStale && new Date(j.lastSeenAt).getTime() < staleLimit) return false;
    if (Number(f.tjmMin) > 0 && !((j.tjmMax ?? j.tjmMin) >= Number(f.tjmMin))) return false;
    if (Number(f.salaryMin) > 0 && !((j.salaryMax ?? j.salaryMin) >= Number(f.salaryMin))) return false;
    if (f.withPay && j.tjmMin == null && j.salaryMin == null) return false;
    return true;
  });
  const ts = (v) => (v ? new Date(v).getTime() : 0);
  const pub = (j) => ts(j.publishedAt || j.firstSeenAt);
  const numDesc = (get) => (a, b) => {
    const va = get(a);
    const vb = get(b);
    if (va == null && vb == null) return pub(b) - pub(a);
    if (va == null) return 1;
    if (vb == null) return -1;
    return vb - va || pub(b) - pub(a);
  };
  const sorters = {
    seen: (a, b) => ts(b.firstSeenAt) - ts(a.firstSeenAt),
    status: (a, b) => ts(b.statusUpdatedAt) - ts(a.statusUpdatedAt) || pub(b) - pub(a),
    tjm: numDesc((j) => j.tjmMax ?? j.tjmMin ?? null),
    salary: numDesc((j) => j.salaryMax ?? j.salaryMin ?? null),
  };
  out.sort(sorters[f.sort] || ((a, b) => pub(b) - pub(a)));
  return out.slice(0, Number(f.limit) || 1000);
}
