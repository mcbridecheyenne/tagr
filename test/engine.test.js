'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const engine = require('../tagr/engine');
const sources = require('./fixtures/sources');

const goldenFile = path.join(__dirname, 'fixtures', 'golden.json');
const golden = JSON.parse(fs.readFileSync(goldenFile, 'utf8'));

// A fetch that serves the made-up pages, with optional overrides per URL:
// a string replaces the page, an Error makes the request fail.
function fakeFetch(overrides = {}) {
  return async url => {
    const hit = Object.keys(overrides).find(part => url.includes(part));
    if (hit) {
      if (overrides[hit] instanceof Error) throw overrides[hit];
      return overrides[hit];
    }
    const body = sources.responseFor(url);
    if (body === null) throw new Error('no fixture for ' + url);
    return body;
  };
}

// Runs a build on the made-up pages and also returns every URL it asked for.
async function build(overrides) {
  const asked = [];
  const fetch = fakeFetch(overrides);
  const built = await engine.buildRankings({ fetchText: url => { asked.push(url); return fetch(url); } });
  return { ...built, asked };
}

const TFAA = 'https://texasfieldarchery.org';
const SEASON_LIST = TFAA + '/results/sywat';
const problemLines = problems => problems.map(p => p.what + ': ' + p.error);

function withoutTimestamp(result) {
  const copy = JSON.parse(JSON.stringify(result));
  delete copy.updatedAt;
  return copy;
}

test('the ranking worked out from the made-up pages is exactly the recorded one', async () => {
  // golden.json is the whole api/tgr.json for the made-up pages. It was
  // first captured from the ranking as the old Tournament Archer site worked it
  // out, and has since changed only with intended fixes.
  // After an intended change, run `UPDATE_GOLDEN=1 npm test` and review the
  // difference in that file archer by archer.
  const { result, problems, requests } = await engine.buildRankings({ fetchText: fakeFetch() });
  assert.deepStrictEqual(problems, []);
  // 46 tabs of the 2026 sheet and 45 of each older sheet, the TFAA season
  // list, 4 outdoor seasons (one not started), 3 indoor seasons, 3 records pages.
  assert.strictEqual(requests, 46 + 45 + 45 + 1 + 4 + 3 + 3);
  if (process.env.UPDATE_GOLDEN) {
    fs.writeFileSync(goldenFile, JSON.stringify(withoutTimestamp(result), null, 1) + '\n');
    return;
  }
  assert.strictEqual(JSON.stringify(withoutTimestamp(result)), JSON.stringify(golden));
});

test('the result carries the time it was built', async () => {
  const at = new Date('2026-11-10T12:00:00Z');
  const { result } = await engine.buildRankings({ fetchText: fakeFetch(), now: () => at });
  assert.strictEqual(result.updatedAt, '2026-11-10T12:00:00.000Z');
  assert.deepStrictEqual(Object.keys(result), ['adult', 'youth', 'sources', 'stateRecords', 'updatedAt']);
});

test('a page that cannot be fetched is reported, and the rest still counts', async () => {
  const { result, problems } = await engine.buildRankings({
    fetchText: fakeFetch({ '/results/sywat/48': new Error('HTTP 503') })
  });
  assert.strictEqual(problems.length, 1);
  assert.strictEqual(problems[0].what, 'TFAA 2025 Outdoor');
  assert.strictEqual(problems[0].error, 'HTTP 503');
  assert.strictEqual(result.sources.txAsa, golden.sources.txAsa);
  assert.strictEqual(result.sources.tfaaIndoor, golden.sources.tfaaIndoor);
  assert.ok(result.sources.tfaa < golden.sources.tfaa);
});

test('a TFAA page with no results on it is reported as a problem', async () => {
  const { problems } = await engine.buildRankings({
    fetchText: fakeFetch({ '/results/sywat/49': '<html><body>Site maintenance</body></html>' })
  });
  assert.deepStrictEqual(problems.map(p => p.what + ': ' + p.error), ['TFAA 2025-2026 Indoor: the page had no results on it']);
});

test('a records page with no records on it is reported as a problem', async () => {
  const { result, problems } = await engine.buildRankings({
    fetchText: fakeFetch({ '/records/900': '<html><body>Not found</body></html>' })
  });
  assert.deepStrictEqual(problems.map(p => p.what), ['TFAA 900 records']);
  assert.strictEqual(result.sources.stateRecords, golden.sources.stateRecords - 1);
});

test('a Google answer that is not a sheet is reported as a problem', async () => {
  const { result, problems } = await engine.buildRankings({
    fetchText: fakeFetch({ 'gid=795531792': '<html><body>Sign in to continue</body></html>' })
  });
  assert.strictEqual(problems.length, 1);
  assert.strictEqual(problems[0].what, 'TX ASA 2026, Open Pro');
  assert.ok(result.sources.txAsa < golden.sources.txAsa);
});

test('an archive without a class tab is skipped quietly', async () => {
  // Google answers a request for a missing tab with the summary sheet.
  const { problems, pages } = await engine.buildRankings({
    fetchText: fakeFetch({ 'sheet=Open%20Pro': sources.SUMMARY_SHEET })
  });
  assert.deepStrictEqual(problems, []);
  const openPro2025 = pages.find(p => p.what === 'TX ASA 2025, Open Pro');
  assert.deepStrictEqual([openPro2025.results, openPro2025.note], [0, 'the sheet has no tab of this name']);
});

// ---- Which Texas ASA tabs are read ----

test('tabs of the older sheets are asked for by their exact names, apostrophes included', async () => {
  const { asked } = await build();
  const names = asked.filter(u => u.includes(sources.ASA_2025)).map(u => new URL(u).searchParams.get('sheet'));
  const mustAsk = ["Men's Open 45", "Men's Open 40", "Men's Hunter 45", "Men's Pins 40", "Men's Pins 30", "Sr. Women's Known",
    'Sr. Known 50', 'Traditional 25', 'Eagle Barebow Recurve', 'Youth Open Boys', 'Youth Pins Girls', 'Sr. Open', 'Sr. Master', 'Traditional 30'];
  for (const name of mustAsk) assert.ok(names.includes(name), name + ' was not asked for');
  // Classes the older sheets never had are not asked for.
  for (const name of ['W. Known Pro', 'Senior Known Pro', 'Senior Hunter 45', 'Senior Legends']) assert.ok(!names.includes(name), name + ' was asked for');
  assert.strictEqual(names.length, 45);
  assert.strictEqual(new Set(names).size, 45);
});

test('a 2026 class without a tab number is asked for by name, and its archers are ranked', async () => {
  const { asked, result } = await build();
  const byName = asked.filter(u => u.includes(sources.ASA_2026) && u.includes('sheet=')).map(u => new URL(u).searchParams.get('sheet'));
  assert.deepStrictEqual(byName.sort(), ['Super Senior', 'Young Adult Pins Female', 'Youth Olympic']);
  const drew = result.youth.find(a => a.name === 'Drew Fingertab');
  assert.deepStrictEqual([drew.orgClass, drew.equipmentClass, drew.events], ['Youth Olympic Recurve', 'Olympic', 3]);
});

test('a tab left over as a copy of the same class in an older sheet is not counted twice', async () => {
  // Each year's sheet starts as a copy of the last one. Here the 2025 sheet
  // still holds the 2024 rows of Known 50.
  const leftover = sources.responseFor(sources.asaUrl(sources.ASA_2024, 'Known 50'));
  const { result, problems, pages } = await build({ [sources.asaUrl(sources.ASA_2025, 'Known 50')]: leftover });
  assert.deepStrictEqual(problems, []);
  assert.strictEqual(JSON.stringify(withoutTimestamp(result)), JSON.stringify(golden));
  const copy = pages.find(p => p.what === 'TX ASA 2025, Known 50');
  assert.deepStrictEqual([copy.results, copy.note], [0, 'the same rows as the 2024 sheet, so not counted twice']);
  assert.strictEqual(pages.find(p => p.what === 'TX ASA 2024, Known 50').results, 1);
});

test('the class table is consistent', () => {
  const tabs = engine.ASA_TABS;
  assert.strictEqual(new Set(tabs.map(t => t.name)).size, tabs.length);
  const gids = tabs.filter(t => t.gid).map(t => t.gid);
  assert.strictEqual(new Set(gids).size, gids.length);
  for (const t of tabs) {
    assert.ok(t.age === 'adult' || t.age === 'youth', t.name);
    assert.strictEqual(typeof t.known, 'boolean', t.name);
    assert.ok([20, 25, 30, 40, 45, 50].includes(t.maxYards), t.name);
    assert.ok(!(t.gid && t.tab), t.name + ' has both a tab number and a tab name');
  }
  // The yardage is in the class name for these.
  for (const t of tabs) {
    const yards = t.name.match(/ (50|45|40|30)$/);
    if (yards && !/^Traditional/.test(t.name)) assert.strictEqual(t.maxYards, Number(yards[1]), t.name);
  }
});

// ---- Which TFAA seasons are read ----

test('the three newest outdoor and indoor seasons with scores are read, from the season list', async () => {
  const { pages, asked, problems } = await build();
  assert.deepStrictEqual(problems, []);
  const seasons = pages.filter(p => /^TFAA \d{4}/.test(p.what)).map(p => p.what + (p.note ? ' (' + p.note + ')' : ''));
  assert.deepStrictEqual(seasons, [
    'TFAA 2027 Outdoor (no scores yet)',
    'TFAA 2026 Outdoor (1 State score listed twice, counted once; 1 score above the round maximum left out)',
    'TFAA 2025 Outdoor',
    'TFAA 2024 Outdoor',
    'TFAA 2025-2026 Indoor',
    'TFAA 2024-2025 Indoor',
    'TFAA 2023-2024 Indoor'
  ]);
  // Older seasons, test entries and other programs in the list are never asked for.
  const ids = asked.filter(u => /\/results\/sywat\/\d+$/.test(u)).map(u => Number(u.split('/').pop()));
  assert.deepStrictEqual(ids, [55, 50, 48, 38, 49, 46, 37]);
});

test('the page without a season number is used for its season list only', async () => {
  // That page shows whichever season is current, so its own table must not be scored.
  const listOnly = '<html><body>' + sources.tfaaSeasonList(0) + '</body></html>';
  const fetch = fakeFetch();
  const { result, problems } = await engine.buildRankings({ fetchText: url => (url === SEASON_LIST ? listOnly : fetch(url)) });
  assert.deepStrictEqual(problems, []);
  assert.strictEqual(JSON.stringify(withoutTimestamp(result)), JSON.stringify(golden));
});

test('without the season list no TFAA season is read, and the site would not publish that', async () => {
  const { reasonsNotToPublish } = require('../tagr/publish');
  const fetch = fakeFetch();
  const down = await engine.buildRankings({ fetchText: url => (url === SEASON_LIST ? Promise.reject(new Error('HTTP 503')) : fetch(url)) });
  assert.deepStrictEqual(problemLines(down.problems), ['TFAA season list: HTTP 503']);
  assert.deepStrictEqual([down.result.sources.tfaa, down.result.sources.tfaaIndoor], [0, 0]);
  assert.strictEqual(down.result.sources.txAsa, golden.sources.txAsa);
  assert.deepStrictEqual(reasonsNotToPublish(down, null, { patient: true }), ['TFAA Outdoor returned no results', 'TFAA Indoor returned no results']);

  const changed = await engine.buildRankings({ fetchText: url => (url === SEASON_LIST ? '<html><body>New site</body></html>' : fetch(url)) });
  assert.deepStrictEqual(problemLines(changed.problems), ['TFAA season list: the page had no season list on it']);
});

test('a season listed as outdoor whose page holds indoor scores is reported, not scored', async () => {
  const indoorPage = sources.responseFor(TFAA + '/results/sywat/49');
  const { result, problems } = await build({ '/results/sywat/50': indoorPage });
  assert.deepStrictEqual(problemLines(problems), ['TFAA 2026 Outdoor: it is listed as an outdoor season but the page holds indoor scores']);
  assert.ok(result.sources.tfaa < golden.sources.tfaa);
  assert.strictEqual(result.sources.tfaaIndoor, golden.sources.tfaaIndoor);
});

test('a listed season the site has no page for is reported, and no older season takes its place', async () => {
  const { problems, asked } = await build({ '/results/sywat/48': sources.TFAA_NOT_FOUND });
  assert.deepStrictEqual(problemLines(problems), ['TFAA 2025 Outdoor: the page had no results on it']);
  assert.ok(!asked.some(u => u.endsWith('/results/sywat/35')));
});

test('a row that does not fit its column headings is left out and reported, and the rest of the page counts', async () => {
  const page = sources.tfaaResultsPage(48, '2025 Shoot Your Way Across Texas', sources.OUTDOOR_HEADS, [
    { age: 'Adult Male', styles: [{ style: 'Freestyle (FS)', rows: [
      [1, 'Quillfeather, Avery', 535, 541, 539, 1079, 2694],
      [2, 'Short, Row', 400, 400]
    ] }] }
  ]);
  const { problems, pages } = await build({ '/results/sywat/48': page });
  assert.deepStrictEqual(problemLines(problems), ['TFAA 2025 Outdoor: 1 of its rows did not fit the column headings']);
  assert.strictEqual(pages.find(p => p.what === 'TFAA 2025 Outdoor').results, 1);
});

// ---- Reading a TFAA results page ----

const outdoorPage = groups => sources.tfaaResultsPage(50, '2026 Shoot Your Way Across Texas', sources.OUTDOOR_HEADS, groups);
const indoorPage = groups => sources.tfaaResultsPage(49, '2025-2026 Indoor Shoot Your Way Across Texas', sources.INDOOR_HEADS, groups);
const freestyle = (age, rows, more = {}) => ({ age, ...more, styles: [{ style: 'Freestyle (FS)', rows }] });

test('the season list gives the real seasons, newest first', () => {
  const html = '<select id="season" name="seasons"> <option value="0">Select...</option> <option value="53" selected>2026-2027 Indoor</option> ' +
    '<option value="54">TEST</option> <option value="52">Field 50 - 2026</option> <option value="50">2026 Outdoor</option> ' +
    '<option value="5">2015-2016 Indoor</option> <option value="16">2015 Outdoor</option> <option value="49">2025-2026&nbsp;Indoor</option> ' +
    '<option value="99">2026 Outdoor</option> <option value="51">I-O TEST 1970</option> </select>';
  assert.deepStrictEqual(engine.parseTfaaSeasonList(html), [
    { id: 53, label: '2026-2027 Indoor', kind: 'indoor', year: 2026 },
    { id: 50, label: '2026 Outdoor', kind: 'outdoor', year: 2026 },
    { id: 49, label: '2025-2026 Indoor', kind: 'indoor', year: 2025 },
    { id: 5, label: '2015-2016 Indoor', kind: 'indoor', year: 2015 },
    { id: 16, label: '2015 Outdoor', kind: 'outdoor', year: 2015 }
  ]);
  assert.deepStrictEqual(engine.parseTfaaSeasonList('<html><body>No list here</body></html>'), []);
});

test('a results page is recognized as indoor or outdoor by its column headings', () => {
  assert.strictEqual(engine.tfaaPageLayout(outdoorPage([freestyle('Adult Male', [[1, 'A, B', 500, 0, 0, 0, 500]])])), 'outdoor');
  assert.strictEqual(engine.tfaaPageLayout(indoorPage([freestyle('Adult Male', [[1, 'A, B', 300, 50, 0, 0, 0, 0, 0, 0, 300, 50]])])), 'indoor');
  assert.strictEqual(engine.tfaaPageLayout(outdoorPage([])), null);
  assert.strictEqual(engine.tfaaPageLayout(sources.TFAA_NOT_FOUND), null);
});

test('an outdoor row gives its ordinary rounds, and the State total as two halves', () => {
  const [archer] = engine.parseTfaaOutdoorHtml(outdoorPage([freestyle('Senior Female', [[1, 'Greybeard, Lee', 510, 0, 509, 1015, 2034]])]), '2026 Outdoor');
  assert.deepStrictEqual(archer, {
    name: 'Greybeard, Lee', org: 'TFAA Outdoor', orgClass: 'Senior Female - Freestyle (FS)', age: 'adult',
    eventScores: [510, 509, 508, 507],
    eventNames: ['2026 SYWAT #1', '2026 SYWAT #2', '2026 State Outdoor (Field)', '2026 State Outdoor (Hunter)'],
    maxPerRound: 560
  });
});

test('a score above the most its round can score is left out', async () => {
  // The 2025 outdoor page lists a few of these: a 629 where a round is out of 560,
  // and a State total of 1231 where the two rounds together are out of 1120.
  const page = sources.tfaaResultsPage(48, '2025 Shoot Your Way Across Texas', sources.OUTDOOR_HEADS, [freestyle('Adult Male', [
    [1, 'Overdraw, Jesse', 629, 554, 0, 1231, 2414],
    [2, 'Quillfeather, Avery', 560, 0, 0, 1120, 1680],
    [3, 'Onceonly, Toby', 608, 0, 0, 0, 608]
  ])]);
  assert.deepStrictEqual(engine.parseTfaaOutdoorHtml(page, '2025 Outdoor').map(a => [a.name, a.eventScores, a.eventNames]), [
    ['Overdraw, Jesse', [554], ['2025 SYWAT #1']],
    ['Quillfeather, Avery', [560, 560, 560], ['2025 SYWAT #1', '2025 State Outdoor (Field)', '2025 State Outdoor (Hunter)']]
  ]);

  // The check lists what was left out, so it can be looked into.
  const { pages, problems } = await build({ '/results/sywat/48': page });
  assert.deepStrictEqual(problems, []);
  const season = pages.find(p => p.what === 'TFAA 2025 Outdoor');
  assert.strictEqual(season.results, 2);
  assert.strictEqual(season.note, '3 scores above the round maximum left out');
  assert.deepStrictEqual(season.leftOut.map(o => [o.name, o.score, o.max]), [
    ['Overdraw, Jesse', 629, 560], ['Overdraw, Jesse', 1231, 1120], ['Onceonly, Toby', 608, 560]
  ]);
});

test('an indoor score above the most its round can score is left out too', () => {
  const [archer] = engine.parseTfaaIndoorHtml(indoorPage([freestyle('Adult Male', [[1, 'Overdraw, Jesse', 301, 20, 299, 41, 0, 0, 601, 80, 1201, 141]])]), '2025-2026 Indoor');
  assert.deepStrictEqual([archer.eventScores, archer.eventNames], [[299], ['2025-2026 Indoor #1']]);
});

test('an indoor State score is the State round, never an ordinary round as well', () => {
  // 270 is under 300, but it is still the total of the two State rounds.
  const [archer] = engine.parseTfaaIndoorHtml(indoorPage([freestyle('Cub Female', [[1, 'Peepsight, Piper', 150, 2, 140, 1, 0, 0, 270, 3, 560, 6]])]), '2025-2026 Indoor');
  assert.deepStrictEqual(archer, {
    name: 'Peepsight, Piper', org: 'TFAA Indoor', orgClass: 'Cub Female - Freestyle (FS)', age: 'youth',
    eventScores: [150, 140, 270],
    xCounts: [2, 1, 3],
    isState: [false, false, true],
    eventNames: ['2025-2026 Indoor #1', '2025-2026 Indoor #2', '2025-2026 State Indoor'],
    roundMax: [300, 300, 600],
    xMax: [60, 60, 120],
    maxPerRound: 300
  });
});

test('a State score listed on two rows of the same class counts once', () => {
  const page = outdoorPage([
    { age: 'Adult Male', styles: [
      { style: 'Freestyle (FS)', rows: [
        [1, 'Twice, Listed', 540, 0, 0, 1080, 1620],
        [2, 'Twice, Listed', 0, 0, 0, 1080, 1080],
        [3, 'Once, Listed', 0, 0, 0, 1080, 1080]
      ] },
      // The same archer in another style shot State there too: a different result.
      { style: 'Bowhunter Freestyle (BHFS)', rows: [
        [1, 'Twice, Listed', 0, 0, 0, 1080, 1080]
      ] }
    ] }
  ]);
  const archers = engine.parseTfaaOutdoorHtml(page, '2026 Outdoor');
  assert.deepStrictEqual(archers.map(a => [a.name, a.orgClass, a.eventScores]), [
    ['Twice, Listed', 'Adult Male - Freestyle (FS)', [540, 540, 540]],
    ['Once, Listed', 'Adult Male - Freestyle (FS)', [540, 540]],
    ['Twice, Listed', 'Adult Male - Bowhunter Freestyle (BHFS)', [540, 540]]
  ]);

  const indoor = engine.parseTfaaIndoorHtml(indoorPage([freestyle('Adult Male', [
    [1, 'Twice, Listed', 300, 55, 0, 0, 0, 0, 598, 110, 898, 165],
    [2, 'TWICE, LISTED', 0, 0, 0, 0, 0, 0, 598, 110, 598, 110]
  ])]), '2025-2026 Indoor');
  assert.deepStrictEqual(indoor.map(a => a.eventScores), [[300, 598]]);
});

test('an empty cell does not shift the scores along', () => {
  const [archer] = engine.parseTfaaOutdoorHtml(outdoorPage([freestyle('Adult Male', [[1, 'Fletcher, Jordan', 520, null, 510, null, 1030]])]), '2026 Outdoor');
  assert.deepStrictEqual(archer.eventScores, [520, 510]);
  assert.deepStrictEqual(archer.eventNames, ['2026 SYWAT #1', '2026 SYWAT #2']);
});

test('professional groups are ranked with the adults of the same age', () => {
  const [pro] = engine.parseTfaaIndoorHtml(indoorPage([freestyle('Pro Senior Male', [[1, 'Backtension, Blake', 300, 59, 0, 0, 0, 0, 0, 0, 300, 59]])]), '2025-2026 Indoor');
  assert.deepStrictEqual([pro.orgClass, pro.age], ['Senior Male - Freestyle (FS)', 'adult']);
});

test('an age group the code has not met keeps its own name, and is adult or youth by its age range', () => {
  const archers = engine.parseTfaaOutdoorHtml(outdoorPage([
    freestyle('Young Adult Male', [[1, 'Nockpoint, Jamie', 480, 0, 0, 0, 480]]),
    freestyle('Legend Male', [[1, 'Yew, Stick', 250, 0, 0, 0, 250]], { range: '80+' }),
    freestyle('Peewee Female', [[1, 'Little, Cub', 180, 0, 0, 0, 180]], { range: '5-7' })
  ]), '2026 Outdoor');
  assert.deepStrictEqual(archers.map(a => [a.orgClass, a.age]), [
    ['Young Adult Male - Freestyle (FS)', 'youth'],
    ['Legend Male - Freestyle (FS)', 'adult'],
    ['Peewee Female - Freestyle (FS)', 'youth']
  ]);
});

// ---- The rules, on hand-made scores ----

function rank(shooters) {
  const result = engine.computeRankings({
    asaShooters: shooters.filter(s => s.org === 'TX ASA'),
    tfaaShooters: shooters.filter(s => s.org === 'TFAA Outdoor'),
    tfaaIndoorShooters: shooters.filter(s => s.org === 'TFAA Indoor'),
    stateRecordDetails: []
  });
  return result.adult.concat(result.youth);
}

function asa(name, scores, { known = false, maxYards = 30, orgClass = "Men's Pins 30", age = 'adult' } = {}) {
  return { name, org: 'TX ASA', orgClass, age, knownDistance: known, asaMaxYards: maxYards, eventScores: scores, eventNames: scores.map((_, i) => 'Event ' + (i + 1)), maxPerRound: 360 };
}

test('NPS is the share of the maximum score, times 1000, times the organization weight', () => {
  const [archer] = rank([asa('A B', [360, 180, 360])]);
  assert.deepStrictEqual(archer.rounds.map(r => r.nps), [1050, 1050, 525]);
});

test('known distance takes 5% off and longer maximum yardage adds a bonus', () => {
  const nps = options => rank([asa('A B', [360, 360, 360], options)])[0].bestNPS;
  assert.strictEqual(nps({ known: true }), Math.round(1000 * (1.05 * 0.95)));
  assert.strictEqual(nps({ maxYards: 40 }), Math.round(1000 * (1.05 * 1.03)));
  assert.strictEqual(nps({ maxYards: 45 }), Math.round(1000 * (1.05 * 1.05)));
  assert.strictEqual(nps({ maxYards: 50 }), Math.round(1000 * (1.05 * 1.07)));
});

test('the TAGR score averages the best five rounds, counting missing rounds as zero', () => {
  const [three] = rank([asa('A B', [360, 360, 360])]);
  assert.deepStrictEqual(three.npsScores, [1050, 1050, 1050, 0, 0]);
  assert.strictEqual(three.avgNPS, 630);
  assert.strictEqual(three.provisional, false);

  const [two] = rank([asa('A B', [360, 360])]);
  assert.strictEqual(two.provisional, true);

  // Seven rounds: only the best five count, and 6 to 7 events earn the 1.05 bonus.
  const [seven] = rank([asa('A B', [360, 360, 360, 360, 360, 90, 90])]);
  assert.strictEqual(seven.avgNPS, Math.round(1050 * 1.05));
  assert.deepStrictEqual(seven.rounds.map(r => r.counted), [true, true, true, true, true, false, false]);
});

test('the same archer in two organizations is merged and earns the cross-organization bonus', () => {
  const outdoor = { name: 'B, A', org: 'TFAA Outdoor', orgClass: 'Adult Male - Freestyle (FS)', age: 'adult', eventScores: [560, 560], eventNames: ['x', 'y'], maxPerRound: 560 };
  const ranked = rank([asa('A B', [360, 360, 360]), outdoor]);
  assert.strictEqual(ranked.length, 1);
  assert.strictEqual(ranked[0].org, 'TX ASA + TFAA Outdoor');
  assert.strictEqual(ranked[0].multiOrg, true);
  // Best five: 1080, 1080, 1050, 1050, 1050. Five events is 1.04, two organizations 1.03.
  assert.strictEqual(ranked[0].avgNPS, Math.round(1062 * 1.04 * 1.03));
});

test('names are matched across "FIRST LAST" and "Last, First" spellings', () => {
  assert.strictEqual(engine.normalizeName('MCARROW, DANA'), 'Dana McArrow');
  assert.strictEqual(engine.normalizeName('dana mcarrow'), 'Dana McArrow');
  assert.strictEqual(engine.normalizeName(' Quillfeather,  Avery '), 'Avery Quillfeather');
});
