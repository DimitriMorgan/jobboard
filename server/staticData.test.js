import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from './db.js';
import { createRefresher } from './refresh.js';
import { exportStatic, importStatic } from './staticData.js';

test('export puis import statique conservent offres, run et sources', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jobboard-'));
  const db1 = openDb(':memory:');
  const jobs = [
    { sourceId: 'a', title: 'Dev React TJM 500', company: 'X', location: 'Paris', url: 'https://x/a', contractHints: ['freelance'], descriptionHtml: '<p>React</p>' },
    { sourceId: 'b', title: 'Dev PHP', company: 'Y', location: 'Lyon', url: 'https://x/b', contractHints: ['cdi'], descriptionText: 'Symfony 45k€' },
  ];
  await createRefresher(db1, { log: {}, connectors: [{ id: 'fake', name: 'Fake', fetch: async () => jobs }] }).refresh();
  const out = exportStatic(db1, dir);
  assert.equal(out.jobs, 2);
  const payload = JSON.parse(fs.readFileSync(path.join(dir, 'jobs.json'), 'utf8'));
  assert.equal(payload.jobs[0].description, undefined);
  assert.ok(payload.jobs.every((j) => j.isNew));
  assert.equal(payload.jobs.find((j) => j.id === 'fake:a').tjmMin, 500);

  // Une offre sans description est conservée telle quelle à l'import (pas de suppression → pas de faux « Nouveau » le lendemain)
  const raw = JSON.parse(fs.readFileSync(path.join(dir, 'jobs.json'), 'utf8'));
  raw.jobs.push({ ...raw.jobs[0], id: 'fake:z', sourceId: 'z', title: 'Développeur full stack', tags: [], excerpt: '', techs: ['react'] });
  fs.writeFileSync(path.join(dir, 'jobs.json'), JSON.stringify(raw));
  const db2 = openDb(':memory:');
  assert.equal(importStatic(db2, dir), 3);
  assert.ok(db1.sourceInfo('fake').last_success_at);
  db2.importSource({ id: 'x', lastRunAt: '2026-01-01T00:00:00.000Z', lastStatus: 'ok' });
  assert.equal(db2.sourceInfo('x').last_success_at, '2026-01-01T00:00:00.000Z');
  assert.equal(db2.getJob('fake:a').description, '<p>React</p>');
  assert.equal(db2.getJob('fake:a').firstSeenAt, db1.getJob('fake:a').firstSeenAt);
  assert.ok(db2.listJobs({ onlyNew: true }).length === 3);
  // Nouvelle actualisation sans nouveauté : plus rien de « nouveau »
  await createRefresher(db2, { log: {}, connectors: [{ id: 'fake', name: 'Fake', fetch: async () => jobs }] }).refresh();
  assert.equal(db2.listJobs({ onlyNew: true }).length, 0);
  assert.equal(db2.purgeOlderThan(60), 0);
  db1.close();
  db2.close();
});
