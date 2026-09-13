// APEC : webservice JSON utilisé par le moteur de recherche du site (cadres, majoritairement CDI).
import { postJson, getJson, mapLimit } from '../http.js';
import { TECH_QUERIES } from '../normalize.js';

const SEARCH = 'https://www.apec.fr/cms/webservices/rechercheOffre';
const DETAIL = 'https://www.apec.fr/cms/webservices/offre/public?numeroOffre=';

export default {
  id: 'apec',
  name: 'APEC',
  site: 'https://www.apec.fr',
  description: 'Offres cadres APEC (CDI/CDD) via le webservice de recherche du site.',
  async fetch(ctx) {
    const jobs = new Map();
    for (const [tech, keywords] of Object.entries(TECH_QUERIES)) {
      for (const kw of keywords) {
        const body = {
          lieux: [], fonctions: [], statutPoste: [], typesContrat: [], typesConvention: [], niveauxExperience: [], idsEtablissement: [],
          secteursActivite: [], idNomZonesDeplacement: [], typesTeletravail: [], activeFiltre: true, pointGeolocDeReference: {},
          motsCles: kw, pagination: { range: 50, startIndex: 0 }, sorts: [{ type: 'DATE', direction: 'DESCENDING' }],
        };
        const data = await postJson(SEARCH, body, { retries: 1, headers: { origin: 'https://www.apec.fr', referer: 'https://www.apec.fr/candidat/recherche-emploi.html' } });
        const items = data?.resultats || data?.results || [];
        for (const it of items) {
          const id = it.numeroOffre || it.id;
          if (!id) continue;
          const prev = jobs.get(String(id));
          if (prev) {
            prev.techHints.push(tech);
            continue;
          }
          const contractLabel = it.typeContratLibelle || it.typeContrat || '';
          jobs.set(String(id), {
            sourceId: id,
            title: it.intitule,
            company: it.nomCommercial || it.nomEntreprise || it.entreprise,
            location: it.lieuTexte || it.lieu,
            countryHint: 'FR',
            contractHints: [/cdi|101888/i.test(String(contractLabel)) ? 'cdi' : /cdd/i.test(String(contractLabel)) ? 'cdd' : null].filter(Boolean),
            remoteHint: /total|complet|100/i.test(it.teletravailLibelle || '') ? 'full' : /partiel|possible|hybride/i.test(it.teletravailLibelle || '') ? 'partial' : undefined,
            techHints: [tech],
            salary: it.salaireTexte,
            url: `https://www.apec.fr/candidat/recherche-emploi.html/emploi/detail-offre/${id}`,
            publishedAt: it.datePublication || it.dateCreation,
            descriptionHtml: it.texteHtml || it.texteOffre || it.descriptif || '',
            tags: [it.experienceLibelle, it.statutLibelle].filter(Boolean),
          });
        }
        ctx.progress?.(`APEC « ${kw} » : ${items.length} offres`);
      }
    }
    const limit = Number(process.env.DETAIL_FETCH_LIMIT ?? 40);
    const toDetail = [...jobs.values()].filter((j) => !j.descriptionHtml && ctx.needsDetail(j.sourceId)).slice(0, limit);
    await mapLimit(toDetail, 3, async (job) => {
      try {
        const d = await getJson(DETAIL + job.sourceId, { retries: 0 });
        job.descriptionHtml = [d.texteHtml, d.texteHtmlProfil, d.texteHtmlEntreprise].filter(Boolean).join('<hr>') || '';
        if (d.salaireTexte && !job.salary) job.salary = d.salaireTexte;
      } catch {
        /* détail indisponible */
      }
    });
    return [...jobs.values()];
  },
};
