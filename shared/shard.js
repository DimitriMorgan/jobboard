// Répartition des descriptions en plusieurs petits fichiers (site statique) : le navigateur ne télécharge
// que le fichier contenant l'offre ouverte au lieu de toutes les descriptions d'un coup.
// Partagé entre l'export (Node) et le site : le calcul doit donner le même résultat des deux côtés.

export const DESCRIPTION_SHARDS = 64;
export const DESCRIPTIONS_DIR = 'descriptions';

/** Hachage FNV-1a 32 bits, stable et identique dans Node et le navigateur. */
export function fnv1a(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Numéro du fichier qui contient la description de l'offre `id`. On garde les bits de poids fort du hachage
 * (les mieux mélangés avec FNV) : répartition régulière même pour des identifiants qui se suivent.
 */
export function shardOf(id, shards = DESCRIPTION_SHARDS) {
  return Math.floor((fnv1a(String(id)) * shards) / 2 ** 32);
}

/** Chemin (relatif au dossier de données) du fichier de descriptions n° `n`. */
export function shardFile(n) {
  return `${DESCRIPTIONS_DIR}/${String(n).padStart(2, '0')}.json`;
}

/** Chemin du fichier qui contient la description de l'offre `id`. */
export function descriptionShardFile(id, shards = DESCRIPTION_SHARDS) {
  return shardFile(shardOf(id, shards));
}
