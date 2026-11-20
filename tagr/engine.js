'use strict';

// TAGR (Texas Archery Global Ranking) engine.
//
// Reads the Texas ASA standings sheets and the TFAA results and records
// pages, turns every score into a Normalized Performance Score (NPS), and
// ranks archers on the average of their best five. It knows nothing about
// Express or the database, so the site, a script and the tests all run the
// same code.

// ---- TX ASA: the Shooter of the Year sheet, and the 2025 and 2024 sheets ----
// Texas ASA keeps one sheet for the season being shot and clears it for the
// next, keeping no copy. So the site saves its own copy of the sheet at every
// rebuild (archive/asa-<year>.json), and a year the sheet no longer holds is
// read from its saved copy. ASA_LIVE_YEAR is the year the sheet held when
// there is no saved copy to tell by.
const ASA_SOY_SHEET = '1xZyOXGonL0NljMLx0suiGWy85JkSWLR7LIUaK0_P1FE';
const ASA_LIVE_YEAR = 2026;
// How many Texas ASA years are ranked, counting the one being shot.
const ASA_YEARS_RANKED = 3;
const ASA_ARCHIVE_SHEETS = [
  { id: '1_JG82xQPkp-qsKmsHcxMRsWOcifCJy8ANfzGjf0FoAk', year: 2025 },
  { id: '10zDwD5voueDqoNhHMDrMezOIvVT2atpGHFc2_kVmfIc', year: 2024 }
];
// One row per Texas ASA class.
//   name      what the site calls the class
//   gid       the class's tab in the 2026 sheet, or `tab`, the tab's name, where
//             the gid is not known. With neither, the 2026 sheet has no such class.
//   archive   the tab's name in the 2025 and 2024 sheets when it is not `name`,
//             or null when those sheets have no such class
//   age, known (known distance) and maxYards are what the scoring rules use.
// Tab names must match the sheet exactly, apostrophes included: asked for a
// tab it does not have, a sheet answers with its summary tab, not an error.
const ASA_TABS = [
  { name: 'Open Pro', gid: '795531792', age: 'adult', known: false, maxYards: 50 },
  { name: 'Semi Pro', gid: '833527519', age: 'adult', known: false, maxYards: 50 },
  { name: "Men's Open 45", gid: '160365011', age: 'adult', known: false, maxYards: 45 },
  { name: "Men's Open 40", gid: '1272224932', age: 'adult', known: false, maxYards: 40 },
  { name: "Men's Hunter 45", gid: '1793524690', age: 'adult', known: false, maxYards: 45 },
  { name: "Men's Pins 40", gid: '1480076688', age: 'adult', known: false, maxYards: 40 },
  { name: "Men's Pins 30", gid: '370061797', age: 'adult', known: false, maxYards: 30 },
  { name: 'Known Pro', gid: '1772574521', age: 'adult', known: true, maxYards: 50 },
  { name: 'Known 50', gid: '1270453854', age: 'adult', known: true, maxYards: 50 },
  { name: 'Known 45', gid: '273753088', age: 'adult', known: true, maxYards: 45 },
  { name: 'Known 40', gid: '938571765', age: 'adult', known: true, maxYards: 40 },
  { name: 'W. Known Pro', gid: '623550275', archive: null, age: 'adult', known: true, maxYards: 45 },
  { name: 'W. Known 45', gid: '253027267', age: 'adult', known: true, maxYards: 45 },
  { name: 'W. Known 40', gid: '242764875', age: 'adult', known: true, maxYards: 40 },
  { name: 'W. Pins 40', gid: '2060860567', age: 'adult', known: false, maxYards: 40 },
  { name: 'W. Pins 30', gid: '751585993', age: 'adult', known: false, maxYards: 30 },
  { name: 'Senior Known 50', gid: '320204999', archive: 'Sr. Known 50', age: 'adult', known: true, maxYards: 50 },
  { name: 'Senior Known 45', gid: '1715385241', archive: 'Sr. Known 45', age: 'adult', known: true, maxYards: 45 },
  { name: 'Senior Known Pro', gid: '226411749', archive: null, age: 'adult', known: true, maxYards: 45 },
  { name: 'Senior Hunter 45', gid: '643036158', archive: null, age: 'adult', known: false, maxYards: 45 },
  { name: 'Senior Pins', gid: '1379723885', archive: 'Sr. Pins', age: 'adult', known: false, maxYards: 30 },
  { name: 'Senior Legends', gid: '1446901929', archive: null, age: 'adult', known: false, maxYards: 30 },
  { name: "Senior Women's Known", gid: '797247151', archive: "Sr. Women's Known", age: 'adult', known: true, maxYards: 40 },
  { name: 'Senior Master Known', gid: '115462302', archive: 'Sr. Master Known', age: 'adult', known: true, maxYards: 40 },
  { name: 'Super Senior Known', gid: '916928327', age: 'adult', known: true, maxYards: 40 },
  { name: 'Super Senior Pins', gid: '1339166677', age: 'adult', known: false, maxYards: 30 },
  { name: 'Barebow Recurve', gid: '614091256', age: 'adult', known: true, maxYards: 40 },
  { name: 'Olympic Recurve', gid: '896935978', age: 'adult', known: true, maxYards: 40 },
  { name: 'Traditional', gid: '659101793', archive: 'Traditional 25', age: 'adult', known: true, maxYards: 30 },
  { name: 'Crossbow', gid: '810184603', age: 'adult', known: true, maxYards: 40 },
  { name: 'Young Adult Open Male', gid: '111166179', age: 'youth', known: true, maxYards: 40 },
  { name: 'Young Adult Open Female', gid: '625557816', age: 'youth', known: true, maxYards: 40 },
  { name: 'Young Adult Pins Male', gid: '1443586511', age: 'youth', known: true, maxYards: 30 },
  { name: 'Eagle Open Boys', gid: '409132283', age: 'youth', known: true, maxYards: 30 },
  { name: 'Eagle Open Girls', gid: '1054855463', age: 'youth', known: true, maxYards: 30 },
  { name: 'Eagle Pins Boys', gid: '669961900', age: 'youth', known: true, maxYards: 25 },
  { name: 'Eagle Pins Girls', gid: '1799438024', age: 'youth', known: true, maxYards: 25 },
  { name: 'Junior Eagle', gid: '1097808975', age: 'youth', known: true, maxYards: 20 },
  { name: 'Youth Barebow', gid: '1240158534', archive: 'Eagle Barebow Recurve', age: 'youth', known: true, maxYards: 30 },
  // Classes the site did not read before November 2026. Distances are from the
  // ASA Federation rules; the last three exist only in the 2024 and 2025 sheets.
  { name: 'Youth Open Boys', gid: '1776340594', age: 'youth', known: true, maxYards: 30 },
  { name: 'Youth Open Girls', gid: '1008413710', age: 'youth', known: true, maxYards: 30 },
  { name: 'Youth Pins Boys', gid: '17396646', age: 'youth', known: true, maxYards: 30 },
  { name: 'Youth Pins Girls', gid: '1842235388', age: 'youth', known: true, maxYards: 30 },
  { name: 'Youth Olympic Recurve', tab: 'Youth Olympic', archive: 'Youth Olympic', age: 'youth', known: true, maxYards: 25 },
  { name: 'Young Adult Pins Female', tab: 'Young Adult Pins Female', age: 'youth', known: true, maxYards: 30 },
  { name: 'Super Senior', tab: 'Super Senior', age: 'adult', known: false, maxYards: 40 },
  { name: 'Senior Open', archive: 'Sr. Open', age: 'adult', known: false, maxYards: 45 },
  { name: 'Senior Master', archive: 'Sr. Master', age: 'adult', known: false, maxYards: 40 },
  { name: 'Traditional 30', age: 'adult', known: true, maxYards: 30 }
];
// Tabs are read this many at a time, so Google is never hit with a burst.
const ASA_BATCH_SIZE = 5;

// ---- TFAA: the three newest outdoor seasons and the three newest indoor seasons ----
// A season's standings are at /results/sywat/<id>. The ids are not in order,
// and /results/sywat on its own is whichever season is current, so the seasons
// are looked up in the season list that every results page carries.
const TFAA_BASE = 'https://texasfieldarchery.org';
const TFAA_SEASON_LIST_URL = TFAA_BASE + '/results/sywat';
const TFAA_SEASONS_RANKED = 3;
// Titles are shown for every season back to this one: the oldest whose
// standings TFAA still publishes. Seasons before the ranked ones are read for
// their titles only.
const TFAA_TITLES_FROM = 2015;
const TFAA_RECORD_PAGES = [
  { type: 'indoor', url: TFAA_BASE + '/records/indoor' },
  { type: 'outdoor', url: TFAA_BASE + '/records/outdoor' },
  { type: '900', url: TFAA_BASE + '/records/900' }
];
const adultAges = ['Adult Male','Adult Female','Senior Male','Senior Female','Silver Senior Male','Silver Senior Female','Master Senior Male','Master Senior Female'];

// NPS = (score / max) * 1000 * difficulty_weight
// Difficulty ranking: TFAA Outdoor (hardest) > TFAA Indoor > ASA 3D
const difficultyWeights = { 'TFAA Outdoor': 1.08, 'TFAA Indoor': 1.00, 'TX ASA': 0.95 };
// ASA Known distance classes are easier (rangefinders allowed) — reduce weight
const KNOWN_DISTANCE_FACTOR = 0.95;
// A State Championship round counts for more than an ordinary round, by the
// same amount in Texas ASA, TFAA Outdoor and TFAA Indoor.
const STATE_ROUND_BONUS = 1.05;
// A round counts in full in the newest season TAGR reads of its organization,
// and for a little less each season before that.
const RECENCY_WEIGHTS = [1, 0.95, 0.9];
// An archer with fewer seasons of an organization than TAGR reads (three) has
// those seasons weighed as the oldest ones: one season counts like a season
// three back (the last weight), two count like the two oldest seasons, the
// newer of them the less discounted. With all three, the usual weights apply.
// The most a Texas ASA round can score: 30 targets, 12 each. Par is a 10 on
// every target, and no class's bar is set lower than that.
const ASA_ROUND_MAX = 360;
const ASA_PAR = 300;
// TFAA rounds are scored against the NFAA national record for the archer's style, not
// against the perfect score: tying the national record is worth 1000 (before weights and
// bonuses) whatever the bow. These are the best adult records of men and women, amateur
// or pro, from NFAA's national records (indoor list updated August 2025, field list July
// 2025): https://nfaausa.com/files/indoor-national-records-120825152848.pdf and
// https://nfaausa.com/files/field-national-records-080725200516.pdf
// indoor: the two-day 300 round total (out of 600); field and hunter: one 28-target round
// (out of 560). BBC is NFAA's "Barebow" style. TFAA's own styles meet the record of the
// nearest NFAA style (RECORD_STYLE_FOR). Any other style that is not listed here is scored
// against the perfect score with its equipment bonus.
const NATIONAL_RECORDS = {
  FS: { indoor: 600, field: 560, hunter: 560 },
  BHFS: { indoor: 600, field: 554, hunter: 554 },
  FSL: { indoor: 600, field: 546, hunter: 535 },
  BBC: { indoor: 597, field: 518, hunter: 523 },
  FSLR: { indoor: 599, field: 521, hunter: 535 },
  BBR: { indoor: 583, field: 481, hunter: 496 },
  TRAD: { indoor: 577, field: 476, hunter: 486 },
  LB: { indoor: 542, field: 376, hunter: 391 }
};
// TFAA styles NFAA keeps no record for, and the NFAA style whose record they meet:
// Modern Bowhunter Freestyle is Bowhunter Freestyle with a longer stabilizer, and a
// Genesis bow is shot with fingers and no sight, as Barebow is.
const RECORD_STYLE_FOR = { MBH: 'BHFS', GEN: 'BBC' };
const NATIONAL_RECORDS_STYLES = {
  FS: 'Freestyle', BHFS: 'Bowhunter Freestyle', FSL: 'Freestyle Limited', BBC: 'Barebow Compound',
  FSLR: 'Freestyle Limited Recurve, Olympic', BBR: 'Barebow Recurve', TRAD: 'Traditional', LB: 'Longbow'
};
// Texas ASA names a Shooter of the Year only in a class where this many archers have a total.
const ASA_SOY_MIN_ARCHERS = 3;
// A title adds to the TAGR score: one bonus for being a Shooter of the Year and
// one for being a State Champion, however many of each the archer holds. A
// title counts for the bonus only when it was won against somebody: at least
// this many archers were in the running for it.
// A State Championship round counts for more when it beat ranked archers in
// the same class there. Ordinary shoots earn nothing for this: State is where
// the best of a class meet. Each archer beaten adds FIELD_BEAT_TOP times the cube of
// their standing (1 for the best-ranked archer, 0.5 for the middle of the
// ranking, 0 for an archer without a full ranking), so beating the top archer
// adds 2.5%, a middling one 0.3%. A round's bonus stops at FIELD_BONUS_MAX.
const FIELD_BONUS_MAX = 0.05;
const FIELD_BEAT_TOP = 0.025;
const FIELD_STANDING_POWER = 3;
const SOY_TITLE_BONUS = 1.03;
const STATE_TITLE_BONUS = 1.02;
const TITLE_BONUS_MIN_FIELD = 2;
// A repeat title is worth more: each further title of the same kind that earns a
// bonus adds REPEAT_TITLE_BONUS, for up to REPEAT_TITLE_MAX further titles.
const REPEAT_TITLE_BONUS = 0.01;
const REPEAT_TITLE_MAX = 3;
// Titles are weighed against the others of their kind won in the same broad class:
// every State Champion (or every Shooter of the Year) in one equipment class, of
// one organization and season, every age division and gender together (adults and
// youth apart). The best score among them earns TITLE_WEIGHT_MAX times the bonus,
// the lowest TITLE_WEIGHT_MIN times, and the rest in between by their score. A
// title that is the only one of its kind in the class earns the plain bonus.
const TITLE_WEIGHT_MAX = 1.5;
const TITLE_WEIGHT_MIN = 0.5;
// Rank by tournament type: each archer is also ranked against the archers of
// their own class (age group and equipment class, as on the site's class tabs)
// on one kind of tournament only, by the average of their best TYPE_RANK_BEST
// rounds of it. TYPE_RANK_MIN_ROUNDS rounds are needed for a rank.
// These ranks are shown beside the TAGR rank and do not change the TAGR score.
const TOURNAMENT_TYPES = [
  { key: 'field', label: 'Field', org: 'TFAA Outdoor' },
  { key: 'indoor', label: 'Indoor', org: 'TFAA Indoor' },
  { key: '3d', label: '3D', org: 'TX ASA' }
];
const TYPE_RANK_BEST = 3;
const TYPE_RANK_MIN_ROUNDS = 2;
// The "How TAGR Works" page prints these, so it cannot drift from the math.
const rules = {
  weights: difficultyWeights, knownDistanceFactor: KNOWN_DISTANCE_FACTOR, stateRoundBonus: STATE_ROUND_BONUS,
  recencyWeights: RECENCY_WEIGHTS, recordStyleFor: RECORD_STYLE_FOR, asaPar: ASA_PAR,
  fieldBonusMax: FIELD_BONUS_MAX, fieldBeatTop: FIELD_BEAT_TOP, fieldStandingPower: FIELD_STANDING_POWER,
  nationalRecords: NATIONAL_RECORDS, nationalRecordStyles: NATIONAL_RECORDS_STYLES,
  asaSoyMinArchers: ASA_SOY_MIN_ARCHERS,
  soyTitleBonus: SOY_TITLE_BONUS, stateTitleBonus: STATE_TITLE_BONUS, titleBonusMinField: TITLE_BONUS_MIN_FIELD,
  repeatTitleBonus: REPEAT_TITLE_BONUS, repeatTitleMax: REPEAT_TITLE_MAX, titleWeightMax: TITLE_WEIGHT_MAX, titleWeightMin: TITLE_WEIGHT_MIN,
  tournamentTypes: TOURNAMENT_TYPES, typeRankBest: TYPE_RANK_BEST, typeRankMinRounds: TYPE_RANK_MIN_ROUNDS
};

// The bonus a list of titles earns: Shooter of the Year and State Champion each
// give their bonus for the first title of that kind that earns one, and
// REPEAT_TITLE_BONUS more for each further one, up to REPEAT_TITLE_MAX of them.
// Each title's part is scaled by its `weight` (the strength of the field it was
// won against, 1 when unknown), the best-weighted title counting as the first.
function titleBonusOf(titles) {
  const factor = (kind, first) => {
    const weights = titles.filter(t => t.kind === kind && t.bonus)
      .map(t => (t.weight === undefined ? 1 : t.weight)).sort((a, b) => b - a);
    if (weights.length === 0) return 1;
    const repeats = weights.slice(1, 1 + REPEAT_TITLE_MAX).reduce((sum, w) => sum + w, 0);
    return 1 + (first - 1) * weights[0] + REPEAT_TITLE_BONUS * repeats;
  };
  return factor('soy', SOY_TITLE_BONUS) * factor('state', STATE_TITLE_BONUS);
}

// Gives every archer in one age group a `typeRanks` entry for each tournament
// type they shot: { score, rounds, titleBonus, rank, of }, ranked within their equipment
// class. `rank` is null with fewer than TYPE_RANK_MIN_ROUNDS rounds; `of` is how
// many archers of the class have a rank of that type. Equal scores share a rank.
function addTypeRanks(list) {
  const classes = new Map();
  for (const r of list) {
    if (!classes.has(r.equipmentClass)) classes.set(r.equipmentClass, []);
    classes.get(r.equipmentClass).push(r);
  }
  for (const members of classes.values()) rankTypesWithin(members);
  return list;
}

function rankTypesWithin(list) {
  for (const r of list) r.typeRanks = {};
  for (const type of TOURNAMENT_TYPES) {
    const entries = [];
    for (const r of list) {
      const nps = r.rounds.filter(x => x.org === type.org).map(x => x.nps).sort((a, b) => b - a);
      if (nps.length === 0) continue;
      const best = nps.slice(0, TYPE_RANK_BEST);
      // Titles won in this kind of tournament add their bonus, as on the TAGR score.
      const titleBonus = Math.round(titleBonusOf((r.titles || []).filter(t => t.org === type.org)) * 10000) / 10000;
      const score = Math.round(best.reduce((sum, n) => sum + n, 0) / best.length * titleBonus);
      const entry = { score, rounds: nps.length, titleBonus, rank: null, of: 0 };
      r.typeRanks[type.key] = entry;
      if (nps.length >= TYPE_RANK_MIN_ROUNDS) entries.push(entry);
    }
    entries.sort((a, b) => b.score - a.score);
    entries.forEach((e, i) => {
      e.rank = i > 0 && e.score === entries[i - 1].score ? entries[i - 1].rank : i + 1;
      e.of = entries.length;
    });
  }
  return list;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

// A Google Sheets "gviz" answer is JSON wrapped in a function call.
// Returns the table, or null when the answer is not one.
function parseGvizTable(raw) {
  const m = raw.match(/setResponse\(({.*})\)/);
  if (!m) return null;
  const table = JSON.parse(m[1]).table;
  if (!table) return null;
  return { cols: table.cols || [], rows: table.rows || [] };
}

// A sheet cell as a number, or 0 when it holds none ("#NUM!", a blank).
function asaNumber(cell) {
  if (!cell || cell.v === null || cell.v === undefined) return 0;
  const v = parseFloat(String(cell.f || cell.v));
  return isNaN(v) ? 0 : v;
}

// One class tab → its archers. `year` is the season the sheet is for; it goes
// in front of the event names, so a 2024 shoot and a 2026 shoot at the same
// club can be told apart. Each archer also carries what the titles are decided
// on, as the sheet has them (the decimals count 12s, and break ties):
//   soyTotal     the TOTAL SCORE column, the Shooter of the Year standing
//   soyWorkedOut the same total worked out from the scores (the best five
//                qualifiers plus the State score, for an archer with five
//                qualifiers), for a sheet whose totals have been cleared
//   stateScore   the score in the STATE column
function parseAsaRows(res, tab, year) {
  const rows = Array.isArray(res) ? res : (res.rows || []);
  const cols = Array.isArray(res) ? [] : (res.cols || []);
  const labelOf = j => (cols[j] && cols[j].label ? String(cols[j].label).replace(/\s+/g, ' ').trim() : '');
  const totalCol = cols.findIndex((c, j) => /^total score$/i.test(labelOf(j)));
  const stateCols = cols.map((c, j) => j).filter(j => j >= 5 && /^state$/i.test(labelOf(j)));
  // Build event-name lookup from column labels (score columns start at index 5).
  // Some sheets repeat a "STATE" label with a trailing blank column; label them clearly.
  function eventNameFor(j) {
    return (year ? year + ' ' : '') + (labelOf(j) || 'Event ' + (j - 4));
  }
  const shooters = [];
  for (const row of rows) {
    const cells = row.c || [];
    const firstName = cells[1] && cells[1].v ? String(cells[1].v) : '';
    const lastName = cells[2] && cells[2].v ? String(cells[2].v) : '';
    if (!firstName && !lastName) continue;
    const eventScores = [];
    const eventNames = [];
    const isState = [];
    // The State Championship a State score is from, and each score as the
    // sheet has it (the decimals count 12s), for seeing who beat whom there.
    const eventKeys = [];
    const fieldScores = [];
    const qualifiers = [];
    for (let j = 5; j < cells.length; j++) {
      if (cells[j] && cells[j].v) {
        const v = parseFloat(String(cells[j].f || cells[j].v));
        // A score above the most a round can score is a slip of the keyboard.
        if (!isNaN(v) && v > 0 && Math.floor(v) <= ASA_ROUND_MAX) {
          // The unnamed column after STATE belongs to the State Championship too.
          const state = stateCols.includes(j) || (stateCols.includes(j - 1) && !labelOf(j));
          eventScores.push(Math.floor(v));
          eventNames.push(eventNameFor(j));
          eventKeys.push(state ? ['asa-state', year || 0, tab.name, j].join(':') : null);
          fieldScores.push(v);
          isState.push(state);
          if (!state) qualifiers.push(v);
        }
      }
    }
    if (eventScores.length === 0) continue;
    const stateScore = Math.max(0, ...stateCols.map(j => asaNumber(cells[j])));
    qualifiers.sort((a, b) => b - a);
    shooters.push({
      name: (firstName + ' ' + lastName).trim(),
      org: 'TX ASA', orgClass: tab.name, age: tab.age,
      knownDistance: tab.known || false,
      asaMaxYards: tab.maxYards || 40,
      eventScores, eventNames, isState, eventKeys, fieldScores, maxPerRound: ASA_ROUND_MAX,
      when: year || 0,
      asaNumber: cells[0] && cells[0].v !== null && cells[0].v !== undefined ? String(cells[0].v).trim() : '',
      soyTotal: totalCol === -1 ? 0 : asaNumber(cells[totalCol]),
      soyWorkedOut: qualifiers.length >= 5 ? qualifiers.slice(0, 5).reduce((a, b) => a + b, 0) + stateScore : 0,
      stateScore
    });
  }
  return shooters;
}

// ---- The saved copies of the Texas ASA sheet ----
//
// A saved copy is { year, savedAt, tabs: { class name: table } }, with each
// table as the sheet sent it, cut down to its labels and cells.

function asaTableToKeep(table) {
  return {
    cols: table.cols.map(c => ({ label: c.label || '' })),
    // The sheets carry rows of formulas below the last archer: only rows with a name are kept.
    rows: table.rows.filter(r => r.c && ((r.c[1] && r.c[1].v) || (r.c[2] && r.c[2].v))).map(r => ({
      c: (r.c || []).map(cell => (!cell || cell.v === null || cell.v === undefined ? null : cell.f !== undefined ? { v: cell.v, f: cell.f } : { v: cell.v }))
    }))
  };
}

// The archers of a class tab with their scores by column: [{ name, scores: Map(column → score) }].
// A column is its label and how many columns before it share the label.
function asaTabScores(table) {
  const seen = {};
  const columns = table.cols.map(c => {
    const label = String(c.label || '').replace(/\s+/g, ' ').trim().toLowerCase();
    seen[label] = (seen[label] || 0) + 1;
    return label + '#' + seen[label];
  });
  const archers = [];
  for (const row of table.rows) {
    const cells = row.c || [];
    const name = ((cells[1] && cells[1].v ? String(cells[1].v) : '') + ' ' + (cells[2] && cells[2].v ? String(cells[2].v) : '')).trim();
    const scores = new Map();
    for (let j = 5; j < cells.length; j++) {
      const v = asaNumber(cells[j]);
      if (v > 0) scores.set(columns[j], v);
    }
    if (name && scores.size > 0) archers.push({ name: nameKey(name), scores });
  }
  return archers;
}

function asaScoreCount(table) {
  return table ? asaTabScores(table).reduce((n, a) => n + a.scores.size, 0) : 0;
}

// Whether the sheet still holds the season of a saved copy: at least half of
// the copy's archers are on the sheet with every score the copy has for them.
// A season going on only adds scores, so it passes; a sheet cleared for the
// next season, or filling with the next season's scores, does not.
function sameAsaSeason(snapshot, liveTabs) {
  let archers = 0;
  let stillThere = 0;
  for (const [name, table] of Object.entries(snapshot.tabs)) {
    const live = liveTabs[name] ? asaTabScores(liveTabs[name]) : [];
    for (const saved of asaTabScores(table)) {
      archers++;
      const now = live.find(a => a.name === saved.name);
      if (now && [...saved.scores].every(([column, score]) => Math.abs((now.scores.get(column) || 0) - score) < 1e-6)) stillThere++;
    }
  }
  return archers === 0 || stillThere >= archers / 2;
}

// ---- Titles ----
//
// A title is { name, org, orgClass, kind, season, field }: `kind` is 'soy'
// (Shooter of the Year) or 'state' (State Champion), `season` is the year, or
// the two years of an indoor season ("2025-2026"), and `field` is how many
// archers were in the running for it.

// The entries with the best standing, where `standing` gives the numbers to
// compare, most important first, or null for an entry that is not in the
// running. More than one entry comes back only for an exact tie. `field` is
// how many archers were in the running, an archer listed twice counting once.
function bestBy(entries, standing) {
  let best = null;
  let winners = [];
  const names = new Set();
  for (const entry of entries) {
    const mine = standing(entry);
    if (!mine) continue;
    names.add(nameKey(entry.name));
    let cmp = best ? 0 : 1;
    for (let i = 0; best && cmp === 0 && i < mine.length; i++) cmp = mine[i] - best[i];
    if (cmp > 0) {
      best = mine;
      winners = [entry];
    } else if (cmp === 0) {
      winners.push(entry);
    }
  }
  return { winners, field: names.size };
}

// The Texas ASA titles of one year, from that year's class tabs
// ([{ tab, shooters }]). In each class the State Champion is the best score in
// the STATE column, and the Shooter of the Year is the best TOTAL SCORE, which
// the sheet works out from the best five qualifiers and the State score and
// leaves empty for an archer with fewer than five scores. Texas ASA gives the
// award only in a class where at least three archers have five scores (the
// sheet's "Read this First" tab). The sheet's own totals are used while it has
// them; a tab whose totals have all been cleared is worked out from its
// scores. Until the State Championship has been shot the season is still
// going, so nobody holds either title yet.
// `official` is the results of the year's State Championship, where the
// project has them (archive/asa-state-<year>.json): then the State Champions
// are the archers it places first, in every class that was shot, and the
// STATE column, which the sheet fills for some classes only, is not used.
function asaTitlesOf(year, tabs, official = null) {
  if (!official && !tabs.some(t => t.shooters.some(s => s.stateScore > 0))) return [];
  const titles = [];
  if (official) {
    const classes = new Map();
    for (const result of official.results) {
      const tab = asaClassTab(result.orgClass);
      const orgClass = tab ? tab.name : result.orgClass;
      if (!classes.has(orgClass)) classes.set(orgClass, []);
      classes.get(orgClass).push(result);
    }
    for (const [orgClass, results] of classes) {
      const field = new Set(results.map(r => nameKey(r.name))).size;
      for (const r of results.filter(r => r.place === 1)) titles.push({ name: r.name, org: 'TX ASA', orgClass, kind: 'state', season: String(year), field });
    }
  }
  for (const { tab, shooters } of tabs) {
    const award = (kind, { winners, field }) => {
      for (const s of winners) titles.push({ name: s.name, org: 'TX ASA', orgClass: tab.name, kind, season: String(year), field });
    };
    const total = shooters.some(s => s.soyTotal > 0) ? s => s.soyTotal : s => s.soyWorkedOut || 0;
    const soy = bestBy(shooters, s => (total(s) > 0 ? [total(s)] : null));
    if (soy.field >= ASA_SOY_MIN_ARCHERS) award('soy', soy);
    if (!official) award('state', bestBy(shooters, s => (s.stateScore > 0 ? [s.stateScore] : null)));
  }
  return titles;
}

// The class of ASA_TABS a class name stands for, as Texas ASA writes it on
// one sheet or another ("Sr. Known 45", "KNOWN 40"), or undefined.
const ASA_CLASS_ALIASES = { 'youth barebow recurve': 'Youth Barebow' };
function asaClassTab(name) {
  const said = String(name || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const wanted = (ASA_CLASS_ALIASES[said] || said).toLowerCase();
  return ASA_TABS.find(t => [t.name, t.archive, t.tab].some(n => n && n.toLowerCase() === wanted));
}

// Puts the results of a State Championship into the year's class tabs
// ([{ tab, year, shooters }]): every archer who shot State gets the State
// round, with or without a row on the Shooter of the Year sheet, and each
// State round is marked as that class's Championship with the score that
// placed the archer (the 12s break a tie on points). A class TAGR has no
// distances for is passed over. Returns how many rounds were added.
function addAsaStateResults(official, asaTabs) {
  let added = 0;
  for (const result of official.results) {
    const tab = asaClassTab(result.orgClass);
    if (!tab || !(result.score > 0) || result.score > ASA_ROUND_MAX) continue;
    let classTab = asaTabs.find(t => t.year === official.year && t.tab === tab && t.shooters);
    if (!classTab) {
      classTab = { what: 'TX ASA ' + official.year + ', ' + tab.name, url: 'archive/asa-state-' + official.year + '.json', tab, year: official.year, shooters: [], note: 'from the State Championship results' };
      asaTabs.push(classTab);
    }
    const eventKey = ['asa-state', official.year, tab.name].join(':');
    const placing = result.score + (result.twelves || 0) / 10000;
    const name = nameKey(result.name);
    let archer = classTab.shooters.find(s => (result.asaNumber && s.asaNumber === result.asaNumber) || nameKey(s.name) === name);
    if (!archer) {
      archer = {
        name: result.name, org: 'TX ASA', orgClass: tab.name, age: tab.age, knownDistance: tab.known || false, asaMaxYards: tab.maxYards || 40,
        eventScores: [], eventNames: [], isState: [], eventKeys: [], fieldScores: [], maxPerRound: ASA_ROUND_MAX,
        when: official.year, asaNumber: result.asaNumber || '', soyTotal: 0, soyWorkedOut: 0, stateScore: 0
      };
      classTab.shooters.push(archer);
    }
    let at = archer.isState.indexOf(true);
    if (at === -1) {
      at = archer.eventScores.length;
      archer.eventScores.push(Math.floor(result.score));
      archer.eventNames.push(official.year + ' STATE');
      archer.isState.push(true);
      archer.eventKeys.push(null);
      archer.fieldScores.push(placing);
      added++;
    }
    // Any other cell of the sheet's STATE columns is not a shoot of its own.
    archer.eventKeys = archer.eventKeys.map((key, i) => (i === at ? eventKey : archer.isState[i] ? null : key));
    archer.fieldScores[at] = placing;
  }
  return added;
}

// The TFAA titles of one season, from the entries on its page. In each
// division (age group and style, professionals apart) the State Champion is
// whoever shot the best State total,
// and the Shooter of the Year is TFAA's SYWAT Aggregate award: the best total
// of three SYWAT scores and the State score, for which TFAA requires all four.
// Indoors, X counts break ties. Scores above the round maximum count here:
// they are left out of the ranking, but they still won the title.
function tfaaTitlesOf(entries, org, season) {
  const divisions = new Map();
  for (const entry of entries) {
    if (!entry.name) continue;
    const orgClass = entry.division + ' - ' + entry.style;
    if (!divisions.has(orgClass)) divisions.set(orgClass, []);
    const rounds = entry.scores.filter(sc => sc.kind === 'round' && sc.score > 0);
    const state = entry.scores.find(sc => sc.kind === 'state' && sc.score > 0);
    const sum = key => rounds.reduce((a, sc) => a + sc[key], 0) + (state ? state[key] : 0);
    divisions.get(orgClass).push({
      name: entry.name,
      state: state ? [state.score, state.x] : null,
      aggregate: state && rounds.length >= 3 ? [sum('score'), sum('x')] : null
    });
  }
  const titles = [];
  for (const [orgClass, division] of divisions) {
    const award = (kind, { winners, field }) => {
      // An archer listed twice in a division holds the title once.
      const names = new Set();
      for (const w of winners) {
        const key = nameKey(w.name);
        if (names.has(key)) continue;
        names.add(key);
        titles.push({ name: w.name, org, orgClass, kind, season, field });
      }
    };
    award('soy', bestBy(division, e => e.aggregate));
    award('state', bestBy(division, e => e.state));
  }
  return titles;
}

// ---- TFAA results pages ----
//
// A season's page is one table. Each age group ("Adult Male (18-49)") and,
// under it, each shooting style ("Freestyle (FS)") has a heading row naming
// the columns, then one row per entry:
//   outdoor   #  Archer  Score #1  Score #2  Score #3  State  Total
//   indoor    #  Archer  Score #1  X's  Score #2  X's  Score #3  X's  State  X's  Total  X's
// Columns are found by their headings, so a State score is never taken for an
// ordinary round and an empty cell cannot shift the scores along.

const TFAA_AGE_GROUP = /((?:Cub|Youth|Young Adult|Adult|Senior|Silver Senior|Master Senior)\s+(?:Male|Female))\s*(?:&nbsp;|\s)*\(([^)]+)\)/;
// One outdoor round (field or hunter) and one indoor round, at their most.
const TFAA_OUTDOOR_ROUND_MAX = 560;
const TFAA_INDOOR_ROUND_MAX = 300;

function tfaaText(html) {
  return html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

// The cells of one table row, given the text that follows its "<tr". The site
// does not close its score cells, so a cell runs until the next one opens.
function tfaaCells(row) {
  const end = row.search(/<\/tr/i);
  return (end === -1 ? row : row.slice(0, end)).split(/<t[dh](?:\s[^>]*)?>/i).slice(1).map(tfaaText);
}

// What each column holds, from the heading row: an ordinary round, the State
// Championship, the X count of the score before it, the archer's name, or
// something TAGR does not use (the place and the totals).
function tfaaColumns(headings) {
  return headings.map(h => {
    if (/^Score\b/i.test(h)) return 'round';
    if (/^State\b/i.test(h)) return 'state';
    if (/^X(?:'?s)?$/i.test(h)) return 'x';
    if (/^(?:Archer|Name)$/i.test(h)) return 'name';
    return 'other';
  });
}

function tfaaNumber(text) {
  const n = parseInt(text.replace(/[^0-9]/g, ''), 10);
  return isNaN(n) ? 0 : n;
}

// Every entry on a results page with what the headings above it say:
//   entries     [{ name, age, adult, style, scores: [{ kind: 'round' | 'state', score, x }] }]
//   unreadRows  score rows that did not fit their column headings, and were left out
function readTfaaEntries(html) {
  const entries = [];
  let unreadRows = 0;
  let age = '';
  let division = '';
  // How often each age group heads a part of the page, and how often so far.
  const headingName = row => (tfaaCells(row)[0] || '').replace(/\s*\([^)]*\)\s*$/, '').replace(/\s+/g, ' ').trim();
  const listed = {};
  const met = {};
  for (const row of html.split('<tr')) {
    if (row.includes('results-dgp')) listed[headingName(row)] = (listed[headingName(row)] || 0) + 1;
  }
  let adult = false;
  let style = '';
  let columns = null;
  for (const row of html.split('<tr')) {
    const known = row.match(TFAA_AGE_GROUP);
    if (known) {
      age = known[1].replace(/\s+/g, ' ').trim();
      adult = adultAges.includes(age);
      // The division as the page names it. Professionals are ranked with the
      // adults of their age, but they shoot for their own titles. Older pages
      // do not say "Pro": they list the age group twice, professionals first.
      division = row.includes('results-dgp') ? headingName(row) : age;
      if (row.includes('results-dgp')) {
        met[division] = (met[division] || 0) + 1;
        if (listed[division] > 1 && met[division] === 1) division = 'Pro ' + division;
      }
    } else if (row.includes('results-dgp')) {
      // An age group this code has not met. It keeps its own name, so its
      // archers are not filed under the group above, and counts as adult
      // when its age range starts at 18 or over.
      const heading = tfaaCells(row)[0] || '';
      const range = heading.match(/\((\d+)[^)]*\)$/);
      age = heading.replace(/\s*\([^)]*\)$/, '');
      division = age;
      adult = range ? Number(range[1]) >= 18 : false;
    }
    if (row.includes('results-fi')) {
      const text = tfaaCells(row)[0];
      if (text) style = text;
    }
    if (row.includes('results-head')) columns = tfaaColumns(tfaaCells(row));
    if (!row.includes('results-score')) continue;
    const cells = tfaaCells(row);
    if (!columns || cells.length !== columns.length) {
      unreadRows++;
      continue;
    }
    const nameAt = columns.includes('name') ? columns.indexOf('name') : 1;
    const scores = [];
    columns.forEach((kind, i) => {
      if (kind !== 'round' && kind !== 'state') return;
      scores.push({ kind, score: tfaaNumber(cells[i]), x: columns[i + 1] === 'x' ? tfaaNumber(cells[i + 1]) : 0 });
    });
    entries.push({ name: cells[nameAt], age, division: division || age, adult, style, scores, place: cells[0] });
  }
  return { entries, unreadRows };
}

// One season's page → the archers on it and their rounds.
//   kind            'outdoor' or 'indoor'
//   repeatedState   State scores listed a second time, which were counted once
//   unreadRows      score rows that could not be read
//   aboveMax        scores above the most their round can score, which were left out
//   titles          the season's Shooters of the Year and State Champions
function parseTfaaPage(html, seasonLabel, kind) {
  const outdoor = kind === 'outdoor';
  const { entries, unreadRows } = readTfaaEntries(html);
  const yr = (seasonLabel || (outdoor ? 'Outdoor' : 'Indoor')).replace(outdoor ? /\s*Outdoor\s*/i : /\s*Indoor\s*/i, '').trim();
  const roundName = yr ? yr + (outdoor ? ' SYWAT' : ' Indoor') : (outdoor ? 'SYWAT' : 'Indoor');
  const stateName = (yr ? yr + ' ' : '') + (outdoor ? 'State Outdoor' : 'State Indoor');
  const org = outdoor ? 'TFAA Outdoor' : 'TFAA Indoor';
  // When the season was shot, for telling an archer's newest results from older
  // ones: an indoor season runs over the winter after the year it starts in.
  const when = (parseInt(yr, 10) || 0) + (outdoor ? 0 : 0.5);

  // The State Championship is shot once a season. The site can list an archer
  // twice in one class, with the State score on both rows: that is one shoot.
  const stateCounted = new Set();
  let repeatedState = 0;
  function isRepeat(entry, score) {
    const key = [nameKey(entry.name), entry.age, entry.style, score].join('|');
    if (stateCounted.has(key)) {
      repeatedState++;
      return true;
    }
    stateCounted.add(key);
    return false;
  }

  // A score above the most its round can score is left out. A few outdoor
  // scores are listed that way (a 629 where a round is out of 560), and until
  // it is known how they were scored they cannot be compared with the rest.
  const aboveMax = [];
  function isAboveMax(entry, score, max) {
    if (score <= max) return false;
    aboveMax.push({ name: entry.name, orgClass: entry.age + ' - ' + entry.style, score, max });
    return true;
  }

  const shooters = [];
  for (const entry of entries) {
    const eventScores = [];
    const eventNames = [];
    const xCounts = [];
    const isState = [];
    const roundMax = [];
    const xMax = [];
    const roundKinds = [];
    // The State Championship a State score is from, for seeing who beat whom
    // there. fieldScores is what places the archers: the whole State total,
    // and indoors the X count as the tie-break.
    const eventKeys = [];
    const fieldScores = [];
    const stateKey = ['tfaa-state', org, yr, entry.division + ' - ' + entry.style].join(':');
    let n = 0;
    for (const { kind: column, score, x } of entry.scores) {
      if (score <= 0) continue;
      if (outdoor) {
        if (column === 'state') {
          // The State column is the total of two rounds, field and hunter, and
          // counts as two halves.
          if (isRepeat(entry, score) || isAboveMax(entry, score, 2 * TFAA_OUTDOOR_ROUND_MAX)) continue;
          const half = Math.round(score / 2);
          eventScores.push(half, score - half);
          eventNames.push(stateName + ' (Field)', stateName + ' (Hunter)');
          roundKinds.push('field', 'hunter');
          eventKeys.push(stateKey, stateKey);
          fieldScores.push(score, score);
        } else {
          if (isAboveMax(entry, score, TFAA_OUTDOOR_ROUND_MAX)) continue;
          n++;
          eventScores.push(score);
          eventNames.push(roundName + ' #' + n);
          roundKinds.push('sywat');
          eventKeys.push(null);
          fieldScores.push(score);
        }
      } else if (column === 'round') {
        if (isAboveMax(entry, score, TFAA_INDOOR_ROUND_MAX)) continue;
        n++;
        eventScores.push(score);
        xCounts.push(Math.min(x, 60));
        isState.push(false);
        roundMax.push(TFAA_INDOOR_ROUND_MAX);
        xMax.push(60);
        eventNames.push(roundName + ' #' + n);
        eventKeys.push(null);
        fieldScores.push(score + Math.min(x, 60) / 1000);
      } else {
        // State Indoor is a double round; the source only publishes the
        // combined total (e.g. 541), not the two individual rounds, so we
        // record it as one 600-max State round rather than inventing halves.
        if (isRepeat(entry, score) || isAboveMax(entry, score, 2 * TFAA_INDOOR_ROUND_MAX)) continue;
        eventScores.push(score);
        xCounts.push(Math.min(x, 120));
        isState.push(true);
        roundMax.push(2 * TFAA_INDOOR_ROUND_MAX);
        xMax.push(120);
        eventNames.push(stateName);
        eventKeys.push(stateKey);
        fieldScores.push(score + Math.min(x, 120) / 1000);
      }
    }
    if (!entry.name || eventScores.length === 0) continue;
    const who = { name: entry.name, org, orgClass: entry.age + ' - ' + entry.style, age: entry.adult ? 'adult' : 'youth', when };
    shooters.push(outdoor
      ? { ...who, eventScores, eventNames, roundKinds, eventKeys, fieldScores, maxPerRound: TFAA_OUTDOOR_ROUND_MAX }
      : { ...who, eventScores, xCounts, isState, eventNames, roundMax, xMax, eventKeys, fieldScores, maxPerRound: TFAA_INDOOR_ROUND_MAX });
  }
  return { shooters, repeatedState, unreadRows, aboveMax, titles: tfaaTitlesOf(entries, org, yr) };
}

function parseTfaaOutdoorHtml(html, seasonLabel) {
  return parseTfaaPage(html, seasonLabel, 'outdoor').shooters;
}

function parseTfaaIndoorHtml(html, seasonLabel) {
  return parseTfaaPage(html, seasonLabel, 'indoor').shooters;
}

// ---- Titles of the seasons before the ranked ones ----
//
// In the standings of older seasons the State column holds one day's score,
// not the State total, so the State Champions of those seasons are taken from
// the results of the State Championship itself.

// A season's list of shoots (/results/season/<id>) → the ids of its State
// Championship: the State shoot that is not the 900 round, the 3D shoot or an
// overflow line.
function parseTfaaStateShoots(html) {
  const ids = [];
  const link = /<a\s+href\s*=\s*["']\/results\/(\d+)["'][^>]*>([^<]*)/gi;
  let m;
  while ((m = link.exec(html)) !== null) {
    const name = tfaaText(m[2]);
    if (/\bstate\b/i.test(name) && !/900|3d|overflow/i.test(name) && !ids.includes(m[1])) ids.push(m[1]);
  }
  return ids;
}

// The results page of a State Championship → its champions as titles: the
// archer placed first in each division, and how many shot the division.
function parseTfaaStateChampions(html, org, season) {
  // Newer pages write the division's code after the archer's name.
  const { entries } = readTfaaEntries(html.replace(/<span class=['"]divstyle['"]>[^<]*<\/span>/gi, ''));
  const divisions = new Map();
  for (const entry of entries) {
    if (!entry.name) continue;
    const orgClass = entry.division + ' - ' + entry.style;
    if (!divisions.has(orgClass)) divisions.set(orgClass, { champion: null, names: new Set() });
    const division = divisions.get(orgClass);
    division.names.add(nameKey(entry.name));
    if (!division.champion && entry.place === '1') division.champion = entry.name;
  }
  const titles = [];
  for (const [orgClass, division] of divisions) {
    if (division.champion) titles.push({ name: division.champion, org, orgClass, kind: 'state', season, field: division.names.size, past: true });
  }
  return titles;
}

// The season list on a TFAA results page → [{ id, label, kind, year }], newest first.
// Only names like "2026 Outdoor" and "2026-2027 Indoor" are seasons: the list
// also holds test entries and other programs.
function parseTfaaSeasonList(html) {
  const list = html.match(/<select[^>]*\bid=["']?season["']?[^>]*>([\s\S]*?)<\/select>/i);
  if (!list) return [];
  const seasons = [];
  const seen = new Set();
  const option = /<option[^>]*\bvalue=["']?(\d+)["']?[^>]*>([^<]*)/gi;
  let m;
  while ((m = option.exec(list[1])) !== null) {
    const label = m[2].replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    const outdoor = label.match(/^(\d{4}) Outdoor$/);
    const indoor = label.match(/^(\d{4})-\d{4} Indoor$/);
    if ((!outdoor && !indoor) || seen.has(label)) continue;
    seen.add(label);
    seasons.push({ id: Number(m[1]), label, kind: outdoor ? 'outdoor' : 'indoor', year: Number((outdoor || indoor)[1]) });
  }
  return seasons.sort((a, b) => b.year - a.year);
}

// Whether a TFAA results page holds indoor scores (every score has an X count
// beside it) or outdoor scores. null when the page has no results table.
function tfaaPageLayout(html) {
  const head = html.split('<tr').find(row => row.includes('results-head'));
  if (!head) return null;
  return tfaaColumns(tfaaCells(head)).includes('x') ? 'indoor' : 'outdoor';
}

// One TFAA records page → [{ name, normalizedName, recordType, ageGroup, style, year, score }]
function parseTfaaRecordsHtml(html, type) {
  const records = [];
  let currentAgeGroup = '';
  const segments = html.split(/<tr/);
  for (const seg of segments) {
    // Check for age group
    if (seg.includes('results-dgp')) {
      const dgpM = seg.match(/>(.*?)<\/td>/s);
      if (dgpM) {
        const t = dgpM[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
        if (t) currentAgeGroup = t;
      }
    }
    if (!seg.includes('results-score')) continue;
    const tds = seg.split(/<td[^>]*>/);
    const cells = tds.map(t => t.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim()).filter(t => t);
    // First cell is always junk from the <tr> tag attributes
    // Indoor/900: [junk, style, year, name, score, xs]
    // Outdoor: [junk, round, style, year, name, score, xs]
    if (cells.length >= 5) {
      let style, year, name, score;
      if (type === 'outdoor') {
        // cells: [junk, round, style, year, name, score, xs]
        const round = (cells[1] || '').trim();
        style = round + ' - ' + (cells[2] || '').trim();
        year = parseInt(cells[3]) || 0;
        name = (cells[4] || '').trim();
        score = parseInt((cells[5] || '').replace(/[^0-9]/g, '')) || 0;
      } else {
        // cells: [junk, style, year, name, score, xs]
        style = (cells[1] || '').trim();
        year = parseInt(cells[2]) || 0;
        name = (cells[3] || '').trim();
        score = parseInt((cells[4] || '').replace(/[^0-9]/g, '')) || 0;
      }
      if (name && year && score) {
        records.push({
          name, normalizedName: normalizeName(name),
          recordType: type, ageGroup: currentAgeGroup,
          style, year, score
        });
      }
    }
  }
  return records;
}

// The national record a TFAA round is scored against, on the round's own scale, or
// null when there is none (Texas ASA, and TFAA styles without a national record).
// A SYWAT round can be a field or a hunter round, so it meets the average of the two.
function nationalRecordFor(s, i, roundMax) {
  if (s.org !== 'TFAA Indoor' && s.org !== 'TFAA Outdoor') return null;
  const code = ((s.orgClass || '').match(/\(([A-Z]+)\)\s*$/) || [])[1] || (/\bgenesis\b/i.test(s.orgClass || '') ? 'GEN' : '');
  const style = RECORD_STYLE_FOR[code] || code;
  const record = style && NATIONAL_RECORDS[style];
  if (!record) return null;
  if (s.org === 'TFAA Indoor') return record.indoor * roundMax / (2 * TFAA_INDOOR_ROUND_MAX);
  const kind = s.roundKinds && s.roundKinds[i];
  const bar = kind === 'field' ? record.field : kind === 'hunter' ? record.hunter : (record.field + record.hunter) / 2;
  return bar * roundMax / TFAA_OUTDOOR_ROUND_MAX;
}

// ---- EQUIPMENT CLASS MAPPING ----
function mapEquipmentClass(orgClass, org) {
  const cl = orgClass.toLowerCase();
  // Longbow
  if (cl.includes('longbow') || cl.includes('(lb)')) return 'Longbow';
  // Traditional
  if (cl.includes('traditional') || cl.includes('(trad)')) return 'Traditional';
  // Olympic (recurve with sight — FSLR / Olympic Recurve)
  if (cl.includes('freestyle limited recurve') || cl.includes('(fslr)') || cl.includes('olympic recurve')) return 'Olympic';
  // Barebow Compound is a compound class — check before barebow
  if (cl.includes('barebow compound') || cl.includes('(bbc)')) return 'Compound';
  // Barebow (recurve without sight)
  if (cl.includes('barebow recurve') || cl.includes('(bbr)')) return 'Barebow';
  if (cl.includes('barebow') && !cl.includes('compound')) return 'Barebow';
  if (org === 'TX ASA' && cl.includes('youth barebow')) return 'Barebow';
  // Everything else is Compound (FS, FSL, BHFS, MBH, BBC, Genesis, Known, Open, Hunter, Pins, Pro, etc.)
  return 'Compound';
}

// ---- NAME NORMALIZATION ----
// TX ASA: "FIRST LAST" (all caps). TFAA: "Last, First"
// One spelling for the things the sources write several ways: extra spaces,
// curly apostrophes, and "Jr." or "II" with or without a full stop and before
// or after the last name.
const NAME_SUFFIXES = { jr: 'Jr', sr: 'Sr', ii: 'II', iii: 'III', iv: 'IV' };
function normalizeName(name) {
  let n = name.replace(/[\u2018\u2019`]/g, "'").replace(/\s+/g, ' ').trim();
  if (n.includes(',')) {
    // Last, First -> First Last
    const parts = n.split(',').map(s => s.trim());
    n = (parts[1] + ' ' + parts[0]).trim();
  }
  const words = [];
  const suffixes = [];
  n.split(' ').forEach((w, i) => {
    const suffix = i > 0 ? NAME_SUFFIXES[w.replace(/\.$/, '').toLowerCase()] : undefined;
    if (suffix) suffixes.push(suffix);
    else words.push(w);
  });
  // Title case, preserving Mc and O' capitalization
  const titled = words.join(' ').replace(/\w\S*/g, w => {
    let t = w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    // Handle Mc prefix (McBride, McDonald, etc.) and O'Brien
    if (/^(Mc|O')[a-z]/.test(t)) t = t.slice(0, 2) + t.charAt(2).toUpperCase() + t.slice(3);
    return t;
  });
  return [titled].concat(suffixes).join(' ');
}

// What two spellings of one archer's name have in common: "A.J. Grogan" and
// "AJ GROGAN" are the same archer.
function nameKey(name) {
  return normalizeName(name).toLowerCase().replace(/\./g, '');
}

// Texas ASA rows carry the archer's ASA number, so one archer written two ways
// ("KEN SCHULZ" and "KENNETH SCHULZ") can be put together. The sheets also
// hold mistyped numbers, which put two different archers on one number, so
// two spellings are taken for one archer only when they share the number and
// the first or the last name. Returns name key → the spelling to use, which is
// the one from the newest sheet.
function asaNameAliases(asaShooters) {
  const byNumber = new Map();
  for (const s of asaShooters) {
    if (!s.asaNumber) continue;
    if (!byNumber.has(s.asaNumber)) byNumber.set(s.asaNumber, new Map());
    const spellings = byNumber.get(s.asaNumber);
    const key = nameKey(s.name);
    const known = spellings.get(key);
    if (!known || (s.when || 0) > known.when) spellings.set(key, { key, name: normalizeName(s.name), when: s.when || 0 });
  }
  const ends = key => {
    const words = key.split(' ').filter((w, i) => i === 0 || !NAME_SUFFIXES[w]);
    return [words[0], words[words.length - 1]];
  };
  const aliases = new Map();
  for (const spellings of byNumber.values()) {
    if (spellings.size < 2) continue;
    const [newest, ...older] = [...spellings.values()].sort((a, b) => b.when - a.when);
    const [first, last] = ends(newest.key);
    for (const other of older) {
      const [otherFirst, otherLast] = ends(other.key);
      if (otherFirst === first || otherLast === last) aliases.set(other.key, newest.name);
    }
  }
  return aliases;
}

// ---------------------------------------------------------------------------
// Ranking math
// ---------------------------------------------------------------------------

// Takes the parsed results and returns the ranking the site and the app show.
// `updatedAt` is left for the caller to stamp.
function computeRankings({ asaShooters, tfaaShooters, tfaaIndoorShooters, stateRecordDetails, titles = [] }) {
  // Deduplicate records: for each (ageGroup + style + recordType + round), keep only the current holder
  // "Current" = the entry with the highest score; if tied, the most recent year
  // For outdoor, multiple rounds exist (Aggregate, Field, Hunter) — each is a separate record
  // One archer under one name: spellings an ASA number ties together, then
  // everything nameKey treats as the same.
  const aliases = asaNameAliases(asaShooters);
  const canonical = name => aliases.get(nameKey(name)) || normalizeName(name);
  const keyOf = name => nameKey(canonical(name));

  const stateRecordHolders = new Set(); // name keys of current record holders
  const recordMap = {};
  for (const rec of stateRecordDetails) {
    const key = rec.ageGroup + '||' + rec.style + '||' + rec.recordType;
    if (!recordMap[key] || rec.score > recordMap[key].score || (rec.score === recordMap[key].score && rec.year > recordMap[key].year)) {
      recordMap[key] = rec;
    }
  }
  const currentRecords = Object.values(recordMap);
  for (const rec of currentRecords) {
    stateRecordHolders.add(keyOf(rec.name || rec.normalizedName));
  }

  const allShooters = [...asaShooters, ...tfaaShooters, ...tfaaIndoorShooters];

  // The bar for a Texas ASA round: the best score anyone shot in its class in
  // the seasons read, and never less than par. Nobody shoots a perfect 3D
  // round, so measuring against the perfect score kept every Texas ASA round
  // well under a TFAA round, which is measured against the national record.
  const asaBars = {};
  for (const s of asaShooters) {
    const best = Math.max(0, ...s.eventScores.filter(v => v <= ASA_ROUND_MAX));
    asaBars[s.orgClass] = Math.max(asaBars[s.orgClass] || ASA_PAR, best);
  }

  // How many seasons back a round was shot, counting the seasons read of its
  // own organization: 0 for the newest.
  const seasons = {};
  for (const s of allShooters) {
    if (!seasons[s.org]) seasons[s.org] = new Set();
    seasons[s.org].add(s.when || 0);
  }
  const seasonsBack = s => [...seasons[s.org]].filter(when => when > (s.when || 0)).length;
  // The seasons each archer shot in each organization, newest first.
  const archerOf = s => nameKey(canonical(s.name)) + '||' + mapEquipmentClass(s.orgClass, s.org) + '||' + s.org;
  const seasonsShot = {};
  for (const s of allShooters) {
    if (!s.eventScores.some(v => v > 0)) continue;
    const k = archerOf(s);
    if (!seasonsShot[k]) seasonsShot[k] = new Set();
    seasonsShot[k].add(s.when || 0);
  }
  const recencyOf = s => {
    const back = seasonsBack(s);
    const mine = [...(seasonsShot[archerOf(s)] || [])].sort((a, b) => b - a);
    const needed = Math.min(RECENCY_WEIGHTS.length, seasons[s.org].size);
    const at = mine.indexOf(s.when || 0);
    const asIf = mine.length < needed && at >= 0 ? RECENCY_WEIGHTS.length - mine.length + at : 0;
    return RECENCY_WEIGHTS[Math.min(Math.max(back, asIf), RECENCY_WEIGHTS.length - 1)];
  };

  // First pass: compute NPS for each entry
  const npsEntries = allShooters.map(s => {
    let w = difficultyWeights[s.org] || 1.0;
    if (s.knownDistance) w = w * KNOWN_DISTANCE_FACTOR;
    // ASA max yardage bonus: longer distances = harder shots
    // 30yd=1.0 baseline, 40yd=1.03, 45yd=1.05, 50yd=1.07
    if (s.asaMaxYards) {
      if (s.asaMaxYards >= 50) w = w * 1.07;
      else if (s.asaMaxYards >= 45) w = w * 1.05;
      else if (s.asaMaxYards >= 40) w = w * 1.03;
      // 30 and below = 1.0 (no bonus)
    }
    w = w * recencyOf(s);
    // For indoor: X count bonus — (xCount/60) * 0.05 adds up to 5% for perfect X count
    const npsScores = s.eventScores.map((score, i) => {
      const rmax = (s.roundMax && s.roundMax[i]) ? s.roundMax[i] : s.maxPerRound;
      const xcap = (s.xMax && s.xMax[i]) ? s.xMax[i] : 60;
      const record = nationalRecordFor(s, i, rmax);
      const bar = record || (s.org === 'TX ASA' ? asaBars[s.orgClass] : rmax);
      let nps = (score / bar) * 1000 * w;
      if (s.xCounts && s.xCounts[i] !== undefined) {
        const xBonus = (s.xCounts[i] / xcap) * 0.05;
        nps = nps * (1 + xBonus);
      }
      // A State Championship round, in any organization. Outdoors it is the
      // field and the hunter half of the State total.
      const kind = s.roundKinds && s.roundKinds[i];
      if ((s.isState && s.isState[i]) || kind === 'field' || kind === 'hunter') {
        nps = nps * STATE_ROUND_BONUS;
      }
      // Equipment-specific bonuses based on restrictions, for rounds without a national
      // record (the record already shows how hard the style is)
      // Fingers + NO sight = 8%: BBC, Genesis, Traditional, Longbow, Barebow Recurve
      // Fingers + sight = 3%: FSL, Olympic/FSLR
      // Fixed pins + 12" stabilizer = 5%: BHFS
      // Fixed pins + 18" stabilizer = 3%: MBH
      // No arrow rest (off the shelf) = additional 3%: Longbow always, Traditional ASA only
      // FS (Freestyle): scope/lens + release + unlimited stabilizer = baseline (0%)
      if (s.orgClass && !record) {
        const ocl = s.orgClass.toLowerCase();
        if (ocl.includes('barebow compound') || ocl.includes('(bbc)')) {
          nps = nps * 1.08;
        } else if (ocl.includes('genesis')) {
          nps = nps * 1.08;
        } else if (ocl.includes('traditional') || ocl.includes('(trad)')) {
          nps = nps * 1.08;
          // Traditional in ASA = no arrow rest (off the shelf) bonus
          if (s.org === 'TX ASA') nps = nps * 1.03;
        } else if (ocl.includes('longbow') || ocl.includes('(lb)')) {
          nps = nps * 1.08;
          // Longbow always shoots off the shelf — no rest bonus
          nps = nps * 1.03;
        } else if (ocl.includes('barebow recurve') || ocl.includes('(bbr)') || ocl === 'barebow' || ocl.includes('youth barebow')) {
          nps = nps * 1.08;
        } else if (ocl.includes('olympic recurve') || ocl.includes('freestyle limited recurve') || ocl.includes('(fslr)')) {
          nps = nps * 1.03;
        } else if (ocl.includes('bowhunter freestyle') && !ocl.includes('modern') || ocl.includes('(bhfs)')) {
          nps = nps * 1.05;
        } else if (ocl.includes('modern bowhunter') || ocl.includes('(mbh)')) {
          nps = nps * 1.03;
        } else if (ocl.includes('freestyle limited') && !ocl.includes('recurve') || ocl.includes('(fsl)') && !ocl.includes('fslr')) {
          nps = nps * 1.03;
        }
      }
      return {
        nps: Math.round(nps), exact: nps, org: s.org, raw: score, orgClass: s.orgClass, event: (s.eventNames && s.eventNames[i]) ? s.eventNames[i] : null,
        eventKey: (s.eventKeys && s.eventKeys[i]) || null,
        fieldScore: s.fieldScores && s.fieldScores[i] !== undefined ? s.fieldScores[i] : score
      };
    });
    const totalX = s.xCounts ? s.xCounts.reduce((a, b) => a + b, 0) : 0;
    const eqClass = mapEquipmentClass(s.orgClass, s.org);
    return {
      normalizedName: canonical(s.name),
      org: s.org, orgClass: s.orgClass, age: s.age, when: s.when || 0,
      equipmentClass: eqClass,
      npsScores: npsScores.map(n => n.nps),
      npsWithOrg: npsScores,
      totalX,
      eventCount: s.eventScores.length,
      bestScore: Math.max(...s.eventScores)
    };
  });

  // Second pass: merge by normalized name + equipment class
  // Same person in different equipment classes gets separate rankings
  const mergedMap = {};
  for (const entry of npsEntries) {
    const key = nameKey(entry.normalizedName) + '||' + entry.equipmentClass;
    if (!mergedMap[key]) {
      mergedMap[key] = {
        key,
        name: entry.normalizedName,
        ages: [],
        equipmentClass: entry.equipmentClass,
        orgs: new Set(),
        orgClasses: [],
        allNPSWithOrg: [],
        totalX: 0,
        totalEvents: 0,
        eventsByYear: {},
        bestScore: 0
      };
    }
    const m = mergedMap[key];
    m.orgs.add(entry.org);
    m.orgClasses.push(entry.orgClass);
    m.allNPSWithOrg.push(...entry.npsWithOrg);
    m.totalX += entry.totalX;
    m.totalEvents += entry.eventCount;
    // A year is the indoor winter, then the outdoor and the Texas ASA season that follow it.
    const year = Math.ceil(entry.when);
    m.eventsByYear[year] = (m.eventsByYear[year] || 0) + entry.eventCount;
    if (entry.bestScore > m.bestScore) m.bestScore = entry.bestScore;
    m.ages.push({ age: entry.age, when: entry.when, tfaa: entry.org !== 'TX ASA' });
  }

  // Youth or adult, from the archer's newest results, so an archer who has
  // turned 18 moves to the adult list without waiting for the youth seasons to
  // leave the three-year window. A TFAA age group goes by the archer's age, so
  // it is believed over a Texas ASA class, which a young archer may shoot up
  // into. When the newest season has both, the archer is still a youth.
  function ageOf(ages) {
    const tfaa = ages.filter(a => a.tfaa);
    const believed = tfaa.length > 0 ? tfaa : ages;
    const newest = Math.max(...believed.map(a => a.when));
    return believed.some(a => a.when === newest && a.age === 'youth') ? 'youth' : 'adult';
  }

  // Titles go to the archer's ranking in the equipment class they were won in.
  // A title from before the ranked seasons (`past`) earns no bonus, and where
  // the archer has no ranking in its equipment class any more it shows on the
  // rankings the archer does have, so a career's titles are not lost.
  const rankingsOf = {};
  for (const m of Object.values(mergedMap)) {
    const name = nameKey(m.name);
    if (!rankingsOf[name]) rankingsOf[name] = [];
    rankingsOf[name].push(m.key);
  }
  const titlesByKey = {};
  for (const t of titles) {
    const key = keyOf(t.name) + '||' + mapEquipmentClass(t.orgClass, t.org);
    const keys = mergedMap[key] ? [key] : t.past ? rankingsOf[keyOf(t.name)] || [] : [];
    for (const k of keys) {
      if (!titlesByKey[k]) titlesByKey[k] = [];
      titlesByKey[k].push({
        kind: t.kind, org: t.org, season: t.season, orgClass: t.orgClass, field: t.field || 1,
        bonus: !t.past && (t.field || 1) >= TITLE_BONUS_MIN_FIELD, past: Boolean(t.past)
      });
    }
  }
  // Newest first, and Shooter of the Year before State Champion within a season.
  const titleOrder = (a, b) => b.season.slice(-4) - a.season.slice(-4) || a.kind.localeCompare(b.kind) || a.org.localeCompare(b.org);

  // Third pass: compute final rankings from merged data. It runs twice: once
  // to see where everybody stands, and again once each round has its bonus
  // for the archers it beat.
  const rankAll = () => Object.values(mergedMap).map(m => {
    // Sort NPS with org tracking together
    m.allNPSWithOrg.sort((a, b) => b.nps - a.nps);
    m.allNPS = m.allNPSWithOrg.map(r => r.nps);
    const totalEvents = m.totalEvents;
    const bestNPS = m.allNPS.length > 0 ? m.allNPS[0] : 0;

    // Always divide by 5 — fewer scores = empty slots count as 0
    const top5 = m.allNPS.slice(0, 5);
    const top5WithOrg = m.allNPSWithOrg.slice(0, 5);
    while (top5.length < 5) top5.push(0);
    let avgNPS = Math.round(top5.reduce((a, b) => a + b, 0) / 5);

    // Event count bonus (diminishing returns, rewards consistency), on the
    // events of the archer's busiest year, so that three quiet years do not
    // add up to the bonus for one busy one.
    // 3 events = baseline 1.0×, scales up to 1.06× at 8+ events
    const yearEvents = Math.max(...Object.values(m.eventsByYear));
    let eventBonus = 1.0;
    if (yearEvents >= 8) eventBonus = 1.06;
    else if (yearEvents >= 6) eventBonus = 1.05;
    else if (yearEvents >= 5) eventBonus = 1.04;
    else if (yearEvents >= 4) eventBonus = 1.02;

    // Org diversity bonus — unique orgs in the top 5 scoring rounds
    // 1 org = 1.0×, 2 orgs = 1.03×, 3+ orgs = 1.05×
    const top5Orgs = new Set(top5WithOrg.map(n => n.org));
    let orgBonus = 1.0;
    if (top5Orgs.size >= 3) orgBonus = 1.05;
    else if (top5Orgs.size >= 2) orgBonus = 1.03;

    // Title bonus: one for Shooter of the Year, one for State Champion.
    const myTitles = (titlesByKey[nameKey(m.name) + '||' + m.equipmentClass] || []).sort(titleOrder);
    const titleBonus = titleBonusOf(myTitles);

    avgNPS = Math.round(avgNPS * eventBonus * orgBonus * titleBonus);

    // Per-round breakdown for the click-through detail view.
    // Sorted highest-NPS first; the first up-to-5 non-empty rounds are the
    // ones that actually counted toward the TAGR score.
    const rounds = m.allNPSWithOrg.map((r, i) => ({
      raw: r.raw,
      nps: r.nps,
      org: r.org,
      orgClass: r.orgClass,
      event: r.event || null,
      counted: i < 5,
      // For a State Championship round: how many other archers shot the class
      // there, how many of them this round beat, and the bonus that earned.
      field: r.field || 0,
      beat: r.beat || 0,
      fieldBonus: r.fieldBonus || 0
    }));

    // Minimum 3 events to be fully ranked
    const provisional = totalEvents < 3;

    const orgsArr = [...m.orgs];
    return {
      name: m.name,
      org: orgsArr.length > 1 ? orgsArr.join(' + ') : orgsArr[0],
      orgClass: m.orgClasses[0],
      orgClasses: m.orgClasses,
      age: ageOf(m.ages),
      equipmentClass: m.equipmentClass,
      events: totalEvents,
      yearEvents,
      bestScore: m.bestScore,
      totalX: m.totalX,
      npsScores: top5, avgNPS, bestNPS,
      rounds,
      multiOrg: orgsArr.length > 1,
      provisional,
      stateRecord: stateRecordHolders.has(nameKey(m.name)),
      titles: myTitles,
      titleBonus: Math.round(titleBonus * 10000) / 10000
    };
  });

  // Where everybody stands before any field bonus: 1 for the best fully
  // ranked archer, down towards 0 for the last, equal scores sharing a
  // standing. An archer without a full ranking has none.
  const standing = {};
  const full = rankAll().filter(r => !r.provisional).sort((a, b) => b.avgNPS - a.avgNPS);
  let place = 0;
  full.forEach((r, i) => {
    if (i === 0 || r.avgNPS !== full[i - 1].avgNPS) place = i;
    standing[nameKey(r.name) + '||' + r.equipmentClass] = 1 - place / full.length;
  });

  // Who shot each State Championship, in each class: archer → the score that placed them.
  const fieldOf = {};
  const enter = (eventKey, archer, score) => {
    if (!fieldOf[eventKey]) fieldOf[eventKey] = new Map();
    if (!fieldOf[eventKey].has(archer) || score > fieldOf[eventKey].get(archer)) fieldOf[eventKey].set(archer, score);
  };
  for (const m of Object.values(mergedMap)) {
    for (const r of m.allNPSWithOrg) {
      if (r.eventKey) enter(r.eventKey, m.key, r.fieldScore);
    }
  }

  // The bonus of each round, for the archers it beat.
  for (const m of Object.values(mergedMap)) {
    for (const r of m.allNPSWithOrg) {
      if (!r.eventKey || !fieldOf[r.eventKey]) continue;
      const others = [...fieldOf[r.eventKey]].filter(([archer]) => archer !== m.key);
      const beaten = others.filter(([, score]) => score < r.fieldScore);
      const earned = beaten.reduce((sum, [archer]) => sum + FIELD_BEAT_TOP * Math.pow(standing[archer] || 0, FIELD_STANDING_POWER), 0);
      r.field = others.length;
      r.beat = beaten.length;
      r.fieldBonus = Math.round(Math.min(FIELD_BONUS_MAX, earned) * 10000) / 10000;
      r.nps = Math.round(r.exact * (1 + r.fieldBonus));
    }
  }
  // How each title compares with the other titles of its kind won in the same
  // broad class (equipment class, adults and youth apart), organization and season:
  // a State Champion by the NPS of their State score, a Shooter of the Year by
  // the average NPS of their season in the division.
  const seasonRoundsOf = {};
  for (const e of npsEntries) {
    const id = [nameKey(e.normalizedName) + '||' + e.equipmentClass, e.org, e.orgClass, Math.floor(e.when)].join('|');
    if (!seasonRoundsOf[id]) seasonRoundsOf[id] = { age: e.age, rounds: [] };
    seasonRoundsOf[id].rounds.push(...e.npsWithOrg.filter(r => r.exact > 0));
  }
  const average = list => list.reduce((sum, n) => sum + n, 0) / list.length;
  const weighed = [];
  for (const [key, list] of Object.entries(titlesByKey)) {
    for (const t of list) {
      if (!t.bonus) continue;
      const year = parseInt(t.season, 10);
      const season = seasonRoundsOf[[key, t.org, t.orgClass, year].join('|')];
      if (!season || season.rounds.length === 0) continue;
      const rounds = t.kind === 'state' ? season.rounds.filter(r => r.eventKey) : season.rounds;
      if (rounds.length === 0) continue;
      const group = [t.kind, t.org, year, key.split('||')[1], season.age === 'youth' ? 'youth' : 'adult'].join('|');
      weighed.push({ t, group, score: average(rounds.map(r => r.exact)) });
    }
  }
  for (const group of new Set(weighed.map(x => x.group))) {
    const titlesOf = weighed.filter(x => x.group === group);
    const best = Math.max(...titlesOf.map(x => x.score));
    const worst = Math.min(...titlesOf.map(x => x.score));
    for (const { t, score } of titlesOf) {
      t.titleScore = Math.round(score);
      t.of = titlesOf.length;
      t.weight = best === worst ? 1
        : Math.round((TITLE_WEIGHT_MIN + (TITLE_WEIGHT_MAX - TITLE_WEIGHT_MIN) * (score - worst) / (best - worst)) * 100) / 100;
    }
  }
  const rankings = rankAll();

  // Best TAGR score first. Equal scores share a rank on the site; among them
  // the better single round comes first, then the name, so the order is the
  // same on every rebuild.
  rankings.sort((a, b) => b.avgNPS - a.avgNPS || b.bestNPS - a.bestNPS || a.name.localeCompare(b.name));
  const titled = rankings.filter(r => r.titles.length > 0);

  // Build state records summary for API
  const stateRecordsByName = {};
  // Keyed by the name the archer is ranked under, in lower case, which is how the site looks them up.
  const rankedAs = {};
  for (const r of rankings) rankedAs[nameKey(r.name)] = r.name;
  for (const rec of currentRecords) {
    const name = rec.name || rec.normalizedName;
    const key = (rankedAs[keyOf(name)] || canonical(name)).toLowerCase();
    if (!stateRecordsByName[key]) stateRecordsByName[key] = [];
    stateRecordsByName[key].push({
      type: rec.recordType, ageGroup: rec.ageGroup,
      style: rec.style, year: rec.year, score: rec.score
    });
  }

  return {
    adult: addTypeRanks(rankings.filter(r => r.age === 'adult')),
    youth: addTypeRanks(rankings.filter(r => r.age === 'youth')),
    sources: {
      txAsa: asaShooters.length,
      tfaa: tfaaShooters.length,
      tfaaIndoor: tfaaIndoorShooters.length,
      totalEntries: allShooters.length,
      total: rankings.length,
      merged: allShooters.length - rankings.length,
      stateRecordHolders: stateRecordHolders.size,
      stateRecords: currentRecords.length,
      asaBars,
      titleHolders: new Set(titled.map(r => r.name.toLowerCase())).size,
      soyTitles: titled.reduce((n, r) => n + r.titles.filter(t => t.kind === 'soy').length, 0),
      stateTitles: titled.reduce((n, r) => n + r.titles.filter(t => t.kind === 'state').length, 0)
    },
    stateRecords: stateRecordsByName
  };
}

// ---------------------------------------------------------------------------
// Reading the sources
// ---------------------------------------------------------------------------

function gvizUrl(sheetId, query) {
  return 'https://docs.google.com/spreadsheets/d/' + sheetId + '/gviz/tq?tq=select%20*&headers=1&' + query;
}

// Reads every source page. A page that cannot be read adds nothing to the
// ranking and is listed in `problems`, as is a page with rows that could not
// be read, so the caller can decide whether the result is good enough to
// publish. `pages` lists every page that was read and how many results it held.
// `asaSnapshots` are the saved copies of the Texas ASA sheet. `asaLive` in the
// answer is the sheet as it should be saved now: its year and its class tabs.
// `asaStateResults` are the saved results of the Texas ASA State Championships.
async function readSources(fetchText, { asaSnapshots = [], asaStateResults = [] } = {}) {
  const problems = [];
  const pages = [];
  let requests = 0;

  // Returns the page body, or null after noting why it could not be read.
  async function read(url, what) {
    requests++;
    try {
      return await fetchText(url);
    } catch (err) {
      problems.push({ what, url, error: err && err.message ? err.message : String(err) });
      return null;
    }
  }

  // Reads one class tab of a Texas ASA sheet. Returns null when there is nothing to count.
  async function readAsaTab(sheetId, year, tab, where) {
    const what = 'TX ASA ' + year + ', ' + (where.sheet || tab.name);
    const url = gvizUrl(sheetId, where.gid ? 'gid=' + where.gid : 'sheet=' + encodeURIComponent(where.sheet));
    const raw = await read(url, what);
    if (raw === null) return null;
    let table = null;
    try { table = parseGvizTable(raw); } catch (err) { table = null; }
    if (!table) {
      problems.push({ what, url, error: 'Google Sheets did not send the tab (is the sheet still public?)' });
      return null;
    }
    // Asked by name for a tab it does not have, a sheet sends its summary tab.
    // A real class tab has a FIRST NAME column.
    if (where.sheet && !table.cols.some(c => c.label && c.label.toUpperCase().includes('FIRST'))) {
      return { what, url, tab, year, shooters: [], note: 'the sheet has no tab of this name' };
    }
    return { what, url, tab, year, table: asaTableToKeep(table) };
  }

  async function readAsaSheet(sheetId, year, whereFor) {
    const found = [];
    const tabs = ASA_TABS.filter(tab => whereFor(tab) !== null);
    for (let i = 0; i < tabs.length; i += ASA_BATCH_SIZE) {
      const batch = tabs.slice(i, i + ASA_BATCH_SIZE);
      found.push(...await Promise.all(batch.map(tab => readAsaTab(sheetId, year, tab, whereFor(tab)))));
    }
    return found.filter(Boolean);
  }

  // The sheet of the season being shot (tabs by gid, or by name). Which year
  // it holds is told by the newest saved copy: the same year while the copy's
  // scores are still on it, the next year once they are gone.
  const newestCopy = asaSnapshots.slice().sort((a, b) => b.year - a.year)[0] || null;
  const asaTabs = await readAsaSheet(ASA_SOY_SHEET, newestCopy ? newestCopy.year : ASA_LIVE_YEAR, tab => (tab.gid ? { gid: tab.gid } : tab.tab ? { sheet: tab.tab } : null));
  const liveTables = {};
  for (const t of asaTabs) if (t.table) liveTables[t.tab.name] = t.table;
  const sameSeason = Boolean(newestCopy) && sameAsaSeason(newestCopy, liveTables);
  const liveYear = newestCopy ? (sameSeason ? newestCopy.year : newestCopy.year + 1) : ASA_LIVE_YEAR;
  for (const t of asaTabs) {
    t.what = t.what.replace('TX ASA ' + t.year, 'TX ASA ' + liveYear);
    t.year = liveYear;
  }
  // While the sheet holds the copy's season, a class that has lost scores
  // since the copy was saved (a tab cleared early) is read from the copy.
  const copyUrl = year => 'archive/asa-' + year + '.json';
  if (sameSeason) {
    for (const tab of ASA_TABS) {
      const saved = newestCopy.tabs[tab.name];
      if (!saved || asaScoreCount(saved) <= asaScoreCount(liveTables[tab.name])) continue;
      const read = asaTabs.find(t => t.tab === tab);
      const kept = { what: 'TX ASA ' + liveYear + ', ' + tab.name, url: copyUrl(liveYear), tab, year: liveYear, table: saved, note: 'the saved copy has more scores than the sheet, so it is used' };
      if (read) Object.assign(read, kept);
      else asaTabs.push(kept);
      liveTables[tab.name] = saved;
    }
  }
  // The years before, newest first, as far back as is ranked: from a saved
  // copy where there is one, else from the 2025 and 2024 sheets (tabs by name).
  // A sheet cleared for a season nobody has shot in yet does not count as a year.
  const newestRanked = Object.values(liveTables).some(table => asaScoreCount(table) > 0) ? liveYear : liveYear - 1;
  for (let year = Math.min(newestRanked, liveYear - 1); year > newestRanked - ASA_YEARS_RANKED; year--) {
    const copy = asaSnapshots.find(c => c.year === year);
    const sheet = ASA_ARCHIVE_SHEETS.find(a => a.year === year);
    if (copy) {
      for (const tab of ASA_TABS) {
        if (copy.tabs[tab.name]) asaTabs.push({ what: 'TX ASA ' + year + ', ' + tab.name, url: copyUrl(year), tab, year, table: copy.tabs[tab.name], note: 'from the saved copy of the sheet' });
      }
    } else if (sheet) {
      asaTabs.push(...await readAsaSheet(sheet.id, sheet.year, tab => (tab.archive === null ? null : { sheet: tab.archive || tab.name })));
    }
  }
  for (const t of asaTabs) {
    if (!t.table) continue;
    t.shooters = parseAsaRows(t.table, t.tab, t.year);
    t.rows = JSON.stringify([t.table.cols.map(c => c.label), t.table.rows]);
  }
  // Each year's sheet starts as a copy of the one before, and a class nobody
  // shot in can still hold last year's rows. A tab with exactly the rows of the
  // same class in an older sheet is that leftover, so it is not counted again.
  for (const newer of asaTabs) {
    const older = asaTabs.find(t => t.tab === newer.tab && t.year < newer.year && t.rows !== undefined && t.rows === newer.rows);
    if (older && newer.shooters.length > 0) {
      newer.shooters = [];
      newer.note = 'the same rows as the ' + older.year + ' sheet, so not counted twice';
    }
  }
  // The State Championships the project has the results of, for the years ranked.
  const asaYears = new Set(asaTabs.map(t => t.year));
  for (const official of asaStateResults) {
    if (!asaYears.has(official.year)) continue;
    const added = addAsaStateResults(official, asaTabs);
    pages.push({ what: 'TX ASA ' + official.year + ' State Championship', url: 'archive/asa-state-' + official.year + '.json', results: official.results.length, note: added + ' State rounds the sheet did not have' });
  }
  const titles = [];
  for (const year of asaYears) {
    titles.push(...asaTitlesOf(year, asaTabs.filter(t => t.year === year && t.shooters), asaStateResults.find(o => o.year === year) || null));
  }
  const asaShooters = [];
  for (const t of asaTabs) {
    asaShooters.push(...t.shooters);
    pages.push(t.note ? { what: t.what, url: t.url, results: t.shooters.length, note: t.note } : { what: t.what, url: t.url, results: t.shooters.length });
  }

  // Which TFAA seasons there are
  const seasonListHtml = await read(TFAA_SEASON_LIST_URL, 'TFAA season list');
  const seasons = seasonListHtml === null ? [] : parseTfaaSeasonList(seasonListHtml);
  if (seasonListHtml !== null && seasons.length === 0) {
    problems.push({ what: 'TFAA season list', url: TFAA_SEASON_LIST_URL, error: 'the page had no season list on it' });
  }

  // Reads the newest seasons of one kind. A season nobody has shot in yet is
  // passed over for the one before it, so three seasons with scores are ranked.
  // An unreadable season is not replaced: it is a problem, not an empty season.
  const seasonsRead = new Set();
  async function readTfaaSeasons(kind) {
    const shooters = [];
    let counted = 0;
    for (const season of seasons) {
      if (season.kind !== kind) continue;
      if (counted === TFAA_SEASONS_RANKED) break;
      seasonsRead.add(season.id);
      const what = 'TFAA ' + season.label;
      const url = TFAA_BASE + '/results/sywat/' + season.id;
      const html = await read(url, what);
      counted++;
      if (html === null) continue;
      const layout = tfaaPageLayout(html);
      if (layout === null && />\s*0 Entries\s*</.test(html)) {
        counted--;
        pages.push({ what, url, results: 0, note: 'no scores yet' });
        continue;
      }
      let error = null;
      let page = null;
      if (layout === null) {
        error = 'the page had no results on it';
      } else if (layout !== kind) {
        error = 'it is listed as an ' + kind + ' season but the page holds ' + layout + ' scores';
      } else {
        page = parseTfaaPage(html, season.label, kind);
        if (page.shooters.length === 0) error = 'the page had no results on it';
      }
      if (error) {
        problems.push({ what, url, error });
        continue;
      }
      // Rows that could not be read are a problem too, but the rest of the page still counts.
      if (page.unreadRows > 0) {
        problems.push({ what, url, error: page.unreadRows + ' of its rows did not fit the column headings' });
      }
      const notes = [];
      if (page.repeatedState > 0) {
        notes.push((page.repeatedState === 1 ? '1 State score' : page.repeatedState + ' State scores') + ' listed twice, counted once');
      }
      if (page.aboveMax.length > 0) {
        notes.push((page.aboveMax.length === 1 ? '1 score' : page.aboveMax.length + ' scores') + ' above the round maximum left out');
      }
      const summary = { what, url, results: page.shooters.length };
      if (notes.length > 0) summary.note = notes.join('; ');
      if (page.aboveMax.length > 0) summary.leftOut = page.aboveMax;
      pages.push(summary);
      shooters.push(...page.shooters);
      titles.push(...page.titles);
    }
    return shooters;
  }

  const tfaaShooters = await readTfaaSeasons('outdoor');
  const tfaaIndoorShooters = await readTfaaSeasons('indoor');

  // The titles of the seasons before the ranked ones. They are for show, so a
  // page that cannot be read here is noted and passed over: it never holds
  // the standings back.
  async function readQuietly(url) {
    requests++;
    try {
      return await fetchText(url);
    } catch (err) {
      return null;
    }
  }
  for (const season of seasons) {
    if (seasonsRead.has(season.id) || season.year < TFAA_TITLES_FROM) continue;
    const what = 'TFAA ' + season.label + ' titles';
    const url = TFAA_BASE + '/results/sywat/' + season.id;
    const html = await readQuietly(url);
    const layout = html === null ? null : tfaaPageLayout(html);
    if (layout === null) {
      if (html === null) pages.push({ what, url, results: 0, note: 'could not be read' });
      continue;
    }
    const page = parseTfaaPage(html, season.label, layout);
    const org = layout === 'outdoor' ? 'TFAA Outdoor' : 'TFAA Indoor';
    const yr = season.label.replace(/\s*(Outdoor|Indoor)\s*/i, '').trim();
    const past = page.titles.filter(t => t.kind === 'soy').map(t => ({ ...t, past: true }));
    const notes = [];
    const list = await readQuietly(TFAA_BASE + '/results/season/' + season.id);
    const stateShoots = list === null ? [] : parseTfaaStateShoots(list);
    if (list === null) notes.push('its list of shoots could not be read');
    const champions = new Map();
    for (const id of stateShoots) {
      const results = await readQuietly(TFAA_BASE + '/results/' + id);
      if (results === null) {
        notes.push('its State Championship results could not be read');
        continue;
      }
      // Where two pages hold the State Championship, a division's champion is the first found.
      for (const t of parseTfaaStateChampions(results, org, yr)) {
        if (!champions.has(t.orgClass)) champions.set(t.orgClass, t);
      }
    }
    past.push(...champions.values());
    titles.push(...past);
    pages.push(notes.length > 0 ? { what, url, results: past.length, note: notes.join('; ') } : { what, url, results: past.length });
  }

  const recordPages = await Promise.all(TFAA_RECORD_PAGES.map(async page => {
    const what = 'TFAA ' + page.type + ' records';
    const html = await read(page.url, what);
    if (html === null) return [];
    const records = parseTfaaRecordsHtml(html, page.type);
    if (records.length === 0) problems.push({ what, url: page.url, error: 'the page had no records on it' });
    pages.push({ what, url: page.url, results: records.length });
    return records;
  }));
  const stateRecordDetails = recordPages.flat();

  return { asaShooters, tfaaShooters, tfaaIndoorShooters, stateRecordDetails, titles, requests, problems, pages, asaLive: { year: liveYear, tabs: liveTables } };
}

// Reads the sources and works out the ranking.
// Returns { result, problems, pages, requests }: `result` is what api/tgr.json holds.
async function buildRankings({ fetchText, now = () => new Date(), asaSnapshots = [], asaStateResults = [] }) {
  const sources = await readSources(fetchText, { asaSnapshots, asaStateResults });
  const result = computeRankings(sources);
  result.updatedAt = now().toISOString();
  return { result, problems: sources.problems, pages: sources.pages, requests: sources.requests, asaLive: sources.asaLive };
}

module.exports = {
  buildRankings,
  readSources,
  computeRankings,
  parseGvizTable,
  parseAsaRows,
  parseTfaaOutdoorHtml,
  parseTfaaIndoorHtml,
  parseTfaaRecordsHtml,
  parseTfaaSeasonList,
  parseTfaaPage,
  parseTfaaStateShoots,
  parseTfaaStateChampions,
  asaTitlesOf,
  asaClassTab,
  addAsaStateResults,
  sameAsaSeason,
  tfaaPageLayout,
  mapEquipmentClass,
  normalizeName,
  nameKey,
  asaNameAliases,
  ASA_TABS,
  rules
};
