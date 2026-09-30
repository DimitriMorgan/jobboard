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
import linkedinposts from './linkedinposts.js';
import collective from './collective.js';
import meteojob from './meteojob.js';
import jobijoba from './jobijoba.js';
import freelanceinformatique from './freelanceinformatique.js';
import freelancerepublik from './freelancerepublik.js';
import lesjeudis from './lesjeudis.js';
import codeur from './codeur.js';
import workingnomads from './workingnomads.js';

// LinkedIn en premier : c'est la source la plus longue (pagination profonde + fiches), elle démarre tout de suite.
export const CONNECTORS = [
  linkedin, freework, wttj, apec, hellowork, collective, freelanceinformatique, freelancerepublik, lesjeudis, meteojob, jobijoba, codeur,
  linkedinposts, francetravail, adzuna, jooble, remotive, arbeitnow, jobicy, remoteok, himalayas, weworkremotely, workingnomads, themuse, hackernews,
];

/** Indique si un connecteur est utilisable (variables d'environnement présentes, non désactivé). */
export function connectorAvailability(c) {
  const disabled = (process.env.DISABLED_SOURCES || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (disabled.includes(c.id)) return { enabled: false, reason: 'Désactivée via DISABLED_SOURCES' };
  const missing = (c.requiresEnv || []).filter((k) => !process.env[k]);
  if (missing.length) return { enabled: false, reason: `Identifiants manquants : ${missing.join(', ')}` };
  return { enabled: true };
}
