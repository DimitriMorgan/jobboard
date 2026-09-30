// Diagnostic des sites candidats : accessibilité depuis GitHub Actions et structure des pages.
// Usage : node scripts/probe/sources.mjs [filtre1 filtre2 ...]
import { probeFetch, summarize, print, mapLimit } from './lib.mjs';

const q = encodeURIComponent('développeur react');
const TARGETS = [
  // Agrégateurs / job boards généralistes FR
  { name: 'indeed-html', url: `https://fr.indeed.com/jobs?q=${q}&l=France&sort=date&fromage=3`, link: /viewjob|\/rc\/clk|jk=/ },
  { name: 'indeed-rss', url: 'https://fr.indeed.com/rss?q=react&l=France&sort=date' },
  { name: 'optioncarriere', url: `https://www.optioncarriere.com/emploi?s=${q}&l=France&sort=date`, link: /\/jobad\/|\/emploi-/ },
  { name: 'optioncarriere-search', url: `https://www.optioncarriere.com/search/jobs?s=${q}&l=France`, link: /\/jobad\// },
  { name: 'jobijoba', url: `https://www.jobijoba.com/fr/query/?what=${q}&where=France`, link: /\/fr\/annonce\/|\/offre/ },
  { name: 'talent', url: `https://fr.talent.com/jobs?k=${q}&l=France`, link: /\/view\?id=|\/job\// },
  { name: 'cadremploi', url: 'https://www.cadremploi.fr/emploi/liste_offres?motscles=react', link: /\/emploi\/detail_offre|offre/ },
  { name: 'meteojob', url: `https://www.meteojob.com/jobs?what=${q}&where=France`, link: /\/job-|offre-emploi|\/jobs\// },
  { name: 'monster', url: 'https://www.monster.fr/emploi/recherche?q=developpeur+react&where=France&page=1', link: /job-openings|\/offre/ },
  { name: 'glassdoor', url: 'https://www.glassdoor.fr/Emploi/france-react-emplois-SRCH_IL.0,6_IN86_KO7,12.htm', link: /job-listing|partner\/jobListing/ },
  { name: 'lesjeudis', url: 'https://www.lesjeudis.com/recherche?q=react', link: /\/offre|\/emploi|\/job/ },
  { name: 'chooseyourboss', url: 'https://www.chooseyourboss.com/offres-emploi', link: /\/offres?\/|\/emploi/ },
  { name: 'turnover-it', url: 'https://www.turnover-it.com/', link: /\/job|offre/ },
  { name: 'welovedevs-paris', url: 'https://welovedevs.com/app/job-paris', link: /\/app\/(?:fr\/)?job\/|\/jobs?\// },
  { name: 'welovedevs-jobs', url: 'https://welovedevs.com/app/fr/jobs?query=react', link: /\/app\/(?:fr\/)?job/ },
  // Freelance FR
  { name: 'freelance-informatique', url: 'https://www.freelance-informatique.fr/', link: /mission|offre|freelance-/ },
  { name: 'freelance-informatique-offres', url: 'https://www.freelance-informatique.fr/offres-freelance', link: /mission|offre/ },
  { name: 'lehibou', url: 'https://www.lehibou.com/missions-freelance', link: /\/mission/ },
  { name: 'lehibou-home', url: 'https://www.lehibou.com/', link: /\/mission/ },
  { name: 'club-freelance', url: 'https://www.club-freelance.com/missions-freelance', link: /mission/ },
  { name: 'freelancerepublik', url: 'https://www.freelancerepublik.com/freelance', link: /\/freelance\/|mission/ },
  { name: 'codeur-projects', url: 'https://www.codeur.com/projects', link: /\/projects\/\d+/ },
  { name: 'codeur-rss', url: 'https://www.codeur.com/projects.rss' },
  { name: 'codeur-rss2', url: 'https://www.codeur.com/projects?format=rss' },
  { name: 'collective', url: 'https://www.collective.work/jobs', link: /\/jobs?\/|mission/ },
  { name: 'malt-projects', url: 'https://www.malt.fr/projects', link: /project/ },
  // Remote / international
  { name: 'workingnomads', url: 'https://www.workingnomads.com/api/exposed_jobs/' },
  { name: 'landingjobs', url: 'https://landing.jobs/api/v1/jobs?limit=5' },
  { name: 'reddit-json', url: 'https://www.reddit.com/r/remotejs/new.json?limit=5' },
  { name: 'reddit-rss', url: 'https://www.reddit.com/r/remotejs/new/.rss' },
  { name: 'startupjobs', url: 'https://startup.jobs/?q=react&remote=true', link: /startup\.jobs\/[a-z0-9-]+-\d+/ },
  { name: 'jobspresso', url: 'https://jobspresso.co/feed/?post_type=job_listing' },
  { name: 'larajobs', url: 'https://larajobs.com/feed' },
  { name: 'remoteco', url: 'https://remote.co/remote-jobs/developer/feed/' },
  { name: 'vuejobs', url: 'https://vuejobs.com/api/jobs' },
  { name: 'eurotechjobs', url: 'https://www.eurotechjobs.com/job_search/keyword/react', link: /job_display|\/job\// },
  { name: 'jobgether', url: 'https://jobgether.com/remote-jobs?search=react', link: /\/offer\// },
  { name: 'nodesk', url: 'https://nodesk.co/remote-jobs/rss.xml' },
  { name: 'dailyremote', url: 'https://dailyremote.com/remote-software-development-jobs', link: /\/remote-job\// },
  { name: 'euremotejobs', url: 'https://euremotejobs.com/feed/?post_type=job_listing' },
];

const filters = process.argv.slice(2);
const targets = filters.length ? TARGETS.filter((t) => filters.some((f) => t.name.includes(f))) : TARGETS;
const results = await mapLimit(targets, 4, async (t) => ({ t, res: await probeFetch(t.url, { headers: t.headers }) }));
for (const { t, res } of results) print(`${t.name}  ${t.url}`, summarize(res, { linkRe: t.link }));
console.log('\nRÉCAP');
for (const { t, res } of results) console.log(`  ${res.ok ? 'OK ' : 'KO '} ${String(res.status).padEnd(3)} ${t.name}`);
