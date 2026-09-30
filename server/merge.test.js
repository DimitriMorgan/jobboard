import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from './db.js';
import { normalizeJob, repairJob } from './normalize.js';

const detailed = {
  sourceId: '42',
  title: 'Développeur Back-End .NET Expert H/F',
  company: 'Nexton',
  location: 'Paris',
  url: 'https://www.linkedin.com/jobs/view/42/',
  contractHints: ['cdi'],
  tags: ['Type d’emploi : Temps plein'],
  descriptionHtml: `<p>${'Nous recrutons un développeur C# / .NET Core en CDI, télétravail 2 jours par semaine. '.repeat(4)} Salaire 55-65k€.</p>`,
};
const listOnly = { sourceId: '42', title: 'Développeur Back-End .NET Expert H/F', company: 'Nexton', location: 'Paris', url: 'https://www.linkedin.com/jobs/view/42/', contractHints: [], techHints: ['dotnet'] };

test('une offre revue sans fiche détaillée n’écrase pas les infos de la fiche complète', () => {
  const db = openDb(':memory:');
  const run = db.startRun();
  db.upsertJobs([normalizeJob('linkedin', detailed)], run.id);
  const before = db.getJob('linkedin:42');
  assert.deepEqual(before.contracts, ['cdi']);
  assert.equal(before.salaryMin, 55000);
  assert.equal(before.remote, 'partial');

  db.upsertJobs([normalizeJob('linkedin', listOnly)], run.id);
  const after = db.getJob('linkedin:42');
  assert.deepEqual(after.contracts, ['cdi']);
  assert.deepEqual(after.tags, ['Type d’emploi : Temps plein']);
  assert.deepEqual(after.techs, before.techs);
  assert.equal(after.salaryMin, 55000);
  assert.equal(after.salary, before.salary);
  assert.equal(after.remote, 'partial');
  assert.equal(after.description, before.description);

  // Une nouvelle fiche complète, elle, remplace bien les infos
  db.upsertJobs([normalizeJob('linkedin', { ...detailed, contractHints: ['freelance'], tags: ['Type d’emploi : Contrat'] })], run.id);
  assert.deepEqual(db.getJob('linkedin:42').contracts, ['freelance']);
  db.close();
});

test('réparation : contrat, télétravail et rémunération déduits de la description', () => {
  const job = { title: 'Développeur PHP', location: 'Lyon', contracts: ['autre'], remote: null, tjmMin: null, salaryMin: null, salary: '', description: '<p>Poste en CDI, full remote possible, rémunération 45-50k€ selon profil.</p>' };
  const fixed = repairJob(job);
  assert.deepEqual(fixed.contracts, ['cdi']);
  assert.equal(fixed.remote, 'full');
  assert.equal(fixed.salaryMin, 45000);
  assert.equal(repairJob({ ...job, description: '<p>Rien de précis.</p>' }), null);

  const db = openDb(':memory:');
  const run = db.startRun();
  const raw = normalizeJob('hellowork', { sourceId: '1', title: 'Développeur React', company: 'X', location: 'Nantes', url: 'https://x/1', descriptionHtml: '<p>Contrat : CDI. Salaire : 3 500 € brut / mois. React, TypeScript.</p>' });
  raw.contracts = ['autre'];
  raw.salaryMin = null;
  raw.salaryMax = null;
  db.upsertJobs([raw], run.id);
  assert.equal(db.repairIncomplete(repairJob), 1);
  const j = db.getJob('hellowork:1');
  assert.deepEqual(j.contracts, ['cdi']);
  assert.equal(j.salaryMin, 42000);
  db.close();
});
