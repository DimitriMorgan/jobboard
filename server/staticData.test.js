import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from './db.js';
import { createRefresher } from './refresh.js';
import { exportStatic, importStatic } from './staticData.js';
import { DESCRIPTION_SHARDS, descriptionShardFile, fnv1a, shardOf } from '../shared/shard.js';

test('export puis import statique conservent offres, run et sources', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jobboard-'));
  const db1 = openDb(':memory:');
  const jobs = [
    { sourceId: 'a', title: 'Dev React TJM 500', company: 'X', location: 'Paris', url: 'https://x/a', contractHints: ['freelance'], descriptionHtml: '<p>React</p>' },
    { sourceId: 'b', title: 'Dev PHP', company: 'Y', location: 'Lyon', url: 'https://x/b', contractHints: ['cdi'], descriptionText: 'Symfony 45k€' },
  ];
  await createRefresher(db1, { log: {}, connectors: [{ id: 'fake', name: 'Fake', fetch: async () => jobs }] }).refresh();
  fs.writeFileSync(path.join(dir, 'descriptions.json'), '{}'); // ancien format : doit disparaître à l'export
  const out = exportStatic(db1, dir);
  assert.equal(out.jobs, 2);
  const payload = JSON.parse(fs.readFileSync(path.join(dir, 'jobs.json'), 'utf8'));
  assert.equal(payload.jobs[0].description, undefined);
  // Descriptions réparties : tous les fichiers existent (même vides), chaque description est dans le sien
  assert.equal(payload.descriptionShards, DESCRIPTION_SHARDS);
  assert.equal(fs.readdirSync(path.join(dir, 'descriptions')).length, DESCRIPTION_SHARDS);
  assert.equal(fs.existsSync(path.join(dir, 'descriptions.json')), false);
  const shard = JSON.parse(fs.readFileSync(path.join(dir, descriptionShardFile('fake:a')), 'utf8'));
  assert.equal(shard['fake:a'], '<p>React</p>');
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

test('import de l\u2019ancien format (un seul descriptions.json)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jobboard-'));
  const job = { id: 'x:1', source: 'x', sourceId: '1', title: 'Dev Node.js', company: 'C', location: 'Paris', url: 'https://x/1', contracts: ['cdi'], techs: ['nodejs'], tags: [], firstSeenAt: '2026-09-01T00:00:00.000Z', lastSeenAt: '2026-09-01T00:00:00.000Z' };
  fs.writeFileSync(path.join(dir, 'jobs.json'), JSON.stringify({ format: 1, jobs: [job], sources: [] }));
  fs.writeFileSync(path.join(dir, 'descriptions.json'), JSON.stringify({ 'x:1': 'Node.js et NestJS' }));
  const db = openDb(':memory:');
  assert.equal(importStatic(db, dir), 1);
  assert.equal(db.getJob('x:1').description, 'Node.js et NestJS');
  db.close();
});

test('répartition des descriptions : hachage stable et fichiers équilibrés', () => {
  // Vecteurs de référence FNV-1a 32 bits : le site et l'export doivent calculer exactement la même chose
  assert.equal(fnv1a(''), 0x811c9dc5);
  assert.equal(fnv1a('a'), 0xe40c292c);
  assert.equal(fnv1a('foobar'), 0xbf9cf968);
  assert.match(descriptionShardFile('linkedin:4301234567'), /^descriptions\/\d{2}\.json$/);
  const counts = new Array(DESCRIPTION_SHARDS).fill(0);
  for (let i = 0; i < 6400; i++) counts[shardOf(`linkedin:${4300000000 + i * 7}`)]++;
  assert.ok(Math.min(...counts) > 60 && Math.max(...counts) < 140, `répartition déséquilibrée : ${Math.min(...counts)}–${Math.max(...counts)}`);
});
