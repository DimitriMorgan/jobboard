// Orchestrateur d'actualisation : exécute chaque connecteur en isolation, normalise, déduplique et enregistre.
import { CONNECTORS, connectorAvailability } from './connectors/index.js';
import { normalizeJob } from './normalize.js';
import { mapLimit } from './http.js';

export function createRefresher(db, { concurrency = 4, log = console, connectors = CONNECTORS } = {}) {
  const state = { running: false, startedAt: null, finishedAt: null, runId: null, sources: {}, totals: { seen: 0, new: 0 } };

  function snapshot() {
    return { ...state, sources: { ...state.sources }, totals: { ...state.totals } };
  }

  async function runConnector(c, runId) {
    const t0 = Date.now();
    const src = (state.sources[c.id] = { status: 'running', message: 'Démarrage…', count: 0, newCount: 0, error: null, warning: null });
    const known = db.knownSourceIds(c.id);
    const ctx = {
      isKnown: (id) => known.has(String(id)),
      progress: (msg) => {
        src.message = msg;
        log.info?.(`[${c.id}] ${msg}`);
      },
    };
    try {
      const rawJobs = await c.fetch(ctx);
      const normalized = [];
      const seen = new Set();
      let ignored = 0;
      for (const raw of rawJobs) {
        const job = normalizeJob(c.id, raw);
        if (!job) {
          ignored++;
          continue;
        }
        if (seen.has(job.id)) continue;
        seen.add(job.id);
        normalized.push(job);
      }
      const { inserted } = db.upsertJobs(normalized, runId);
      Object.assign(src, {
        status: 'ok',
        count: normalized.length,
        newCount: inserted,
        ignored,
        warning: rawJobs.warning || null,
        message: `${normalized.length} offres pertinentes (${inserted} nouvelles, ${ignored} hors technos)`,
        durationMs: Date.now() - t0,
      });
      db.recordSource(c.id, { status: rawJobs.warning ? 'partial' : 'ok', error: rawJobs.warning || null, count: normalized.length, newCount: inserted, durationMs: src.durationMs });
      state.totals.seen += normalized.length;
      state.totals.new += inserted;
    } catch (err) {
      const message = err?.message || String(err);
      Object.assign(src, { status: 'error', error: message, message: 'Échec', durationMs: Date.now() - t0 });
      db.recordSource(c.id, { status: 'error', error: message, count: 0, newCount: 0, durationMs: src.durationMs });
      log.warn?.(`[${c.id}] ERREUR : ${message}`);
    }
  }

  async function refresh({ only } = {}) {
    if (state.running) return snapshot();
    const run = db.startRun();
    Object.assign(state, { running: true, startedAt: run.startedAt, finishedAt: null, runId: run.id, sources: {}, totals: { seen: 0, new: 0 } });
    const targets = connectors.filter((c) => !only?.length || only.includes(c.id));
    for (const c of targets) {
      const avail = connectorAvailability(c);
      if (!avail.enabled) state.sources[c.id] = { status: 'skipped', message: avail.reason, count: 0, newCount: 0 };
    }
    const runnable = targets.filter((c) => connectorAvailability(c).enabled);
    try {
      await mapLimit(runnable, concurrency, (c) => runConnector(c, run.id));
    } finally {
      state.running = false;
      state.finishedAt = new Date().toISOString();
      db.finishRun(run.id, { totalSeen: state.totals.seen, totalNew: state.totals.new, summary: state.sources });
      log.info?.(`Actualisation terminée : ${state.totals.seen} offres vues, ${state.totals.new} nouvelles.`);
    }
    return snapshot();
  }

  return { refresh, status: snapshot };
}
