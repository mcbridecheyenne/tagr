#!/usr/bin/env node
'use strict';

// Saves the results of a Texas ASA State Championship in the project.
//
//   node scripts/save-asa-state.js YEAR SHEET [GID]
//
// SHEET is the Google Sheets link or id of the results Texas ASA publishes
// after the Championship: one row an archer, with the place, ASA number, first
// name, last name, class, score and number of 12s. GID picks a tab; without
// it the first tab is read.
//
// The file written, archive/asa-state-<year>.json, is what the ranking reads
// the year's State Champions and State scores from. Texas ASA's Shooter of
// the Year sheet has a State column too, but only for some of its classes.

const { fetchText } = require('../tagr/fetch');
const { parseGvizTable } = require('../tagr/engine');
const { saveAsaStateResults } = require('../tagr/snapshots');

async function main() {
  const [year, sheet, gid] = process.argv.slice(2);
  if (!/^\d{4}$/.test(year || '') || !sheet) throw new Error('Usage: node scripts/save-asa-state.js YEAR SHEET [GID]');
  const id = (sheet.match(/\/d\/([^/]+)/) || [null, sheet])[1];
  const url = 'https://docs.google.com/spreadsheets/d/' + id + '/gviz/tq?tq=select%20*&headers=0' + (gid ? '&gid=' + gid : '');
  const table = parseGvizTable(await fetchText(url));
  if (!table) throw new Error('Google Sheets did not send the sheet (is it shared with anyone who has the link?)');

  const text = cell => (cell && cell.v !== null && cell.v !== undefined ? String(cell.v).replace(/\s+/g, ' ').trim() : '');
  const number = cell => (cell && typeof cell.v === 'number' ? cell.v : NaN);
  const results = [];
  for (const row of table.rows) {
    const c = row.c || [];
    const place = number(c[0]);
    const score = number(c[5]);
    const name = (text(c[2]) + ' ' + text(c[3])).trim();
    if (!Number.isInteger(place) || place < 1 || isNaN(score) || !name || !text(c[4])) continue;
    results.push({ place, asaNumber: text(c[1]), name, orgClass: text(c[4]), score, twelves: number(c[6]) || 0 });
  }
  if (results.length === 0) throw new Error('No results found: the rows should be place, ASA number, first name, last name, class, score, 12s');

  const file = saveAsaStateResults({ year: Number(year), source: 'https://docs.google.com/spreadsheets/d/' + id, results });
  const classes = new Set(results.map(r => r.orgClass.toLowerCase()));
  console.log('Saved ' + results.length + ' results in ' + classes.size + ' classes to ' + file);
}

main().catch(err => {
  console.error(err && err.message ? err.message : err);
  process.exitCode = 1;
});
