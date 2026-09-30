// Export / import des données au format JSON (mode « site statique » : GitHub Actions + GitHub Pages).
import fs from 'node:fs';
import path from 'node:path';
import { rowToJob, STATUSES } from './db.js';
import { CONNECTORS, connectorAvailability } from './connectors/index.js';
import { TECHS, CONTRACTS } from './normalize.js';
import { MANUAL_PLATFORMS } from '../shared/manualLinks.js';
import { DESCRIPTION_SHARDS, DESCRIPTIONS_DIR, shardFile, shardOf } from '../shared/shard.js';

export const JOBS_FILE = 'jobs.json';
/** Ancien format : toutes les descriptions dans un seul fichier (encore lu à l'import, plus écrit). */
export const LEGACY_DESCRIPTIONS_FILE = 'descriptions.json';

/**
 * Écrit jobs.json (tout sauf les descriptions) et les descriptions réparties en DESCRIPTION_SHARDS fichiers
 * (descriptions/00.json…) dans `dir`, pour que le site ne charge que le fichier de l'offre ouverte.
 */
export function exportStatic(db, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const latestRun = db.latestRun();
  const since = db.newSince();
  const rows = db.raw.prepare('SELECT * FROM jobs ORDER BY COALESCE(published_at, first_seen_at) DESC').all();
  const jobs = [];
  const descriptions = {};
  for (const row of rows) {
    const job = rowToJob(row, since);
    const { description, status, notes, favorite, statusUpdatedAt, ...rest } = job;
    jobs.push({ ...rest, firstRunId: row.first_run_id });
    if (description) descriptions[job.id] = description;
  }
  const { counts, rows: srcRows } = db.sourceStats();
  const sources = CONNECTORS.map((c) => {
    const r = srcRows[c.id] || {};
    return {
      id: c.id, name: c.name, site: c.site, description: c.description, ...connectorAvailability(c),
      total: counts[c.id] || 0, lastRunAt: r.last_run_at || null, lastSuccessAt: r.last_success_at || null, lastStatus: r.last_status || null, lastError: r.last_error || null,
      lastCount: r.last_count || 0, lastNew: r.last_new || 0, durationMs: r.duration_ms || 0,
    };
  });
  const payload = {
    format: 1,
    descriptionShards: DESCRIPTION_SHARDS,
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
  // Chaque fichier est écrit, même vide, pour que le site n'ait jamais de 404 sur une offre sans description.
  const shards = Array.from({ length: DESCRIPTION_SHARDS }, () => ({}));
  for (const [id, text] of Object.entries(descriptions)) shards[shardOf(id)][id] = text;
  fs.rmSync(path.join(dir, DESCRIPTIONS_DIR), { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, DESCRIPTIONS_DIR), { recursive: true });
  shards.forEach((content, n) => fs.writeFileSync(path.join(dir, shardFile(n)), JSON.stringify(content)));
  fs.rmSync(path.join(dir, LEGACY_DESCRIPTIONS_FILE), { force: true });
  fs.writeFileSync(path.join(dir, JOBS_FILE), JSON.stringify(payload));
  return { jobs: jobs.length, descriptions: Object.keys(descriptions).length, files: shards.length };
}

/** Lit toutes les descriptions disponibles dans `dir` : ancien fichier unique puis fichiers répartis. */
function readDescriptions(dir) {
  const out = {};
  const files = [path.join(dir, LEGACY_DESCRIPTIONS_FILE)];
  const shardDir = path.join(dir, DESCRIPTIONS_DIR);
  if (fs.existsSync(shardDir)) for (const f of fs.readdirSync(shardDir).sort()) if (f.endsWith('.json')) files.push(path.join(shardDir, f));
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    try {
      Object.assign(out, JSON.parse(fs.readFileSync(file, 'utf8')));
    } catch (err) {
      console.warn(`${path.relative(dir, file)} illisible (${err.message}) : descriptions ignorées`);
    }
  }
  return out;
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
  const descriptions = readDescriptions(dir);
  if (payload.latestRun) db.importRun(payload.latestRun);
  for (const s of payload.sources || []) if (s.lastRunAt) db.importSource(s);
  const rows = (payload.jobs || []).map((j) => ({ ...j, description: descriptions[j.id] || '' }));
  db.importJobs(rows);
  return rows.length;
}
