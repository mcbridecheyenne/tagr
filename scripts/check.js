#!/usr/bin/env node
'use strict';

// Checks TAGR against the live Texas ASA and TFAA pages.
//
//   node scripts/check.js             read every source and print a summary
//   node scripts/check.js --peek      also show a sample of what each source sent
//   node scripts/check.js --out FILE  also save the standings (what api/tgr.json holds)
//   node scripts/check.js --save DIR  also save every page that was read
//   node scripts/check.js --from DIR  read the pages saved by --save, not the live sites
//   node scripts/check.js --also URL  also fetch this page (repeatable; for looking into a source)
//
// Exits with 1 when the site would not publish these standings, so it can run
// as an alarm for a source changing its pages.

const fs = require('fs');
const path = require('path');
const engine = require('../tagr/engine');
const { fetchText, savedPages } = require('../tagr/fetch');
const { reasonsNotToPublish } = require('../tagr/publish');

const args = process.argv.slice(2);
const peek = args.includes('--peek');
const valueOf = flag => (args.includes(flag) ? args[args.indexOf(flag) + 1] : null);
const outFile = valueOf('--out');
const saveDir = valueOf('--save');
const fromDir = valueOf('--from');
const alsoUrls = args.flatMap((arg, i) => (arg === '--also' ? [args[i + 1]] : []));

// The most a single round can score, to spot a column being misread as a score.
const ROUND_MAX = { 'TX ASA': 360, 'TFAA Outdoor': 560, 'TFAA Indoor': 600 };

function squash(html, length) {
  const text = html.replace(/\s+/g, ' ').trimEnd();
  return text.length > length ? text.slice(0, length) + ' ...' : text;
}

function plainText(row) {
  return row.slice(row.indexOf('>') + 1).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function peekAtTfaa(url, body) {
  const rows = body.split('<tr').slice(1);
  const scoreRows = rows.filter(r => r.includes('results-score'));
  console.log('\n  ' + url + '  (' + body.length + ' bytes, ' + rows.length + ' table rows, ' + scoreRows.length + ' of them score rows)');
  console.log('    first rows as sent:');
  for (const row of rows.slice(0, 5)) console.log('      <tr' + squash(row, 300));
  console.log('    first score rows as sent:');
  for (const row of scoreRows.slice(0, 3)) console.log('      <tr' + squash(row, 500));
  const headings = [...new Set(rows.filter(r => !r.includes('results-score')).map(plainText).filter(Boolean))];
  console.log('    headings on the page (' + headings.length + '): ' + headings.slice(0, 80).map(h => h.slice(0, 70)).join(' | '));
}

function peekAtSheet(url, body) {
  console.log('\n  ' + url + '  (' + body.length + ' bytes)');
  let table = null;
  try { table = engine.parseGvizTable(body); } catch (err) { /* shown below */ }
  if (!table) return console.log('    not a sheet: ' + squash(body, 300));
  console.log('    columns: ' + table.cols.map(c => JSON.stringify(c.label || '')).join(' '));
  for (const row of table.rows.slice(0, 2)) {
    console.log('    row: ' + (row.c || []).map(c => (c ? JSON.stringify(c.f !== undefined ? c.f : c.v) : '-')).join(' '));
  }
}

// Every column from the sixth on is read as an event score, so list what those columns are called.
function eventColumnsBySheet(fetched) {
  const bySheet = new Map();
  for (const { url, body } of fetched) {
    if (new URL(url).hostname !== 'docs.google.com') continue;
    let table = null;
    try { table = engine.parseGvizTable(body); } catch (err) { continue; }
    if (!table || !table.cols.some(c => c.label && c.label.toUpperCase().includes('FIRST'))) continue;
    const sheet = url.split('/d/')[1].split('/')[0];
    if (!bySheet.has(sheet)) bySheet.set(sheet, new Map());
    const counts = bySheet.get(sheet);
    table.cols.slice(5).forEach(c => {
      const label = (c.label || '').replace(/\s+/g, ' ').trim() || '(no label)';
      counts.set(label, (counts.get(label) || 0) + 1);
    });
  }
  return bySheet;
}

function savePages(dir, attempts) {
  fs.mkdirSync(dir, { recursive: true });
  const index = attempts.map(({ url, body, error }, i) => {
    const file = body === undefined ? null : String(i + 1).padStart(3, '0') + '.txt';
    if (file) fs.writeFileSync(path.join(dir, file), body);
    return { url, file, bytes: body === undefined ? 0 : body.length, error };
  });
  fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify(index, null, 1));
}

async function main() {
  const fetched = [];   // pages that were read
  const attempts = [];  // every page asked for, read or not
  const source = fromDir ? savedPages(fromDir) : fetchText;
  const read = async url => {
    try {
      const body = await source(url);
      attempts.push({ url, body });
      return body;
    } catch (err) {
      attempts.push({ url, error: err.message });
      throw err;
    }
  };
  const startedAt = Date.now();
  const build = await engine.buildRankings({
    fetchText: async url => {
      const body = await read(url);
      fetched.push({ url, body });
      return body;
    }
  });
  const { result, problems, pages, requests } = build;
  const seconds = Math.round((Date.now() - startedAt) / 1000);
  const s = result.sources;
  const everyone = result.adult.concat(result.youth);

  console.log(fromDir ? 'TAGR check against the pages saved in ' + fromDir : 'TAGR check against the live sources');
  console.log('  ' + requests + ' pages asked for in ' + seconds + 's, ' + problems.length + ' could not be read');
  console.log('  TX ASA        ' + s.txAsa + ' results');
  console.log('  TFAA Outdoor  ' + s.tfaa + ' results');
  console.log('  TFAA Indoor   ' + s.tfaaIndoor + ' results');
  console.log('  Ranked        ' + s.total + ' archers (' + result.adult.length + ' adult, ' + result.youth.length + ' youth), ' +
    everyone.filter(r => r.provisional).length + ' provisional, ' + everyone.filter(r => r.multiOrg).length + ' in more than one organization');
  console.log('  Records       ' + s.stateRecords + ' TFAA state records, ' + everyone.filter(r => r.stateRecord).length + ' ranked archers hold one');

  console.log('\nResults per page');
  for (const p of pages) console.log('  ' + String(p.results).padStart(5) + '  ' + p.what + (p.note ? '  (' + p.note + ')' : ''));

  const tooHigh = [];
  for (const archer of everyone) {
    for (const round of archer.rounds) {
      if (round.raw > ROUND_MAX[round.org]) tooHigh.push(archer.name + ': ' + round.raw + ' in ' + round.org + ' ' + round.orgClass + ' (' + round.event + ')');
    }
  }
  console.log('\nRanked scores above the most a round can score: ' + tooHigh.length);
  for (const line of tooHigh.slice(0, 15)) console.log('  ' + line);

  const leftOut = pages.flatMap(p => (p.leftOut || []).map(o => p.what + ': ' + o.name + ', ' + o.score + ' where the most is ' + o.max + ' (' + o.orgClass + ')'));
  console.log('\nScores left out for being above the most their round can score: ' + leftOut.length);
  for (const line of leftOut) console.log('  ' + line);

  for (const [label, list] of [['adult', result.adult], ['youth', result.youth]]) {
    console.log('\nTop 10 ' + label);
    list.filter(r => !r.provisional).slice(0, 10).forEach((r, i) => {
      console.log('  ' + String(i + 1).padStart(2) + '. ' + String(r.avgNPS).padStart(5) + '  ' + r.name + '  (' + r.equipmentClass + ', ' + r.events + ' events, ' + r.org + ')');
    });
  }

  if (peek) {
    console.log('\nTX ASA columns read as event scores (and how many tabs have them)');
    for (const [sheet, counts] of eventColumnsBySheet(fetched)) {
      console.log('  sheet ' + sheet + ': ' + [...counts].map(([label, n]) => label + ' x' + n).join(', '));
    }

    console.log('\nWhat the sources sent (samples)');
    const seen = new Set();
    for (const { url, body } of fetched) {
      const host = new URL(url).hostname;
      if (host === 'texasfieldarchery.org') {
        peekAtTfaa(url, body);
      } else {
        // The first two tabs of each sheet are enough to see its layout.
        const sheet = url.split('/d/')[1].split('/')[0];
        const shown = [...seen].filter(k => k.startsWith(sheet)).length;
        if (shown < 2) { seen.add(sheet + shown); peekAtSheet(url, body); }
      }
    }
  }

  if (alsoUrls.length > 0) {
    console.log('\nAlso fetched');
    for (const url of alsoUrls) {
      const answer = await read(url).then(body => body.length + ' bytes', err => 'failed: ' + err.message);
      console.log('  ' + url + '  (' + answer + ')');
    }
  }

  if (outFile) {
    fs.writeFileSync(outFile, JSON.stringify(result));
    console.log('\nSaved the standings to ' + outFile);
  }
  if (saveDir) {
    savePages(saveDir, attempts);
    console.log('\nSaved the ' + attempts.length + ' pages to ' + saveDir);
  }

  const reasons = reasonsNotToPublish({ ...build, problems: [] }, null, { patient: true });
  if (problems.length > 0) {
    console.log('\nCould not be read');
    for (const p of problems) console.log('  ' + p.what + ': ' + p.error + '\n    ' + p.url);
  }
  if (reasons.length > 0) {
    console.log('\nThe site would NOT publish these standings: ' + reasons.join('; ') + '.');
  } else if (problems.length > 0) {
    console.log('\nThe site would hold these standings back and retry, because of the unreadable pages above.');
  } else {
    console.log('\nAll good: the site would publish these standings.');
  }
  process.exitCode = reasons.length > 0 || problems.length > 0 ? 1 : 0;
}

main().catch(err => {
  console.error(err && err.stack ? err.stack : err);
  process.exitCode = 1;
});
