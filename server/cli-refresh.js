// Actualisation en ligne de commande (utile pour un cron) : node server/cli-refresh.js [source1,source2]
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { createRefresher } from './refresh.js';
import { loadEnv } from './env.js';

loadEnv();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = openDb(path.resolve(process.env.DB_PATH || path.join(__dirname, '..', 'data', 'jobboard.sqlite')));
const only = (process.argv[2] || '').split(',').filter(Boolean);
const result = await createRefresher(db, { log: console }).refresh({ only });
for (const [id, s] of Object.entries(result.sources)) console.log(`${id.padEnd(16)} ${s.status.padEnd(8)} ${s.message || ''}${s.error ? ' — ' + s.error : ''}`);
db.close();
