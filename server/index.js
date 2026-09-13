import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openDb, STATUSES } from './db.js';
import { createRefresher } from './refresh.js';
import { CONNECTORS, connectorAvailability } from './connectors/index.js';
import { TECHS, CONTRACTS } from './normalize.js';
import { manualLinks, MANUAL_PLATFORMS } from '../shared/manualLinks.js';
import { loadEnv } from './env.js';

loadEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const DB_PATH = path.resolve(process.env.DB_PATH || path.join(__dirname, '..', 'data', 'jobboard.sqlite'));

const db = openDb(DB_PATH);
const refresher = createRefresher(db, { log: console });
const app = express();
app.use(express.json({ limit: '1mb' }));

const list = (v) => (typeof v === 'string' && v.length ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);

app.get('/api/meta', (_req, res) => {
  res.json({
    techs: TECHS.map(({ id, label }) => ({ id, label })),
    contracts: CONTRACTS,
    statuses: STATUSES,
    sources: CONNECTORS.map((c) => ({ id: c.id, name: c.name, site: c.site, description: c.description, ...connectorAvailability(c) })),
    manualPlatforms: MANUAL_PLATFORMS.map((p) => ({ id: p.id, name: p.name })),
  });
});

app.get('/api/jobs', (req, res) => {
  const q = req.query;
  const jobs = db.listJobs({
    techs: list(q.techs),
    contracts: list(q.contracts),
    sources: list(q.sources),
    statuses: list(q.statuses),
    country: q.country || '',
    remote: q.remote || '',
    q: typeof q.q === 'string' ? q.q.trim() : '',
    sinceDays: q.sinceDays ? Number(q.sinceDays) : 0,
    onlyNew: q.onlyNew === '1' || q.onlyNew === 'true',
    favorite: q.favorite === '1' || q.favorite === 'true',
    withPay: q.withPay === '1' || q.withPay === 'true',
    tjmMin: q.tjmMin ? Number(q.tjmMin) : 0,
    salaryMin: q.salaryMin ? Number(q.salaryMin) : 0,
    hideStale: q.hideStale === '1' || q.hideStale === 'true',
    sort: q.sort || 'published',
    limit: q.limit ? Number(q.limit) : 1000,
  });
  res.json({ count: jobs.length, jobs });
});

app.get('/api/jobs/:id', (req, res) => {
  const job = db.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Offre introuvable' });
  res.json(job);
});

app.patch('/api/jobs/:id', (req, res) => {
  const { status, notes, favorite } = req.body || {};
  if (status && !STATUSES.includes(status)) return res.status(400).json({ error: `Statut invalide. Valeurs : ${STATUSES.join(', ')}` });
  const job = db.updateTracking(req.params.id, { status, notes, favorite });
  if (!job) return res.status(404).json({ error: 'Offre introuvable' });
  res.json(job);
});

app.delete('/api/jobs/:id', (req, res) => {
  res.json({ deleted: db.deleteJob(req.params.id) });
});

app.post('/api/refresh', (req, res) => {
  const only = list(req.body?.only || req.query.only);
  if (refresher.status().running) return res.status(409).json({ error: 'Une actualisation est déjà en cours', status: refresher.status() });
  refresher.refresh({ only }).catch((err) => console.error('Actualisation échouée', err));
  res.status(202).json(refresher.status());
});

app.get('/api/refresh/status', (_req, res) => res.json(refresher.status()));

app.get('/api/sources', (_req, res) => {
  const { counts, rows } = db.sourceStats();
  const live = refresher.status().sources;
  res.json(
    CONNECTORS.map((c) => {
      const row = rows[c.id] || {};
      return {
        id: c.id, name: c.name, site: c.site, description: c.description, ...connectorAvailability(c),
        total: counts[c.id] || 0, lastRunAt: row.last_run_at || null, lastStatus: row.last_status || null, lastError: row.last_error || null,
        lastCount: row.last_count || 0, lastNew: row.last_new || 0, durationMs: row.duration_ms || 0, live: live[c.id] || null,
      };
    }),
  );
});

app.get('/api/stats', (_req, res) => res.json(db.stats()));

app.get('/api/manual-links', (req, res) => {
  const tech = typeof req.query.tech === 'string' ? req.query.tech : 'react';
  const contract = typeof req.query.contract === 'string' ? req.query.contract : '';
  res.json(manualLinks(tech, contract));
});

// Front build (client/dist) en production.
const dist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
} else {
  app.get('/', (_req, res) => res.type('text').send('Front non construit : lancez `npm run build` (ou `npm run dev` en développement). API disponible sous /api.'));
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Erreur interne' });
});

app.listen(PORT, () => {
  console.log(`JobBoard démarré sur http://localhost:${PORT} (base : ${DB_PATH})`);
  if (process.env.REFRESH_ON_START === 'true') refresher.refresh().catch(console.error);
  const minutes = Number(process.env.AUTO_REFRESH_MINUTES) || 0;
  if (minutes > 0) setInterval(() => refresher.refresh().catch(console.error), minutes * 60e3).unref();
});

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { db.close(); process.exit(0); });
