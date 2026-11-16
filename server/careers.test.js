import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isDevTitle, relevantPlace } from './careers/filters.js';
import { guessSlugs, nameKey } from './careers/guess.js';
import { parseCareersUrl, findCareersLinks } from './careers/ats.js';
import { emptyState, addCandidates, recordCheck, dueForCheck, publicPool, loadState } from './careers/state.js';
import careers from './connectors/careers.js';
import { normalizeJob } from './normalize.js';

test('sites carrières : postes tech et lieux retenus', () => {
  for (const t of ['Développeur Full Stack React H/F', 'Senior Backend Engineer (Node.js)', 'Lead Dev PHP', 'Software Engineer', 'Ingénieur DevOps', 'Tech Lead Frontend']) assert.ok(isDevTitle(t), t);
  for (const t of ['Sales Engineer', 'Account Executive', 'Business Developer', 'Chargé de recrutement', 'Office Manager', 'Responsable marketing']) assert.ok(!isDevTitle(t), t);
  assert.equal(relevantPlace({ location: 'Paris, France' }), 'FR');
  assert.equal(relevantPlace({ location: 'Lyon' }), 'FR');
  assert.equal(relevantPlace({ location: 'London', country: 'FR' }), 'FR');
  assert.equal(relevantPlace({ location: 'Remote - Europe' }), 'REMOTE');
  assert.equal(relevantPlace({ location: 'Remote', remote: true }), 'REMOTE');
  assert.equal(relevantPlace({ location: 'Remote - US' }), null);
  assert.equal(relevantPlace({ location: 'Berlin, Germany' }), null);
  assert.equal(relevantPlace({ location: 'New York', remote: true, country: 'US' }), null);
});

test('sites carrières : identifiants devinés et adresses reconnues', () => {
  assert.deepEqual(guessSlugs('Back Market'), ['backmarket', 'back-market']);
  assert.deepEqual(guessSlugs('Qonto SAS'), ['qonto']);
  assert.deepEqual(guessSlugs('Société Générale'), ['societegenerale', 'societe-generale']);
  assert.deepEqual(guessSlugs('Entreprise non précisée'), []);
  assert.equal(nameKey('Back-Market'), nameKey('back market'));
  assert.deepEqual(parseCareersUrl('https://jobs.lever.co/qonto/abc-123'), { ats: 'lever', slug: 'qonto' });
  assert.deepEqual(parseCareersUrl('https://jobs.eu.lever.co/dilitrust'), { ats: 'lever-eu', slug: 'dilitrust' });
  assert.deepEqual(parseCareersUrl('https://job-boards.greenhouse.io/gitlab/jobs/42'), { ats: 'greenhouse', slug: 'gitlab' });
  assert.deepEqual(parseCareersUrl('https://boards.greenhouse.io/embed/job_board?for=alan'), { ats: 'greenhouse', slug: 'alan' });
  assert.deepEqual(parseCareersUrl('https://hubvisory.recruitee.com/o/dev'), { ats: 'recruitee', slug: 'hubvisory' });
  assert.deepEqual(parseCareersUrl('https://careers.smartrecruiters.com/Alten'), { ats: 'smartrecruiters', slug: 'Alten' });
  assert.equal(parseCareersUrl('https://www.example.com/careers'), null);
  const links = findCareersLinks('Postulez sur https://jobs.ashbyhq.com/mui/123 ou https://apply.workable.com/seeq/j/ABC, et https://jobs.ashbyhq.com/mui');
  assert.deepEqual(links, [{ ats: 'ashby', slug: 'mui' }, { ats: 'workable', slug: 'seeq' }]);
});

test('sites carrières : cycle de vie d’une entreprise dans l’annuaire', () => {
  const s = emptyState();
  assert.equal(addCandidates(s, [{ ats: 'lever', slug: 'a' }, { ats: 'lever', slug: 'b' }], 'link'), 2);
  assert.equal(addCandidates(s, [{ ats: 'lever', slug: 'a' }], 'link'), 0);
  const [a, b] = dueForCheck(s);
  recordCheck(a, { ok: true, name: 'A', total: 10, fr: 3, dev: 2 });
  recordCheck(b, { ok: true, total: 4, fr: 0, dev: 0 });
  assert.equal(a.status, 'pool');
  assert.equal(b.status, 'out');
  assert.equal(dueForCheck(s).length, 0);
  // Plus d'offre en France : reste suivie un temps, puis sort après le délai
  recordCheck(a, { ok: true, total: 5, fr: 0, dev: 0 }, Date.parse(a.lastFrAt) + 86400e3);
  assert.equal(a.status, 'pool');
  recordCheck(a, { ok: true, total: 5, fr: 0, dev: 0 }, Date.parse(a.lastFrAt) + 61 * 86400e3);
  assert.equal(a.status, 'out');
  assert.equal(recordCheck({ ats: 'x', slug: 'y', status: 'candidate' }, { ok: false, notFound: true }).status, 'dead');
  const m = { ats: 'x', slug: 'm', status: 'pool', origin: 'manual' };
  recordCheck(m, { ok: true, total: 0, fr: 0, dev: 0 });
  assert.equal(m.status, 'pool'); // ajout manuel : toujours suivi
  assert.deepEqual(publicPool(s), []); // plus aucune entreprise suivie dans cet annuaire
  s.companies['x:m'] = m;
  assert.deepEqual(publicPool(s).map((c) => c.slug), ['m']);
});

test('sites carrières : découverte, lecture et sélection des offres (Lever simulé)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'careers-'));
  const file = path.join(dir, 'careers-state.json');
  const env = { ...process.env };
  const realFetch = globalThis.fetch;
  const lever = [
    { id: 'p1', text: 'Développeur Full Stack React / Node.js', hostedUrl: 'https://jobs.lever.co/acme/p1', categories: { location: 'Paris', commitment: 'CDI' }, country: 'FR', workplaceType: 'hybrid', createdAt: Date.parse('2026-11-10'), description: '<p>React, Node.js, TypeScript. Salaire 55-65k€.</p>' },
    { id: 'p2', text: 'Account Executive', hostedUrl: 'https://jobs.lever.co/acme/p2', categories: { location: 'Paris' }, country: 'FR', description: '<p>Vente</p>' },
    { id: 'p3', text: 'Backend Engineer PHP', hostedUrl: 'https://jobs.lever.co/acme/p3', categories: { location: 'New York' }, country: 'US', description: '<p>PHP</p>' },
  ];
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).startsWith('https://api.lever.co/v0/postings/acme')) return new Response(JSON.stringify(lever), { status: 200 });
    return new Response('{"ok":false,"error":"Document not found"}', { status: 404 });
  };
  Object.assign(process.env, { CAREERS_STATE_FILE: file, CAREERS_MAX_MINUTES: "1", CAREERS_HARVEST: "0" });
  try {
    const ctx = { progress: () => {}, corpus: () => [{ company: 'Acme', url: 'https://x/1', description: 'Rejoignez-nous' }] };
    const raw = await careers.fetch(ctx);
    assert.equal(raw.length, 1);
    const job = normalizeJob('careers', raw[0]);
    assert.equal(job.title, 'Développeur Full Stack React / Node.js');
    assert.equal(job.company, 'Acme');
    assert.deepEqual(job.contracts, ['cdi']);
    assert.equal(job.country, 'FR');
    assert.equal(job.salaryMin, 55000);
    assert.ok(job.tags.includes('Lever'));
    const state = loadState(file);
    assert.equal(state.companies['lever:acme'].status, 'pool');
    assert.equal(state.companies['lever:acme'].frJobs, 2);
    assert.equal(state.companies['greenhouse:acme'], undefined); // inexistante : pas gardée
    assert.ok(state.names.acme.found.includes('lever:acme'));
    // Deuxième passage : relue directement, sans redeviner
    calls.length = 0;
    const again = await careers.fetch(ctx);
    assert.equal(again.length, 1);
    assert.ok(calls.every((u) => u.includes('/acme') && u.includes('lever.co')), calls.join(' '));
    // Panne réseau : le nom n'est pas marqué comme essayé
    globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
    await careers.fetch({ progress: () => {}, corpus: () => [{ company: 'Globex', url: 'https://x/2' }] });
    assert.equal(loadState(file).names.globex, undefined);
    globalThis.fetch = async (url) => (String(url).startsWith('https://api.lever.co/v0/postings/acme') ? new Response(JSON.stringify(lever), { status: 200 }) : new Response('{}', { status: 404 }));
    // Ajout manuel d'une page carrière seule
    const manual = await careers.fetch({ progress: () => {}, manualOnly: true, companyUrls: ['https://jobs.lever.co/acme'] });
    assert.equal(manual.length, 1);
    assert.equal(loadState(file).companies['lever:acme'].origin, 'manual');
  } finally {
    globalThis.fetch = realFetch;
    process.env = env;
  }
});
