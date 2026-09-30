import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseJobijoba } from './connectors/jobijoba.js';
import { parseFreelanceRepublik } from './connectors/freelancerepublik.js';
import { parseCodeur } from './connectors/codeur.js';
import { parseCollective } from './connectors/collective.js';
import { parseLinkedinUrl, splitUrls, activityDate, looksLikeOffer, postTitle, parsePost, postToRaw } from './connectors/linkedinposts.js';
import { normalizeJob } from './normalize.js';

const fixture = (name) => fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const now = new Date('2026-09-30T10:00:00Z');

test('Jobijoba : cartes de résultats', () => {
  const [a, b] = parseJobijoba(fixture('jobijoba-list.html'), now);
  assert.equal(a.sourceId, '9836304da46be22edd8592b24bb09f66');
  assert.equal(a.title.trim(), 'Développeur React H/F');
  assert.equal(a.company, 'Asap.Work');
  assert.equal(a.location, 'Paris');
  assert.deepEqual(a.contractHints, ['interim']);
  assert.equal(a.remoteHint, 'none');
  assert.equal(a.publishedAt.slice(0, 10), '2026-09-25');
  const job = normalizeJob('jobijoba', a);
  assert.equal(job.salaryMin, 40000);
  assert.equal(job.salaryMax, 50000);
  assert.deepEqual(b.contractHints, ['freelance']);
});

test('Freelance Republik : cartes de missions', () => {
  const [m] = parseFreelanceRepublik(fixture('freelancerepublik.html'), now);
  assert.equal(m.sourceId, 'a661c038');
  assert.equal(m.remoteHint, 'partial');
  assert.deepEqual(m.contractHints, ['freelance']);
  assert.equal(m.publishedAt.slice(0, 10), '2026-09-30');
  assert.deepEqual(normalizeJob('freelancerepublik', m).techs.sort(), ['javascript', 'nodejs', 'react'].sort());
});

test('Codeur.com : flux RSS', () => {
  const [p] = parseCodeur(fixture('codeur.rss'));
  assert.equal(p.sourceId, '490541');
  assert.ok(p.tags.includes('PHP'));
  assert.ok(p.tags.includes('Budget : 500 € à 1 000 €'));
  assert.deepEqual(normalizeJob('codeur', p).techs, ['php']);
});

test('Collective.work : données de recherche embarquées', () => {
  const project = { id: 'cmunu8lxh4wl74kf8ac8f0p0k', slug: 'lead-developpeur-php-symfony-juhm', name: 'Lead développeur PHP Symfony', description: '<p>Symfony, API Platform</p>', budgetBrief: '500', workPreferences: ['HYBRID'], isPermanentContract: false, contractTypes: ['FREELANCE'], projectTypes: ['SYMFONY', 'PHP'], publishedAt: '2026-09-30T08:23:12.409Z', company: { name: 'Salutech' }, location: { fullNameFrench: 'Paris, France' } };
  const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { dehydratedState: { queries: [{ queryKey: ['PublicPages_SearchJobs', {}], state: { data: { results: { projects: [project] } } } }] } } } })}</script>`;
  assert.equal(parseCollective(html).length, 1);
});

test('Posts LinkedIn : URL, date, tri offre / candidat, titre', () => {
  assert.deepEqual(parseLinkedinUrl('https://fr.linkedin.com/posts/chrisscholly_je-cherche-activity-7348282755333451776-dCAQ?utm_source=share'), {
    kind: 'post',
    id: '7348282755333451776',
    url: 'https://www.linkedin.com/posts/chrisscholly_je-cherche-activity-7348282755333451776-dCAQ',
  });
  assert.deepEqual(parseLinkedinUrl('https://www.linkedin.com/feed/update/urn:li:activity:7348282755333451776/?actorCompanyId=1'), {
    kind: 'post',
    id: '7348282755333451776',
    url: 'https://www.linkedin.com/feed/update/urn:li:activity:7348282755333451776/',
  });
  assert.equal(parseLinkedinUrl('https://www.linkedin.com/feed/update/urn:li:ugcPost:7348282754322456576/').url, 'https://www.linkedin.com/feed/update/urn:li:ugcPost:7348282754322456576/');
  assert.equal(parseLinkedinUrl('https://www.linkedin.com/feed/update/urn%3Ali%3Ashare%3A7348282754322456577').url, 'https://www.linkedin.com/feed/update/urn:li:share:7348282754322456577/');
  assert.deepEqual(parseLinkedinUrl('https://www.linkedin.com/jobs/view/developpeur-react-at-acme-4472713483/'), { kind: 'job', id: '4472713483', url: 'https://www.linkedin.com/jobs/view/4472713483/' });
  assert.equal(parseLinkedinUrl('https://example.com'), null);
  assert.equal(splitUrls('https://www.linkedin.com/jobs/view/4472713483 https://www.linkedin.com/jobs/view/4472713483/').length, 1);
  assert.equal(activityDate('7348282755333451776').slice(0, 10), '2025-07-08');
  assert.ok(looksLikeOffer('Je cherche un dev PHP/Symfony freelance pour une mission longue en full-remote (TJM 550-650€)'));
  assert.ok(!looksLikeOffer('Je suis actuellement disponible et à la recherche de missions en tant que Dev Back-end. 350€ / Jour'));
  assert.ok(!looksLikeOffer('Hello le réseau ! Je n’ai pas attendu la sortie de Symfony 6 pour refaire mon site.'));
  assert.equal(postTitle('🚀 #hiring\nNous recrutons un développeur React senior en CDI à Lyon. Rejoignez-nous !'), 'Nous recrutons un développeur React senior en CDI à Lyon.');
});

test('Posts LinkedIn : lecture d’un post public et conversion en offre', () => {
  const parsed = parsePost(fixture('linkedin-post.html'));
  assert.equal(parsed.author, 'Chris Scholly');
  assert.equal(parsed.datePublished, '2025-07-08T09:12:00.000Z');
  const raw = postToRaw(parsed, parseLinkedinUrl('https://fr.linkedin.com/posts/chrisscholly_x-activity-7348282755333451776-dCAQ'));
  const job = normalizeJob('linkedin-posts', raw);
  assert.deepEqual(job.contracts, ['freelance']);
  assert.equal(job.remote, 'full');
  assert.equal(job.tjmMin, 550);
  assert.equal(job.tjmMax, 650);
  assert.deepEqual(job.techs, ['php']);
  assert.equal(job.company, 'Chris Scholly');
  // Ajout manuel sans techno : conservé
  const manual = normalizeJob('linkedin-posts', { ...postToRaw({ text: 'Nous recrutons un chef de projet', author: 'X' }, parseLinkedinUrl('https://www.linkedin.com/feed/update/urn:li:activity:7348282755333451776'), { manual: true }) });
  assert.ok(manual);
  assert.deepEqual(manual.techs, []);
});

test('LesJeudis : ligne de méta éclatée en nœuds', async () => {
  const { parseLesJeudis } = await import('./connectors/lesjeudis.js');
  const [o] = parseLesJeudis(fixture('lesjeudis-card.html'), now);
  assert.equal(o.sourceId, '78a2ff6a');
  assert.equal(o.company, 'Fish Eye Technologies');
  assert.equal(o.location, 'Neuilly-sur-Seine (92)');
  assert.deepEqual(o.contractHints, ['cdi']);
  assert.equal(o.remoteHint, 'partial');
  assert.equal(o.salary, '45 – 55 k€/an');
  assert.ok(o.tags.includes('PHP'));
  assert.equal(o.publishedAt.slice(0, 10), '2026-09-16');
  const job = normalizeJob('lesjeudis', o);
  assert.deepEqual([job.salaryMin, job.salaryMax], [45000, 55000]);
  assert.deepEqual(job.techs, ['php']);
});

test('Salaire avec devise en tête (titres Jobijoba)', async () => {
  const { extractCompensation } = await import('./compensation.js');
  const r = extractCompensation({ title: 'Développeur React Front End F/H - €45.000 - €53.000 Par An' });
  assert.deepEqual([r.salaryMin, r.salaryMax], [45000, 53000]);
});
