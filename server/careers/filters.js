// Tri des offres publiées sur les sites carrières des entreprises : ces pages listent tous les métiers
// (vente, RH, finance…) et souvent plusieurs pays ; on ne garde que les postes tech situés en France
// ou en télétravail ouvert depuis la France.

/** Intitulé d'un poste technique (développement, ingénierie logicielle, technique au sens large). */
export const DEV_TITLE_RE =
  /d[ée]velopp?(?:eur|euse|ement)|\bdev\b|\bdevs\b|developer|engineer|ing[ée]nieur|programm|software|logiciel|full[- ]?stack|front[- ]?end|back[- ]?end|\bweb\b|\bmobile\b|\btech(?:nical)? lead\b|\blead tech\b|\bcto\b|architect|\bsre\b|devops|platform|\bqa\b|\bsdet\b|int[ée]grateur|\bjs\b|javascript|typescript|react|node|php|symfony|laravel|vue\.?js|angular|next\.?js|nest\.?js/i;

/** Postes manifestement non techniques malgré un mot-clé ambigu (« Sales Engineer », « Account Manager »…). */
const NON_DEV_TITLE_RE =
  /\bsales\b|commercial|account (?:manager|executive)|business developer|d[ée]veloppement (?:commercial|des ventes|business|rh)|d[ée]veloppeur? (?:commercial|d'affaires|business)|recrut|recruit|talent acquisition|marketing|customer success|support client|juriste|legal|comptab|financ|\bhr\b|\brh\b|ressources humaines|office manager|assistant/i;

export function isDevTitle(title) {
  const t = String(title || '');
  return DEV_TITLE_RE.test(t) && !NON_DEV_TITLE_RE.test(t);
}

const FR_LOC_RE =
  /\bfrance\b|\bfrench\b|\bparis\b|\blyon\b|\bmarseille\b|\btoulouse\b|\bnantes\b|\bbordeaux\b|\blille\b|\brennes\b|\bnice\b|\bstrasbourg\b|\bmontpellier\b|\bgrenoble\b|\bnancy\b|\brouen\b|\btours\b|\baix[- ]en[- ]provence\b|\bsophia[- ]antipolis\b|\bîle[- ]de[- ]france\b|\bile[- ]de[- ]france\b|\bla d[ée]fense\b|\bboulogne\b|\bissy\b|\bnanterre\b|\blevallois\b|\bneuilly\b|\bsaint[- ]denis\b|\bclermont\b|\bdijon\b|\bangers\b|\breims\b|\bmetz\b|\bcaen\b|\bbrest\b|\blimoges\b|\bpau\b|\bbiarritz\b|\bannecy\b|\bniort\b|\bvalence\b|\bperpignan\b|\borléans\b|\borleans\b|\bamiens\b|\bpoitiers\b|\ble mans\b|\btoulon\b|\bavignon\b/i;
const FR_COUNTRY_CODES = new Set(['fr', 'fra', 'france']);
/** Télétravail ouvert depuis la France : Europe, EMEA, monde, ou sans pays précisé. */
const REMOTE_OK_RE = /\beurope\b|\beu\b|\bemea\b|\bcet\b|\bworldwide\b|\bglobal\b|\banywhere\b|\bmonde\b|\binternational\b/i;
const REMOTE_RE = /\bremote\b|t[ée]l[ée]travail|\bdistanciel\b|work from home|\bwfh\b/i;

/**
 * Où se situe l'offre pour nous : 'FR' (en France), 'REMOTE' (télétravail accessible depuis la France) ou null (à écarter).
 * `country` : code ou nom de pays fourni par la plateforme ; `remote` : vrai si la plateforme déclare le poste en télétravail.
 */
export function relevantPlace({ location = '', country = '', remote = false } = {}) {
  const loc = String(location || '');
  const c = String(country || '').trim().toLowerCase();
  if (FR_COUNTRY_CODES.has(c) || FR_LOC_RE.test(loc)) return 'FR';
  const isRemote = remote || REMOTE_RE.test(loc);
  if (!isRemote) return null;
  // Télétravail : accepté s'il vise l'Europe / le monde, ou s'il n'est rattaché à aucun autre pays.
  if (REMOTE_OK_RE.test(loc)) return 'REMOTE';
  const stripped = loc.replace(REMOTE_RE, '').replace(/[\s,;()\-–/|·]+/g, '');
  if (!c && !stripped) return 'REMOTE';
  return null;
}
