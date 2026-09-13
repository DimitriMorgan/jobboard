// Export / import des données au format JSON (mode « site statique » : GitHub Actions + GitHub Pages).
import fs from 'node:fs';
import path from 'node:path';
import { rowToJob, STATUSES } from './db.js';
import { CONNECTORS, connectorAvailability } from './connectors/index.js';
import { TECHS, CONTRACTS } from './normalize.js';
import { MANUAL_PLATFORMS } from '../shared/manualLinks.js';

export const JOBS_FILE = 'jobs.json';
export const DESCRIPTIONS_FILE = 'descriptions.json';

/** Écrit jobs.json (tout sauf les descriptions) et descriptions.json dans `dir`. */
export function exportStatic(db, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const latestRun = db.latestRun();
  const runId = latestRun?.id ?? null;
  const rows = db.raw.prepare('SELECT * FROM jobs ORDER BY COALESCE(published_at, first_seen_at) DESC').all();
  const jobs = [];
  const descriptions = {};
  for (const row of rows) {
    const job = rowToJob(row, runId);
    const { description, status, notes, favorite, statusUpdatedAt, ...rest } = job;
    jobs.push({ ...rest, firstRunId: row.first_run_id });
    if (description) descriptions[job.id] = description;
  }
  const { counts, rows: srcRows } = db.sourceStats();
  const sources = CONNECTORS.map((c) => {
    const r = srcRows[c.id] || {};
    return {
      id: c.id, name: c.name, site: c.site, description: c.description, ...connectorAvailability(c),
      total: counts[c.id] || 0, lastRunAt: r.last_run_at || null, lastStatus: r.last_status || null, lastError: r.last_error || null,
      lastCount: r.last_count || 0, lastNew: r.last_new || 0, durationMs: r.duration_ms || 0,
    };
  });
  const payload = {
    format: 1,
    generatedAt: new Date().toISOString(),
    latestRun: latestRun ? { id: latestRun.id, startedAt: latestRun.started_at, finishedAt: latestRun.finished_at, totalSeen: latestRun.total_seen, totalNew: latestRun.total_new } : null,
    meta: {
      techs: TECHS.map(({ id, label }) => ({ id, label })),
      contracts: CONTRACTS,
      statuses: STATUSES,
      sources: sources.map(({ id, name, site, description, enabled, reason }) => ({ id, name, site, description, enabled, reason })),
      manualPlatforms: MANUAL_PLATFORMS.map((p) => ({ id: p.id, name: p.name })),
    },
    sources,
    jobs,
  };
  fs.writeFileSync(path.join(dir, JOBS_FILE), JSON.stringify(payload));
  fs.writeFileSync(path.join(dir, DESCRIPTIONS_FILE), JSON.stringify(descriptions));
  return { jobs: jobs.length, descriptions: Object.keys(descriptions).length };
}

/** Recharge un export précédent dans une base (vide). Renvoie le nombre d'offres importées. */
export function importStatic(db, dir) {
  const jobsPath = path.join(dir, JOBS_FILE);
  if (!fs.existsSync(jobsPath)) return 0;
  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(jobsPath, 'utf8'));
  } catch (err) {
    console.warn(`jobs.json illisible (${err.message}) : on repart de zéro`);
    return 0;
  }
  let descriptions = {};
  try {
    if (fs.existsSync(path.join(dir, DESCRIPTIONS_FILE))) descriptions = JSON.parse(fs.readFileSync(path.join(dir, DESCRIPTIONS_FILE), 'utf8'));
  } catch {
    descriptions = {};
  }
  if (payload.latestRun) db.importRun(payload.latestRun);
  for (const s of payload.sources || []) if (s.lastRunAt) db.importSource(s);
  const rows = (payload.jobs || []).map((j) => ({ ...j, description: descriptions[j.id] || '' }));
  db.importJobs(rows);
  return rows.length;
}
