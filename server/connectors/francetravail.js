// France Travail (ex Pôle emploi) : API officielle "Offres d'emploi v2" (identifiants gratuits sur francetravail.io).
import { getJson, request } from '../http.js';
import { TECH_QUERIES } from '../normalize.js';

const TOKEN_URL = 'https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire';
const SEARCH = 'https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search';

export default {
  id: 'francetravail',
  name: 'France Travail',
  site: 'https://candidat.francetravail.fr/offres/recherche',
  description: 'API officielle France Travail (nécessite FRANCE_TRAVAIL_CLIENT_ID / SECRET).',
  requiresEnv: ['FRANCE_TRAVAIL_CLIENT_ID', 'FRANCE_TRAVAIL_CLIENT_SECRET'],
  async fetch(ctx) {
    const clientId = process.env.FRANCE_TRAVAIL_CLIENT_ID;
    const secret = process.env.FRANCE_TRAVAIL_CLIENT_SECRET;
    const tokenRes = await request(TOKEN_URL, {
      method: 'POST',
      as: 'json',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: secret, scope: 'api_offresdemploiv2 o2dsoffre' }).toString(),
    });
    const token = tokenRes.access_token;
    const jobs = new Map();
    for (const [tech, keywords] of Object.entries(TECH_QUERIES)) {
      for (const kw of keywords) {
        const params = new URLSearchParams({ motsCles: kw, sort: '1', range: '0-149', publieeDepuis: '7' });
        let data;
        try {
          data = await getJson(`${SEARCH}?${params}`, { headers: { authorization: `Bearer ${token}` }, retries: 1 });
        } catch (err) {
          if (err.status === 204) continue;
          throw err;
        }
        const items = data?.resultats || [];
        for (const it of items) {
          if (!it.id) continue;
          const prev = jobs.get(String(it.id));
          if (prev) {
            prev.techHints.push(tech);
            continue;
          }
          const type = `${it.typeContrat || ''} ${it.typeContratLibelle || ''}`;
          jobs.set(String(it.id), {
            sourceId: it.id,
            title: it.intitule,
            company: it.entreprise?.nom,
            location: it.lieuTravail?.libelle,
            countryHint: 'FR',
            contractHints: [/\bCDI\b/.test(type) ? 'cdi' : /\bCDD\b/.test(type) ? 'cdd' : /\bLIB\b|libéral|indépendant|franchise/i.test(type) ? 'freelance' : /\bMIS\b|intérim/i.test(type) ? 'interim' : null].filter(Boolean),
            techHints: [tech],
            salary: it.salaire?.libelle || it.salaire?.commentaire,
            url: it.origineOffre?.urlOrigine || `https://candidat.francetravail.fr/offres/recherche/detail/${it.id}`,
            publishedAt: it.dateCreation || it.dateActualisation,
            descriptionText: it.description,
            tags: [...(it.competences || []).map((c) => c.libelle), it.experienceLibelle, it.dureeTravailLibelleConverti].filter(Boolean),
          });
        }
        ctx.progress?.(`France Travail « ${kw} » : ${items.length} offres`);
      }
    }
    return [...jobs.values()];
  },
};
