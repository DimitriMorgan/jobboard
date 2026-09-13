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
