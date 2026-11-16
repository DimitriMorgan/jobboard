// Identifiants probables d'une entreprise sur les plateformes de recrutement, déduits de son nom
// (« Back Market » → backmarket, back-market ; « Qonto SAS » → qonto).

// Mentions juridiques et compléments qui ne font pas partie de l'identifiant.
const SUFFIXES = /\b(?:sas|sasu|sa|sarl|eurl|sci|scop|inc|ltd|llc|plc|gmbh|ag|bv|nv|srl|spa|ab|oy|as|corp|corporation|company|co|group|groupe|holding|france|fr|europe|international|worldwide|global|hq)\b\.?/g;

const LEGAL = /^(?:sas|sasu|sa|sarl|eurl|sci|scop|inc|ltd|llc|plc|gmbh|ag|bv|nv|srl|spa|ab|oy|as|corp|co)$/;

/** Noms trop génériques pour être devinés sans risque de confusion avec une autre entreprise. */
const GENERIC = /^(?:entreprise|confidentiel|confidential|anonyme|client|startup|start-up|cabinet|agence|societe|company|recrutement|recruitment|freelance|mission|esn|groupe|group|consulting|services|solutions|digital|tech|technologies|software|studio|lab|labs|web|data|cloud|ai|it|interim|jobs?|careers?)$/;

const ascii = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Clé de regroupement d'un nom d'entreprise (minuscules, sans accents ni ponctuation). */
export function nameKey(name) {
  return ascii(name).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Jusqu'à trois identifiants candidats, du plus probable au moins probable. */
export function guessSlugs(name) {
  const raw = ascii(name).toLowerCase().replace(/\(.*?\)/g, ' ').replace(/&/g, ' and ');
  if (/non pr[ée]cis|confidenti|anonym/.test(raw)) return [];
  const words = raw.replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  const core = raw.replace(SUFFIXES, ' ').replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  const out = [];
  const add = (s) => {
    if (s && s.length >= 3 && s.length <= 40 && !GENERIC.test(s) && !out.includes(s)) out.push(s);
  };
  const base = core.length ? core : words;
  add(base.join(''));
  add(base.join('-'));
  // Nom complet aussi (« axafrance », « soprasteriagroup »), sauf si seule une forme juridique a été retirée.
  const removed = words.filter((w) => !core.includes(w));
  if (removed.length && !removed.every((w) => LEGAL.test(w))) add(words.join(''));
  return out.slice(0, 3);
}
