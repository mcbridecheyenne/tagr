'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const engine = require('../tagr/engine');
const sources = require('./fixtures/sources');
const { runSiteJob, fetchPublished } = require('../tagr/site');

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tagr-site-test-'));
const read = (dir, file) => fs.readFileSync(path.join(dir, file), 'utf8');
const exists = (dir, file) => fs.existsSync(path.join(dir, file));

// A build result with the given number of results per source.
function buildOf({ txAsa = 100, tfaa = 60, tfaaIndoor = 40, problems = [], at }) {
  const archers = txAsa + tfaa + tfaaIndoor > 0 ? [{ name: 'Avery Quillfeather', avgNPS: 1000 }] : [];
  return {
    result: {
      adult: archers,
      youth: [],
      sources: { txAsa, tfaa, tfaaIndoor, totalEntries: txAsa + tfaa + tfaaIndoor, total: archers.length },
      stateRecords: {},
      updatedAt: at
    },
    problems,
    requests: 146
  };
}

const unreadablePage = { what: 'TFAA 2025 Outdoor', url: 'https://texasfieldarchery.org/results/sywat/48', error: 'HTTP 503' };

// What the site hands back as published once the files in outDir are on it.
function publishedIn(outDir) {
  return { ...JSON.parse(read(outDir, 'api/status.json')), result: JSON.parse(read(outDir, 'api/tgr.json')) };
}

// One run of the job at the given time. `build` is what reading the sources gives, or an Error.
async function run({ at, published = null, scheduled = true, force = false, build, engineId = 'rules-v1' }) {
  const outDir = tempDir();
  let builds = 0;
  const outcome = await runSiteJob({
    outDir, published, scheduled, force, engineId,
    now: () => new Date(at),
    build: async () => {
      builds++;
      if (build instanceof Error) throw build;
      return build;
    }
  });
  return { ...outcome, outDir, builds };
}

// The weekly rebuild time is Tuesday 6:00 AM Central: 12:00 UTC in November.
const TUESDAY = '2026-11-10T12:07:00.000Z';
const NEXT_TUESDAY = '2026-11-17T12:07:00.000Z';
async function publishedOn(at) {
  const { outDir } = await run({ at, build: buildOf({ at }) });
  return publishedIn(outDir);
}

test('the site is the two pages, the stylesheet and the standings, and every link is relative', async () => {
  const outDir = tempDir();
  const outcome = await runSiteJob({
    outDir, engineId: 'rules-v1',
    build: () => engine.buildRankings({
      fetchText: async url => {
        const body = sources.responseFor(url);
        if (body === null) throw new Error('no fixture for ' + url);
        return body;
      }
    })
  });
  assert.deepStrictEqual([outcome.deploy, outcome.behind], [true, false]);

  const home = read(outDir, 'index.html');
  assert.match(home, /fetch\("api\/tgr\.json"\)/);
  assert.match(home, /href="how-it-works\/"/);
  assert.match(home, /href="style\.css"/);
  const how = read(outDir, 'how-it-works/index.html');
  assert.match(how, /href="\.\.\/style\.css"/);
  assert.match(how, /href="\.\.\/" class="back-link"/);
  assert.ok(exists(outDir, 'style.css'));
  for (const page of [home, how]) {
    // The site lives in a folder of its host, so nothing may point at the host's top.
    assert.doesNotMatch(page, /(href|src)="\/|fetch\(["']\//);
    // The full site's menu, with its login links, is not part of this site.
    assert.doesNotMatch(page, /Login|Request Access|\/js\/main\.js/);
  }

  const standings = JSON.parse(read(outDir, 'api/tgr.json'));
  assert.deepStrictEqual(Object.keys(standings), ['adult', 'youth', 'sources', 'stateRecords', 'updatedAt']);
  assert.strictEqual(standings.adult[0].name, 'Avery Quillfeather');
  assert.strictEqual(JSON.parse(read(outDir, 'api/status.json')).builtAt, standings.updatedAt);
});

test('the timer rebuilds on Tuesday morning and does nothing while the standings are this week\'s', async () => {
  const first = await run({ at: TUESDAY, build: buildOf({ at: TUESDAY }) });
  assert.deepStrictEqual([first.deploy, first.behind, first.builds], [true, false, 1]);
  const published = publishedIn(first.outDir);

  for (const at of ['2026-11-10T14:07:00Z', '2026-11-16T12:07:00Z', '2026-11-17T11:07:00Z']) {
    const later = await run({ at, published, build: buildOf({ at }) });
    assert.deepStrictEqual([later.deploy, later.behind, later.builds], [false, false, 0], at);
    assert.ok(!exists(later.outDir, 'index.html'));
  }

  const nextWeek = await run({ at: NEXT_TUESDAY, published, build: buildOf({ txAsa: 105, at: NEXT_TUESDAY }) });
  assert.deepStrictEqual([nextWeek.deploy, nextWeek.behind, nextWeek.builds], [true, false, 1]);
  assert.strictEqual(publishedIn(nextWeek.outDir).result.sources.txAsa, 105);
});

test('a rebuild that is not good enough leaves the published standings on the site', async () => {
  const published = await publishedOn(TUESDAY);

  // The timer has nothing new to publish, and the run is reported as behind.
  const timer = await run({ at: NEXT_TUESDAY, published, build: buildOf({ tfaa: 0, at: NEXT_TUESDAY }) });
  assert.deepStrictEqual([timer.deploy, timer.behind], [false, true]);
  assert.deepStrictEqual(timer.rebuild.reasons, ['TFAA Outdoor returned no results']);

  // A change to the ranking code publishes the pages again, with the standings the site had.
  const push = await run({ at: '2026-11-12T20:00:00Z', published, scheduled: false, engineId: 'rules-v2', build: new Error('boom') });
  assert.deepStrictEqual([push.deploy, push.behind, push.builds], [true, true, 1]);
  assert.deepStrictEqual(publishedIn(push.outDir), published);
});

test('a change to the pages alone publishes them with the standings the site has, without reading the sources', async () => {
  const published = await publishedOn(TUESDAY);
  const push = await run({ at: '2026-11-12T20:00:00Z', published, scheduled: false, build: new Error('not expected') });
  assert.deepStrictEqual([push.deploy, push.behind, push.builds], [true, false, 0]);
  assert.deepStrictEqual(publishedIn(push.outDir), published);
});

test('a run by hand can rebuild standings that are this week\'s', async () => {
  const published = await publishedOn(TUESDAY);
  const at = '2026-11-12T20:00:00.000Z';
  const byHand = await run({ at, published, scheduled: false, force: true, build: buildOf({ txAsa: 111, at }) });
  assert.deepStrictEqual([byHand.deploy, byHand.behind, byHand.builds], [true, false, 1]);
  assert.strictEqual(publishedIn(byHand.outDir).result.sources.txAsa, 111);
});

test('a first run that cannot rank publishes nothing', async () => {
  const first = await run({ at: TUESDAY, scheduled: false, build: buildOf({ txAsa: 0, tfaa: 0, tfaaIndoor: 0, at: TUESDAY }) });
  assert.deepStrictEqual([first.deploy, first.behind], [false, true]);
  assert.ok(!exists(first.outDir, 'index.html'));
});

test('a page that cannot be read holds new standings back for a day, then they are published without it', async () => {
  const published = await publishedOn(TUESDAY);

  const sameDay = '2026-11-17T21:07:00.000Z';
  const held = await run({ at: sameDay, published, build: buildOf({ problems: [unreadablePage], at: sameDay }) });
  assert.deepStrictEqual([held.deploy, held.behind], [false, true]);

  const nextDay = '2026-11-18T12:07:00.000Z';
  const let_go = await run({ at: nextDay, published, build: buildOf({ problems: [unreadablePage], at: nextDay }) });
  assert.deepStrictEqual([let_go.deploy, let_go.behind], [true, false]);
  assert.deepStrictEqual(publishedIn(let_go.outDir).pagesGivenUpOn, [unreadablePage.url]);
});

test('a change to the ranking code waits for an unreadable page, and the next day the timer publishes without it', async () => {
  const published = await publishedOn(TUESDAY);

  const thursday = '2026-11-12T20:00:00.000Z';
  const push = await run({ at: thursday, published, scheduled: false, engineId: 'rules-v2', build: buildOf({ problems: [unreadablePage], at: thursday }) });
  assert.deepStrictEqual([push.deploy, push.behind], [true, true]);
  assert.deepStrictEqual(publishedIn(push.outDir), published);

  const friday = '2026-11-13T12:07:00.000Z';
  const timer = await run({ at: friday, published, engineId: 'rules-v2', build: buildOf({ problems: [unreadablePage], at: friday }) });
  assert.deepStrictEqual([timer.deploy, timer.behind], [true, false]);
  assert.strictEqual(publishedIn(timer.outDir).engineId, 'rules-v2');
  assert.deepStrictEqual(publishedIn(timer.outDir).pagesGivenUpOn, [unreadablePage.url]);
});

test('the published standings are read back from the site, and a site without any gives none', async () => {
  const first = await run({ at: TUESDAY, build: buildOf({ at: TUESDAY }) });
  const asked = [];
  // A site that has the given files. A file given as an Error is one the host fails on.
  const site = files => async url => {
    asked.push(url);
    const file = new URL(url).pathname.replace('/tagr/', '');
    if (!(file in files)) return { status: 404, ok: false };
    if (files[file] instanceof Error) return { status: 503, ok: false };
    return { status: 200, ok: true, json: async () => JSON.parse(files[file]) };
  };
  const url = 'https://example.github.io/tagr/';
  const files = { 'api/status.json': read(first.outDir, 'api/status.json'), 'api/tgr.json': read(first.outDir, 'api/tgr.json') };

  assert.deepStrictEqual(await fetchPublished(url, site(files)), publishedIn(first.outDir));
  assert.match(asked[0], /^https:\/\/example\.github\.io\/tagr\/api\/status\.json\?t=\d+$/);
  assert.strictEqual(await fetchPublished(url, site({})), null);
  // Not being able to tell is not the same as there being none.
  await assert.rejects(fetchPublished(url, site({ 'api/status.json': new Error('down') })), /answered 503 for api\/status\.json/);
  await assert.rejects(fetchPublished(url, site({ ...files, 'api/tgr.json': new Error('down') })), /answered 503 for api\/tgr\.json/);
});
