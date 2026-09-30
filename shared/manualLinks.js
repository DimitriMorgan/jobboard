// Plateformes sans API exploitable (anti-bot, connexion requise…) : liens de recherche directs, par techno et contrat.
const KW = { javascript: 'javascript', react: 'react', php: 'php', nodejs: 'node.js', dotnet: '.net' };

export const MANUAL_PLATFORMS = [
  { id: 'linkedin-search', name: 'LinkedIn (recherche connectée, dernières 24 h)', build: (k, c) => `https://www.linkedin.com/jobs/search/?keywords=${enc(k)}&location=France&f_TPR=r86400${c === 'freelance' ? '&f_JT=C' : c === 'cdi' ? '&f_JT=F' : ''}` },
  { id: 'linkedin-posts', name: 'LinkedIn — posts récents', build: (k, c) => `https://www.linkedin.com/search/results/content/?keywords=${enc(`${c === 'cdi' ? 'recrute CDI' : 'mission freelance'} ${k}`)}&sortBy=%22date_posted%22` },
  { id: 'indeed', name: 'Indeed', build: (k, c) => `https://fr.indeed.com/jobs?q=${enc(`développeur ${k}`)}&l=France&fromage=7${c === 'freelance' ? '&jt=contract' : c === 'cdi' ? '&jt=permanent' : ''}` },
  { id: 'malt', name: 'Malt (freelance)', contracts: ['freelance'], build: (k) => `https://www.malt.fr/s?q=${enc(k)}&remoteAllowed=true` },
  { id: 'comet', name: 'Comet (freelance)', contracts: ['freelance'], build: () => 'https://app.comet.co/freelancer/missions' },
  { id: 'lehibou', name: 'LeHibou (freelance)', contracts: ['freelance'], build: (k) => `https://www.lehibou.com/missions-freelance?keywords=${enc(k)}` },
  { id: 'mindquest', name: 'Mindquest (ex Club Freelance)', build: (k, c) => `https://mindquest.io/fr/missions-freelance-offres-emploi-it-finance?${c === 'cdi' ? 'employmentType=Permanent' : 'employmentType=Contract'}&search=${enc(k)}` },
  { id: 'glassdoor', name: 'Glassdoor', build: (k) => `https://www.glassdoor.fr/Emploi/france-d%C3%A9veloppeur-${enc(k)}-emplois-SRCH_IL.0,6_IN86_KO7,${20 + k.length}.htm` },
  { id: 'cadremploi', name: 'Cadremploi', build: (k) => `https://www.cadremploi.fr/emploi/liste_offres?motscles=${enc(k)}` },
  { id: 'monster', name: 'Monster', build: (k) => `https://www.monster.fr/emploi/recherche?q=${enc(`développeur ${k}`)}&where=France` },
  { id: 'chooseyourboss', name: 'ChooseYourBoss', build: (k) => `https://www.chooseyourboss.com/offres-emploi?q=${enc(k)}` },
  { id: 'welovedevs', name: 'WeLoveDevs', build: (k) => `https://welovedevs.com/app/fr/jobs?query=${enc(k)}` },
  { id: 'talent', name: 'Talent.com', build: (k) => `https://fr.talent.com/jobs?k=${enc(`développeur ${k}`)}&l=France` },
  { id: 'jobteaser', name: 'JobTeaser', build: (k) => `https://www.jobteaser.com/fr/job-offers?q=${enc(k)}` },
];

function enc(s) {
  return encodeURIComponent(s);
}

export function manualLinks(tech = 'react', contract = '') {
  const k = KW[tech] || tech;
  return MANUAL_PLATFORMS.filter((p) => !p.contracts || !contract || p.contracts.includes(contract)).map((p) => ({ id: p.id, name: p.name, url: p.build(k, contract) }));
}
