import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from './db.js';
import { createRefresher } from './refresh.js';

const fake = (id, jobs, fail) => ({
  id,
  name: id,
  async fetch() {
    if (fail) throw new Error('boom');
    return jobs;
  },
});

test('actualisation : isolation des erreurs, insertion, suivi et filtres', async () => {
  const db = openDb(':memory:');
  const okJobs = [
    { sourceId: 'a', title: 'Dev React', company: 'X', location: 'Paris', url: 'https://x/a', contractHints: ['cdi'], descriptionText: 'React et Node' },
    { sourceId: 'b', title: 'Dev PHP freelance', company: 'Y', location: 'Remote', url: 'https://x/b', remoteHint: 'full', descriptionText: 'Symfony' },
    { sourceId: 'c', title: 'Dev Java', company: 'Z', location: 'Lyon', url: 'https://x/c', descriptionText: 'Spring' },
  ];
  const r = createRefresher(db, { log: {}, connectors: [fake('good', okJobs), fake('bad', [], true)] });
  const st = await r.refresh();
  assert.equal(st.sources.good.status, 'ok');
  assert.equal(st.sources.good.newCount, 2);
  assert.equal(st.sources.good.ignored, 1);
  assert.equal(st.sources.bad.status, 'error');

  const all = db.listJobs({});
  assert.equal(all.length, 2);
  assert.ok(all.every((j) => j.isNew));
  assert.equal(db.listJobs({ techs: ['php'] }).length, 1);
  assert.equal(db.listJobs({ contracts: ['cdi'] }).length, 1);
  assert.equal(db.listJobs({ country: 'FR' }).length, 1);
  assert.equal(db.listJobs({ country: 'FR_OR_REMOTE' }).length, 2);
  assert.equal(db.listJobs({ q: 'symfony' }).length, 1);

  const updated = db.updateTracking('good:b', { status: 'candidature_envoyee', notes: 'envoyé lundi', favorite: true });
  assert.equal(updated.status, 'candidature_envoyee');
  assert.equal(db.listJobs({ favorite: true }).length, 1);

  // Seconde actualisation : rien de nouveau, le suivi est conservé.
  const st2 = await r.refresh();
  assert.equal(st2.sources.good.newCount, 0);
  assert.equal(db.getJob('good:b').status, 'candidature_envoyee');
  assert.equal(db.listJobs({ onlyNew: true }).length, 0);
  assert.equal(db.stats().total, 2);
  db.close();
});

test('actualisation partielle : les offres ajoutées sont « nouvelles » sans effacer celles du jour', async () => {
  const db = openDb(':memory:');
  const job = (id, title) => ({ sourceId: id, title, company: 'X', location: 'Paris', url: `https://x/${id}`, descriptionText: 'React' });
  await createRefresher(db, { log: {}, connectors: [fake('a', [job('1', 'Dev React')])] }).refresh();
  assert.equal(db.listJobs({ onlyNew: true }).length, 1);
  const tick = () => new Promise((r) => setTimeout(r, 5));
  await tick();
  await createRefresher(db, { log: {}, connectors: [fake('b', [job('2', 'Dev React 2')])] }).refresh({ only: ['b'] });
  assert.equal(db.listJobs({ onlyNew: true }).length, 2);
  await tick();
  await createRefresher(db, { log: {}, connectors: [fake('a', [job('1', 'Dev React')])] }).refresh();
  assert.equal(db.listJobs({ onlyNew: true }).length, 0);
  db.close();
});
