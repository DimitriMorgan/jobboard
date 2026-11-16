// Diagnostic n° 3 : le connecteur « Sites des entreprises » de bout en bout sur un échantillon réel
// (600 entreprises qui recrutent le plus de devs dans le board + liens trouvés dans les offres). Ne publie rien.
// Usage : node scripts/probe/careers3.mjs [minutes=12]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import careers from '../../server/connectors/careers.js';
import { normalizeJob } from '../../server/normalize.js';
import { loadState } from '../../server/careers/state.js';
import { ATS } from '../../server/careers/ats.js';

const sample = JSON.parse(fs.readFileSync(new URL('./careers-sample.json', import.meta.url), 'utf8'));
const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'careers-')), 'careers-state.json');
Object.assign(process.env, { CAREERS_STATE_FILE: file, CAREERS_MAX_MINUTES: process.argv[2] || '12', CAREERS_HARVEST_MINUTES: '4' });
const corpus = [...sample.names.map((company) => ({ company, url: '' })), ...sample.links.map((l) => ({ company: '', url: l }))];
const t0 = Date.now();
const raw = await careers.fetch({ corpus: () => corpus, progress: (m) => console.log('·', m), needsDetail: () => true });
const jobs = raw.map((r) => normalizeJob('careers', r)).filter(Boolean);
console.log(`\nDurée ${((Date.now() - t0) / 60000).toFixed(1)} min — brut ${raw.length}, retenues après technos ${jobs.length}`);
const state = loadState(file);
const all = Object.values(state.companies);
const count = (arr, f) => arr.reduce((m, x) => ((m[f(x)] = (m[f(x)] || 0) + 1), m), {});
console.log('Annuaire par état', JSON.stringify(count(all, (c) => c.status)));
console.log('Suivies par plateforme', JSON.stringify(count(all.filter((c) => c.status === 'pool'), (c) => c.ats)));
console.log('Origine des suivies', JSON.stringify(count(all.filter((c) => c.status === 'pool'), (c) => c.origin)));
console.log('Noms essayés', Object.keys(state.names || {}).length, 'trouvés', Object.values(state.names || {}).filter((n) => n.found).length);
console.log('Candidates restantes', all.filter((c) => c.status === 'candidate').length);
console.log('Offres par contrat', JSON.stringify(count(jobs, (j) => j.contracts.join('+'))), 'par techno', JSON.stringify(count(jobs.flatMap((j) => j.techs), (t) => t)));
console.log('Offres par lieu', JSON.stringify(count(jobs, (j) => j.country)), 'avec salaire', jobs.filter((j) => j.salaryMin).length);
const pool = all.filter((c) => c.status === 'pool').sort((a, b) => (b.devJobs || 0) - (a.devJobs || 0));
console.log('\nEntreprises suivies (top 40) :');
for (const c of pool.slice(0, 40)) console.log(`  ${(c.name || c.slug).slice(0, 30).padEnd(30)} ${c.ats.padEnd(15)} ${c.slug.padEnd(24)} offres ${c.jobs} fr ${c.frJobs} dev ${c.devJobs} (${c.origin})`);
console.log('\nExemples d’offres :');
for (const j of jobs.sort(() => Math.random() - 0.5).slice(0, 25)) console.log(`  ${j.title.slice(0, 60).padEnd(60)} | ${j.company.slice(0, 20).padEnd(20)} | ${j.location.slice(0, 28).padEnd(28)} | ${j.contracts.join('/')} | ${j.techs.join('/')} | ${j.salary || '-'} | ${j.url.slice(0, 70)}`);
for (const ats of Object.keys(ATS)) {
  const one = jobs.find((j) => j.sourceId.startsWith(ats + ':'));
  if (one) console.log(`\n[${ats}] ${one.title} — ${one.location} — ${one.remote} — desc ${one.description.length} car. — ${one.url}`);
}
const errs = all.filter((c) => c.error && c.error !== 'introuvable');
console.log('\nErreurs', errs.length, errs.slice(0, 8).map((c) => `${c.ats}:${c.slug} ${c.error}`).join(' ; '));
console.log('Taille annuaire', fs.statSync(file).size, 'octets');
