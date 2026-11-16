// Sites carrières des entreprises : offres publiées directement par les entreprises via leur plateforme de
// recrutement (Lever, Greenhouse, Ashby, Recruitee, Teamtailor, Workable, SmartRecruiters, Personio).
//
// L'annuaire (server/careers/state.js) se remplit tout seul :
//  - liens vers ces plateformes trouvés dans les offres déjà collectées (identifiant certain) ;
//  - identifiants devinés à partir du nom des entreprises qui recrutent déjà des devs dans le board ;
//  - ajouts manuels depuis le site (adresse d'une page carrière).
// Chaque jour : relecture de toutes les entreprises suivies, puis vérification de nouvelles entreprises tant que le
// budget de temps le permet. Seuls les postes tech situés en France (ou en télétravail depuis la France) sont gardés.
import path from 'node:path';
import { HttpError, getText, sleep } from '../http.js';
import { ATS, parseCareersUrl, findCareersLinks, prettyName } from '../careers/ats.js';
import { loadState, saveState, addCandidates, dueForCheck, poolCompanies, recordCheck, keyOf } from '../careers/state.js';
import { guessSlugs, nameKey } from '../careers/guess.js';
import { harvestCommonCrawl } from '../careers/harvest.js';
import { isDevTitle, relevantPlace } from '../careers/filters.js';
import { resolveContracts, htmlToText } from '../normalize.js';
import { contractFromLabel } from '../scrape.js';

const num = (v, d) => (v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : d);
const DAY = 86400e3;
/** Délai avant de retenter de deviner les identifiants d'une entreprise restée introuvable. */
const NAME_RECHECK_DAYS = 90;
/** Plateformes essayées pour deviner un identifiant (Lever US et EU partagent les identifiants : les deux sont testés). */
const GUESS_ATS = ['lever', 'lever-eu', 'greenhouse', 'ashby', 'recruitee', 'teamtailor', 'workable', 'smartrecruiters'];

export function stateFile() {
  return path.resolve(process.env.CAREERS_STATE_FILE || 'data/careers-state.json');
}

/**
 * Rythme par serveur : requêtes simultanées et pause minimale entre deux requêtes. Recruitee et Workable refusent
 * (429) dès quelques requêtes rapprochées : une à la fois, espacées.
 */
const HOST_PACE = { 'recruitee.com': { perHost: 1, gapMs: 1500 }, 'apply.workable.com': { perHost: 1, gapMs: 3000 } };

/** File d'attente par serveur, et arrêt du serveur pour l'actualisation après trop de refus (429). */
function hostLimiter({ perHost = 3, maxRefusals = 8 } = {}) {
  const hosts = new Map();
  const get = (h) => {
    if (!hosts.has(h)) hosts.set(h, { active: 0, queue: [], refusals: 0, blocked: false, last: 0, ...{ perHost, gapMs: 0, ...HOST_PACE[h] } });
    return hosts.get(h);
  };
  return {
    blocked: (h) => get(h).blocked,
    stats: () => [...hosts.entries()].filter(([, s]) => s.refusals).map(([h, s]) => `${h} : ${s.refusals} refus${s.blocked ? ' (abandonné)' : ''}`),
    async run(h, fn) {
      const s = get(h);
      if (s.blocked) throw new HttpError(429, h, 'serveur abandonné pour cette actualisation');
      if (s.active >= s.perHost) await new Promise((r) => s.queue.push(r));
      s.active++;
      const wait = s.last + s.gapMs - Date.now();
      if (wait > 0) await sleep(wait);
      s.last = Date.now();
      try {
        return await fn();
      } catch (err) {
        if (err instanceof HttpError && err.status === 429 && ++s.refusals >= maxRefusals) s.blocked = true;
        if (err instanceof HttpError && err.status === 429) await sleep(10000);
        throw err;
      } finally {
        s.active--;
        s.queue.shift()?.();
      }
    },
  };
}

const HOST_OF = { lever: 'api.lever.co', 'lever-eu': 'api.eu.lever.co', greenhouse: 'boards-api.greenhouse.io', ashby: 'api.ashbyhq.com', recruitee: 'recruitee.com', teamtailor: 'teamtailor.com', workable: 'apply.workable.com', smartrecruiters: 'api.smartrecruiters.com', personio: 'jobs.personio.de' };

/** Offres retenues d'un tableau d'offres + statistiques pour l'annuaire. */
export function selectJobs(company, board) {
  let fr = 0;
  const kept = [];
  for (const j of board.jobs || []) {
    const place = relevantPlace({ location: j.location, country: j.country, remote: j.remote });
    if (place === 'FR') fr++;
    if (!place || !isDevTitle(j.title)) continue;
    kept.push({ job: j, place });
  }
  return { kept, stats: { ok: true, name: board.name, careersUrl: board.careersUrl, total: (board.jobs || []).length, fr, dev: kept.length } };
}

/** Offre brute au format des connecteurs. */
export function toRaw(company, j, place) {
  const label = ATS[company.ats]?.label || company.ats;
  const description = htmlToText(j.descriptionHtml || '');
  const strong = contractFromLabel(j.employment);
  const weak = /full[-_ ]?time|fulltime|temps plein|permanent/i.test(j.employment || '') ? ['cdi'] : [];
  return {
    sourceId: `${company.ats}:${company.slug}:${j.id}`,
    title: j.title,
    company: company.name || prettyName(company.slug),
    location: j.location || (place === 'REMOTE' ? 'Télétravail' : ''),
    countryHint: place === 'FR' ? 'FR' : undefined,
    remoteHint: place === 'REMOTE' || j.remote ? 'full' : /hybrid/i.test(j.workplace || '') ? 'partial' : undefined,
    contractHints: resolveContracts({ title: j.title, description, strong, weak }),
    url: j.url,
    publishedAt: j.publishedAt,
    descriptionHtml: j.descriptionHtml,
    compensation: j.compensation,
    tags: ['Site carrière', label],
  };
}

export default {
  id: 'careers',
  name: 'Sites des entreprises',
  site: '',
  description: 'Offres publiées par les entreprises sur leur propre page carrière (Lever, Greenhouse, Ashby, Recruitee, Teamtailor, Workable, SmartRecruiters, Personio).',
  async fetch(ctx) {
    const file = stateFile();
    const state = loadState(file);
    const t0 = Date.now();
    const deadline = t0 + num(process.env.CAREERS_MAX_MINUTES, 35) * 60e3;
    const concurrency = num(process.env.CAREERS_CONCURRENCY, 16);
    const limiter = hostLimiter();
    const out = [];
    const counters = { read: 0, checked: 0, joined: 0, guessed: 0, errors: 0, manual: 0, details: 0 };
    // Fiches lues une à une (SmartRecruiters) : plafond par actualisation, le reste est complété les jours suivants.
    const detailLimit = num(process.env.CAREERS_DETAIL_LIMIT, 300);
    const timeLeft = () => Date.now() < deadline;

    /** Lit une entreprise, met à jour l'annuaire et garde ses offres pertinentes si elle est suivie. */
    const readCompany = async (company) => {
      const reader = ATS[company.ats];
      if (!reader) return;
      const wasPool = company.status === 'pool';
      try {
        const board = await limiter.run(HOST_OF[company.ats], () => reader.fetch(company.slug));
        const { kept, stats } = selectJobs(company, board);
        recordCheck(company, stats);
        if (!wasPool && company.status === 'pool') counters.joined++;
        if (company.status !== 'pool') return;
        for (const { job, place } of kept) {
          if (reader.detail && !job.descriptionHtml && ctx.needsDetail?.(`${company.ats}:${company.slug}:${job.id}`) !== false) {
            // Fiche non lue (plafond atteint) : l'offre attend le prochain passage plutôt que d'entrer sans description.
            if (counters.details >= detailLimit || !timeLeft()) continue;
            counters.details++;
            await limiter.run(HOST_OF[company.ats], () => reader.detail(job)).catch(() => {});
          }
          out.push(toRaw(company, job, place));
        }
      } catch (err) {
        counters.errors++;
        recordCheck(company, { ok: false, notFound: err instanceof HttpError && (err.status === 404 || err.status === 410), error: err.message });
      }
    };

    /** Exécute `fn` sur la liste avec une concurrence limitée, tant que le budget de temps le permet. */
    const runAll = async (items, fn) => {
      let next = 0;
      await Promise.all(
        Array.from({ length: Math.min(concurrency, items.length) }, async () => {
          while (next < items.length && timeLeft()) await fn(items[next++]);
        }),
      );
    };

    // 0. Ajouts manuels : adresse d'une page carrière (plateforme reconnue) ou d'un site maison qui y renvoie.
    const manual = [];
    for (const url of ctx.companyUrls || []) {
      let refs = parseCareersUrl(url) ? [parseCareersUrl(url)] : [];
      if (!refs.length) refs = findCareersLinks(await getText(url, { retries: 1 }).catch(() => ''));
      if (!refs.length) {
        ctx.progress?.(`Page carrière non reconnue : ${url}`);
        continue;
      }
      for (const r of refs) {
        const k = keyOf(r.ats, r.slug);
        state.companies[k] ||= { ats: r.ats, slug: r.slug, status: 'candidate', addedAt: new Date().toISOString() };
        state.companies[k].origin = 'manual';
        manual.push(state.companies[k]);
      }
    }
    await runAll(manual, readCompany);
    counters.manual = manual.length;
    if (ctx.manualOnly) {
      saveState(file, state);
      ctx.progress?.(`Sites carrières : ${manual.length} entreprise(s) ajoutée(s), ${out.length} offres`);
      return out;
    }

    // 1. Liens vers des plateformes dans les offres déjà collectées (toutes sources).
    const corpus = ctx.corpus?.() || [];
    const linked = [];
    for (const item of corpus) for (const ref of findCareersLinks(`${item.url || ''} ${item.applyUrl || ''} ${item.description || ''}`)) linked.push(ref);
    const linkedAdded = addCandidates(state, linked, 'link');

    // 2. Relecture de toutes les entreprises suivies.
    const pool = poolCompanies(state);
    await runAll(pool, async (c) => {
      await readCompany(c);
      counters.read++;
    });
    if (counters.read < pool.length) ctx.progress?.(`Sites carrières : budget de temps atteint, ${counters.read}/${pool.length} entreprises relues`);

    // 3. Identifiants devinés à partir des entreprises qui recrutent déjà des devs dans le board, les plus actives d'abord.
    state.names ||= {};
    const byName = new Map();
    for (const item of corpus) {
      const key = nameKey(item.company);
      if (!key) continue;
      const e = byName.get(key) || { name: item.company, count: 0 };
      e.count++;
      byName.set(key, e);
    }
    const now = Date.now();
    const names = [...byName.entries()]
      .filter(([key]) => !state.names[key] || (!state.names[key].found && now - Date.parse(state.names[key].at) > NAME_RECHECK_DAYS * DAY))
      .sort((a, b) => b[1].count - a[1].count);
    await runAll(names, async ([key, { name }]) => {
      const found = [];
      let unsure = false; // erreur réseau ou refus : on retentera ce nom à la prochaine actualisation
      for (const slug of guessSlugs(name)) {
        for (const ats of GUESS_ATS) {
          if (!timeLeft() || limiter.blocked(HOST_OF[ats])) return;
          const k = keyOf(ats, slug);
          if (state.companies[k]) {
            if (state.companies[k].status !== 'dead') found.push(k);
            continue;
          }
          const company = { ats, slug, name, status: 'candidate', origin: 'guess', addedAt: new Date().toISOString() };
          await readCompany(company);
          // Une entreprise devinée n'est gardée dans l'annuaire que si elle existe vraiment sur la plateforme.
          if (company.status !== 'dead' && !company.error) {
            state.companies[k] = company;
            found.push(k);
          } else if (company.status !== 'dead') unsure = true;
        }
        if (found.length) break; // premier identifiant trouvé : inutile d'essayer les variantes suivantes
      }
      if (unsure && !found.length) return;
      state.names[key] = { at: new Date().toISOString(), found: found.length ? found : undefined };
      counters.guessed++;
    });

    // 4. Entreprises découvertes à vérifier (liens trouvés, index Common Crawl, revérifications échues).
    await runAll(dueForCheck(state), async (c) => {
      await readCompany(c);
      counters.checked++;
    });

    // 5. Temps restant : nouvelles adresses dans l'index Common Crawl, vérifiées lors des prochaines actualisations.
    let harvested = 0;
    if (timeLeft() && process.env.CAREERS_HARVEST !== '0') {
      const until = Math.min(deadline, Date.now() + num(process.env.CAREERS_HARVEST_MINUTES, 10) * 60e3);
      state.harvest ||= {};
      const found = await harvestCommonCrawl(state.harvest, { timeLeft: () => Date.now() < until, log: (m) => ctx.progress?.(m) }).catch((err) => {
        ctx.progress?.(`Common Crawl indisponible : ${err.message}`);
        return [];
      });
      harvested = addCandidates(state, found, 'commoncrawl');
    }

    saveState(file, state);
    const all = Object.values(state.companies);
    const msg = `Sites carrières : ${poolCompanies(state).length} entreprises suivies (${counters.joined} nouvelles), ${all.length} connues, ${counters.read} relues, ${counters.checked} vérifiées, ${counters.guessed}/${names.length} noms essayés, ${linkedAdded} liens découverts, ${harvested} adresses Common Crawl, ${counters.details} fiches lues, ${out.length} offres, ${Math.round((Date.now() - t0) / 60000)} min`;
    ctx.progress?.(msg);
    const refused = limiter.stats();
    if (refused.length) ctx.progress?.(`Sites carrières, refus : ${refused.join(' ; ')}`);
    return out;
  },
};
