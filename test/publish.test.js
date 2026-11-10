'use strict';

const test = require('node:test');
const assert = require('node:assert');

const {
  rebuild, rebuildIsDue, stillPatient, reasonsNotToPublish, asPublished,
  lastRebuildTimeAtOrBefore, nextRebuildTimeAfter, FORMAT
} = require('../tagr/publish');

// A build result with the given number of results per source.
function buildOf({ txAsa = 100, tfaa = 60, tfaaIndoor = 40, problems = [], at = '2026-11-10T12:00:00.000Z' } = {}) {
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

// Published standings, as the site holds them.
function publishedOf(options = {}, { engineId = 'rules-v1', pagesGivenUpOn = [] } = {}) {
  const { result, problems } = buildOf(options);
  return { format: FORMAT, builtAt: result.updatedAt, engineId, problems, pagesGivenUpOn, result };
}

const unreadablePage = { what: 'TFAA 2025 Outdoor', url: 'https://texasfieldarchery.org/results/sywat/48', error: 'HTTP 503' };
const anotherUnreadablePage = { what: 'TFAA 900 records', url: 'https://texasfieldarchery.org/records/900', error: 'HTTP 404' };

// ---- Weekly schedule ----

test('the weekly rebuild is Tuesday 6:00 AM Central, in winter and in summer', () => {
  // Central Standard Time is UTC-6, Central Daylight Time is UTC-5.
  assert.strictEqual(nextRebuildTimeAfter(new Date('2026-11-10T00:30:00Z')).toISOString(), '2026-11-10T12:00:00.000Z');
  assert.strictEqual(nextRebuildTimeAfter(new Date('2026-11-10T12:00:00Z')).toISOString(), '2026-11-17T12:00:00.000Z');
  assert.strictEqual(nextRebuildTimeAfter(new Date('2026-07-01T00:00:00Z')).toISOString(), '2026-07-07T11:00:00.000Z');
  assert.strictEqual(lastRebuildTimeAtOrBefore(new Date('2026-11-10T12:00:00Z')).toISOString(), '2026-11-10T12:00:00.000Z');
  assert.strictEqual(lastRebuildTimeAtOrBefore(new Date('2026-11-10T11:59:59Z')).toISOString(), '2026-11-03T12:00:00.000Z');
  // Across the change back to standard time on Sunday, November 1, 2026.
  assert.strictEqual(nextRebuildTimeAfter(new Date('2026-10-27T11:00:00Z')).toISOString(), '2026-11-03T12:00:00.000Z');
});

test('a rebuild is due when there are no standings, when they are a week old, and when the ranking code changed', () => {
  const published = publishedOf({ at: '2026-11-10T12:07:00.000Z' });
  assert.strictEqual(rebuildIsDue(null, 'rules-v1', new Date('2026-11-10T12:07:00Z')), true);
  assert.strictEqual(rebuildIsDue(published, 'rules-v1', new Date('2026-11-10T14:07:00Z')), false);
  assert.strictEqual(rebuildIsDue(published, 'rules-v1', new Date('2026-11-17T11:59:00Z')), false);
  assert.strictEqual(rebuildIsDue(published, 'rules-v1', new Date('2026-11-17T12:00:00Z')), true);
  assert.strictEqual(rebuildIsDue(published, 'rules-v2', new Date('2026-11-10T14:07:00Z')), true);
});

test('an unreadable page is waited for until a day after the weekly rebuild time', () => {
  assert.strictEqual(stillPatient(new Date('2026-11-10T12:07:00Z')), true);
  assert.strictEqual(stillPatient(new Date('2026-11-11T11:59:00Z')), true);
  assert.strictEqual(stillPatient(new Date('2026-11-11T12:00:00Z')), false);
  assert.strictEqual(stillPatient(new Date('2026-11-16T12:00:00Z')), false);
});

// ---- Publishing rules ----

test('a healthy build is published; an empty or collapsed one is not', () => {
  const previous = buildOf();
  const check = (build, prev = previous) => reasonsNotToPublish(build, prev, { patient: true });

  assert.deepStrictEqual(check(buildOf({ txAsa: 104 })), []);
  assert.deepStrictEqual(check(buildOf({ txAsa: 70, tfaa: 40, tfaaIndoor: 27 })), []);
  assert.deepStrictEqual(check(buildOf({ txAsa: 0, tfaa: 0, tfaaIndoor: 0 })), [
    'it has no archers', 'TX ASA returned no results', 'TFAA Outdoor returned no results', 'TFAA Indoor returned no results'
  ]);
  assert.deepStrictEqual(check(buildOf({ tfaa: 0 })), ['TFAA Outdoor returned no results']);
  assert.deepStrictEqual(check(buildOf({ txAsa: 49 })), ['TX ASA dropped from 100 results to 49']);
  // With nothing published there is nothing to compare with, but every source must still answer.
  assert.deepStrictEqual(check(buildOf({ txAsa: 3 }), null), []);
  assert.deepStrictEqual(check(buildOf({ tfaaIndoor: 0 }), null), ['TFAA Indoor returned no results']);
  // Nor are counts compared with standings that different ranking code built.
  const changedRules = build => reasonsNotToPublish(build, previous, { patient: true, sameRules: false });
  assert.deepStrictEqual(changedRules(buildOf({ txAsa: 49 })), []);
  assert.deepStrictEqual(changedRules(buildOf({ tfaa: 0 })), ['TFAA Outdoor returned no results']);
});

test('a build with unreadable pages waits while there are standings to keep', () => {
  const partial = buildOf({ problems: [unreadablePage, anotherUnreadablePage] });
  const previous = publishedOf();
  assert.deepStrictEqual(reasonsNotToPublish(partial, previous, { patient: true }),
    ['2 source pages could not be read (TFAA 2025 Outdoor: HTTP 503)']);
  assert.deepStrictEqual(reasonsNotToPublish(partial, previous, { patient: false }), []);
  assert.deepStrictEqual(reasonsNotToPublish(partial, null, { patient: true }), []);

  // A page the published standings were already published without does not hold things up.
  const givenUp = publishedOf({}, { pagesGivenUpOn: [unreadablePage.url] });
  assert.deepStrictEqual(reasonsNotToPublish(buildOf({ problems: [unreadablePage] }), givenUp, { patient: true }), []);
  assert.deepStrictEqual(reasonsNotToPublish(partial, givenUp, { patient: true }),
    ['1 source page could not be read (TFAA 900 records: HTTP 404)']);
});

// ---- Rebuilding ----

test('a healthy rebuild gives the standings to publish', async () => {
  const fresh = buildOf({ txAsa: 104, at: '2026-11-17T12:07:00.000Z' });
  const outcome = await rebuild({ build: async () => fresh, published: publishedOf(), engineId: 'rules-v1', patient: true });
  assert.deepStrictEqual(outcome, {
    published: true,
    reasons: [],
    problems: [],
    standings: { format: FORMAT, builtAt: '2026-11-17T12:07:00.000Z', engineId: 'rules-v1', problems: [], pagesGivenUpOn: [], result: fresh.result }
  });
});

test('a rebuild that crashes or is not healthy gives nothing to publish', async () => {
  const crashed = await rebuild({ build: async () => { throw new Error('boom'); }, published: publishedOf(), engineId: 'rules-v1', patient: true });
  assert.deepStrictEqual(crashed, { published: false, reasons: ['the rebuild failed: boom'], problems: [], standings: null });

  const collapsed = await rebuild({ build: async () => buildOf({ tfaaIndoor: 5 }), published: publishedOf(), engineId: 'rules-v1', patient: false });
  assert.deepStrictEqual([collapsed.published, collapsed.reasons, collapsed.standings], [false, ['TFAA Indoor dropped from 40 results to 5'], null]);

  // With nothing published yet, a source that is down still keeps the standings off the site.
  const firstWithSourceDown = await rebuild({ build: async () => buildOf({ tfaa: 0 }), published: null, engineId: 'rules-v1', patient: true });
  assert.deepStrictEqual(firstWithSourceDown.reasons, ['TFAA Outdoor returned no results']);
});

test('the first standings are published with the pages they lack, which are waited for next time', async () => {
  const first = await rebuild({ build: async () => buildOf({ problems: [unreadablePage] }), published: null, engineId: 'rules-v1', patient: true });
  assert.strictEqual(first.published, true);
  assert.deepStrictEqual(first.standings.problems, [unreadablePage]);
  assert.deepStrictEqual(first.standings.pagesGivenUpOn, []);

  const again = await rebuild({ build: async () => buildOf({ problems: [unreadablePage] }), published: first.standings, engineId: 'rules-v1', patient: true });
  assert.deepStrictEqual(again.reasons, ['1 source page could not be read (TFAA 2025 Outdoor: HTTP 503)']);
});

test('out of patience, the standings are published without the unreadable pages, which then hold nothing up', async () => {
  const published = publishedOf();
  const gaveUp = await rebuild({ build: async () => buildOf({ txAsa: 95, problems: [unreadablePage] }), published, engineId: 'rules-v1', patient: false });
  assert.strictEqual(gaveUp.published, true);
  assert.deepStrictEqual(gaveUp.standings.pagesGivenUpOn, [unreadablePage.url]);

  // Next week the same page is still gone: published straight away.
  const nextWeek = await rebuild({ build: async () => buildOf({ txAsa: 96, problems: [unreadablePage] }), published: gaveUp.standings, engineId: 'rules-v1', patient: true });
  assert.strictEqual(nextWeek.published, true);
  assert.deepStrictEqual(nextWeek.standings.pagesGivenUpOn, [unreadablePage.url]);

  // A different page failing is news, and is waited for.
  const news = await rebuild({ build: async () => buildOf({ problems: [unreadablePage, anotherUnreadablePage] }), published: nextWeek.standings, engineId: 'rules-v1', patient: true });
  assert.deepStrictEqual(news.reasons, ['1 source page could not be read (TFAA 900 records: HTTP 404)']);

  // The old page comes back, so it is forgotten, and waited for again if it fails later.
  const back = await rebuild({ build: async () => buildOf({ txAsa: 98 }), published: nextWeek.standings, engineId: 'rules-v1', patient: true });
  assert.deepStrictEqual(back.standings.pagesGivenUpOn, []);
  const failsAgain = await rebuild({ build: async () => buildOf({ problems: [unreadablePage] }), published: back.standings, engineId: 'rules-v1', patient: true });
  assert.strictEqual(failsAgain.published, false);
});

test('changed ranking code is not held to the counts the old code got', async () => {
  // A fix makes the code rightly read far fewer TFAA Outdoor results.
  const fixed = await rebuild({ build: async () => buildOf({ tfaa: 20 }), published: publishedOf(), engineId: 'rules-v2', patient: true });
  assert.strictEqual(fixed.published, true);
  assert.strictEqual(fixed.standings.engineId, 'rules-v2');

  // From then on the new code is compared with its own last counts.
  const after = await rebuild({ build: async () => buildOf({ tfaa: 9 }), published: fixed.standings, engineId: 'rules-v2', patient: true });
  assert.deepStrictEqual(after.reasons, ['TFAA Outdoor dropped from 20 results to 9']);
});

test('standings read back from the site are used only when they are standings this code wrote', () => {
  const published = publishedOf();
  assert.deepStrictEqual(asPublished(published), published);
  const { pagesGivenUpOn, problems, ...older } = published;
  assert.deepStrictEqual(asPublished(older), published);
  assert.strictEqual(asPublished({ ...published, format: FORMAT + 1 }), null);
  assert.strictEqual(asPublished({ ...published, result: { adult: [] } }), null);
  assert.strictEqual(asPublished(null), null);
});
