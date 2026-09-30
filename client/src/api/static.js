// Implémentation « site statique » : données JSON publiées par GitHub Actions, filtrage dans le navigateur,
// suivi local synchronisable, bouton Actualiser qui déclenche le workflow GitHub.
import { filterJobs } from '../staticFilter.js';
import { tracking } from '../tracking.js';
import { getSettings } from '../settings.js';
import { dispatchWorkflow, latestWorkflowRun } from '../github.js';
import { manualLinks } from '../../../shared/manualLinks.js';
import { descriptionShardFile } from '../../../shared/shard.js';

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
// Fichiers de descriptions déjà demandés (chemin → promesse du contenu) : chaque fichier n'est chargé qu'une fois.
const descriptionFiles = new Map();
let dataError = null;
const state = { running: false, startedAt: null, finishedAt: null, sources: {}, totals: { seen: 0, new: 0 }, message: '', runUrl: null, error: null, static: true };

async function fetchJson(file, force, version) {
  const query = force ? `?t=${Date.now()}` : version ? `?v=${encodeURIComponent(version)}` : '';
  const res = await fetch(`${BASE}data/${file}${query}`, { cache: force ? 'no-store' : 'default' });
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
    if (force) descriptionFiles.clear();
  } catch (err) {
    dataError = err;
    if (!data) throw err;
  }
  return data;
}

/**
 * Description d'une offre. Les descriptions sont réparties en plusieurs fichiers (`descriptionShards`) :
 * seul celui de l'offre est téléchargé. Les données plus anciennes n'ont qu'un fichier descriptions.json.
 * L'URL porte la date de publication des données : le cache du navigateur sert tant qu'elles n'ont pas changé.
 */
async function loadDescription(d, id) {
  const file = d.descriptionShards ? descriptionShardFile(id, d.descriptionShards) : 'descriptions.json';
  if (!descriptionFiles.has(file)) {
    const pending = fetchJson(file, false, d.generatedAt).catch(() => {
      if (descriptionFiles.get(file) === pending) descriptionFiles.delete(file); // échec réseau : on réessaiera à la prochaine ouverture
      return {};
    });
    descriptionFiles.set(file, pending);
  }
  const descs = await descriptionFiles.get(file);
  return descs[id] || '';
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
    const description = await loadDescription(d, id);
    job = withTracking(job);
    job.description = description;
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
      latestRun: d.latestRun ? { id: d.latestRun.id, finished_at: d.generatedAt || d.latestRun.finishedAt, started_at: d.latestRun.startedAt } : null,
      generatedAt: d.generatedAt,
    };
  },

  async sources() {
    const d = await loadData().catch(() => null);
    return (d?.sources || []).map((s) => ({ ...s, live: null }));
  },

  manualLinks: async (tech, contract) => manualLinks(tech, contract),

  refreshStatus: async () => ({ ...state }),

  /**
   * Déclenche le workflow GitHub. `only` : sources à actualiser (actualisation partielle, rapide) ;
   * `manualUrls` : posts / offres LinkedIn à ajouter.
   */
  async refresh(only, { manualUrls = [] } = {}) {
    if (state.running) return { ...state };
    const partial = !!(only?.length || manualUrls.length);
    const cfg = getSettings();
    if (!cfg.token || !cfg.repo) {
      const err = new Error('Pour actualiser depuis le site, renseignez un jeton GitHub dans l’onglet Sources → Paramètres. Sinon, lancez le workflow « Actualiser les offres » depuis l’onglet Actions du dépôt GitHub.');
      err.code = 'NO_TOKEN';
      throw err;
    }
    const before = data?.generatedAt || null;
    Object.assign(state, { running: true, startedAt: new Date().toISOString(), finishedAt: null, message: 'Déclenchement du workflow GitHub…', runUrl: null, error: null });
    const inputs = partial ? { sources: (only || []).join(','), linkedin_urls: manualUrls.join(' ') } : undefined;
    try {
      await dispatchWorkflow(cfg, inputs);
    } catch (err) {
      state.running = false;
      if (err.status === 422 && inputs) err.message = `${err.message} — le workflow du dépôt ne connaît pas encore les paramètres d’ajout : attendez la prochaine publication du site ou relancez-le une fois depuis GitHub.`;
      throw err;
    }
    (async () => {
      try {
        await sleep(6000);
        let run = null;
        for (let i = 0; i < 360; i++) {
          run = await latestWorkflowRun(cfg).catch(() => null);
          if (run && run.created_at >= state.startedAt.slice(0, 19)) {
            state.runUrl = run.html_url;
            state.message =
              run.status === 'completed'
                ? `Workflow terminé (${run.conclusion})`
                : partial
                  ? `Ajout en cours sur GitHub (${run.status})… comptez 1 à 2 minutes.`
                  : `Workflow GitHub en cours (${run.status})… toutes les sources sont interrogées, LinkedIn compris : comptez 30 à 40 minutes.`;
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
