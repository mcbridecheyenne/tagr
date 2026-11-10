'use strict';

// TAGR (Texas Archery Global Ranking) engine.
//
// Reads the Texas ASA standings sheets and the TFAA results and records
// pages, turns every score into a Normalized Performance Score (NPS), and
// ranks archers on the average of their best five. It knows nothing about
// Express or the database, so the site, a script and the tests all run the
// same code.

// ---- TX ASA: the 2026 Shooter of the Year sheet, and the 2025 and 2024 sheets ----
const ASA_SOY_SHEET = '1xZyOXGonL0NljMLx0suiGWy85JkSWLR7LIUaK0_P1FE';
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
const TFAA_RECORD_PAGES = [
  { type: 'indoor', url: TFAA_BASE + '/records/indoor' },
  { type: 'outdoor', url: TFAA_BASE + '/records/outdoor' },
  { type: '900', url: TFAA_BASE + '/records/900' }
];
const adultAges = ['Adult Male','Adult Female','Senior Male','Senior Female','Silver Senior Male','Silver Senior Female','Master Senior Male','Master Senior Female'];

// NPS = (score / max) * 1000 * difficulty_weight
// Difficulty ranking: TFAA Outdoor (hardest) > ASA 3D > TFAA Indoor (easiest)
const difficultyWeights = { 'TX ASA': 1.05, 'TFAA Outdoor': 1.08, 'TFAA Indoor': 0.95 };
// ASA Known distance classes are easier (rangefinders allowed) — reduce weight
const KNOWN_DISTANCE_FACTOR = 0.95;
// State Championship rounds count for more than a regular SYWAT round
const STATE_ROUND_BONUS = 1.15;
// TFAA rounds are scored against the NFAA national record for the archer's style, not
// against the perfect score: tying the national record is worth 1000 (before weights and
// bonuses) whatever the bow. These are the best adult records of men and women, amateur
// or pro, from NFAA's national records (indoor list updated August 2025, field list July
// 2025): https://nfaausa.com/files/indoor-national-records-120825152848.pdf and
// https://nfaausa.com/files/field-national-records-080725200516.pdf
// indoor: the two-day 300 round total (out of 600); field and hunter: one 28-target round
// (out of 560). BBC is NFAA's "Barebow" style. A style that is not listed here (MBH,
// Genesis) is scored against the perfect score with its equipment bonus, like Texas ASA.
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
const NATIONAL_RECORDS_STYLES = {
  FS: 'Freestyle', BHFS: 'Bowhunter Freestyle', FSL: 'Freestyle Limited', BBC: 'Barebow Compound',
  FSLR: 'Freestyle Limited Recurve, Olympic', BBR: 'Barebow Recurve', TRAD: 'Traditional', LB: 'Longbow'
};
// The "How TAGR Works" page prints these, so it cannot drift from the math.
const rules = {
  weights: difficultyWeights, knownDistanceFactor: KNOWN_DISTANCE_FACTOR, stateRoundBonus: STATE_ROUND_BONUS,
  nationalRecords: NATIONAL_RECORDS, nationalRecordStyles: NATIONAL_RECORDS_STYLES
};

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

function parseAsaRows(res, tab) {
  const rows = Array.isArray(res) ? res : (res.rows || []);
  const cols = Array.isArray(res) ? [] : (res.cols || []);
  // Build event-name lookup from column labels (score columns start at index 5).
  // Some sheets repeat a "STATE" label with a trailing blank column; label them clearly.
  function eventNameFor(j) {
    const label = cols[j] && cols[j].label ? String(cols[j].label).trim() : '';
    if (label) return label.replace(/\s+/g, ' ');
    return 'Event ' + (j - 4);
  }
  const shooters = [];
  for (const row of rows) {
    const cells = row.c || [];
    const firstName = cells[1] && cells[1].v ? String(cells[1].v) : '';
    const lastName = cells[2] && cells[2].v ? String(cells[2].v) : '';
    if (!firstName && !lastName) continue;
    const eventScores = [];
    const eventNames = [];
    for (let j = 5; j < cells.length; j++) {
      if (cells[j] && cells[j].v) {
        const v = parseFloat(String(cells[j].f || cells[j].v));
        if (!isNaN(v) && v > 0) {
          eventScores.push(Math.floor(v));
          eventNames.push(eventNameFor(j));
        }
      }
    }
    if (eventScores.length === 0) continue;
    shooters.push({
      name: (firstName + ' ' + lastName).trim(),
      org: 'TX ASA', orgClass: tab.name, age: tab.age,
      knownDistance: tab.known || false,
      asaMaxYards: tab.maxYards || 40,
      eventScores, eventNames, maxPerRound: 360
    });
  }
  return shooters;
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
  let adult = false;
  let style = '';
  let columns = null;
  for (const row of html.split('<tr')) {
    const known = row.match(TFAA_AGE_GROUP);
    if (known) {
      age = known[1].replace(/\s+/g, ' ').trim();
      adult = adultAges.includes(age);
    } else if (row.includes('results-dgp')) {
      // An age group this code has not met. It keeps its own name, so its
      // archers are not filed under the group above, and counts as adult
      // when its age range starts at 18 or over.
      const heading = tfaaCells(row)[0] || '';
      const range = heading.match(/\((\d+)[^)]*\)$/);
      age = heading.replace(/\s*\([^)]*\)$/, '');
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
    entries.push({ name: cells[nameAt], age, adult, style, scores });
  }
  return { entries, unreadRows };
}

// One season's page → the archers on it and their rounds.
//   kind            'outdoor' or 'indoor'
//   repeatedState   State scores listed a second time, which were counted once
//   unreadRows      score rows that could not be read
//   aboveMax        scores above the most their round can score, which were left out
function parseTfaaPage(html, seasonLabel, kind) {
  const outdoor = kind === 'outdoor';
  const { entries, unreadRows } = readTfaaEntries(html);
  const yr = (seasonLabel || (outdoor ? 'Outdoor' : 'Indoor')).replace(outdoor ? /\s*Outdoor\s*/i : /\s*Indoor\s*/i, '').trim();
  const roundName = yr ? yr + (outdoor ? ' SYWAT' : ' Indoor') : (outdoor ? 'SYWAT' : 'Indoor');
  const stateName = (yr ? yr + ' ' : '') + (outdoor ? 'State Outdoor' : 'State Indoor');

  // The State Championship is shot once a season. The site can list an archer
  // twice in one class, with the State score on both rows: that is one shoot.
  const stateCounted = new Set();
  let repeatedState = 0;
  function isRepeat(entry, score) {
    const key = [normalizeName(entry.name).toLowerCase(), entry.age, entry.style, score].join('|');
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
        } else {
          if (isAboveMax(entry, score, TFAA_OUTDOOR_ROUND_MAX)) continue;
          n++;
          eventScores.push(score);
          eventNames.push(roundName + ' #' + n);
          roundKinds.push('sywat');
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
      }
    }
    if (!entry.name || eventScores.length === 0) continue;
    const who = { name: entry.name, org: outdoor ? 'TFAA Outdoor' : 'TFAA Indoor', orgClass: entry.age + ' - ' + entry.style, age: entry.adult ? 'adult' : 'youth' };
    shooters.push(outdoor
      ? { ...who, eventScores, eventNames, roundKinds, maxPerRound: TFAA_OUTDOOR_ROUND_MAX }
      : { ...who, eventScores, xCounts, isState, eventNames, roundMax, xMax, maxPerRound: TFAA_INDOOR_ROUND_MAX });
  }
  return { shooters, repeatedState, unreadRows, aboveMax };
}

function parseTfaaOutdoorHtml(html, seasonLabel) {
  return parseTfaaPage(html, seasonLabel, 'outdoor').shooters;
}

function parseTfaaIndoorHtml(html, seasonLabel) {
  return parseTfaaPage(html, seasonLabel, 'indoor').shooters;
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
  const style = ((s.orgClass || '').match(/\(([A-Z]+)\)\s*$/) || [])[1];
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
function normalizeName(name) {
  let n = name.trim();
  if (n.includes(',')) {
    // Last, First -> First Last
    const parts = n.split(',').map(s => s.trim());
    n = parts[1] + ' ' + parts[0];
  }
  // Title case, preserving Mc/Mac capitalization
  return n.replace(/\w\S*/g, w => {
    let titled = w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    // Handle Mc prefix (McBride, McDonald, etc.)
    if (titled.match(/^Mc[a-z]/)) titled = titled.slice(0,2) + titled.charAt(2).toUpperCase() + titled.slice(3);
    return titled;
  });
}

// ---------------------------------------------------------------------------
// Ranking math
// ---------------------------------------------------------------------------

// Takes the parsed results and returns the ranking the site and the app show.
// `updatedAt` is left for the caller to stamp.
function computeRankings({ asaShooters, tfaaShooters, tfaaIndoorShooters, stateRecordDetails }) {
  // Deduplicate records: for each (ageGroup + style + recordType + round), keep only the current holder
  // "Current" = the entry with the highest score; if tied, the most recent year
  // For outdoor, multiple rounds exist (Aggregate, Field, Hunter) — each is a separate record
  const stateRecordHolders = new Set(); // normalized names of current record holders
  const recordMap = {};
  for (const rec of stateRecordDetails) {
    const key = rec.ageGroup + '||' + rec.style + '||' + rec.recordType;
    if (!recordMap[key] || rec.score > recordMap[key].score || (rec.score === recordMap[key].score && rec.year > recordMap[key].year)) {
      recordMap[key] = rec;
    }
  }
  const currentRecords = Object.values(recordMap);
  for (const rec of currentRecords) {
    stateRecordHolders.add(rec.normalizedName.toLowerCase());
  }

  const allShooters = [...asaShooters, ...tfaaShooters, ...tfaaIndoorShooters];

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
    // For indoor: X count bonus — (xCount/60) * 0.05 adds up to 5% for perfect X count
    const npsScores = s.eventScores.map((score, i) => {
      const rmax = (s.roundMax && s.roundMax[i]) ? s.roundMax[i] : s.maxPerRound;
      const xcap = (s.xMax && s.xMax[i]) ? s.xMax[i] : 60;
      const record = nationalRecordFor(s, i, rmax);
      let nps = (score / (record || rmax)) * 1000 * w;
      if (s.xCounts && s.xCounts[i] !== undefined) {
        const xBonus = (s.xCounts[i] / xcap) * 0.05;
        nps = nps * (1 + xBonus);
      }
      if (s.isState && s.isState[i]) {
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
      return { nps: Math.round(nps), org: s.org, raw: score, orgClass: s.orgClass, event: (s.eventNames && s.eventNames[i]) ? s.eventNames[i] : null };
    });
    const totalX = s.xCounts ? s.xCounts.reduce((a, b) => a + b, 0) : 0;
    const eqClass = mapEquipmentClass(s.orgClass, s.org);
    return {
      normalizedName: normalizeName(s.name),
      org: s.org, orgClass: s.orgClass, age: s.age,
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
    const key = entry.normalizedName.toLowerCase() + '||' + entry.equipmentClass;
    if (!mergedMap[key]) {
      mergedMap[key] = {
        name: entry.normalizedName,
        age: entry.age,
        equipmentClass: entry.equipmentClass,
        orgs: new Set(),
        orgClasses: [],
        allNPS: [],
        allNPSWithOrg: [],
        totalX: 0,
        totalEvents: 0,
        bestScore: 0
      };
    }
    const m = mergedMap[key];
    m.orgs.add(entry.org);
    m.orgClasses.push(entry.orgClass);
    m.allNPS.push(...entry.npsScores);
    m.allNPSWithOrg.push(...entry.npsWithOrg);
    m.totalX += entry.totalX;
    m.totalEvents += entry.eventCount;
    if (entry.bestScore > m.bestScore) m.bestScore = entry.bestScore;
    if (entry.age === 'youth') m.age = entry.age;
  }

  // Third pass: compute final rankings from merged data
  const rankings = Object.values(mergedMap).map(m => {
    // Sort NPS with org tracking together
    m.allNPSWithOrg.sort((a, b) => b.nps - a.nps);
    m.allNPS.sort((a, b) => b - a);
    const totalEvents = m.totalEvents;
    const bestNPS = m.allNPS.length > 0 ? m.allNPS[0] : 0;

    // Always divide by 5 — fewer scores = empty slots count as 0
    const top5 = m.allNPS.slice(0, 5);
    const top5WithOrg = m.allNPSWithOrg.slice(0, 5);
    while (top5.length < 5) top5.push(0);
    let avgNPS = Math.round(top5.reduce((a, b) => a + b, 0) / 5);

    // Event count bonus (diminishing returns, rewards consistency)
    // 3 events = baseline 1.0×, scales up to 1.06× at 8+ events
    let eventBonus = 1.0;
    if (totalEvents >= 8) eventBonus = 1.06;
    else if (totalEvents >= 6) eventBonus = 1.05;
    else if (totalEvents >= 5) eventBonus = 1.04;
    else if (totalEvents >= 4) eventBonus = 1.02;

    // Org diversity bonus — unique orgs in the top 5 scoring rounds
    // 1 org = 1.0×, 2 orgs = 1.03×, 3+ orgs = 1.05×
    const top5Orgs = new Set(top5WithOrg.map(n => n.org));
    let orgBonus = 1.0;
    if (top5Orgs.size >= 3) orgBonus = 1.05;
    else if (top5Orgs.size >= 2) orgBonus = 1.03;

    avgNPS = Math.round(avgNPS * eventBonus * orgBonus);

    // Per-round breakdown for the click-through detail view.
    // Sorted highest-NPS first; the first up-to-5 non-empty rounds are the
    // ones that actually counted toward the TAGR score.
    const rounds = m.allNPSWithOrg.map((r, i) => ({
      raw: r.raw,
      nps: r.nps,
      org: r.org,
      orgClass: r.orgClass,
      event: r.event || null,
      counted: i < 5
    }));

    // Minimum 3 events to be fully ranked
    const provisional = totalEvents < 3;

    const orgsArr = [...m.orgs];
    return {
      name: m.name,
      org: orgsArr.length > 1 ? orgsArr.join(' + ') : orgsArr[0],
      orgClass: m.orgClasses[0],
      orgClasses: m.orgClasses,
      age: m.age,
      equipmentClass: m.equipmentClass,
      events: totalEvents,
      bestScore: m.bestScore,
      totalX: m.totalX,
      npsScores: top5, avgNPS, bestNPS,
      rounds,
      multiOrg: orgsArr.length > 1,
      provisional,
      stateRecord: stateRecordHolders.has(m.name.toLowerCase())
    };
  });

  // Sort by avgNPS descending
  rankings.sort((a, b) => b.avgNPS - a.avgNPS);

  // Build state records summary for API
  const stateRecordsByName = {};
  for (const rec of currentRecords) {
    const key = rec.normalizedName.toLowerCase();
    if (!stateRecordsByName[key]) stateRecordsByName[key] = [];
    stateRecordsByName[key].push({
      type: rec.recordType, ageGroup: rec.ageGroup,
      style: rec.style, year: rec.year, score: rec.score
    });
  }

  return {
    adult: rankings.filter(r => r.age === 'adult'),
    youth: rankings.filter(r => r.age === 'youth'),
    sources: {
      txAsa: asaShooters.length,
      tfaa: tfaaShooters.length,
      tfaaIndoor: tfaaIndoorShooters.length,
      totalEntries: allShooters.length,
      total: rankings.length,
      merged: allShooters.length - rankings.length,
      stateRecordHolders: stateRecordHolders.size,
      stateRecords: currentRecords.length
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
async function readSources(fetchText) {
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
    return { what, url, tab, year, shooters: parseAsaRows(table, tab), rows: JSON.stringify([table.cols.map(c => c.label), table.rows]) };
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

  // TX ASA 2026 (tabs by gid, or by name), then the 2025 and 2024 sheets (tabs by name)
  const asaTabs = await readAsaSheet(ASA_SOY_SHEET, 2026, tab => (tab.gid ? { gid: tab.gid } : tab.tab ? { sheet: tab.tab } : null));
  for (const archive of ASA_ARCHIVE_SHEETS) {
    asaTabs.push(...await readAsaSheet(archive.id, archive.year, tab => (tab.archive === null ? null : { sheet: tab.archive || tab.name })));
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
  async function readTfaaSeasons(kind) {
    const shooters = [];
    let counted = 0;
    for (const season of seasons) {
      if (season.kind !== kind) continue;
      if (counted === TFAA_SEASONS_RANKED) break;
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
    }
    return shooters;
  }

  const tfaaShooters = await readTfaaSeasons('outdoor');
  const tfaaIndoorShooters = await readTfaaSeasons('indoor');

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

  return { asaShooters, tfaaShooters, tfaaIndoorShooters, stateRecordDetails, requests, problems, pages };
}

// Reads the sources and works out the ranking.
// Returns { result, problems, pages, requests }: `result` is what api/tgr.json holds.
async function buildRankings({ fetchText, now = () => new Date() }) {
  const sources = await readSources(fetchText);
  const result = computeRankings(sources);
  result.updatedAt = now().toISOString();
  return { result, problems: sources.problems, pages: sources.pages, requests: sources.requests };
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
  tfaaPageLayout,
  mapEquipmentClass,
  normalizeName,
  ASA_TABS,
  rules
};
