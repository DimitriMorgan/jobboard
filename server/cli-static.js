// Mode statique (GitHub Actions) : recharge l'export précédent, actualise, purge, ré-exporte.
// Usage : node server/cli-static.js [dossier de données=./data/static]
import path from 'node:path';
import { openDb } from './db.js';
import { createRefresher } from './refresh.js';
import { exportStatic, importStatic } from './staticData.js';
import { loadEnv } from './env.js';

loadEnv();
const dir = path.resolve(process.argv[2] || process.env.STATIC_DATA_DIR || 'data/static');
const retentionDays = Number(process.env.RETENTION_DAYS) || 60;

const db = openDb(':memory:');
const imported = importStatic(db, dir);
console.log(`Données précédentes : ${imported} offres (${dir})`);

const result = await createRefresher(db, { log: console }).refresh();
for (const [id, s] of Object.entries(result.sources)) console.log(`${id.padEnd(16)} ${s.status.padEnd(8)} ${s.message || ''}${s.error ? ' — ' + s.error : ''}`);

const purged = db.purgeOlderThan(retentionDays);
const out = exportStatic(db, dir);
console.log(`Export : ${out.jobs} offres, ${out.descriptions} descriptions, ${purged} offres purgées (> ${retentionDays} j sans être revues).`);
const okCount = Object.values(result.sources).filter((s) => s.status === 'ok' || s.status === 'partial').length;
if (okCount === 0) console.warn('ATTENTION : aucune source n’a répondu, les données précédentes sont conservées.');
db.close();
