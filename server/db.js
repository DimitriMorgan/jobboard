// Couche de persistance SQLite (module natif node:sqlite, Node >= 22.13).
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export const STATUSES = ['nouveau', 'vu', 'a_postuler', 'candidature_envoyee', 'relance', 'entretien', 'offre_recue', 'refus', 'ignore'];

const SCHEMA = `
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  source_id TEXT NOT NULL,
  title TEXT NOT NULL,
  company TEXT,
  location TEXT,
  country TEXT,
  remote TEXT,
  contracts TEXT NOT NULL DEFAULT '[]',
  techs TEXT NOT NULL DEFAULT '[]',
  salary TEXT,
  tjm_min REAL,
  tjm_max REAL,
  salary_min REAL,
  salary_max REAL,
  currency TEXT,
  url TEXT NOT NULL,
  apply_url TEXT,
  published_at TEXT,
  description TEXT,
  excerpt TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  fingerprint TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  first_run_id INTEGER,
  status TEXT NOT NULL DEFAULT 'nouveau',
  notes TEXT NOT NULL DEFAULT '',
  favorite INTEGER NOT NULL DEFAULT 0,
  status_updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_jobs_source ON jobs(source);
CREATE INDEX IF NOT EXISTS idx_jobs_published ON jobs(published_at);
CREATE INDEX IF NOT EXISTS idx_jobs_fingerprint ON jobs(fingerprint);
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  last_run_at TEXT,
  last_success_at TEXT,
  last_status TEXT,
  last_error TEXT,
  last_count INTEGER DEFAULT 0,
  last_new INTEGER DEFAULT 0,
  duration_ms INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  total_seen INTEGER DEFAULT 0,
  total_new INTEGER DEFAULT 0,
  summary TEXT
);
`;

const parse = (s, fallback) => {
  try {
    return s ? JSON.parse(s) : fallback;
  } catch {
    return fallback;
  }
};

/** @param newSince date ISO de début de la dernière actualisation complète : une offre découverte depuis est « nouvelle ». */
export function rowToJob(row, newSince) {
  if (!row) return null;
  const lastSeen = new Date(row.last_seen_at).getTime();
  return {
    id: row.id,
    source: row.source,
    sourceId: row.source_id,
    title: row.title,
    company: row.company,
    location: row.location,
    country: row.country,
    remote: row.remote,
    contracts: parse(row.contracts, []),
    techs: parse(row.techs, []),
    salary: row.salary,
    tjmMin: row.tjm_min,
    tjmMax: row.tjm_max,
    salaryMin: row.salary_min,
    salaryMax: row.salary_max,
    currency: row.currency,
    url: row.url,
    applyUrl: row.apply_url,
    publishedAt: row.published_at,
    description: row.description,
    excerpt: row.excerpt,
    tags: parse(row.tags, []),
    fingerprint: row.fingerprint,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    isNew: newSince != null && row.first_seen_at >= newSince,
    stillListed: Date.now() - lastSeen < 7 * 86400e3,
    status: row.status,
    notes: row.notes,
    favorite: !!row.favorite,
    statusUpdatedAt: row.status_updated_at,
  };
}

const INFORMED = 200; // longueur de description à partir de laquelle une fiche est considérée complète
const specific = (list) => list.filter((c) => c !== 'autre');

/**
 * Fusionne une offre revue lors d'une actualisation avec la version en base.
 * Une offre revue sans sa fiche détaillée (liste de résultats seule) ne doit pas écraser le contrat,
 * les technos, les critères ou la rémunération obtenus précédemment depuis la fiche complète.
 */
export function mergeJob(row, j) {
  const oldContracts = parse(row.contracts, []);
  const oldTechs = parse(row.techs, []);
  const oldTags = parse(row.tags, []);
  const oldDesc = row.description || '';
  const newDesc = j.description || '';
  const oldInformed = oldDesc.length >= INFORMED;
  const newInformed = newDesc.length >= INFORMED;
  const richer = newDesc.length >= oldDesc.length;

  let contracts;
  if (!specific(j.contracts).length) contracts = oldContracts.length ? oldContracts : j.contracts;
  else if (richer || !specific(oldContracts).length) contracts = j.contracts;
  else contracts = [...new Set([...specific(oldContracts), ...specific(j.contracts)])];

  let techs;
  if (newInformed || (!oldInformed && richer)) techs = j.techs;
  else if (oldInformed) techs = oldTechs.length ? oldTechs : j.techs;
  else techs = [...new Set([...oldTechs, ...j.techs])];

  const placeholder = 'Entreprise non précisée';
  return {
    title: j.title || row.title,
    company: j.company && (j.company !== placeholder || !row.company) ? j.company : row.company,
    location: j.location || row.location,
    country: j.location ? j.country : row.country,
    remote: j.remote ?? row.remote,
    contracts,
    techs,
    salary: j.salary || row.salary || '',
    tjmMin: j.tjmMin ?? row.tjm_min,
    tjmMax: j.tjmMax ?? row.tjm_max,
    salaryMin: j.salaryMin ?? row.salary_min,
    salaryMax: j.salaryMax ?? row.salary_max,
    currency: j.currency ?? row.currency,
    url: j.url || row.url,
    applyUrl: j.applyUrl || row.apply_url,
    publishedAt: j.publishedAt || row.published_at,
    description: richer ? newDesc : oldDesc,
    excerpt: (j.excerpt || '').length >= (row.excerpt || '').length ? j.excerpt : row.excerpt,
    tags: j.tags.length >= oldTags.length ? j.tags : oldTags,
    fingerprint: j.fingerprint || row.fingerprint,
  };
}

export function openDb(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  const cols = new Set(db.prepare('PRAGMA table_info(jobs)').all().map((c) => c.name));
  for (const [col, type] of [['tjm_min', 'REAL'], ['tjm_max', 'REAL'], ['salary_min', 'REAL'], ['salary_max', 'REAL'], ['currency', 'TEXT']]) {
    if (!cols.has(col)) db.exec(`ALTER TABLE jobs ADD COLUMN ${col} ${type}`);
  }
  const srcCols = new Set(db.prepare('PRAGMA table_info(sources)').all().map((c) => c.name));
  if (!srcCols.has('last_success_at')) db.exec('ALTER TABLE sources ADD COLUMN last_success_at TEXT');
  const runCols = new Set(db.prepare('PRAGMA table_info(runs)').all().map((c) => c.name));
  if (!runCols.has('partial')) db.exec('ALTER TABLE runs ADD COLUMN partial INTEGER NOT NULL DEFAULT 0');

  const stmts = {
    getJob: db.prepare('SELECT * FROM jobs WHERE id = ?'),
    insertJob: db.prepare(`INSERT INTO jobs (id, source, source_id, title, company, location, country, remote, contracts, techs, salary, tjm_min, tjm_max, salary_min, salary_max, currency, url, apply_url,
      published_at, description, excerpt, tags, fingerprint, first_seen_at, last_seen_at, first_run_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    updateJob: db.prepare(`UPDATE jobs SET title = ?, company = ?, location = ?, country = ?, remote = ?, contracts = ?, techs = ?, salary = ?,
      tjm_min = ?, tjm_max = ?, salary_min = ?, salary_max = ?, currency = ?, url = ?, apply_url = ?, published_at = ?, description = ?, excerpt = ?,
      tags = ?, fingerprint = ?, last_seen_at = ? WHERE id = ?`),
    sourceIds: db.prepare('SELECT source_id FROM jobs WHERE source = ?'),
    upsertSource: db.prepare(`INSERT INTO sources (id, last_run_at, last_success_at, last_status, last_error, last_count, last_new, duration_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET last_run_at = excluded.last_run_at, last_success_at = COALESCE(excluded.last_success_at, sources.last_success_at),
      last_status = excluded.last_status, last_error = excluded.last_error,
      last_count = excluded.last_count, last_new = excluded.last_new, duration_ms = excluded.duration_ms`),
    allSources: db.prepare('SELECT * FROM sources'),
    countBySource: db.prepare('SELECT source, COUNT(*) AS n FROM jobs GROUP BY source'),
    insertRun: db.prepare('INSERT INTO runs (started_at, partial) VALUES (?, ?)'),
    finishRun: db.prepare('UPDATE runs SET finished_at = ?, total_seen = ?, total_new = ?, summary = ? WHERE id = ?'),
    // Dernière actualisation complète (les actualisations partielles — ajout d'un post… — ne réinitialisent pas « Nouveau »).
    latestRun: db.prepare('SELECT * FROM runs WHERE finished_at IS NOT NULL AND partial = 0 ORDER BY id DESC LIMIT 1'),
    updateTracking: db.prepare('UPDATE jobs SET status = ?, notes = ?, favorite = ?, status_updated_at = ? WHERE id = ?'),
    duplicates: db.prepare('SELECT id, source, url FROM jobs WHERE fingerprint = ? AND id != ?'),
    deleteJob: db.prepare('DELETE FROM jobs WHERE id = ?'),
  };

  const newSince = () => stmts.latestRun.get()?.started_at ?? null;

  return {
    raw: db,

    knownSourceIds(source) {
      return new Set(stmts.sourceIds.all(source).map((r) => r.source_id));
    },
    /** Offres déjà en base pour une source : infos utiles aux connecteurs pour décider d'aller chercher le détail. */
    knownJobs(source) {
      const rows = db
        .prepare(`SELECT source_id, title, company, location, url, contracts, tags, first_seen_at, last_seen_at, length(COALESCE(description, '')) AS desc_len FROM jobs WHERE source = ?`)
        .all(source);
      return new Map(
        rows.map((r) => [
          r.source_id,
          { sourceId: r.source_id, title: r.title, company: r.company, location: r.location, url: r.url, contracts: parse(r.contracts, []), tags: parse(r.tags, []), firstSeenAt: r.first_seen_at, lastSeenAt: r.last_seen_at, descLen: r.desc_len },
        ]),
      );
    },

    /** Insère ou met à jour une liste d'offres normalisées. Renvoie {inserted, updated}. */
    upsertJobs(jobs, runId) {
      const now = new Date().toISOString();
      let inserted = 0;
      let updated = 0;
      db.exec('BEGIN');
      try {
        for (const j of jobs) {
          const existing = stmts.getJob.get(j.id);
          if (existing) {
            const m = mergeJob(existing, j);
            stmts.updateJob.run(
              m.title, m.company, m.location, m.country, m.remote, JSON.stringify(m.contracts), JSON.stringify(m.techs), m.salary,
              m.tjmMin, m.tjmMax, m.salaryMin, m.salaryMax, m.currency, m.url, m.applyUrl, m.publishedAt, m.description, m.excerpt,
              JSON.stringify(m.tags), m.fingerprint, j.refreshOnly ? existing.last_seen_at : now, j.id,
            );
            updated++;
          } else {
            stmts.insertJob.run(
              j.id, j.source, j.sourceId, j.title, j.company, j.location, j.country, j.remote, JSON.stringify(j.contracts), JSON.stringify(j.techs),
              j.salary, j.tjmMin, j.tjmMax, j.salaryMin, j.salaryMax, j.currency, j.url, j.applyUrl, j.publishedAt || now, j.description, j.excerpt, JSON.stringify(j.tags), j.fingerprint, now, now, runId,
            );
            inserted++;
          }
        }
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
      return { inserted, updated };
    },

    startRun({ partial = false } = {}) {
      const startedAt = new Date().toISOString();
      const res = stmts.insertRun.run(startedAt, partial ? 1 : 0);
      return { id: Number(res.lastInsertRowid), startedAt };
    },
    newSince,
    finishRun(id, { totalSeen, totalNew, summary }) {
      stmts.finishRun.run(new Date().toISOString(), totalSeen, totalNew, JSON.stringify(summary), id);
    },
    latestRun() {
      const r = stmts.latestRun.get();
      return r ? { ...r, summary: parse(r.summary, null) } : null;
    },

    recordSource(id, { status, error, count, newCount, durationMs, startedAt }) {
      const now = new Date().toISOString();
      const success = status === 'ok' || status === 'partial' ? startedAt || now : null;
      stmts.upsertSource.run(id, now, success, status, error || null, count || 0, newCount || 0, durationMs || 0);
    },
    sourceInfo(id) {
      return db.prepare('SELECT * FROM sources WHERE id = ?').get(id) || null;
    },
    sourceStats() {
      const counts = Object.fromEntries(stmts.countBySource.all().map((r) => [r.source, r.n]));
      const rows = Object.fromEntries(stmts.allSources.all().map((r) => [r.id, r]));
      return { counts, rows };
    },

    getJob(id) {
      const job = rowToJob(stmts.getJob.get(id), newSince());
      if (!job) return null;
      job.duplicates = stmts.duplicates.all(job.fingerprint, job.id);
      return job;
    },

    updateTracking(id, { status, notes, favorite }) {
      const existing = stmts.getJob.get(id);
      if (!existing) return null;
      const nextStatus = status && STATUSES.includes(status) ? status : existing.status;
      const nextNotes = typeof notes === 'string' ? notes : existing.notes;
      const nextFav = typeof favorite === 'boolean' ? (favorite ? 1 : 0) : existing.favorite;
      const changed = nextStatus !== existing.status;
      stmts.updateTracking.run(nextStatus, nextNotes, nextFav, changed ? new Date().toISOString() : existing.status_updated_at, id);
      return this.getJob(id);
    },

    /** Import brut d'offres déjà normalisées (mode statique) — conserve dates de découverte et run d'origine. */
    importJobs(rows) {
      const stmt = db.prepare(`INSERT OR REPLACE INTO jobs (id, source, source_id, title, company, location, country, remote, contracts, techs, salary, tjm_min, tjm_max, salary_min, salary_max, currency,
        url, apply_url, published_at, description, excerpt, tags, fingerprint, first_seen_at, last_seen_at, first_run_id, status, notes, favorite, status_updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      db.exec('BEGIN');
      try {
        for (const j of rows) {
          stmt.run(
            j.id, j.source, j.sourceId, j.title, j.company ?? null, j.location ?? null, j.country ?? null, j.remote ?? null, JSON.stringify(j.contracts || []), JSON.stringify(j.techs || []), j.salary ?? null,
            j.tjmMin ?? null, j.tjmMax ?? null, j.salaryMin ?? null, j.salaryMax ?? null, j.currency ?? null, j.url, j.applyUrl ?? null, j.publishedAt ?? null, j.description || '', j.excerpt || '',
            JSON.stringify(j.tags || []), j.fingerprint ?? null, j.firstSeenAt, j.lastSeenAt, j.firstRunId ?? null, j.status || 'nouveau', j.notes || '', j.favorite ? 1 : 0, j.statusUpdatedAt ?? null,
          );
        }
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
    importRun(run) {
      db.prepare('INSERT OR REPLACE INTO runs (id, started_at, finished_at, total_seen, total_new, summary, partial) VALUES (?, ?, ?, ?, ?, ?, 0)').run(
        run.id, run.startedAt, run.finishedAt, run.totalSeen || 0, run.totalNew || 0, null,
      );
    },
    importSource(s) {
      db.prepare(`INSERT OR REPLACE INTO sources (id, last_run_at, last_success_at, last_status, last_error, last_count, last_new, duration_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
        s.id, s.lastRunAt ?? null, s.lastSuccessAt ?? (s.lastStatus === 'ok' || s.lastStatus === 'partial' ? s.lastRunAt ?? null : null), s.lastStatus ?? null, s.lastError ?? null,
        s.lastCount || 0, s.lastNew || 0, s.durationMs || 0,
      );
    },
    /** Supprime les offres non revues depuis `days` jours (sauf celles en cours de suivi). */
    purgeOlderThan(days) {
      const limit = new Date(Date.now() - days * 86400e3).toISOString();
      return db.prepare(`DELETE FROM jobs WHERE last_seen_at < ? AND status IN ('nouveau', 'vu', 'ignore')`).run(limit).changes;
    },

    /**
     * Complète les offres dont le contrat, le télétravail ou la rémunération sont inconnus alors que la description
     * en base permet de les déduire (répare les offres abîmées par l'ancienne mise à jour destructive).
     */
    repairIncomplete(repairFn) {
      const rows = db
        .prepare(
          `SELECT * FROM jobs WHERE (length(COALESCE(description, '')) > 40 AND (contracts = '["autre"]' OR remote IS NULL OR (tjm_min IS NULL AND salary_min IS NULL)))
             OR (tjm_min IS NOT NULL AND contracts NOT LIKE '%"freelance"%')
             OR (length(COALESCE(location, '')) > 25 AND instr(title, location) > 0)`,
        )
        .all();
      const upd = db.prepare('UPDATE jobs SET contracts = ?, remote = ?, tjm_min = ?, tjm_max = ?, salary_min = ?, salary_max = ?, currency = ?, salary = ?, location = ? WHERE id = ?');
      let repaired = 0;
      db.exec('BEGIN');
      try {
        for (const row of rows) {
          const job = rowToJob(row, null);
          const fixed = repairFn(job);
          if (!fixed) continue;
          upd.run(JSON.stringify(fixed.contracts), fixed.remote ?? null, fixed.tjmMin ?? null, fixed.tjmMax ?? null, fixed.salaryMin ?? null, fixed.salaryMax ?? null, fixed.currency ?? null, fixed.salary ?? '', fixed.location ?? '', row.id);
          repaired++;
        }
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
      return repaired;
    },

    deleteJob(id) {
      return stmts.deleteJob.run(id).changes > 0;
    },

    /**
     * Liste filtrée. filters: { techs[], contracts[], sources[], statuses[], country ('FR'|'REMOTE'|'FR_OR_REMOTE'|''),
     * remote ('full'|'partial'|'any'), q, sinceDays, onlyNew, favorite, sort ('published'|'seen'|'status') }
     */
    listJobs(filters = {}) {
      const where = [];
      const params = [];
      const orGroup = (values, col) => {
        if (!values?.length) return;
        where.push(`(${values.map(() => `${col} LIKE ?`).join(' OR ')})`);
        for (const v of values) params.push(`%"${v}"%`);
      };
      orGroup(filters.techs, 'techs');
      orGroup(filters.contracts, 'contracts');
      if (filters.sources?.length) {
        where.push(`source IN (${filters.sources.map(() => '?').join(',')})`);
        params.push(...filters.sources);
      }
      if (filters.statuses?.length) {
        where.push(`status IN (${filters.statuses.map(() => '?').join(',')})`);
        params.push(...filters.statuses);
      }
      if (filters.country === 'FR') where.push(`country = 'FR'`);
      else if (filters.country === 'REMOTE') where.push(`remote = 'full'`);
      else if (filters.country === 'FR_OR_REMOTE') where.push(`(country = 'FR' OR remote = 'full')`);
      if (filters.remote === 'full') where.push(`remote = 'full'`);
      else if (filters.remote === 'any') where.push(`remote IN ('full','partial')`);
      if (filters.q) {
        where.push(`(title LIKE ? OR company LIKE ? OR location LIKE ? OR excerpt LIKE ? OR tags LIKE ?)`);
        const like = `%${filters.q}%`;
        params.push(like, like, like, like, like);
      }
      if (filters.sinceDays) {
        where.push(`COALESCE(published_at, first_seen_at) >= ?`);
        params.push(new Date(Date.now() - Number(filters.sinceDays) * 86400e3).toISOString());
      }
      const since = newSince();
      if (filters.onlyNew) {
        where.push(`first_seen_at >= ?`);
        params.push(since ?? '9999');
      }
      if (filters.favorite) where.push('favorite = 1');
      if (Number(filters.tjmMin) > 0) {
        where.push('COALESCE(tjm_max, tjm_min) >= ?');
        params.push(Number(filters.tjmMin));
      }
      if (Number(filters.salaryMin) > 0) {
        where.push('COALESCE(salary_max, salary_min) >= ?');
        params.push(Number(filters.salaryMin));
      }
      if (filters.withPay) where.push('(tjm_min IS NOT NULL OR salary_min IS NOT NULL)');
      if (filters.hideStale) {
        where.push('last_seen_at >= ?');
        params.push(new Date(Date.now() - 7 * 86400e3).toISOString());
      }
      const ORDERS = {
        seen: 'first_seen_at DESC',
        status: 'status_updated_at DESC, published_at DESC',
        tjm: 'COALESCE(tjm_max, tjm_min) DESC NULLS LAST, COALESCE(published_at, first_seen_at) DESC',
        salary: 'COALESCE(salary_max, salary_min) DESC NULLS LAST, COALESCE(published_at, first_seen_at) DESC',
      };
      const order = ORDERS[filters.sort] || 'COALESCE(published_at, first_seen_at) DESC';
      const sql = `SELECT id, source, source_id, title, company, location, country, remote, contracts, techs, salary, tjm_min, tjm_max, salary_min, salary_max, currency, url, apply_url, published_at, excerpt, tags,
        fingerprint, first_seen_at, last_seen_at, first_run_id, status, notes, favorite, status_updated_at FROM jobs
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${order} LIMIT ?`;
      params.push(Number(filters.limit) || 1000);
      return db.prepare(sql).all(...params).map((r) => rowToJob(r, since));
    },

    stats() {
      const since = newSince();
      const total = db.prepare('SELECT COUNT(*) AS n FROM jobs').get().n;
      const newCount = since == null ? 0 : db.prepare('SELECT COUNT(*) AS n FROM jobs WHERE first_seen_at >= ?').get(since).n;
      const byStatus = Object.fromEntries(db.prepare('SELECT status, COUNT(*) AS n FROM jobs GROUP BY status').all().map((r) => [r.status, r.n]));
      const byTech = {};
      for (const r of db.prepare('SELECT techs FROM jobs').all()) for (const t of parse(r.techs, [])) byTech[t] = (byTech[t] || 0) + 1;
      const byContract = {};
      for (const r of db.prepare('SELECT contracts FROM jobs').all()) for (const c of parse(r.contracts, [])) byContract[c] = (byContract[c] || 0) + 1;
      const median = (rows) => {
        const v = rows.map((r) => r.v).filter((x) => x != null).sort((a, b) => a - b);
        return v.length ? v[Math.floor(v.length / 2)] : null;
      };
      const pay = {
        tjmMedian: median(db.prepare(`SELECT (COALESCE(tjm_min, tjm_max) + COALESCE(tjm_max, tjm_min)) / 2 AS v FROM jobs WHERE tjm_min IS NOT NULL AND (currency IS NULL OR currency = '€')`).all()),
        salaryMedian: median(db.prepare(`SELECT (COALESCE(salary_min, salary_max) + COALESCE(salary_max, salary_min)) / 2 AS v FROM jobs WHERE salary_min IS NOT NULL AND (currency IS NULL OR currency = '€')`).all()),
        withTjm: db.prepare('SELECT COUNT(*) AS n FROM jobs WHERE tjm_min IS NOT NULL').get().n,
        withSalary: db.prepare('SELECT COUNT(*) AS n FROM jobs WHERE salary_min IS NOT NULL').get().n,
      };
      return { total, newCount, byStatus, byTech, byContract, pay, latestRun: this.latestRun() };
    },

    close() {
      db.close();
    },
  };
}
