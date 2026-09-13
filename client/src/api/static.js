// Implémentation « site statique » : données JSON publiées par GitHub Actions, filtrage dans le navigateur,
// suivi local synchronisable, bouton Actualiser qui déclenche le workflow GitHub.
import { filterJobs } from '../staticFilter.js';
import { tracking } from '../tracking.js';
import { getSettings } from '../settings.js';
import { dispatchWorkflow, latestWorkflowRun } from '../github.js';
import { manualLinks } from '../../../shared/manualLinks.js';

const BASE = import.meta.env.BASE_URL || '/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const FALLBACK_META = {
  techs: [{ id: 'javascript', label: 'JavaScript' }, { id: 'react', label: 'React' }, { id: 'php', label: 'PHP' }, { id: 'nodejs', label: 'Node.js' }, { id: 'dotnet', label: '.NET' }],
  contracts: ['freelance', 'cdi', 'cdd', 'interim', 'alternance', 'stage', 'autre'],
  statuses: ['nouveau', 'vu', 'a_postuler', 'candidature_envoyee', 'relance', 'entretien', 'offre_recue', 'refus', 'ignore'],
  sources: [],
  manualPlatforms: [],
};

let data = null;
let descriptions = null;
let dataError = null;
const state = { running: false, startedAt: null, finishedAt: null, sources: {}, totals: { seen: 0, new: 0 }, message: '', runUrl: null, error: null, static: true };

async function fetchJson(file, force) {
  const res = await fetch(`${BASE}data/${file}${force ? `?t=${Date.now()}` : ''}`, { cache: force ? 'no-store' : 'default' });
  if (!res.ok) {
    const err = new Error(res.status === 404 ? 'Aucune donnée publiée pour l’instant : lancez le workflow « Actualiser les offres » depuis l’onglet Actions de GitHub (ou le bouton Actualiser une fois le jeton configuré).' : `Erreur de chargement des données (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function loadData(force = false) {
  if (data && !force) return data;
  try {
    data = await fetchJson('jobs.json', force);
    dataError = null;
    if (force) descriptions = null;
  } catch (err) {
    dataError = err;
    if (!data) throw err;
  }
  return data;
}

async function loadDescriptions() {
  if (!descriptions) descriptions = await fetchJson('descriptions.json', true).catch(() => ({}));
  return descriptions;
}

function withTracking(job) {
  const t = tracking.get(job.id);
  return { ...job, status: t?.status || 'nouveau', notes: t?.notes || '', favorite: !!t?.favorite, statusUpdatedAt: t?.statusUpdatedAt || null };
}

function snapshotOf(job) {
  const { title, company, location, url, source, contracts, techs, tjmMin, tjmMax, salaryMin, salaryMax, currency, publishedAt } = job;
  return { title, company, location, url, source, contracts, techs, tjmMin, tjmMax, salaryMin, salaryMax, currency, publishedAt };
}

function trackedGhosts(statuses) {
  const present = new Set((data?.jobs || []).map((j) => j.id));
  const out = [];
  for (const [id, t] of Object.entries(tracking.all())) {
    if (present.has(id) || !t.snapshot || !statuses.includes(t.status)) continue;
    out.push({ ...t.snapshot, id, contracts: t.snapshot.contracts || [], techs: t.snapshot.techs || [], tags: [], excerpt: '', isNew: false, stillListed: false, firstSeenAt: t.updatedAt, lastSeenAt: t.updatedAt, status: t.status, notes: t.notes || '', favorite: !!t.favorite, statusUpdatedAt: t.statusUpdatedAt || null });
  }
  return out;
}

function median(values) {
  const v = values.filter((x) => x != null).sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : null;
}

export const api = {
  isStatic: true,

  async meta() {
    try {
      const d = await loadData();
      return d.meta || FALLBACK_META;
    } catch {
      return FALLBACK_META;
    }
  },

  async jobs(filters) {
    const d = await loadData();
    let list = filterJobs(d.jobs.map(withTracking), filters);
    if (filters.statuses?.length && !filters.sinceDays) list = list.concat(trackedGhosts(filters.statuses));
    return { count: list.length, jobs: list };
  },

  async job(id) {
    const d = await loadData();
    let job = d.jobs.find((j) => j.id === id);
    if (!job) {
      const ghost = trackedGhosts(FALLBACK_META.statuses).find((g) => g.id === id);
      if (!ghost) throw new Error('Offre introuvable');
      return { ...ghost, description: '', duplicates: [] };
    }
    const descs = await loadDescriptions();
    job = withTracking(job);
    job.description = descs[id] || '';
    job.duplicates = d.jobs.filter((j) => j.fingerprint === job.fingerprint && j.id !== job.id).map(({ id, source, url }) => ({ id, source, url }));
    return job;
  },

  async updateJob(id, patch) {
    const d = await loadData().catch(() => ({ jobs: [] }));
    const job = d.jobs.find((j) => j.id === id);
    tracking.update(id, patch, job ? snapshotOf(job) : undefined);
    return job ? withTracking(job) : { id, ...tracking.get(id) };
  },

  async stats() {
    const d = await loadData();
    const jobs = d.jobs.map(withTracking);
    const byStatus = {};
    const byTech = {};
    const byContract = {};
    for (const j of jobs) {
      byStatus[j.status] = (byStatus[j.status] || 0) + 1;
      for (const t of j.techs) byTech[t] = (byTech[t] || 0) + 1;
      for (const c of j.contracts) byContract[c] = (byContract[c] || 0) + 1;
    }
    const euro = (j) => !j.currency || j.currency === '€';
    return {
      total: jobs.length,
      newCount: jobs.filter((j) => j.isNew).length,
      byStatus,
      byTech,
      byContract,
      pay: {
        tjmMedian: median(jobs.filter((j) => j.tjmMin != null && euro(j)).map((j) => ((j.tjmMin ?? j.tjmMax) + (j.tjmMax ?? j.tjmMin)) / 2)),
        salaryMedian: median(jobs.filter((j) => j.salaryMin != null && euro(j)).map((j) => ((j.salaryMin ?? j.salaryMax) + (j.salaryMax ?? j.salaryMin)) / 2)),
        withTjm: jobs.filter((j) => j.tjmMin != null).length,
        withSalary: jobs.filter((j) => j.salaryMin != null).length,
      },
      latestRun: d.latestRun ? { id: d.latestRun.id, finished_at: d.latestRun.finishedAt || d.generatedAt, started_at: d.latestRun.startedAt } : null,
      generatedAt: d.generatedAt,
    };
  },

  async sources() {
    const d = await loadData().catch(() => null);
    return (d?.sources || []).map((s) => ({ ...s, live: null }));
  },

  manualLinks: async (tech, contract) => manualLinks(tech, contract),

  refreshStatus: async () => ({ ...state }),

  async refresh() {
    if (state.running) return { ...state };
    const cfg = getSettings();
    if (!cfg.token || !cfg.repo) {
      const err = new Error('Pour actualiser depuis le site, renseignez un jeton GitHub dans l’onglet Sources → Paramètres. Sinon, lancez le workflow « Actualiser les offres » depuis l’onglet Actions du dépôt GitHub.');
      err.code = 'NO_TOKEN';
      throw err;
    }
    const before = data?.generatedAt || null;
    Object.assign(state, { running: true, startedAt: new Date().toISOString(), finishedAt: null, message: 'Déclenchement du workflow GitHub…', runUrl: null, error: null });
    await dispatchWorkflow(cfg);
    (async () => {
      try {
        await sleep(6000);
        let run = null;
        for (let i = 0; i < 80; i++) {
          run = await latestWorkflowRun(cfg).catch(() => null);
          if (run && run.created_at >= state.startedAt) {
            state.runUrl = run.html_url;
            state.message = run.status === 'completed' ? `Workflow terminé (${run.conclusion})` : `Workflow GitHub en cours (${run.status})… les 16 sources sont interrogées, comptez 2 à 5 minutes.`;
            if (run.status === 'completed') break;
          } else state.message = 'En attente du démarrage du workflow…';
          await sleep(10000);
        }
        if (run?.conclusion && run.conclusion !== 'success') throw new Error(`Le workflow s’est terminé en « ${run.conclusion} ». Consultez le journal sur GitHub.`);
        state.message = 'Publication des nouvelles données…';
        for (let i = 0; i < 40; i++) {
          await sleep(15000);
          const d = await loadData(true).catch(() => null);
          if (d && d.generatedAt !== before) break;
        }
        state.message = 'Données à jour.';
      } catch (err) {
        state.error = err.message;
      } finally {
        state.running = false;
        state.finishedAt = new Date().toISOString();
      }
    })();
    return { ...state };
  },

  async reload() {
    return loadData(true);
  },
  lastDataError: () => dataError,
};
