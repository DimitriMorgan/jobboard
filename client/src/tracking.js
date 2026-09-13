// Suivi des candidatures en mode statique : stockage local + synchronisation optionnelle dans un dépôt GitHub.
import { getSettings } from './settings.js';
import { readFile, writeFile } from './github.js';

const KEY = 'jobboard.tracking.v1';
let map = load();
let timer = null;
const listeners = new Set();
export const syncState = { configured: false, syncing: false, lastSyncAt: null, error: null, pending: false };

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}') || {};
  } catch {
    return {};
  }
}
function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* stockage indisponible */
  }
}
function notify() {
  for (const fn of listeners) fn();
}

function mergeMaps(local, remote) {
  const out = { ...local };
  let localNewer = false;
  let changed = false;
  const ids = new Set([...Object.keys(local), ...Object.keys(remote)]);
  for (const id of ids) {
    const a = local[id];
    const b = remote[id];
    if (!a) {
      out[id] = b;
      changed = true;
    } else if (!b) localNewer = true;
    else if ((b.updatedAt || '') > (a.updatedAt || '')) {
      out[id] = b;
      changed = true;
    } else if ((a.updatedAt || '') > (b.updatedAt || '')) localNewer = true;
  }
  return { merged: out, changed, localNewer };
}

function syncConfig() {
  const s = getSettings();
  if (!s.token || !s.syncRepo) return null;
  return s;
}

export const tracking = {
  get: (id) => map[id] || null,
  all: () => map,
  onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  update(id, patch, snapshot) {
    const prev = map[id] || { status: 'nouveau', notes: '', favorite: false };
    const now = new Date().toISOString();
    const next = { ...prev, ...patch, updatedAt: now, snapshot: snapshot || prev.snapshot };
    if (patch.status && patch.status !== prev.status) next.statusUpdatedAt = now;
    map[id] = next;
    persist();
    tracking.schedulePush();
    return next;
  },
  exportJson: () => JSON.stringify(map, null, 2),
  importJson(json) {
    const remote = JSON.parse(json);
    if (!remote || typeof remote !== 'object') throw new Error('Fichier invalide');
    map = mergeMaps(map, remote).merged;
    persist();
    notify();
    tracking.schedulePush();
  },

  /** Récupère le fichier distant et fusionne (la version la plus récente par offre gagne). */
  async pull() {
    const cfg = syncConfig();
    syncState.configured = !!cfg;
    if (!cfg) return false;
    syncState.syncing = true;
    syncState.error = null;
    try {
      const file = await readFile(cfg, cfg.syncRepo, cfg.syncPath, cfg.syncBranch);
      let localNewer = Object.keys(map).length > 0;
      if (file) {
        const remote = JSON.parse(file.content || '{}');
        const res = mergeMaps(map, remote);
        map = res.merged;
        localNewer = res.localNewer;
        if (res.changed) {
          persist();
          notify();
        }
      }
      syncState.lastSyncAt = new Date().toISOString();
      if (localNewer) await tracking.push();
      return true;
    } catch (err) {
      syncState.error = err.message;
      return false;
    } finally {
      syncState.syncing = false;
    }
  },

  async push() {
    const cfg = syncConfig();
    syncState.configured = !!cfg;
    if (!cfg) return false;
    syncState.syncing = true;
    syncState.pending = false;
    syncState.error = null;
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const file = await readFile(cfg, cfg.syncRepo, cfg.syncPath, cfg.syncBranch);
        if (file) {
          const res = mergeMaps(map, JSON.parse(file.content || '{}'));
          map = res.merged;
          persist();
          if (res.changed) notify();
        }
        try {
          await writeFile(cfg, cfg.syncRepo, cfg.syncPath, cfg.syncBranch, JSON.stringify(map, null, 2), file?.sha, `Suivi JobBoard ${new Date().toISOString()}`);
          syncState.lastSyncAt = new Date().toISOString();
          return true;
        } catch (err) {
          if (err.status !== 409 && err.status !== 422) throw err;
        }
      }
      throw new Error('Conflit de synchronisation persistant');
    } catch (err) {
      syncState.error = err.message;
      return false;
    } finally {
      syncState.syncing = false;
    }
  },

  schedulePush() {
    if (!syncConfig()) return;
    syncState.pending = true;
    clearTimeout(timer);
    timer = setTimeout(() => tracking.push(), 2500);
  },
};
