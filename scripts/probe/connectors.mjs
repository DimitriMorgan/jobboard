// Exécute des connecteurs sans rien publier et affiche un résumé (validation d'une source).
// Usage : node scripts/probe/connectors.mjs linkedin wttj ...
import { CONNECTORS } from '../../server/connectors/index.js';
import { normalizeJob } from '../../server/normalize.js';

const ids = process.argv.slice(2);
const targets = CONNECTORS.filter((c) => !ids.length || ids.includes(c.id));
const count = (arr, f) => {
  const m = {};
  for (const x of arr) for (const k of [].concat(f(x))) m[k] = (m[k] || 0) + 1;
  return m;
};

for (const c of targets) {
  const t0 = Date.now();
  const logs = [];
  const ctx = { isKnown: () => false, needsDetail: () => true, known: () => null, lastRunAt: null, progress: (m) => logs.push(m) };
  console.log(`\n### ${c.id}`);
  try {
    const raw = await c.fetch(ctx);
    const jobs = raw.map((r) => normalizeJob(c.id, r)).filter(Boolean);
    const withDesc = jobs.filter((j) => j.description.length > 40).length;
    console.log(`  brut=${raw.length} retenues=${jobs.length} avec description=${withDesc} durée=${((Date.now() - t0) / 1000).toFixed(1)} s${raw.warning ? ' ⚠ ' + raw.warning : ''}`);
    console.log(`  technos=${JSON.stringify(count(jobs, (j) => j.techs))}`);
    console.log(`  contrats=${JSON.stringify(count(jobs, (j) => j.contracts))} pays=${JSON.stringify(count(jobs, (j) => j.country))}`);
    console.log(`  TJM=${jobs.filter((j) => j.tjmMin != null).length} salaire=${jobs.filter((j) => j.salaryMin != null).length}`);
    for (const j of jobs.slice(0, 6)) console.log(`   - ${j.title.slice(0, 60)} | ${j.company.slice(0, 25)} | ${j.location.slice(0, 25)} | ${j.contracts.join('/')} | ${j.techs.join('/')} | ${j.salary || '-'} | ${j.url.slice(0, 90)}`);
  } catch (err) {
    console.log(`  ERREUR : ${err.message}`);
  }
  for (const l of logs.slice(-12)) console.log(`  · ${l}`);
}
