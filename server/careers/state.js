// Annuaire des entreprises suivies sur leurs sites carrières (fichier JSON, publié sur la branche data).
//
// Chaque entreprise est identifiée par « plateforme:identifiant » (ex. « lever:qonto ») et passe par ces états :
//  - candidate : découverte (index Common Crawl, ajout manuel…), pas encore vérifiée ;
//  - pool      : publie au moins une offre en France (ou télétravail depuis la France) : relue chaque jour ;
//  - out       : vérifiée, aucune offre en France : revérifiée après OUT_RECHECK_DAYS ;
//  - dead      : page introuvable : revérifiée après DEAD_RECHECK_DAYS.
import fs from 'node:fs';
import path from 'node:path';

export const STATE_FILE = 'careers-state.json';
export const OUT_RECHECK_DAYS = 45;
export const DEAD_RECHECK_DAYS = 120;
/** Une entreprise du pool sans offre en France depuis ce délai en sort (sauf ajout manuel). */
export const POOL_EXPIRY_DAYS = 60;

const DAY = 86400e3;

export function emptyState() {
  return { format: 1, updatedAt: null, harvest: { index: null, at: null }, companies: {} };
}

export function loadState(file) {
  try {
    const s = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (s && typeof s.companies === 'object') return { ...emptyState(), ...s };
  } catch {
    /* absent ou illisible : on repart d'un annuaire vide */
  }
  return emptyState();
}

export function saveState(file, state) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(file, JSON.stringify(state));
}

export const keyOf = (ats, slug) => `${ats}:${slug}`;

/** Ajoute des entreprises découvertes (sans écraser celles déjà connues). Renvoie le nombre d'ajouts. */
export function addCandidates(state, list, origin) {
  let added = 0;
  for (const { ats, slug, name } of list) {
    const k = keyOf(ats, slug);
    if (state.companies[k]) continue;
    state.companies[k] = { ats, slug, name: name || null, status: 'candidate', origin, addedAt: new Date().toISOString() };
    added++;
  }
  return added;
}

/** Entreprises à vérifier maintenant : candidates d'abord, puis revérifications échues (les plus anciennes d'abord). */
export function dueForCheck(state, now = Date.now()) {
  const out = [];
  const recheck = [];
  for (const c of Object.values(state.companies)) {
    if (c.status === 'candidate') out.push(c);
    else if (c.status === 'out' && now - Date.parse(c.checkedAt || 0) > OUT_RECHECK_DAYS * DAY) recheck.push(c);
    else if (c.status === 'dead' && now - Date.parse(c.checkedAt || 0) > DEAD_RECHECK_DAYS * DAY) recheck.push(c);
  }
  recheck.sort((a, b) => Date.parse(a.checkedAt || 0) - Date.parse(b.checkedAt || 0));
  return [...out, ...recheck];
}

export const poolCompanies = (state) => Object.values(state.companies).filter((c) => c.status === 'pool');

/**
 * Enregistre le résultat d'une lecture : `result` = { ok, notFound, name, careersUrl, total, fr, dev }.
 * Une entreprise entre dans le pool dès qu'elle publie une offre en France, et en sort après POOL_EXPIRY_DAYS sans.
 */
export function recordCheck(company, result, now = Date.now()) {
  const iso = new Date(now).toISOString();
  company.checkedAt = iso;
  if (!result.ok) {
    if (result.notFound) {
      company.status = company.origin === 'manual' && company.status === 'pool' ? 'pool' : 'dead';
      company.error = 'introuvable';
    } else company.error = result.error || 'erreur';
    return company;
  }
  delete company.error;
  if (result.name) company.name = result.name;
  if (result.careersUrl) company.careersUrl = result.careersUrl;
  company.jobs = result.total;
  company.frJobs = result.fr;
  company.devJobs = result.dev;
  if (result.fr > 0) {
    company.status = 'pool';
    company.lastFrAt = iso;
  } else if (company.origin === 'manual') company.status = 'pool';
  else if (company.status !== 'pool' || now - Date.parse(company.lastFrAt || 0) > POOL_EXPIRY_DAYS * DAY) company.status = 'out';
  return company;
}

/** Résumé publié pour le site (onglet Entreprises) : uniquement les entreprises suivies. */
export function publicPool(state) {
  return poolCompanies(state)
    .map(({ ats, slug, name, careersUrl, frJobs, devJobs, checkedAt, origin }) => ({ ats, slug, name: name || slug, careersUrl, frJobs: frJobs || 0, devJobs: devJobs || 0, checkedAt, manual: origin === 'manual' }))
    .sort((a, b) => b.devJobs - a.devJobs || b.frJobs - a.frJobs || a.name.localeCompare(b.name, 'fr'));
}
