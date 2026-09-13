import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractCompensation, formatTjm, formatAnnual } from './compensation.js';

const c = (o) => extractCompensation(o);

test('TJM', () => {
  assert.deepEqual([c({ title: 'Dev React – TJM 550' }).tjmMin, c({ title: 'Dev React – TJM 550' }).tjmMax], [550, 550]);
  assert.deepEqual([c({ description: 'Rémunération : 500 - 600 € / jour HT' }).tjmMin, c({ description: 'Rémunération : 500 - 600 € / jour HT' }).tjmMax], [500, 600]);
  assert.equal(c({ salaryText: '550 - 650 €/jour' }).tjmMax, 650);
  assert.equal(c({ description: 'TJM : 650€ HT' }).tjmMin, 650);
  assert.equal(c({ description: 'day rate 500-600' }).tjmMax, 600);
  assert.equal(c({ description: 'Mission de 12 jours' }).tjmMin, null);
  assert.equal(c({ description: '6000 €/jour' }).tjmMin, null);
});

test('salaire annuel', () => {
  assert.deepEqual([c({ title: 'Dev PHP CDI 45-55k€' }).salaryMin, c({ title: 'Dev PHP CDI 45-55k€' }).salaryMax], [45000, 55000]);
  assert.equal(c({ description: 'Salaire : 48 000 € brut annuel' }).salaryMin, 48000);
  assert.equal(c({ description: 'Package 60K€ selon profil' }).salaryMin, 60000);
  assert.equal(c({ description: 'Rémunération 3 500 € / mois' }).salaryMin, 42000);
  assert.deepEqual([c({ salaryText: '$90k - $110k' }).salaryMin, c({ salaryText: '$90k - $110k' }).currency], [90000, '$']);
  assert.equal(c({ description: 'plus de 10k utilisateurs' }).salaryMin, null);
  assert.equal(c({ description: 'Salaire 45k' }).salaryMin, 45000);
});

test('structuré prioritaire et mixte', () => {
  const r = c({ structured: { tjmMin: 500, tjmMax: 600, salaryMin: 50000, salaryMax: 60000 }, description: 'TJM 900' });
  assert.deepEqual([r.tjmMin, r.tjmMax, r.salaryMin, r.salaryMax], [500, 600, 50000, 60000]);
  const m = c({ description: 'CDI ou freelance : 50-55k€ ou TJM 450-500' });
  assert.deepEqual([m.tjmMin, m.tjmMax, m.salaryMin, m.salaryMax], [450, 500, 50000, 55000]);
  assert.equal(formatTjm(500, 600), '500 - 600 €/j');
  assert.equal(formatAnnual(45000, 55000), '45 k - 55 k€/an');
  assert.equal(formatAnnual(50000, 50000, '$'), '50 k$/an');
});
