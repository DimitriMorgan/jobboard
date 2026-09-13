import freework from './freework.js';
import linkedin from './linkedin.js';
import wttj from './wttj.js';
import apec from './apec.js';
import hellowork from './hellowork.js';
import francetravail from './francetravail.js';
import adzuna from './adzuna.js';
import jooble from './jooble.js';
import remotive from './remotive.js';
import arbeitnow from './arbeitnow.js';
import jobicy from './jobicy.js';
import remoteok from './remoteok.js';
import himalayas from './himalayas.js';
import weworkremotely from './weworkremotely.js';
import themuse from './themuse.js';
import hackernews from './hackernews.js';

export const CONNECTORS = [freework, linkedin, wttj, apec, hellowork, francetravail, adzuna, jooble, remotive, arbeitnow, jobicy, remoteok, himalayas, weworkremotely, themuse, hackernews];

/** Indique si un connecteur est utilisable (variables d'environnement présentes, non désactivé). */
export function connectorAvailability(c) {
  const disabled = (process.env.DISABLED_SOURCES || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (disabled.includes(c.id)) return { enabled: false, reason: 'Désactivée via DISABLED_SOURCES' };
  const missing = (c.requiresEnv || []).filter((k) => !process.env[k]);
  if (missing.length) return { enabled: false, reason: `Identifiants manquants : ${missing.join(', ')}` };
  return { enabled: true };
}
