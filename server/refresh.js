// Orchestrateur d'actualisation : exécute chaque connecteur en isolation, normalise, déduplique et enregistre.
import { CONNECTORS, connectorAvailability } from './connectors/index.js';
import { normalizeJob } from './normalize.js';
import { mapLimit } from './http.js';

export function createRefresher(db, { concurrency = 4, log = console, connectors = CONNECTORS } = {}) {
  const state = { running: false, startedAt: null, finishedAt: null, runId: null, sources: {}, totals: { seen: 0, new: 0 } };

  function snapshot() {
    return { ...state, sources: { ...state.sources }, totals: { ...state.totals } };
  }

  async function runConnector(c, runId, opts = {}) {
    const t0 = Date.now();
    const src = (state.sources[c.id] = { status: 'running', message: 'Démarrage…', count: 0, newCount: 0, error: null, warning: null });
    const known = db.knownJobs(c.id);
    const info = db.sourceInfo?.(c.id) || null;
    const startedAt = new Date(t0).toISOString();
    const ctx = {
      isKnown: (id) => known.has(String(id)),
      /** Vrai si l'offre est nouvelle ou connue sans description : le connecteur peut aller chercher le détail. */
      needsDetail: (id) => !known.has(String(id)) || known.get(String(id)).descLen < 40,
      /** Infos sur une offre déjà en base (ou null). */
      known: (id) => known.get(String(id)) || null,
      /** Toutes les offres déjà en base pour cette source. */
      knownJobs: () => [...known.values()],
      /** Date du dernier passage réussi de la source (ISO) ou null : permet d'ajuster la fenêtre de recherche. */
      lastSuccessAt: info?.last_success_at || null,
      /** URL ajoutées à la main (posts ou offres LinkedIn) et mode « ajout seul » (pas de recherche complète). */
      manualUrls: opts.manualUrls || [],
      manualOnly: !!opts.manualOnly,
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
      db.recordSource(c.id, { status: rawJobs.warning ? 'partial' : 'ok', error: rawJobs.warning || null, count: normalized.length, newCount: inserted, durationMs: src.durationMs, startedAt });
      state.totals.seen += normalized.length;
      state.totals.new += inserted;
    } catch (err) {
      const message = err?.message || String(err);
      Object.assign(src, { status: 'error', error: message, message: 'Échec', durationMs: Date.now() - t0 });
      db.recordSource(c.id, { status: 'error', error: message, count: 0, newCount: 0, durationMs: src.durationMs });
      log.warn?.(`[${c.id}] ERREUR : ${message}`);
    }
  }

  async function refresh({ only, manualUrls = [], partial } = {}) {
    if (state.running) return snapshot();
    const isPartial = partial ?? !!only?.length;
    const run = db.startRun({ partial: isPartial });
    Object.assign(state, { running: true, startedAt: run.startedAt, finishedAt: null, runId: run.id, sources: {}, totals: { seen: 0, new: 0 } });
    const targets = connectors.filter((c) => !only?.length || only.includes(c.id));
    for (const c of targets) {
      const avail = connectorAvailability(c);
      if (!avail.enabled) state.sources[c.id] = { status: 'skipped', message: avail.reason, count: 0, newCount: 0 };
    }
    const runnable = targets.filter((c) => connectorAvailability(c).enabled);
    try {
      const opts = { manualUrls, manualOnly: isPartial && manualUrls.length > 0 };
      await mapLimit(runnable, concurrency, (c) => runConnector(c, run.id, opts));
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
