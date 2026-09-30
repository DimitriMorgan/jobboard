import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseList, parseDetail, linkedinContracts, searchWindowSeconds } from './connectors/linkedin.js';
import { normalizeJob } from './normalize.js';

const fixture = (name) => fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

test('LinkedIn : liste de résultats', () => {
  const items = parseList(fixture('linkedin-list.html'), 'react');
  assert.equal(items.length, 2);
  assert.equal(items[0].sourceId, '4472713483');
  assert.equal(items[0].title.trim(), 'Développeur React H/F');
  assert.equal(items[0].company.trim(), 'Acme');
  assert.equal(items[0].publishedAt, '2026-09-30');
  assert.equal(items[0].url, 'https://www.linkedin.com/jobs/view/4472713483/');
  assert.deepEqual(items[0].techHints, ['react']);
  const job = normalizeJob('linkedin', items[0]);
  assert.equal(job.salaryMin, 45000);
  assert.equal(job.salaryMax, 55000);
  assert.deepEqual(parseList(fixture('linkedin-list.html'), null)[1].techHints, []);
});

test('LinkedIn : fiche détaillée et type de contrat', () => {
  const d = parseDetail(fixture('linkedin-detail.html'));
  assert.equal(d.criteria['Type d’emploi'], 'Temps plein');
  assert.equal(d.typeContract, 'cdi');
  assert.match(d.descriptionHtml, /TypeScript/);
  assert.equal(d.title, 'Développeur React H/F');
  // Mention explicite prioritaire sur la rubrique « Type d’emploi »
  assert.deepEqual(linkedinContracts('Mission freelance Node.js', '<p>Mission de 6 mois</p>', 'cdi'), ['freelance']);
  assert.deepEqual(linkedinContracts('Développeur React H/F', d.descriptionHtml, d.typeContract), ['cdi']);
  assert.deepEqual(linkedinContracts('Développeur', '<p>Rien</p>', null), []);
});

test('LinkedIn : fenêtre de recherche adaptée au dernier passage', () => {
  const now = Date.parse('2026-09-30T10:00:00Z');
  assert.equal(searchWindowSeconds(null, now), 7 * 86400);
  assert.equal(searchWindowSeconds('2026-09-29T10:00:00Z', now), 30 * 3600);
  assert.equal(searchWindowSeconds('2026-09-30T09:00:00Z', now), 86400);
  assert.equal(searchWindowSeconds('2026-09-01T10:00:00Z', now), 7 * 86400);
});
