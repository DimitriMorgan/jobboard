// Paramètres GitHub (mode statique), stockés uniquement dans le navigateur.
const KEY = 'jobboard.github.v1';

export const DEFAULT_SETTINGS = {
  token: '',
  repo: import.meta.env.VITE_GITHUB_REPO || '',
  branch: import.meta.env.VITE_GITHUB_BRANCH || 'main',
  workflow: 'refresh.yml',
  syncRepo: '',
  syncBranch: '',
  syncPath: 'tracking.json',
};

export function getSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(localStorage.getItem(KEY) || 'null') || {}) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(patch) {
  const next = { ...getSettings(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* stockage indisponible */
  }
  return next;
}
