// Made-up source pages for the TAGR tests.
//
// These mimic the two places TAGR reads from: the Texas ASA Google Sheets
// (the "gviz" JSON-in-a-function format) and the TFAA results and records
// pages (HTML tables). Every archer here is invented.
//
// responseFor(url) returns the page body for a URL TAGR asks for, or null if
// the fixture set has nothing for it.

const ASA_2026 = '1xZyOXGonL0NljMLx0suiGWy85JkSWLR7LIUaK0_P1FE';
const ASA_2025 = '1_JG82xQPkp-qsKmsHcxMRsWOcifCJy8ANfzGjf0FoAk';
const ASA_2024 = '10zDwD5voueDqoNhHMDrMezOIvVT2atpGHFc2_kVmfIc';

// ---------- Google Sheets (gviz) ----------

function cell(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return { v: value, f: String(value) };
  if (typeof value === 'object') return value;
  return { v: value };
}

function gviz(labels, rows) {
  const table = {
    cols: labels.map((label, i) => ({ id: String.fromCharCode(65 + i), label, type: i >= 4 ? 'number' : 'string' })),
    rows: rows.map(r => ({ c: r.map(cell) })),
    parsedNumHeaders: 1
  };
  return '/*O_o*/\ngoogle.visualization.Query.setResponse(' +
    JSON.stringify({ version: '0.6', reqId: '0', status: 'ok', sig: '1', table }) + ');';
}

const ASA_LABELS_2026 = ['PLACE', 'FIRST NAME', 'LAST NAME', 'ASA #', 'CITY', 'PARIS', 'STEPHENVILLE ', 'TEMPLE', 'STATE', '', 'BROWNWOOD', 'KILGORE'];
const ASA_LABELS_ARCHIVE = ['PLACE', 'FIRST NAME', 'LAST NAME', 'ASA #', 'CITY', 'Qualifier  1', 'Qualifier 2', 'STATE'];
const EMPTY_TAB = gviz(ASA_LABELS_2026, []);
// What Google returns when a tab name does not exist: the first (summary) sheet.
const SUMMARY_SHEET = gviz(['CLASS', 'SHOOTERS', 'AVERAGE'], [['Open Pro', 14, 331.2], ['Known 50', 22, 318.9]]);

const asa2026ByGid = {
  // Open Pro (unknown distance, 50 yards)
  '795531792': gviz(ASA_LABELS_2026, [
    [1, 'AVERY', 'QUILLFEATHER', 'TX1001', 'Paris', 352, 340, { v: 0, f: '0' }, 348, null, 'DNS'],
    [2, 'DANA', 'MCARROW', 'TX1002', 'Waco', { v: 330.5, f: '330.5' }, null, 318],
    [3, null, null, 'TX1003', 'Nowhere', 300, 301],
    [4, 'NO', 'SCORES', 'TX1004', 'Austin', null, null, null]
  ]),
  // Men's Open 45
  '160365011': gviz(ASA_LABELS_2026, [
    [1, 'RILEY', 'STABILIZER', 'TX1010', 'Tyler', 320, 325, 330, 335, null, 340, 345]
  ]),
  // Men's Pins 30 (unknown distance, 30 yards)
  '370061797': gviz(ASA_LABELS_2026, [
    [1, 'SAM', 'BROADHEAD', 'TX1020', 'Lufkin', 300, 290, 310],
    [2, 'ONE', 'TIMER', 'TX1021', 'Lufkin', 280],
    [3, 'TWO', 'TIMER', 'TX1022', 'Lufkin', null, 281, 279],
    [4, 'THREE', 'EVENTS', 'TX1023', 'Lufkin', 281, 279, 283]
  ]),
  // Known 50
  '1270453854': gviz(ASA_LABELS_2026, [
    [1, 'AVERY', 'QUILLFEATHER', 'TX1001', 'Paris', 344, 350],
    [2, 'PAT', "O'NOCK", 'TX1030', 'Dallas', 322, 300, 310, 298]
  ]),
  // Known 45
  '273753088': gviz(ASA_LABELS_2026, [
    [1, 'JORDAN', 'FLETCHER', 'TX1040', 'Abilene', 336, 341, 329],
    [2, 'jamie', 'nockpoint', 'TX1041', 'Abilene', 301]
  ]),
  // Known 40
  '938571765': gviz(ASA_LABELS_2026, [
    [1, 'MARIA', 'DE LA FLETCH', 'TX1050', 'Laredo', 333, 333, 333]
  ]),
  // Senior Known 50
  '320204999': gviz(ASA_LABELS_2026, [
    [1, 'LEE', 'GREYBEARD', 'TX1060', 'Kerrville', 315, 309]
  ]),
  // Barebow Recurve
  '614091256': gviz(ASA_LABELS_2026, [
    [1, 'CASEY', 'STRINGWALKER', 'TX1070', 'Denton', 270, 265, 280]
  ]),
  // Olympic Recurve
  '896935978': gviz(ASA_LABELS_2026, [
    [1, 'MORGAN', 'CLICKER', 'TX1080', 'Houston', 290, 301]
  ]),
  // Traditional
  '659101793': gviz(ASA_LABELS_2026, [
    [1, 'ROBIN', 'SHELFSHOOTER', 'TX1090', 'Boerne', 250, 262, 240]
  ]),
  // Crossbow
  '810184603': gviz(ASA_LABELS_2026, [
    [1, 'TAYLOR', 'BOLT', 'TX1100', 'Odessa', 350, 355, 349]
  ]),
  // Young Adult Open Male
  '111166179': gviz(ASA_LABELS_2026, [
    [1, 'JAMIE', 'NOCKPOINT', 'TX1041', 'Abilene', 330, 320, 325]
  ]),
  // Junior Eagle (20 yards)
  '1097808975': gviz(ASA_LABELS_2026, [
    [1, 'PIPER', 'PEEPSIGHT', 'TX1110', 'Katy', 280, 285]
  ]),
  // Youth Barebow
  '1240158534': gviz(ASA_LABELS_2026, [
    [1, 'SKYLER', 'STRINGWALKER', 'TX1120', 'Denton', 200, 210, 190]
  ])
};

// 2026 tabs the site asks for by name instead of by gid.
const asa2026ByName = {
  'Youth Olympic': gviz(ASA_LABELS_2026, [
    [1, 'DREW', 'FINGERTAB', 'TX1130', 'Plano', 255, 262, 249]
  ])
};

const asaArchiveBySheet = {
  [ASA_2025]: {
    'Open Pro': gviz(ASA_LABELS_ARCHIVE, [[1, 'AVERY', 'QUILLFEATHER', 'TX1001', 'Paris', 345, 339]]),
    "Men's Open 45": gviz(ASA_LABELS_ARCHIVE, [[1, 'RILEY', 'STABILIZER', 'TX1010', 'Tyler', 310, 315]]),
    'Sr. Known 50': gviz(ASA_LABELS_ARCHIVE, [[1, 'LEE', 'GREYBEARD', 'TX1060', 'Kerrville', 300, 305, 299]]),
    'Traditional 25': gviz(ASA_LABELS_ARCHIVE, [[1, 'ROBIN', 'SHELFSHOOTER', 'TX1090', 'Boerne', 255]]),
    'Eagle Barebow Recurve': gviz(ASA_LABELS_ARCHIVE, [[1, 'SKYLER', 'STRINGWALKER', 'TX1120', 'Denton', 180]]),
    'Known 45': SUMMARY_SHEET
  },
  [ASA_2024]: {
    'Open Pro': gviz(ASA_LABELS_ARCHIVE, [[1, 'DANA', 'MCARROW', 'TX1002', 'Waco', 300]]),
    'Known 50': gviz(ASA_LABELS_ARCHIVE, [[1, 'PAT', "O'NOCK", 'TX1030', 'Dallas', 290, 285]]),
    'Crossbow': SUMMARY_SHEET
  }
};

// ---------- TFAA results pages ----------

function td(value) {
  return '<td class="results-cell">' + (value === null || value === undefined || value === '' ? '&nbsp;' : value) + '</td>';
}

// The season list every TFAA results page carries. Besides real seasons it
// holds test entries, another program, and a season nobody has shot in yet.
const TFAA_SEASON_OPTIONS = [
  [55, '2027 Outdoor'], [54, 'TEST'], [52, 'Field 50 - 2026'], [50, '2026 Outdoor'], [49, '2025-2026 Indoor'],
  [48, '2025 Outdoor'], [46, '2024-2025 Indoor'], [38, '2024 Outdoor'], [37, '2023-2024 Indoor'],
  [35, '2023 Outdoor'], [33, '2022-2023 Indoor'], [51, 'I-O TEST 1970']
];

function tfaaSeasonList(selectedId) {
  return '<span style="font-weight: bolder">Season:</span>\n<select id="season" name="seasons">\n<option value="0">Select...</option>\n' +
    TFAA_SEASON_OPTIONS.map(([id, label]) => '<option value="' + id + '"' + (id === selectedId ? ' selected' : '') + '>' + label + '</option>').join('\n') +
    '\n</select>\n';
}

const TFAA_AGE_RANGES = { Cub: '8-11', Youth: '12-14', 'Young Adult': '15-17', Adult: '18-49', Senior: '50-59', 'Silver Senior': '60-69', 'Master Senior': '70+' };

// A results page as texasfieldarchery.org writes it: the season list, a count
// of entries, then for each age group and shooting style a heading row and
// score rows whose cells are not closed.
// groups: [{ age, range (only for an age group TFAA does not have), styles: [{ style, rows: [[place, name, ...cells]] }] }]
function tfaaResultsPage(seasonId, title, columnHeads, groups) {
  const width = columnHeads.length + 2;
  const entries = groups.reduce((n, g) => n + g.styles.reduce((m, s) => m + s.rows.length, 0), 0);
  let html = '<html><head><title>' + title + '</title></head><body>\n<h1>' + title + '</h1>\n' + tfaaSeasonList(seasonId) +
    '<table class="table table-condensed table-results"> \n';
  html += '<tr><td colspan=' + width + " style='text-align: center'>" + entries + ' Entries</td>\n';
  for (const group of groups) {
    const range = group.range || TFAA_AGE_RANGES[group.age.replace(/^Pro /, '').replace(/ (Male|Female)$/, '')];
    html += "<tr class='results-dgp'><td colspan='14'>" + group.age + '&nbsp;&nbsp;(' + range + ')</td></tr>\n';
    for (const s of group.styles) {
      const code = s.style.match(/^(.*) (\([A-Z]+\))$/);
      html += "<tr class='results-fi'><td colspan='14' class='la'>" + (code ? code[1] + '&nbsp;&nbsp;<em>' + code[2] + '</em>' : s.style) + '</td></tr> \n';
      html += '<tr class="results-head"> ' + ['#', 'Archer'].concat(columnHeads).map((h, i) => (i < 2 ? '<td class="la">' : '<td>') + h + '</td>').join(' ') + ' </tr> \n';
      for (const row of s.rows) {
        const totals = columnHeads.length - columnHeads.indexOf('Total');
        html += "<tr class='results-score'>" + row.map((value, i) => {
          if (i === 0) return "<td class='la'><strong>" + value + '</strong>';
          if (i === 1) return "<td class='la'>" + value;
          const blank = value === null || value === undefined || value === '';
          return (row.length === width && i >= width - totals ? "<td class='results-total'>" : '<td>') + (blank ? '&nbsp;' : value);
        }).join('') + '</tr>\n';
      }
    }
  }
  if (entries === 0) html += '<tr><td colspan=' + width + " style='text-align: center'>0 Entries</td>";
  return html + '</table>\n</div>\n<script>\n$(document).ready(function(){ $("#season").on("change",function(){ var id = $(this).val(); if(id != "0"){ window.location = "/results/sywat/" + id; } }); });\n</script>\n</body></html>\n';
}

const OUTDOOR_HEADS = ['Score #1', 'Score #2', 'Score #3', 'State', 'Total'];
const INDOOR_HEADS = ['Score #1', "X's", 'Score #2', "X's", 'Score #3', "X's", 'State', "X's", 'Total', "X's"];

const tfaaOutdoor2026 = tfaaResultsPage(50, '2026 Shoot Your Way Across Texas', OUTDOOR_HEADS, [
  { age: 'Adult Male', styles: [
    { style: 'Freestyle (FS)', rows: [
      [1, 'Quillfeather, Avery', 540, 545, 538, 1085, 2708],
      [2, 'Stabilizer, Riley', 501, 1100, 530, 0, 2131],
      [3, 'Fletcher, Jordan', 520, 0, 510, 1040, 2070],
      // The 2026 page lists an archer who shot State a second time, with only
      // the State score. It is the same State shoot, so it must count once.
      [4, 'Quillfeather, Avery', 0, 0, 0, 1085, 1085]
    ] },
    { style: 'Bowhunter Freestyle (BHFS)', rows: [
      [1, 'Broadhead, Sam', 500, 505, 498, 990, 2493]
    ] },
    { style: 'Bowhunter Freestyle Limited (BHFSL)', rows: [
      [1, 'Tab, Finger', 430, 441, 425, 860, 2156]
    ] },
    { style: 'Modern Bowhunter (MBH)', rows: [
      // Listed twice, but the State score is on one row only: both rows count.
      [1, 'Pins, Fixed', 470, 465, 480, 0, 1415],
      [2, 'Pins, Fixed', 0, 0, 0, 930, 930]
    ] },
    { style: 'Barebow Compound (BBC)', rows: [
      [1, 'Bare, Compound', 410, 415, 420, 820, 2065]
    ] },
    { style: 'Barebow Recurve (BBR)', rows: [
      [1, 'Stringwalker, Casey', 390, 400, 385, 770, 1945]
    ] },
    { style: 'Barebow (BB)', rows: [
      [1, 'Plain, Barebow', 380, 382, 379, 760, 1901]
    ] },
    { style: 'Traditional (TRAD)', rows: [
      [1, 'Shelfshooter, Robin', 330, 340, 320, 650, 1640]
    ] },
    { style: 'Longbow (LB)', rows: [
      [1, 'Yew, Stick', 250, 260, 255, 500, 1265]
    ] },
    { style: 'Freestyle Limited (FSL)', rows: [
      [1, 'Limited, Sight', 450, 455, 460, 900, 2265]
    ] },
    { style: 'Freestyle Limited Recurve (FSLR)', rows: [
      [1, 'Clicker, Morgan', 440, 445, 450, 880, 2215]
    ] }
  ] },
  { age: 'Senior Female', styles: [
    { style: 'Freestyle (FS)', rows: [
      [1, 'Greybeard, Lee', 510, 512, 509, 1015, 2546]
    ] }
  ] },
  { age: 'Silver Senior Male', styles: [
    { style: 'Freestyle (FS)', rows: [
      [1, 'Silver, Fox', 505, 500, 498, 1001, 2504]
    ] }
  ] },
  { age: 'Young Adult Male', styles: [
    { style: 'Freestyle (FS)', rows: [
      [1, 'Nockpoint, Jamie', 480, 490, 485, 960, 2415]
    ] }
  ] },
  { age: 'Youth Female', styles: [
    { style: 'Genesis', rows: [
      [1, 'Peepsight, Piper', 300, 310, 305, 600, 1515]
    ] }
  ] },
  { age: 'Cub Male', styles: [
    { style: 'Freestyle (FS)', rows: [
      [1, 'Little, Cub', 280, 290, 285, 560, 1415]
    ] }
  ] }
]);

const tfaaOutdoor2025 = tfaaResultsPage(48, '2025 Shoot Your Way Across Texas', OUTDOOR_HEADS, [
  { age: 'Adult Male', styles: [
    { style: 'Freestyle (FS)', rows: [
      [1, 'Quillfeather, Avery', 535, 541, 539, 1079, 2694],
      [2, "O'Nock, Pat", 499, 503, 488, 980, 2470]
    ] }
  ] },
  { age: 'Master Senior Male', styles: [
    { style: 'Freestyle (FS)', rows: [
      [1, 'Greybeard, Lee', 500, 498, 502, 1000, 2500]
    ] }
  ] }
]);

const tfaaOutdoor2024 = tfaaResultsPage(38, '2024 Shoot Your Way Across Texas', OUTDOOR_HEADS, [
  { age: 'Adult Female', styles: [
    { style: 'Freestyle (FS)', rows: [
      [1, 'De La Fletch, Maria', 521, 525, 519, 1044, 2609]
    ] }
  ] }
]);

const tfaaIndoor2026 = tfaaResultsPage(49, '2025-2026 Indoor Shoot Your Way Across Texas', INDOOR_HEADS, [
  { age: 'Adult Male', styles: [
    { style: 'Freestyle (FS)', rows: [
      [1, 'Quillfeather, Avery', 300, 58, 299, 55, 300, 60, 598, 110, 1497, 283],
      [2, 'Mcarrow, Dana', 295, 40, 290, 35, 0, 0, 0, 0, 585, 75],
      [3, 'Bolt, Taylor', 288, 31, 291, 70, 285, 22, 571, 130, 1435, 253]
    ] },
    { style: 'Barebow Recurve (BBR)', rows: [
      [1, 'Stringwalker, Casey', 250, 10, 245, 8, 240, 5, 480, 12, 1215, 35]
    ] },
    { style: 'Bowhunter Freestyle (BHFS)', rows: [
      [1, 'Broadhead, Sam', 296, 44, 297, 46, 295, 41, 590, 88, 1478, 219]
    ] }
  ] },
  { age: 'Master Senior Male', styles: [
    { style: 'Freestyle (FS)', rows: [
      [1, 'Greybeard, Lee', 290, 30, 288, 28, 291, 33, 580, 60, 1449, 151]
    ] }
  ] },
  { age: 'Young Adult Male', styles: [
    { style: 'Freestyle (FS)', rows: [
      [1, 'Nockpoint, Jamie', 298, 50, 297, 48, 299, 52, 595, 101, 1489, 251]
    ] }
  ] },
  { age: 'Cub Female', styles: [
    { style: 'Genesis', rows: [
      // A State total of 300 or less is still the State round, out of 600. It
      // was once counted a second time as an ordinary round out of 300.
      [1, 'Peepsight, Piper', 150, 2, 140, 1, 130, 0, 270, 3, 690, 6]
    ] }
  ] },
  // Professional groups are filed with the adults of the same age.
  { age: 'Pro Adult Male', styles: [
    { style: 'Freestyle (FS)', rows: [
      [1, 'Backtension, Blake', 300, 59, 300, 58, 299, 55, 0, 0, 899, 172]
    ] }
  ] }
]);

const tfaaIndoor2025 = tfaaResultsPage(46, '2024-2025 Indoor Shoot Your Way Across Texas', INDOOR_HEADS, [
  { age: 'Adult Male', styles: [
    { style: 'Freestyle (FS)', rows: [
      [1, 'Quillfeather, Avery', 300, 57, 300, 59, 298, 51, 597, 108, 1495, 275],
      [2, 'Fletcher, Jordan', 297, 45, 296, 43, 299, 50, 594, 97, 1486, 235]
    ] }
  ] }
]);

const tfaaIndoor2024 = tfaaResultsPage(37, '2023-2024 Indoor Shoot Your Way Across Texas', INDOOR_HEADS, [
  { age: 'Adult Female', styles: [
    { style: 'Freestyle (FS)', rows: [
      [1, 'De La Fletch, Maria', 299, 49, 298, 47, 300, 55, 596, 100, 1493, 251]
    ] }
  ] }
]);

// ---------- TFAA records pages ----------

// groups: [{ ageGroup, rows: [[...cells]] }]
function tfaaRecordsPage(title, heads, groups) {
  let html = '<html><body><h1>' + title + '</h1>\n<table class="results">\n';
  html += '<tr class="results-head">' + heads.map(h => '<th>' + h + '</th>').join('') + '</tr>\n';
  for (const g of groups) {
    html += "<tr class='results-dgp'><td colspan='6'><b>" + g.ageGroup + '</b></td></tr>\n';
    for (const row of g.rows) {
      html += "<tr class='results-score'>" + row.map(td).join('') + '</tr>\n';
    }
  }
  return html + '</table></body></html>\n';
}

const tfaaRecordsIndoor = tfaaRecordsPage('Indoor State Records', ['Style', 'Year', 'Name', 'Score', 'X'], [
  { ageGroup: 'Adult Male', rows: [
    ['Freestyle', 2019, 'Quillfeather, Avery', 600, 118],
    ['Freestyle', 2012, 'Oldtimer, Past', 599, 101],
    ['Barebow Recurve', 2020, 'Stringwalker, Casey', 540, 30],
    ['Barebow Recurve', 2023, 'Newcomer, Tied', 540, 28]
  ] },
  { ageGroup: 'Young Adult Male', rows: [
    ['Freestyle', 2025, 'Nockpoint, Jamie', 598, 104]
  ] }
]);

const tfaaRecordsOutdoor = tfaaRecordsPage('Outdoor State Records', ['Round', 'Style', 'Year', 'Name', 'Score', 'X'], [
  { ageGroup: 'Adult Male', rows: [
    ['Field', 'Freestyle', 2021, 'Fletcher, Jordan', 558, 90],
    ['Hunter', 'Freestyle', 2022, 'Quillfeather, Avery', 559, 95],
    ['Aggregate', 'Freestyle', 2022, 'Quillfeather, Avery', 1115, 180],
    ['Field', 'Freestyle', null, 'No, Year', 560, 99]
  ] }
]);

const tfaaRecords900 = tfaaRecordsPage('900 Round State Records', ['Style', 'Year', 'Name', 'Score', 'X'], [
  { ageGroup: 'Senior Female', rows: [
    ['Freestyle', 2018, 'Greybeard, Lee', 880, 40]
  ] }
]);

// A season in the list that nobody has shot in yet.
const tfaaSeasonNotStarted = tfaaResultsPage(55, '2027 Shoot Your Way Across Texas', OUTDOOR_HEADS, []);
// What the site sends, with a normal "200 OK", for a season id it does not have.
const TFAA_NOT_FOUND = '<html><head><title>TFAA</title></head><body><h1>TFAA</h1><h2>Page Not Found</h2></body></html>\n';

const tfaaPages = {
  // With no season id the site shows whichever season is current. Here that is
  // the newest indoor one, so nothing may treat this page as a fixed season.
  '/results/sywat': tfaaIndoor2026,
  '/results/sywat/55': tfaaSeasonNotStarted,
  '/results/sywat/50': tfaaOutdoor2026,
  '/results/sywat/48': tfaaOutdoor2025,
  '/results/sywat/38': tfaaOutdoor2024,
  '/results/sywat/49': tfaaIndoor2026,
  '/results/sywat/46': tfaaIndoor2025,
  '/results/sywat/37': tfaaIndoor2024,
  '/records/indoor': tfaaRecordsIndoor,
  '/records/outdoor': tfaaRecordsOutdoor,
  '/records/900': tfaaRecords900
};

function asaUrl(sheetId, tabName) {
  return 'https://docs.google.com/spreadsheets/d/' + sheetId + '/gviz/tq?tq=select%20*&headers=1&sheet=' + encodeURIComponent(tabName);
}

function responseFor(url) {
  const u = new URL(url);
  if (u.hostname === 'docs.google.com') {
    const m = u.pathname.match(/^\/spreadsheets\/d\/([^/]+)\/gviz\/tq$/);
    if (!m) return null;
    const sheetId = m[1];
    if (sheetId === ASA_2026 && u.searchParams.has('gid')) {
      return asa2026ByGid[u.searchParams.get('gid')] || EMPTY_TAB;
    }
    if (sheetId === ASA_2026 && u.searchParams.has('sheet')) {
      return asa2026ByName[u.searchParams.get('sheet')] || SUMMARY_SHEET;
    }
    if (asaArchiveBySheet[sheetId] && u.searchParams.has('sheet')) {
      return asaArchiveBySheet[sheetId][u.searchParams.get('sheet')] || SUMMARY_SHEET;
    }
    return null;
  }
  if (u.hostname === 'texasfieldarchery.org') {
    if (tfaaPages[u.pathname]) return tfaaPages[u.pathname];
    return u.pathname.startsWith('/results/sywat/') ? TFAA_NOT_FOUND : null;
  }
  return null;
}

module.exports = {
  responseFor, asaUrl, gviz, tfaaResultsPage, tfaaRecordsPage, tfaaSeasonList,
  OUTDOOR_HEADS, INDOOR_HEADS, EMPTY_TAB, SUMMARY_SHEET, TFAA_NOT_FOUND, ASA_2026, ASA_2025, ASA_2024
};
