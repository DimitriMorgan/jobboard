// Regroupe les offres identiques publiées sur plusieurs sites (même entreprise + même intitulé).
const rank = (j) => (j.status && !['nouveau', 'vu', 'ignore'].includes(j.status) ? 4 : 0) + (j.favorite ? 2 : 0) + (j.description || j.excerpt ? 1 : 0);

export function groupDuplicates(jobs) {
  const groups = new Map();
  const order = [];
  for (const j of jobs) {
    const key = j.fingerprint && !/^entreprise-non-precisee\|/.test(j.fingerprint) ? j.fingerprint : `id:${j.id}`;
    const g = groups.get(key);
    if (!g) {
      groups.set(key, { primary: j, others: [] });
      order.push(key);
    } else if (rank(j) > rank(g.primary)) {
      g.others.push(g.primary);
      g.primary = j;
    } else g.others.push(j);
  }
  return order.map((k) => {
    const { primary, others } = groups.get(k);
    const seen = new Set([primary.source]);
    const alsoOn = others.filter((o) => !seen.has(o.source) && seen.add(o.source)).map(({ id, source, url }) => ({ id, source, url }));
    return alsoOn.length ? { ...primary, alsoOn } : primary;
  });
}
