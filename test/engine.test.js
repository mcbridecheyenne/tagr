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
  // list, 4 outdoor seasons (one not started), 3 indoor seasons, 3 records pages,
  // and for their titles the two seasons before the ranked ones: one the site
  // has no page for, the other with its standings, its list of shoots and its
  // State Championship.
  assert.strictEqual(requests, 46 + 45 + 45 + 1 + 4 + 3 + 3 + 1 + 3);
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
  const seasons = pages.filter(p => /^TFAA \d{4}/.test(p.what) && !/ titles$/.test(p.what)).map(p => p.what + (p.note ? ' (' + p.note + ')' : ''));
  assert.deepStrictEqual(seasons, [
    'TFAA 2027 Outdoor (no scores yet)',
    'TFAA 2026 Outdoor (1 State score listed twice, counted once; 1 score above the round maximum left out)',
    'TFAA 2025 Outdoor',
    'TFAA 2024 Outdoor',
    'TFAA 2025-2026 Indoor',
    'TFAA 2024-2025 Indoor',
    'TFAA 2023-2024 Indoor'
  ]);
  // Test entries and other programs in the list are never asked for. The two
  // seasons before the ranked ones are read last, for their titles only.
  const ids = asked.filter(u => /\/results\/sywat\/\d+$/.test(u)).map(u => Number(u.split('/').pop()));
  assert.deepStrictEqual(ids, [55, 50, 48, 38, 49, 46, 37, 35, 33]);
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
  const { problems, pages, result } = await build({ '/results/sywat/48': sources.TFAA_NOT_FOUND });
  assert.deepStrictEqual(problemLines(problems), ['TFAA 2025 Outdoor: the page had no results on it']);
  // The 2023 season is read for its titles only: it is not ranked in 2025's place.
  assert.ok(!pages.some(p => p.what === 'TFAA 2023 Outdoor'));
  assert.ok(!result.adult.concat(result.youth).some(r => r.rounds.some(x => /^2023 /.test(x.event || ''))));
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
    roundKinds: ['sywat', 'sywat', 'field', 'hunter'],
    // Both halves are the one State shoot, where the whole total places the archer.
    eventKeys: [null, null, 'tfaa-state:TFAA Outdoor:2026:Senior Female - Freestyle (FS)', 'tfaa-state:TFAA Outdoor:2026:Senior Female - Freestyle (FS)'],
    fieldScores: [510, 509, 1015, 1015],
    maxPerRound: 560, when: 2026
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
    // Indoors the X count breaks a tie on points.
    eventKeys: [null, null, 'tfaa-state:TFAA Indoor:2025-2026:Cub Female - Freestyle (FS)'],
    fieldScores: [150.002, 140.001, 270.003],
    maxPerRound: 300, when: 2025.5
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
  assert.deepStrictEqual(archer.rounds.map(r => r.nps), [950, 950, 475]);
});

test('known distance takes 5% off and longer maximum yardage adds a bonus', () => {
  const nps = options => rank([asa('A B', [360, 360, 360], options)])[0].bestNPS;
  assert.strictEqual(nps({ known: true }), Math.round(1000 * (0.95 * 0.95)));
  assert.strictEqual(nps({ maxYards: 40 }), Math.round(1000 * (0.95 * 1.03)));
  assert.strictEqual(nps({ maxYards: 45 }), Math.round(1000 * (0.95 * 1.05)));
  assert.strictEqual(nps({ maxYards: 50 }), Math.round(1000 * (0.95 * 1.07)));
});

test('the TAGR score averages the best five rounds, counting missing rounds as zero', () => {
  const [three] = rank([asa('A B', [360, 360, 360])]);
  assert.deepStrictEqual(three.npsScores, [950, 950, 950, 0, 0]);
  assert.strictEqual(three.avgNPS, 570);
  assert.strictEqual(three.provisional, false);

  const [two] = rank([asa('A B', [360, 360])]);
  assert.strictEqual(two.provisional, true);

  // Seven rounds: only the best five count, and 6 to 7 events earn the 1.05 bonus.
  const [seven] = rank([asa('A B', [360, 360, 360, 360, 360, 90, 90])]);
  assert.strictEqual(seven.avgNPS, Math.round(950 * 1.05));
  assert.deepStrictEqual(seven.rounds.map(r => r.counted), [true, true, true, true, true, false, false]);
});

test('the same archer in two organizations is merged and earns the cross-organization bonus', () => {
  const outdoor = { name: 'B, A', org: 'TFAA Outdoor', orgClass: 'Adult Male - Freestyle (FS)', age: 'adult', eventScores: [560, 560], eventNames: ['x', 'y'], maxPerRound: 560 };
  const ranked = rank([asa('A B', [360, 360, 360]), outdoor]);
  assert.strictEqual(ranked.length, 1);
  assert.strictEqual(ranked[0].org, 'TX ASA + TFAA Outdoor');
  assert.strictEqual(ranked[0].multiOrg, true);
  // Best five: 1080, 1080, 950, 950, 950. Five events is 1.04, two organizations 1.03.
  assert.strictEqual(ranked[0].avgNPS, Math.round(1002 * 1.04 * 1.03));
});

function tfaaOutdoor(name, style, scores, roundKinds) {
  return { name, org: 'TFAA Outdoor', orgClass: 'Adult Male - ' + style, age: 'adult', eventScores: scores, eventNames: scores.map((_, i) => 'Round ' + (i + 1)), roundKinds, maxPerRound: 560 };
}

function tfaaIndoorState(name, style, scores) {
  const n = scores.length;
  return {
    name, org: 'TFAA Indoor', orgClass: 'Adult Male - ' + style, age: 'adult', eventScores: scores, eventNames: scores.map((_, i) => 'State ' + (i + 1)),
    xCounts: scores.map(() => 0), isState: scores.map(() => true), roundMax: scores.map(() => 600), xMax: scores.map(() => 120), maxPerRound: 300
  };
}

test('a TFAA round is scored against the national record for its style, with no equipment bonus', () => {
  const { nationalRecords } = engine.rules;
  assert.deepStrictEqual(nationalRecords.BBR, { indoor: 583, field: 481, hunter: 496 });
  assert.deepStrictEqual(nationalRecords.LB, { indoor: 542, field: 376, hunter: 391 });

  // Tying the national field or hunter record is worth what a perfect Freestyle round is.
  // The field and hunter rounds here are the two halves of State, which earn the State bonus.
  const state = Math.round(1080 * 1.05);
  const [barebow] = rank([tfaaOutdoor('A B', 'Barebow Recurve (BBR)', [481, 496, 400], ['field', 'hunter', 'sywat'])]);
  const [freestyle] = rank([tfaaOutdoor('C D', 'Freestyle (FS)', [560, 560, 560], ['field', 'hunter', 'sywat'])]);
  assert.deepStrictEqual(freestyle.rounds.map(r => r.nps), [state, state, 1080]);
  // A SYWAT round can be either, so it meets the average of the two records.
  assert.deepStrictEqual(barebow.rounds.map(r => r.nps), [state, state, Math.round(400 / ((481 + 496) / 2) * 1080)]);

  // Bowhunter Freestyle's 5% goes: its record is the bar now.
  const [bowhunter] = rank([tfaaOutdoor('E F', 'Bowhunter Freestyle (BHFS)', [554, 554, 554], ['field', 'hunter', 'sywat'])]);
  assert.deepStrictEqual(bowhunter.rounds.map(r => r.nps), [state, state, 1080]);

  // Indoors the record is the two-day total: a 583 State in barebow recurve counts as a 600 in Freestyle.
  const [indoorBarebow] = rank([tfaaIndoorState('G H', 'Barebow Recurve (BBR)', [583, 583, 583])]);
  const [indoorFreestyle] = rank([tfaaIndoorState('I J', 'Freestyle (FS)', [600, 600, 600])]);
  assert.strictEqual(indoorBarebow.bestNPS, indoorFreestyle.bestNPS);
  assert.strictEqual(indoorFreestyle.bestNPS, Math.round(1000 * 1.00 * 1.05));
});

test('a TFAA style NFAA keeps no record for meets the record of the nearest NFAA style', () => {
  assert.deepStrictEqual(engine.rules.recordStyleFor, { MBH: 'BHFS', GEN: 'BBC' });
  const sywat = (style, score) => rank([tfaaOutdoor('A B', style, [score, score, score], ['sywat', 'sywat', 'sywat'])])[0].bestNPS;
  // Modern Bowhunter Freestyle is measured as Bowhunter Freestyle is, with no bonus on top.
  assert.strictEqual(sywat('Modern Bowhunter Freestyle (MBH)', 540), sywat('Bowhunter Freestyle (BHFS)', 540));
  assert.strictEqual(sywat('Modern Bowhunter Freestyle (MBH)', 554), 1080);
  // Genesis is measured as Barebow Compound is, with or without its code on the page.
  assert.strictEqual(sywat('Genesis (GEN)', 400), sywat('Barebow Compound (BBC)', 400));
  assert.strictEqual(sywat('Genesis', 400), sywat('Barebow Compound (BBC)', 400));
});

test('a style without a national record, and every Texas ASA round, keeps the equipment bonus', () => {
  // Bowhunter Freestyle Limited has no record here: the perfect score, and the bowhunter's 5%.
  const [limited] = rank([tfaaOutdoor('A B', 'Bowhunter Freestyle Limited (BHFSL)', [560, 560, 560], ['sywat', 'sywat', 'sywat'])]);
  assert.strictEqual(limited.bestNPS, Math.round(1000 * 1.08 * 1.05));
  const [asaBarebow] = rank([asa('C D', [360, 360, 360], { orgClass: 'Barebow Recurve' })]);
  assert.strictEqual(asaBarebow.bestNPS, Math.round(1000 * 0.95 * 1.08));
  const [asaTraditional] = rank([asa('E F', [360, 360, 360], { orgClass: 'Traditional' })]);
  assert.strictEqual(asaTraditional.bestNPS, Math.round(1000 * 0.95 * 1.08 * 1.03));
});

test('names are matched across "FIRST LAST" and "Last, First" spellings', () => {
  assert.strictEqual(engine.normalizeName('MCARROW, DANA'), 'Dana McArrow');
  assert.strictEqual(engine.normalizeName('dana mcarrow'), 'Dana McArrow');
  assert.strictEqual(engine.normalizeName(' Quillfeather,  Avery '), 'Avery Quillfeather');
});

test('one archer written several ways is one name', () => {
  // Extra spaces, curly apostrophes, and a suffix with or without its full stop, wherever it stands.
  assert.strictEqual(engine.normalizeName('JOSH  NUGENT'), 'Josh Nugent');
  assert.strictEqual(engine.normalizeName("O\u2019donohue, Savannah"), "Savannah O'Donohue");
  for (const spelling of ['RAUL  REYES JR', 'Reyes Jr., Raul', 'Reyes, Raul Jr', 'Raul Jr. Reyes']) {
    assert.strictEqual(engine.normalizeName(spelling), 'Raul Reyes Jr');
  }
  assert.strictEqual(engine.normalizeName('LARRY MITCHELL II'), 'Larry Mitchell II');
  // A suffix keeps father and son apart.
  assert.notStrictEqual(engine.nameKey('Raul Reyes Jr'), engine.nameKey('Raul Reyes'));
  // Full stops do not: A.J. and AJ are one archer.
  assert.strictEqual(engine.nameKey('A.J. GROGAN'), engine.nameKey('Grogan, AJ'));
  const ranked = rank([asa('A.J.  GROGAN', [300, 300, 300]), asa('AJ GROGAN', [310, 310, 310])]);
  assert.strictEqual(ranked.length, 1);
  assert.strictEqual(ranked[0].events, 6);
});

test('two spellings on one ASA number are one archer when they share a first or last name', () => {
  const row = (name, asaNumber, when) => ({ ...asa(name, [300, 300, 300]), asaNumber, when });
  const tfaa = tfaaOutdoor('Schulz, Ken', 'Freestyle (FS)', [500, 500, 500], ['sywat', 'sywat', 'sywat']);
  const ranked = rank([
    row('KEN SCHULZ', '45173', 2025), row('KENNETH SCHULZ', '45173', 2026),
    row('LISA HAMLIN', '64596', 2025), row('LISA LOPEZ', '64596', 2026),
    // A mistyped number puts two different archers on it: they stay apart.
    row('TYLER ROEBUCK', '65574', 2025), row('RYAN THOMAS', '65574', 2026),
    tfaa
  ]);
  assert.deepStrictEqual(ranked.map(r => r.name).sort(), ['Kenneth Schulz', 'Lisa Lopez', 'Ryan Thomas', 'Tyler Roebuck']);
  // The TFAA spelling follows the same archer, under the newest ASA spelling.
  assert.strictEqual(ranked.find(r => r.name === 'Kenneth Schulz').org, 'TX ASA + TFAA Outdoor');
});

test('a Texas ASA round is measured against the best score of its own class in the seasons read', () => {
  const ranked = rank([
    asa('A B', [340, 340, 340]), asa('C D', [170, 170, 170]),
    // Another class has its own bar: its best score is worth as much as the first class's best.
    asa('E F', [320, 320, 160], { orgClass: "Men's Pins 40", maxYards: 30 })
  ]);
  const best = name => ranked.find(r => r.name === name).rounds.map(r => r.nps);
  assert.deepStrictEqual(best('A B'), [950, 950, 950]);
  assert.deepStrictEqual(best('C D'), [475, 475, 475]);
  assert.deepStrictEqual(best('E F'), [950, 950, 475]);

  // No bar is under par: the best of a class nobody has shot well in is not worth a full 1000.
  const [low] = rank([asa('G H', [270, 270, 270], { orgClass: 'Traditional 30' })]);
  assert.strictEqual(engine.rules.asaPar, 300);
  assert.strictEqual(low.bestNPS, Math.round(270 / 300 * 1000 * 0.95 * 1.08 * 1.03));

  const result = engine.computeRankings({ asaShooters: [asa('A B', [340, 300, 300]), asa('G H', [270, 270, 270], { orgClass: 'Traditional 30' })], tfaaShooters: [], tfaaIndoorShooters: [], stateRecordDetails: [] });
  assert.deepStrictEqual(result.sources.asaBars, { "Men's Pins 30": 340, 'Traditional 30': 300 });
});

test('a Texas ASA score above the most a round can score is left out', () => {
  const table = engine.parseGvizTable(sources.gviz(
    ['ASA NUMBER', 'FIRST NAME', 'LAST NAME', 'TOTAL EVENTS', 'TOTAL SCORE', 'A', 'B', 'STATE'],
    [[1, 'KOREY', 'TWELVES', '71695', 'Tyler', 3020, 302, 298]]
  ));
  const [archer] = engine.parseAsaRows(table, engine.ASA_TABS[0], 2026);
  assert.deepStrictEqual(archer.eventScores, [302, 298]);
  assert.deepStrictEqual(archer.isState, [false, true]);
  assert.strictEqual(archer.asaNumber, '71695');
});

test('a State Championship round earns the same bonus in every organization', () => {
  assert.strictEqual(engine.rules.stateRoundBonus, 1.05);
  const [texasAsa] = rank([{ ...asa('A B', [360, 360, 360]), isState: [false, false, true] }]);
  assert.deepStrictEqual(texasAsa.rounds.map(r => r.nps), [Math.round(950 * 1.05), 950, 950]);
  const [outdoor] = rank([tfaaOutdoor('C D', 'Freestyle (FS)', [560, 560, 560], ['sywat', 'field', 'hunter'])]);
  assert.deepStrictEqual(outdoor.rounds.map(r => r.nps), [Math.round(1080 * 1.05), Math.round(1080 * 1.05), 1080]);
  const [indoor] = rank([tfaaIndoorState('E F', 'Freestyle (FS)', [600, 600, 600])]);
  assert.strictEqual(indoor.bestNPS, Math.round(1000 * 1.05));
});

test('a round counts in full in the newest season of its organization, and for less each season before', () => {
  assert.deepStrictEqual(engine.rules.recencyWeights, [1, 0.95, 0.9]);
  const season = (name, when) => ({ ...asa(name, [360, 360, 360]), when });
  const ranked = rank([season('New Er', 2026), season('Mid Dle', 2025), season('Old Er', 2024), season('Old Est', 2023)]);
  const best = name => ranked.find(r => r.name === name).bestNPS;
  assert.deepStrictEqual([best('New Er'), best('Mid Dle'), best('Old Er'), best('Old Est')], [950, Math.round(1000 * (0.95 * 0.95)), 855, 855]);

  // The seasons of another organization do not age this one's: its own newest season is full value.
  const indoor = { ...tfaaIndoorState('In Door', 'Freestyle (FS)', [600, 600, 600]), when: 2024.5 };
  const [only] = rank([indoor, season('New Er', 2026)]).filter(r => r.name === 'In Door');
  assert.strictEqual(only.bestNPS, Math.round(1000 * 1.05));
});

test('the event bonus goes by the events of the busiest year, not the three years together', () => {
  const season = (when, n) => ({ ...asa('A B', Array(n).fill(360)), when });
  // Three events a year for three years: nine events, but never more than three in a year.
  const [steady] = rank([season(2024, 3), season(2025, 3), season(2026, 3)]);
  assert.strictEqual(steady.events, 9);
  assert.strictEqual(steady.yearEvents, 3);
  assert.strictEqual(steady.avgNPS, Math.round((950 * 3 + Math.round(1000 * (0.95 * 0.95)) * 2) / 5));
  // Eight in one year earns the full 1.06.
  const [busy] = rank([season(2026, 8)]);
  assert.strictEqual(busy.avgNPS, Math.round(950 * 1.06));
  // The indoor winter belongs with the outdoor and Texas ASA season that follow it.
  const indoor = { ...tfaaIndoorState('A B', 'Freestyle (FS)', [600, 600]), when: 2025.5 };
  const [both] = rank([indoor, season(2026, 3)]);
  assert.strictEqual(both.yearEvents, 5);
});

// ---- Titles: Shooter of the Year and State Champion ----

const titleLines = titles => titles.map(t => [t.season, t.org, t.kind, t.orgClass, t.name].join(' | ')).sort();

test('Texas ASA titles come from the TOTAL SCORE and STATE columns of a finished season', async () => {
  const { titles } = await engine.readSources(fakeFetch());
  assert.deepStrictEqual(titleLines(titles.filter(t => t.org === 'TX ASA')), [
    // 2025: one State score. Nobody has the five qualifiers a total needs.
    '2025 | TX ASA | state | Senior Known 50 | LEE GREYBEARD',
    // 2026: Men's Open 45 has three archers with five scores, and Riley the best total and State score.
    // Pat and Avery have only the best State score of their class.
    "2026 | TX ASA | soy | Men's Open 45 | RILEY STABILIZER",
    "2026 | TX ASA | state | Known 50 | PAT O'NOCK",
    "2026 | TX ASA | state | Men's Open 45 | RILEY STABILIZER",
    '2026 | TX ASA | state | Open Pro | AVERY QUILLFEATHER'
  ]);
});

test('a Texas ASA season names nobody until its State Championship has been shot', () => {
  const tab = engine.ASA_TABS.find(t => t.name === 'Known 50');
  const shooter = (name, soyTotal, stateScore) => ({ name, soyTotal, stateScore });
  const leading = [{ tab, shooters: [shooter('A B', 1600.004, 0), shooter('C D', 1590.002, 0)] }];
  assert.deepStrictEqual(engine.asaTitlesOf(2026, leading), []);

  // The decimals count 12s: they break a tie on points, and an exact tie is shared.
  const finished = [{ tab, shooters: [shooter('A B', 1900.004, 310.0005), shooter('C D', 1900.006, 310.0005), shooter('E F', 1700, 300), shooter('G H', 0, 0)] }];
  assert.deepStrictEqual(titleLines(engine.asaTitlesOf(2026, finished)), [
    '2026 | TX ASA | soy | Known 50 | C D',
    '2026 | TX ASA | state | Known 50 | A B',
    '2026 | TX ASA | state | Known 50 | C D'
  ]);

  // A sheet whose totals have been cleared: the Shooter of the Year is worked out from the scores.
  const cleared = [{ tab, shooters: [
    { ...shooter('A B', 0, 310), soyWorkedOut: 1900 }, { ...shooter('C D', 0, 0), soyWorkedOut: 1910 }, { ...shooter('E F', 0, 300), soyWorkedOut: 1800 }
  ] }];
  assert.deepStrictEqual(titleLines(engine.asaTitlesOf(2025, cleared)), ['2025 | TX ASA | soy | Known 50 | C D', '2025 | TX ASA | state | Known 50 | A B']);

  // Texas ASA gives the award only where three archers have a total: with two, there is a State Champion alone.
  const thin = [{ tab, shooters: [shooter('A B', 1900.004, 310.0005), shooter('C D', 1850, 0), shooter('E F', 0, 300)] }];
  assert.deepStrictEqual(titleLines(engine.asaTitlesOf(2026, thin)), ['2026 | TX ASA | state | Known 50 | A B']);
});

test('a Texas ASA row carries its total, its State score and the year of its events', () => {
  const table = engine.parseGvizTable(sources.gviz(
    ['ASA NUMBER', 'FIRST NAME', 'LAST NAME', 'TOTAL EVENTS', 'TOTAL SCORE', 'BROWNWOOD', 'STATE', '', 'STATE', ''],
    [[1, 'KOREY', 'TWELVES', '71695', 'Tyler', { v: 328.0014, f: '328.0014' }, { v: 298.0004, f: '298.0004' }]]
  ));
  table.rows[0].c[4] = { v: '#NUM!' };
  const [archer] = engine.parseAsaRows(table, engine.ASA_TABS[0], 2026);
  assert.deepStrictEqual(archer.eventNames, ['2026 BROWNWOOD', '2026 STATE']);
  assert.deepStrictEqual(archer.eventScores, [328, 298]);
  assert.strictEqual(archer.stateScore, 298.0004);
  assert.strictEqual(archer.soyTotal, 0);
  assert.strictEqual(archer.soyWorkedOut, 0);

  // Five qualifiers and State: the best five qualifiers plus the State score, the cell after STATE left out.
  const full = engine.parseGvizTable(sources.gviz(
    ['ASA NUMBER', 'FIRST NAME', 'LAST NAME', 'TOTAL EVENTS', 'TOTAL SCORE', 'A', 'B', 'C', 'D', 'E', 'F', 'STATE', ''],
    [[1, 'KOREY', 'TWELVES', '71695', 'Tyler', 300, 310, 320, 290, 305, 315, 298, 12]]
  ));
  const [six] = engine.parseAsaRows(full, engine.ASA_TABS[0], 2025);
  assert.strictEqual(six.soyWorkedOut, 320 + 315 + 310 + 305 + 300 + 298);
  assert.strictEqual(six.soyTotal, six.soyWorkedOut);
});

test('a TFAA Shooter of the Year needs three SYWAT scores and the State score; the State Champion has the best State score', () => {
  const page = outdoorPage([freestyle('Adult Male', [
    [1, 'Quillfeather, Avery', 540, 545, 538, 1085, 2708],
    // The best three rounds, but no State score: not in the running for the aggregate.
    [2, 'Stabilizer, Riley', 550, 551, 552, 0, 1653],
    // The best State score, but only two rounds.
    [3, 'Fletcher, Jordan', 520, 0, 510, 1090, 2120],
    // Listed a second time with the State score alone: still one title.
    [4, 'Fletcher, Jordan', 0, 0, 0, 1090, 1090],
    // Above the round maximum, so left out of the ranking, but it cannot win here.
    [5, 'Onceonly, Toby', 608, 0, 0, 0, 608]
  ]), freestyle('Cub Male', [[1, 'Little, Cub', 280, 290, 285, 0, 855]])]);
  assert.deepStrictEqual(titleLines(engine.parseTfaaPage(page, '2026 Outdoor', 'outdoor').titles), [
    '2026 | TFAA Outdoor | soy | Adult Male - Freestyle (FS) | Quillfeather, Avery',
    '2026 | TFAA Outdoor | state | Adult Male - Freestyle (FS) | Fletcher, Jordan'
  ]);
});

test('a title is won with a score above the round maximum, though the score is left out of the ranking', () => {
  const page = outdoorPage([freestyle('Adult Male', [
    [1, 'Overdraw, Jesse', 629, 627, 623, 1231, 3110],
    [2, 'Quillfeather, Avery', 560, 559, 558, 1120, 2797]
  ])]);
  const { titles, shooters } = engine.parseTfaaPage(page, '2025 Outdoor', 'outdoor');
  assert.deepStrictEqual(shooters.map(a => a.name), ['Quillfeather, Avery']);
  assert.deepStrictEqual(titleLines(titles), [
    '2025 | TFAA Outdoor | soy | Adult Male - Freestyle (FS) | Overdraw, Jesse',
    '2025 | TFAA Outdoor | state | Adult Male - Freestyle (FS) | Overdraw, Jesse'
  ]);
});

test('indoors the X count breaks a tie, and an exact tie is shared', () => {
  const page = indoorPage([freestyle('Adult Male', [
    [1, 'Quillfeather, Avery', 300, 60, 300, 58, 300, 57, 600, 110, 1500, 285],
    [2, 'Mcarrow, Dana', 300, 60, 300, 60, 300, 60, 600, 108, 1500, 288],
    [3, 'Bolt, Taylor', 299, 40, 298, 41, 297, 39, 600, 110, 1494, 230]
  ])]);
  assert.deepStrictEqual(titleLines(engine.parseTfaaPage(page, '2025-2026 Indoor', 'indoor').titles), [
    '2025-2026 | TFAA Indoor | soy | Adult Male - Freestyle (FS) | Mcarrow, Dana',
    '2025-2026 | TFAA Indoor | state | Adult Male - Freestyle (FS) | Bolt, Taylor',
    '2025-2026 | TFAA Indoor | state | Adult Male - Freestyle (FS) | Quillfeather, Avery'
  ]);
});

test('a season still being shot has no titles', () => {
  const page = indoorPage([freestyle('Adult Male', [[1, 'Quillfeather, Avery', 300, 60, 300, 58, 300, 57, 0, 0, 900, 175]])]);
  assert.deepStrictEqual(engine.parseTfaaPage(page, '2026-2027 Indoor', 'indoor').titles, []);
});

test('titles show on the ranking for the equipment class they were won in, newest first', () => {
  const compound = asa('Casey Stringwalker', [300, 300, 300]);
  const barebow = { ...tfaaOutdoor('Stringwalker, Casey', 'Barebow Recurve (BBR)', [400, 400, 400], ['sywat', 'sywat', 'sywat']) };
  const title = (kind, org, season, orgClass, name) => ({ kind, org, season, orgClass, name });
  const result = engine.computeRankings({
    asaShooters: [compound], tfaaShooters: [barebow], tfaaIndoorShooters: [], stateRecordDetails: [],
    titles: [
      title('state', 'TFAA Outdoor', '2024', 'Adult Male - Barebow Recurve (BBR)', 'Stringwalker, Casey'),
      title('soy', 'TFAA Indoor', '2025-2026', 'Adult Male - Barebow Recurve (BBR)', 'Stringwalker, Casey'),
      title('state', 'TFAA Indoor', '2025-2026', 'Adult Male - Barebow Recurve (BBR)', 'Stringwalker, Casey'),
      title('soy', 'TX ASA', '2026', 'Open Pro', 'CASEY STRINGWALKER'),
      // Won by somebody who is not ranked: it has nowhere to show.
      title('soy', 'TX ASA', '2026', 'Known 50', 'NOT RANKED')
    ]
  });
  const by = cls => result.adult.find(r => r.equipmentClass === cls);
  assert.deepStrictEqual(by('Barebow').titles.map(t => t.season + ' ' + t.kind), ['2025-2026 soy', '2025-2026 state', '2024 state']);
  assert.deepStrictEqual(by('Compound').titles, [{ kind: 'soy', org: 'TX ASA', season: '2026', orgClass: 'Open Pro', field: 1, bonus: false, past: false }]);
  assert.strictEqual(result.sources.titleHolders, 1);
  assert.strictEqual(result.sources.soyTitles, 2);
  assert.strictEqual(result.sources.stateTitles, 2);
});

test('the made-up pages give their title holders a trophy and a star to show', async () => {
  const { result } = await build();
  const avery = result.adult.find(r => r.name === 'Avery Quillfeather');
  assert.deepStrictEqual(avery.titles.map(t => [t.season, t.org, t.kind].join(' ')), [
    '2025-2026 TFAA Indoor soy', '2026 TFAA Outdoor soy', '2025-2026 TFAA Indoor state', '2026 TFAA Outdoor state', '2026 TX ASA state',
    '2024-2025 TFAA Indoor soy', '2025 TFAA Outdoor soy', '2024-2025 TFAA Indoor state', '2025 TFAA Outdoor state'
  ]);
});

// ---- Adult or youth, and equal scores ----

test('an archer who has moved up to an adult TFAA age group is ranked with the adults', () => {
  const tfaa = (age, when) => ({ ...tfaaOutdoor('Nockpoint, Jamie', 'Freestyle (FS)', [500, 500, 500], ['sywat', 'sywat', 'sywat']), orgClass: (age === 'youth' ? 'Young Adult Male' : 'Adult Male') + ' - Freestyle (FS)', age, when });
  const list = shooters => {
    const result = engine.computeRankings({ asaShooters: shooters.filter(s => s.org === 'TX ASA'), tfaaShooters: shooters.filter(s => s.org !== 'TX ASA'), tfaaIndoorShooters: [], stateRecordDetails: [] });
    return result.adult.length ? 'adult' : 'youth';
  };
  assert.strictEqual(list([tfaa('youth', 2024), tfaa('adult', 2026)]), 'adult');
  assert.strictEqual(list([tfaa('adult', 2024), tfaa('youth', 2026)]), 'youth');
  // Both in the newest season: still a youth.
  assert.strictEqual(list([tfaa('youth', 2026), tfaa('adult', 2026)]), 'youth');
  // A young archer may shoot up into an adult Texas ASA class: the TFAA age group is believed.
  assert.strictEqual(list([tfaa('youth', 2025), { ...asa('Jamie Nockpoint', [300, 300, 300]), when: 2026 }]), 'youth');
  // With Texas ASA results alone, the newest season decides.
  assert.strictEqual(list([{ ...asa('Jamie Nockpoint', [300, 300, 300]), age: 'youth', when: 2024 }, { ...asa('Jamie Nockpoint', [300, 300, 300]), when: 2026 }]), 'adult');
});

test('equal TAGR scores are listed in the same order every time: better best round first, then by name', () => {
  const ranked = rank([asa('Zed Last', [360, 360, 360]), asa('Amy First', [360, 360, 360]), asa('Bo Peak', [360, 360, 360])]);
  assert.deepStrictEqual(ranked.map(r => r.avgNPS), [570, 570, 570]);
  assert.deepStrictEqual(ranked.map(r => r.name), ['Amy First', 'Bo Peak', 'Zed Last']);
});

test('a Shooter of the Year and a State Champion each earn a bonus, once, for a title won against somebody', () => {
  const { soyTitleBonus, stateTitleBonus, titleBonusMinField } = engine.rules;
  assert.deepStrictEqual([soyTitleBonus, stateTitleBonus, titleBonusMinField], [1.03, 1.02, 2]);
  const score = titles => {
    const result = engine.computeRankings({
      asaShooters: [asa('A B', [360, 360, 360])], tfaaShooters: [], tfaaIndoorShooters: [], stateRecordDetails: [],
      titles: titles.map(([kind, season, field]) => ({ kind, season, field, org: 'TX ASA', orgClass: "Men's Pins 30", name: 'A B' }))
    });
    return [result.adult[0].avgNPS, result.adult[0].titleBonus];
  };
  assert.deepStrictEqual(score([]), [570, 1]);
  assert.deepStrictEqual(score([['soy', '2026', 3]]), [Math.round(570 * 1.03), 1.03]);
  assert.deepStrictEqual(score([['state', '2026', 2]]), [Math.round(570 * 1.02), 1.02]);
  assert.deepStrictEqual(score([['soy', '2026', 3], ['state', '2026', 2]]), [Math.round(570 * 1.03 * 1.02), 1.0506]);
  // Three Shooter of the Year titles are still one bonus.
  assert.deepStrictEqual(score([['soy', '2026', 3], ['soy', '2025', 4], ['soy', '2024', 5]]), [Math.round(570 * 1.03), 1.03]);
  // The only archer in the class holds the title, without the bonus.
  assert.deepStrictEqual(score([['state', '2026', 1]]), [570, 1]);
  assert.deepStrictEqual(score([['state', '2026', 1], ['state', '2025', 2]]), [Math.round(570 * 1.02), 1.02]);
});

test('a title says how many archers were in the running for it', () => {
  const page = outdoorPage([freestyle('Adult Male', [
    [1, 'Quillfeather, Avery', 540, 545, 538, 1085, 2708],
    [2, 'Stabilizer, Riley', 550, 551, 552, 0, 1653],
    [3, 'Fletcher, Jordan', 520, 0, 510, 1090, 2120],
    [4, 'Fletcher, Jordan', 0, 0, 0, 1090, 1090]
  ])]);
  const fields = engine.parseTfaaPage(page, '2026 Outdoor', 'outdoor').titles.map(t => [t.kind, t.name, t.field]);
  // Only Avery has the three rounds and the State score; two archers shot State, one of them listed twice.
  assert.deepStrictEqual(fields, [['soy', 'Quillfeather, Avery', 1], ['state', 'Fletcher, Jordan', 2]]);
});

// ---- Who an archer beat at State ----

test('a round earns more for beating highly ranked archers than low ranked ones, up to 5%', () => {
  const { fieldBonusMax, fieldBeatTop, fieldStandingPower } = engine.rules;
  assert.deepStrictEqual([fieldBonusMax, fieldBeatTop, fieldStandingPower], [0.05, 0.025, 3]);

  // Four archers in one class at one State Championship ("e1"), and each with two more rounds elsewhere.
  const at = (name, shoot, elsewhere) => ({
    ...asa(name, [shoot, elsewhere, elsewhere]),
    eventKeys: ['e1', null, null], fieldScores: [shoot, elsewhere, elsewhere]
  });
  // Before any bonus they stand: Top, Mid, Low, Last (on their two other rounds).
  const ranked = rank([at('Top Dog', 300, 360), at('Mid Field', 310, 330), at('Low Down', 320, 300), at('Last One', 330, 270)]);
  const shoot = name => ranked.find(r => r.name === name).rounds.find(x => x.field > 0);

  // Last One won the shoot: they beat all three, among them the best-ranked archer.
  // The standings are 1, 0.75, 0.5 and 0.25, and each archer beaten adds 2.5% of the cube of theirs.
  assert.deepStrictEqual([shoot('Last One').beat, shoot('Last One').field], [3, 3]);
  assert.strictEqual(shoot('Last One').fieldBonus, Math.round(0.025 * (1 + 0.75 ** 3 + 0.5 ** 3) * 10000) / 10000);
  // Low Down beat the two best: more than Mid Field earns for beating only the best.
  assert.strictEqual(shoot('Low Down').fieldBonus, Math.round(0.025 * (1 + 0.75 ** 3) * 10000) / 10000);
  assert.strictEqual(shoot('Mid Field').fieldBonus, 0.025);
  // Top Dog was last at the shoot: nobody beaten, no bonus.
  assert.deepStrictEqual([shoot('Top Dog').beat, shoot('Top Dog').fieldBonus], [0, 0]);
  // The bonus is on the round's NPS.
  assert.strictEqual(shoot('Mid Field').nps, Math.round(310 / 360 * 1000 * 0.95 * 1.025));
});

test('beating low ranked archers earns little, an equal score beats nobody, and the bonus stops at 5%', () => {
  const at = (name, shoot, elsewhere) => ({
    ...asa(name, [shoot, elsewhere, elsewhere]),
    eventKeys: ['e1', null, null], fieldScores: [shoot, elsewhere, elsewhere]
  });
  // Six strong archers, and one who beat them all at the shoot: capped.
  const strong = ['A', 'B', 'C', 'D', 'E', 'F'].map((n, i) => at(n + ' Strong', 300, 360 - i));
  const ranked = rank([...strong, at('Giant Killer', 350, 200)]);
  assert.strictEqual(ranked.find(r => r.name === 'Giant Killer').rounds.find(x => x.field > 0).fieldBonus, 0.05);

  // The same win over archers at the bottom of the ranking is worth a fraction of that.
  const weak = ['A', 'B', 'C', 'D', 'E', 'F'].map((n, i) => at(n + ' Weak', 200, 150 - i));
  const others = ['G', 'H', 'I', 'J', 'K', 'L', 'M', 'N'].map((n, i) => asa(n + ' Other', [340 - i, 340 - i, 340 - i]));
  const low = rank([...weak, ...others, at('Flat Track', 350, 300)]).find(r => r.name === 'Flat Track').rounds.find(x => x.field > 0);
  assert.strictEqual(low.beat, 6);
  assert.ok(low.fieldBonus > 0 && low.fieldBonus < 0.01, 'bonus was ' + low.fieldBonus);

  // An equal score is not a win, and an archer without a full ranking adds nothing.
  const tied = rank([at('One Tied', 300, 300), at('Two Tied', 300, 300), { ...asa('New Comer', [100]), eventKeys: ['e1'], fieldScores: [100] }]);
  const one = tied.find(r => r.name === 'One Tied').rounds.find(x => x.field > 0);
  assert.deepStrictEqual([one.field, one.beat, one.fieldBonus], [2, 1, 0]);
});

test('a shoot nobody else shot in the class earns no bonus', () => {
  const [alone] = rank([{ ...asa('A B', [300, 300, 300]), eventKeys: ['e1', 'e2', 'e3'], fieldScores: [300, 300, 300] }]);
  assert.deepStrictEqual(alone.rounds.map(x => [x.field, x.beat, x.fieldBonus]), [[0, 0, 0], [0, 0, 0], [0, 0, 0]]);
  assert.strictEqual(alone.avgNPS, Math.round(Math.round(300 / 300 * 950) * 3 / 5));
});

test('only a State Championship round earns the bonus, in Texas ASA and in TFAA', async () => {
  // A Texas ASA row: its qualifiers name no shoot to be compared at, its State score does.
  const table = engine.parseGvizTable(sources.gviz(
    ['ASA NUMBER', 'FIRST NAME', 'LAST NAME', 'TOTAL EVENTS', 'TOTAL SCORE', 'A', 'B', 'STATE'],
    [[1, 'KOREY', 'TWELVES', '71695', 'Tyler', 310, 302, { v: 298.0004, f: '298.0004' }]]
  ));
  const [archer] = engine.parseAsaRows(table, engine.ASA_TABS[0], 2026);
  assert.deepStrictEqual(archer.eventKeys, [null, null, 'asa-state:2026:Open Pro:7']);
  assert.deepStrictEqual(archer.fieldScores, [310, 302, 298.0004]);

  const { result, problems } = await build();
  assert.deepStrictEqual(problems, []);
  const avery = result.adult.find(r => r.name === 'Avery Quillfeather');
  const round = event => avery.rounds.find(x => x.event === event);
  // At State Outdoor, Avery beat the one other archer of the division with a State score.
  assert.deepStrictEqual([round('2026 State Outdoor (Field)').field, round('2026 State Outdoor (Field)').beat], [1, 1]);
  assert.ok(round('2026 State Outdoor (Field)').fieldBonus > 0);
  // A SYWAT round and a Texas ASA qualifier have no field, whoever else shot them.
  assert.deepStrictEqual([round('2026 SYWAT #2').field, round('2026 SYWAT #2').fieldBonus], [0, 0]);
  assert.deepStrictEqual([round('2026 PARIS').field, round('2026 PARIS').fieldBonus], [0, 0]);
  for (const r of result.adult.concat(result.youth)) {
    for (const x of r.rounds) assert.ok(x.field === 0 || /state/i.test(x.event), r.name + ': ' + x.event);
  }
});

// ---- The saved copies of the Texas ASA sheet ----

const withoutTime = result => JSON.stringify(withoutTimestamp(result));
// The sheet after Texas ASA has cleared it: every class tab with its headings and no archers.
const clearedSheet = { [sources.ASA_2026]: sources.EMPTY_TAB };

test('the sheet is handed back as it should be saved: its year and its class tabs, without the empty rows', async () => {
  const { asaLive } = await build();
  assert.strictEqual(asaLive.year, 2026);
  const openPro = asaLive.tabs['Open Pro'];
  assert.deepStrictEqual(openPro.cols.slice(0, 5).map(c => c.label), ['ASA NUMBER', 'FIRST NAME', 'LAST NAME', 'TOTAL EVENTS', 'TOTAL SCORE']);
  // The row with no name is dropped; the archer with no scores is kept, as the sheet has them.
  assert.deepStrictEqual(openPro.rows.map(r => r.c[1].v + ' ' + r.c[2].v), ['AVERY QUILLFEATHER', 'DANA MCARROW', 'NO SCORES']);
});

test('with a saved copy of the year the sheet still holds, nothing changes', async () => {
  const plain = await build();
  const copy = { year: 2026, savedAt: '2026-11-17T12:00:00.000Z', tabs: plain.asaLive.tabs };
  const again = await engine.buildRankings({ fetchText: fakeFetch(), asaSnapshots: [copy] });
  assert.strictEqual(again.asaLive.year, 2026);
  assert.strictEqual(withoutTime(again.result), withoutTime(plain.result));
});

test('once Texas ASA clears the sheet, the year is read from the saved copy and the sheet is the next year', async () => {
  const plain = await build();
  const copy = { year: 2026, savedAt: '2026-11-17T12:00:00.000Z', tabs: plain.asaLive.tabs };
  const asked = [];
  const fetch = fakeFetch(clearedSheet);
  const cleared = await engine.buildRankings({ fetchText: url => { asked.push(url); return fetch(url); }, asaSnapshots: [copy] });
  assert.deepStrictEqual(cleared.problems, []);
  assert.strictEqual(cleared.asaLive.year, 2027);
  // The standings are the same: nobody has shot in 2027, so 2026, 2025 and 2024 are still the three years.
  assert.strictEqual(withoutTime(cleared.result), withoutTime(plain.result));
  const riley = cleared.pages.find(p => p.what === "TX ASA 2026, Men's Open 45");
  assert.deepStrictEqual([riley.url, riley.results, riley.note], ['archive/asa-2026.json', 3, 'from the saved copy of the sheet']);
  assert.ok(asked.some(u => u.includes(sources.ASA_2024)));
});

test('when the new season has scores it is ranked as the new year, and the oldest year drops out', async () => {
  const plain = await build();
  const copy = { year: 2026, savedAt: '2026-11-17T12:00:00.000Z', tabs: plain.asaLive.tabs };
  // 2027: the sheet holds one class, with new archers and new shoots.
  const newSeason = sources.gviz(
    ['ASA NUMBER', 'FIRST NAME', 'LAST NAME', 'TOTAL EVENTS', 'TOTAL SCORE', 'TYLER', 'WACO', 'STATE'],
    [[1, 'NEW', 'SEASON', 'TX2001', 'Tyler', 301, 305, null], [2, 'AVERY', 'QUILLFEATHER', 'TX1001', 'Paris', 333, null, null]]
  );
  const asked = [];
  const fetch = fakeFetch({ 'gid=795531792': newSeason, ...clearedSheet });
  const next = await engine.buildRankings({ fetchText: url => { asked.push(url); return fetch(url); }, asaSnapshots: [copy] });
  assert.strictEqual(next.asaLive.year, 2027);
  const avery = next.result.adult.find(r => r.name === 'Avery Quillfeather');
  assert.ok(avery.rounds.some(x => x.event === '2027 TYLER'));
  assert.ok(avery.rounds.some(x => x.event === '2026 PARIS'));
  // 2027, 2026 and 2025 are ranked: the 2024 sheet is not even asked for.
  assert.ok(asked.some(u => u.includes(sources.ASA_2025)));
  assert.ok(!asked.some(u => u.includes(sources.ASA_2024)));
  assert.ok(!avery.rounds.some(x => /^2024 /.test(x.event) && x.org === 'TX ASA'));
});

test('a season going on is the same season as its copy; a class cleared early is read from the copy', async () => {
  const plain = await build();
  const copy = { year: 2026, savedAt: '2026-11-17T12:00:00.000Z', tabs: plain.asaLive.tabs };
  assert.strictEqual(engine.sameAsaSeason(copy, plain.asaLive.tabs), true);
  assert.strictEqual(engine.sameAsaSeason(copy, {}), false);
  // One class tab comes back empty while the rest of the sheet is as it was.
  const partly = await engine.buildRankings({ fetchText: fakeFetch({ 'gid=160365011': sources.EMPTY_TAB }), asaSnapshots: [copy] });
  assert.strictEqual(partly.asaLive.year, 2026);
  assert.strictEqual(withoutTime(partly.result), withoutTime(plain.result));
  assert.strictEqual(partly.pages.find(p => p.what === "TX ASA 2026, Men's Open 45").note, 'the saved copy has more scores than the sheet, so it is used');
  // What is handed back to be saved keeps that class.
  assert.strictEqual(partly.asaLive.tabs["Men's Open 45"].rows.length, 3);
});

// ---- Titles of the seasons before the ranked ones ----

test('the State Championship of a season is the State shoot that is not the 900 round, the 3D shoot or an overflow line', () => {
  const list = sources.tfaaShootList(22, [
    [595, '03/02/2018 - 03/04/2018', '2018 TFAA State Indoor - OVERFLOW LINE'], [546, '03/02/2018 - 03/04/2018', '2018 TFAA State Indoor Championship'],
    [600, '09/15/2018 - 09/16/2018', '2018 - State 900 Round'], [599, '09/15/2018 - 09/16/2018', '2018 - State Known 3D'], [500, '01/13/2018 - 01/14/2018', 'Arena Archery - 1']
  ]);
  assert.deepStrictEqual(engine.parseTfaaStateShoots(list), ['546']);
});

test('the champions of a State Championship are the archers placed first in each division', () => {
  const champions = engine.parseTfaaStateChampions(sources.responseFor(TFAA + '/results/9011'), 'TFAA Indoor', '2022-2023');
  assert.deepStrictEqual(champions, [
    { name: 'Shelfshooter, Robin', org: 'TFAA Indoor', orgClass: 'Adult Male - Barebow Recurve (BBR)', kind: 'state', season: '2022-2023', field: 2, past: true },
    { name: 'Yew, Stick', org: 'TFAA Indoor', orgClass: 'Adult Male - Longbow (LB)', kind: 'state', season: '2022-2023', field: 1, past: true }
  ]);
});

test('titles from before the ranked seasons are shown, from the State Championship\'s own results, and earn no bonus', async () => {
  const { titles } = await engine.readSources(fakeFetch());
  assert.deepStrictEqual(titleLines(titles.filter(t => t.past)), [
    // Casey is Shooter of the Year on the standings. Robin is State Champion on the
    // Championship's results, though the standings' State column has Casey's day ahead.
    '2022-2023 | TFAA Indoor | soy | Adult Male - Barebow Recurve (BBR) | Stringwalker, Casey',
    '2022-2023 | TFAA Indoor | soy | Adult Male - Longbow (LB) | Yew, Stick',
    '2022-2023 | TFAA Indoor | state | Adult Male - Barebow Recurve (BBR) | Shelfshooter, Robin',
    '2022-2023 | TFAA Indoor | state | Adult Male - Longbow (LB) | Yew, Stick'
  ]);

  const { result, pages, problems } = await build();
  assert.deepStrictEqual(problems, []);
  assert.strictEqual(pages.find(p => p.what === 'TFAA 2022-2023 Indoor titles').results, 4);
  const casey = result.adult.find(r => r.name === 'Casey Stringwalker' && r.equipmentClass === 'Barebow');
  const old = casey.titles.find(t => t.season === '2022-2023');
  assert.deepStrictEqual([old.kind, old.past, old.bonus], ['soy', true, false]);
  // Robin is ranked in Traditional only now: the barebow title of 2023 still shows, on that ranking.
  const robin = result.adult.find(r => r.name === 'Robin Shelfshooter');
  assert.strictEqual(robin.equipmentClass, 'Traditional');
  assert.ok(robin.titles.some(t => t.season === '2022-2023' && t.kind === 'state' && t.past));

  // With only a past title there is no bonus.
  const bonus = titles => engine.computeRankings({
    asaShooters: [asa('A B', [360, 360, 360])], tfaaShooters: [], tfaaIndoorShooters: [], stateRecordDetails: [],
    titles: titles.map(past => ({ kind: 'soy', season: '2020', field: 9, org: 'TX ASA', orgClass: "Men's Pins 30", name: 'A B', past }))
  }).adult[0].titleBonus;
  assert.strictEqual(bonus([true]), 1);
  assert.strictEqual(bonus([true, false]), 1.03);
});

test('a page of an earlier season that cannot be read is noted, and never a problem', async () => {
  const { pages, problems } = await build({ '/results/9011': new Error('HTTP 500'), '/results/sywat/35': new Error('HTTP 500') });
  assert.deepStrictEqual(problems, []);
  assert.strictEqual(pages.find(p => p.what === 'TFAA 2022-2023 Indoor titles').note, 'its State Championship results could not be read');
  assert.strictEqual(pages.find(p => p.what === 'TFAA 2023 Outdoor titles').note, 'could not be read');
});
