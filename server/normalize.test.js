import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectTechs, inferContracts, inferRemote, inferCountry, normalizeJob, sanitize, isExcludedJob } from './normalize.js';
import { openDb } from './db.js';

test('détection des technos', () => {
  assert.deepEqual(detectTechs('Développeur React / Node.js'), ['javascript', 'react', 'nodejs']);
  assert.deepEqual(detectTechs('Ingénieur .NET Core C#'), []);
  assert.deepEqual(detectTechs('Développeur PHP Symfony'), ['php']);
  assert.deepEqual(detectTechs('Développeur Java Spring'), []);
  assert.deepEqual(detectTechs('Fullstack TypeScript'), ['javascript']);
  assert.deepEqual(detectTechs('Frontend ReactJS'), ['javascript', 'react']);
  assert.deepEqual(detectTechs('Data engineer python internet'), []);
});

test('inférence du contrat', () => {
  assert.deepEqual(inferContracts({ hints: ['cdi'], title: 'Freelance React' }), ['cdi']);
  assert.deepEqual(inferContracts({ title: 'Mission freelance React (TJM 550)' }), ['freelance']);
  assert.deepEqual(inferContracts({ title: 'Développeur PHP H/F CDI' }), ['cdi']);
  assert.deepEqual(inferContracts({ title: 'Développeur PHP', description: 'Poste en CDI ou freelance' }), ['freelance', 'cdi']);
  assert.deepEqual(inferContracts({ title: 'Développeur PHP', description: 'Bla' }), ['autre']);
});

test('télétravail et pays', () => {
  assert.equal(inferRemote({ text: 'Poste en full remote' }), 'full');
  assert.equal(inferRemote({ text: '2 jours de télétravail par semaine' }), 'partial');
  assert.equal(inferRemote({ hint: 'none', text: 'télétravail' }), 'none');
  assert.equal(inferCountry({ location: 'Paris (75)' }), 'FR');
  assert.equal(inferCountry({ location: 'Berlin', remote: 'full' }), 'REMOTE');
  assert.equal(inferCountry({ location: 'Berlin' }), 'OTHER');
});

test('normalisation complète', () => {
  const job = normalizeJob('test', {
    sourceId: 42,
    title: '  Lead dev React  ',
    company: 'ACME',
    location: 'Lyon',
    contractHints: ['freelance'],
    url: 'https://example.com/42',
    publishedAt: '2026-09-10T10:00:00Z',
    descriptionHtml: '<p>Mission React + <script>alert(1)</script>Node</p><a href="javascript:void(0)">x</a>',
    tags: ['React'],
  });
  assert.equal(job.id, 'test:42');
  assert.equal(job.title, 'Lead dev React');
  assert.deepEqual(job.techs, ['react', 'nodejs']);
  assert.deepEqual(job.contracts, ['freelance']);
  assert.equal(job.country, 'FR');
  assert.ok(!job.description.includes('<script'));
  assert.ok(!job.description.includes('javascript:'));
  assert.equal(job.fingerprint, 'acme|lead-dev-react');
});

test('offre hors technos ignorée, sauf indice de recherche sans description', () => {
  assert.equal(normalizeJob('t', { sourceId: 1, title: 'Dev Java', url: 'u', descriptionText: 'Spring Boot' }), null);
  assert.deepEqual(normalizeJob('t', { sourceId: 1, title: 'Dev Fullstack', url: 'u', techHints: ['react'] }).techs, ['react']);
  assert.equal(sanitize('<img src=x onerror=alert(1)>ok'), 'ok');
});

test('contrat cité explicitement dans la description', () => {
  const c = (description, title = 'Développeur React') => inferContracts({ title, description });
  assert.deepEqual(c('Bla bla. Poste en CDI à 39 heures, avec un jour de RTT.'), ['cdi']);
  assert.deepEqual(c('Contrat : Freelance à temps partiel ou temps plein. Environnement : React'), ['freelance']);
  assert.deepEqual(c('Type de contrat : Freelance / Indépendant, Temps complet Rémunération : 300'), ['freelance']);
  assert.deepEqual(c('- Lieu : Paris - Contrat : CDI / Freelance - Salaire fixe'), ['freelance', 'cdi']);
  assert.deepEqual(c('Localisation : Bordeaux (33) Télétravail partiel possible CDI à temps plein PROFIL'), ['cdi']);
  assert.deepEqual(c('Démarrage souhaité : Octobre Durée de la mission : 3 mois Renouvelable'), ['freelance']);
  assert.deepEqual(c('Employment type: Full-time. We are a remote company.'), ['cdi']);
  assert.deepEqual(c('Nous cherchons un profil passionné pour rejoindre notre équipe produit.'), ['autre']);
  assert.deepEqual(inferContracts({ hints: ['autre'], title: 'Dev', description: 'Poste en CDI' }), ['cdi']);
});

test('contrat résolu par ordre de fiabilité, TJM ⇒ freelance', async () => {
  const { resolveContracts } = await import('./normalize.js');
  assert.deepEqual(resolveContracts({ title: 'Développeur Node.js - Mission à Lille', description: 'Rejoignez-nous', strong: [], weak: ['cdi'] }), ['freelance']);
  assert.deepEqual(resolveContracts({ title: 'Développeur Node.js', description: 'Type de contrat : CDI. Mission : développer…', weak: ['cdi'] }), ['cdi']);
  assert.deepEqual(resolveContracts({ title: 'Développeur', description: 'Rien', strong: ['freelance'], weak: ['cdi'] }), ['freelance']);
  assert.deepEqual(resolveContracts({ title: 'Développeur', description: 'Rien', weak: ['cdi'] }), ['cdi']);
  const job = normalizeJob('hellowork', { sourceId: '1', title: 'Développeur Back-End Node.Js - Refad950 H/F', company: 'Teolia', url: 'https://x/1', contractHints: ['cdi'], compensation: { tjmMin: 420, tjmMax: 420 }, descriptionText: 'Node.js' });
  assert.deepEqual(job.contracts, ['freelance', 'cdi']);
});

test('.NET / C# écarté de l\u2019agrégateur', () => {
  const base = { sourceId: '1', url: 'https://x/1', company: 'X' };
  // Intitulé .NET / C# sans autre techno : écarté, même si la description cite JavaScript
  assert.equal(normalizeJob('x', { ...base, title: 'Développeur C# .NET Core H/F', descriptionText: 'ASP.NET, Blazor, un peu de JavaScript.' }), null);
  // Intitulé neutre mais poste .NET avec JavaScript / TypeScript en appoint : écarté
  assert.equal(normalizeJob('x', { ...base, title: 'Développeur Full Stack H/F', descriptionText: 'Back-end C# / ASP.NET Core, front Angular TypeScript.' }), null);
  // Intitulé mixte « .NET / React » : écarté aussi (le poste exige C#)
  assert.equal(normalizeJob('x', { ...base, title: 'Développeur .NET / React', descriptionText: 'C# et React.' }), null);
  // Intitulé React, description qui mentionne .NET : conservé, sans techno .NET
  assert.deepEqual(normalizeJob('x', { ...base, title: 'Développeur React', descriptionText: 'React, API en .NET.' }).techs, ['react']);
  assert.ok(normalizeJob('x', { ...base, title: 'Développeur Full Stack', descriptionText: 'PHP Symfony, ou .NET selon les projets.' }));
  // Ajout manuel : conservé
  assert.ok(normalizeJob('x', { ...base, title: 'Dev C# freelance', descriptionText: 'Mission C#', forceKeep: true }));
  assert.equal(isExcludedJob('Développeur Node.js', 'Node.js'), false);
  assert.equal(isExcludedJob('Dev.Net / React Ou Angular - Freelance'), true);
});

test('nettoyage des offres .NET déjà enregistrées', () => {
  const db = openDb(':memory:');
  const job = (id, title, techs, extra = {}) => ({ id: `x:${id}`, source: 'x', sourceId: id, title, url: `https://x/${id}`, contracts: ['cdi'], techs, tags: [], fingerprint: id, firstSeenAt: '2026-10-01T00:00:00.000Z', lastSeenAt: '2026-10-01T00:00:00.000Z', description: '', ...extra });
  db.importJobs([
    job('1', 'Développeur C# .NET', ['dotnet']),
    job('2', 'Développeur .NET / React', ['dotnet', 'react']),
    job('3', 'Développeur Full Stack', ['dotnet', 'javascript'], { description: '<p>C# ASP.NET Core et Angular TypeScript</p>' }),
    job('4', 'Développeur C#', ['dotnet'], { status: 'candidature_envoyee' }),
    job('5', 'Post LinkedIn C#', [], { tags: ['Ajout manuel'] }),
    job('6', 'Développeur PHP', ['php']),
  ]);
  const out = db.dropTech('dotnet', (t, html) => isExcludedJob(t, html.replace(/<[^>]+>/g, ' ')));
  assert.deepEqual(out, { removed: 3, updated: 1 });
  assert.equal(db.getJob('x:1'), null);
  assert.equal(db.getJob('x:2'), null);
  assert.equal(db.getJob('x:3'), null);
  assert.deepEqual(db.getJob('x:4').techs, []); // offre suivie : gardée
  assert.ok(db.getJob('x:5'));
  assert.ok(db.getJob('x:6'));
  db.close();
});
