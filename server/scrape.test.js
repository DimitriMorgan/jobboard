import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jsonLd, jobPostings, fromJobPosting, parseFrenchDate, contractFromLabel, remoteFromLabel, decodeText } from './scrape.js';

test('JSON-LD : ItemList déplié, caractères de contrôle tolérés', () => {
  const html = `<script type="application/ld+json">{"@type":"ItemList","itemListElement":[{"@type":"ListItem","item":{"@type":"JobPosting","title":"Dev\tReact","description":"ligne1
ligne2"}}]}</script>`;
  const jps = jobPostings(html);
  assert.equal(jps.length, 1);
  assert.equal(jsonLd(html).length, 2);
});

test('JobPosting → offre brute', () => {
  const raw = fromJobPosting({
    title: 'Architecte R&eacute;seaux',
    employmentType: 'CONTRACTOR',
    hiringOrganization: { name: 'Acme' },
    jobLocation: { address: { addressLocality: 'Lyon', postalCode: '69001', addressCountry: 'FR' } },
    baseSalary: { currency: 'EUR', value: { minValue: 500, maxValue: 600, unitText: 'DAY' } },
    datePosted: '2026-09-30',
  });
  assert.equal(raw.title, 'Architecte Réseaux');
  assert.deepEqual(raw.contractHints, ['freelance']);
  assert.equal(raw.compensation.tjmMax, 600);
  assert.equal(raw.location, 'Lyon 69001');
  assert.equal(raw.countryHint, 'FR');
  assert.equal(fromJobPosting({ baseSalary: { value: { minValue: 3000, unitText: 'MONTH' } } }).compensation.salaryMin, 36000);
  assert.equal(decodeText('D&#233;veloppeur'), 'Développeur');
});

test('dates en français', () => {
  const now = new Date('2026-09-30T10:00:00Z');
  assert.equal(parseFrenchDate('25 septembre', now).slice(0, 10), '2026-09-25');
  assert.equal(parseFrenchDate('30 septembre 2026', now).slice(0, 10), '2026-09-30');
  assert.equal(parseFrenchDate('Il y a 5 jours', now).slice(0, 10), '2026-09-25');
  assert.equal(parseFrenchDate('Hier', now).slice(0, 10), '2026-09-29');
  assert.equal(parseFrenchDate('15 décembre', now).slice(0, 10), '2025-12-15');
  assert.equal(parseFrenchDate('', now), null);
});

test('libellés de contrat et de télétravail', () => {
  assert.deepEqual(contractFromLabel('Indépendant'), ['freelance']);
  assert.deepEqual(contractFromLabel('CDI'), ['cdi']);
  assert.deepEqual(contractFromLabel('Intérim'), ['interim']);
  assert.equal(remoteFromLabel('Pas de télétravail'), 'none');
  assert.equal(remoteFromLabel('Télétravail partiel'), 'partial');
  assert.equal(remoteFromLabel('Full remote'), 'full');
  assert.equal(remoteFromLabel('Hybride'), 'partial');
});
