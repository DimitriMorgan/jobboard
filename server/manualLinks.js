// Plateformes sans API exploitable (anti-bot, connexion requise…) : liens de recherche directs, par techno et contrat.
const KW = { javascript: 'javascript', react: 'react', php: 'php', nodejs: 'node.js', dotnet: '.net' };

export const MANUAL_PLATFORMS = [
  { id: 'indeed', name: 'Indeed', build: (k, c) => `https://fr.indeed.com/jobs?q=${enc(`développeur ${k}`)}&l=France&fromage=7${c === 'freelance' ? '&jt=contract' : c === 'cdi' ? '&jt=permanent' : ''}` },
  { id: 'malt', name: 'Malt (freelance)', contracts: ['freelance'], build: (k) => `https://www.malt.fr/s?q=${enc(k)}&remoteAllowed=true` },
  { id: 'comet', name: 'Comet (freelance)', contracts: ['freelance'], build: () => 'https://app.comet.co/freelancer/missions' },
  { id: 'freelance-informatique', name: 'Freelance-Informatique', contracts: ['freelance'], build: (k) => `https://www.freelance-informatique.fr/offres-freelance?q=${enc(k)}` },
  { id: 'codeur', name: 'Codeur.com (freelance)', contracts: ['freelance'], build: (k) => `https://www.codeur.com/projects?q=${enc(k)}` },
  { id: 'glassdoor', name: 'Glassdoor', build: (k) => `https://www.glassdoor.fr/Emploi/france-d%C3%A9veloppeur-${enc(k)}-emplois-SRCH_IL.0,6_IN86_KO7,${20 + k.length}.htm` },
  { id: 'jobteaser', name: 'JobTeaser', build: (k) => `https://www.jobteaser.com/fr/job-offers?q=${enc(k)}` },
  { id: 'monster', name: 'Monster', build: (k) => `https://www.monster.fr/emploi/recherche?q=${enc(`développeur ${k}`)}&where=France` },
  { id: 'cadremploi', name: 'Cadremploi', build: (k) => `https://www.cadremploi.fr/emploi/liste_offres?motscles=${enc(k)}` },
  { id: 'lesjeudis', name: 'LesJeudis', build: (k) => `https://www.lesjeudis.com/emplois?q=${enc(k)}` },
  { id: 'chooseyourboss', name: 'ChooseYourBoss', build: (k) => `https://www.chooseyourboss.com/offres-emploi?q=${enc(k)}` },
  { id: 'talent', name: 'Talent.com', build: (k) => `https://fr.talent.com/jobs?k=${enc(`développeur ${k}`)}&l=France` },
  { id: 'linkedin-search', name: 'LinkedIn (recherche connectée)', build: (k, c) => `https://www.linkedin.com/jobs/search/?keywords=${enc(k)}&location=France&f_TPR=r86400${c === 'freelance' ? '&f_JT=C' : c === 'cdi' ? '&f_JT=F' : ''}` },
  { id: 'wttj-search', name: 'WTTJ (recherche)', build: (k) => `https://www.welcometothejungle.com/fr/jobs?query=${enc(k)}&refinementList%5Boffices.country_code%5D%5B%5D=FR` },
  { id: 'freework-search', name: 'Free-Work (recherche)', build: (k, c) => `https://www.free-work.com/fr/tech-it/jobs?query=${enc(k)}${c === 'freelance' ? '&contracts=contractor' : c === 'cdi' ? '&contracts=permanent' : ''}` },
];

function enc(s) {
  return encodeURIComponent(s);
}

export function manualLinks(tech = 'react', contract = '') {
  const k = KW[tech] || tech;
  return MANUAL_PLATFORMS.filter((p) => !p.contracts || !contract || p.contracts.includes(contract)).map((p) => ({ id: p.id, name: p.name, url: p.build(k, contract) }));
}
