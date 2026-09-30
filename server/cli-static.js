// Mode statique (GitHub Actions) : recharge l'export précédent, actualise, purge, ré-exporte.
// Usage : node server/cli-static.js [dossier de données=./data/static]
import path from 'node:path';
import { openDb } from './db.js';
import { createRefresher } from './refresh.js';
import { exportStatic, importStatic } from './staticData.js';
import { loadEnv } from './env.js';
import { repairJob } from './normalize.js';

loadEnv();
const dir = path.resolve(process.argv[2] || process.env.STATIC_DATA_DIR || 'data/static');
const retentionDays = Number(process.env.RETENTION_DAYS) || 60;

const db = openDb(':memory:');
const imported = importStatic(db, dir);
console.log(`Données précédentes : ${imported} offres (${dir})`);
const repaired = db.repairIncomplete(repairJob);
if (repaired) console.log(`Offres complétées depuis leur description (contrat, télétravail, rémunération) : ${repaired}`);

const only = (process.env.ONLY_SOURCES || '').split(/[\s,]+/).filter(Boolean);
const manualUrls = (process.env.LINKEDIN_POST_URLS || '').split(/\s+/).filter(Boolean);
if (only.length) console.log(`Actualisation partielle : ${only.join(', ')}`);
if (manualUrls.length) console.log(`URL LinkedIn ajoutées à la main : ${manualUrls.length}`);
const result = await createRefresher(db, { log: console }).refresh({ only, manualUrls });
for (const [id, s] of Object.entries(result.sources)) console.log(`${id.padEnd(16)} ${s.status.padEnd(8)} ${s.message || ''}${s.error ? ' — ' + s.error : ''}`);

const purged = db.purgeOlderThan(retentionDays);
const out = exportStatic(db, dir);
console.log(`Export : ${out.jobs} offres, ${out.descriptions} descriptions, ${purged} offres purgées (> ${retentionDays} j sans être revues).`);
const okCount = Object.values(result.sources).filter((s) => s.status === 'ok' || s.status === 'partial').length;
if (okCount === 0) console.warn('ATTENTION : aucune source n’a répondu, les données précédentes sont conservées.');
db.close();
