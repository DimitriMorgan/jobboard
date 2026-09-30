import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectTechs, inferContracts, inferRemote, inferCountry, normalizeJob, sanitize } from './normalize.js';

test('détection des technos', () => {
  assert.deepEqual(detectTechs('Développeur React / Node.js'), ['javascript', 'react', 'nodejs']);
  assert.deepEqual(detectTechs('Ingénieur .NET Core C#'), ['dotnet']);
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
