'use strict';

// The site's own copies of the Texas ASA Shooter of the Year sheet.
//
// Texas ASA clears the sheet for each new season and keeps no copy, so every
// rebuild saves the sheet as it stands, one file a year: archive/asa-<year>.json.
// Once the sheet has moved on, that file is where the year is read from.

const fs = require('fs');
const path = require('path');

const ARCHIVE_DIR = path.join(__dirname, '..', 'archive');
const FILE = /^asa-(\d{4})\.json$/;

// The saved copies in a folder: [{ year, savedAt, tabs }].
function loadAsaSnapshots(dir = ARCHIVE_DIR) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(name => FILE.test(name)).sort()
    .map(name => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')));
}

// Saves the sheet as the ranking read it ({ year, tabs }), unless the copy of
// that year already holds exactly that. A sheet with no scores is not saved:
// there is nothing to keep. Returns the file written, or null.
function saveAsaSnapshot(asaLive, dir = ARCHIVE_DIR, now = () => new Date()) {
  const names = Object.keys(asaLive.tabs).sort();
  const holdsScores = names.some(name => asaLive.tabs[name].rows.some(r => (r.c || []).slice(5).some(cell => cell && Number(cell.v) > 0)));
  if (!holdsScores) return null;
  const tabs = {};
  for (const name of names) tabs[name] = asaLive.tabs[name];
  const file = path.join(dir, 'asa-' + asaLive.year + '.json');
  if (fs.existsSync(file) && JSON.stringify(JSON.parse(fs.readFileSync(file, 'utf8')).tabs) === JSON.stringify(tabs)) return null;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ year: asaLive.year, savedAt: now().toISOString(), tabs }) + '\n');
  return file;
}

// ---- The results of the Texas ASA State Championships ----
//
// Texas ASA publishes the results of each State Championship as a sheet of
// its own. They are saved once, by scripts/save-asa-state.js, as
// archive/asa-state-<year>.json: { year, source, savedAt, results }, with a
// result being { place, asaNumber, name, orgClass, score, twelves }.

const STATE_FILE = /^asa-state-(\d{4})\.json$/;

function loadAsaStateResults(dir = ARCHIVE_DIR) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(name => STATE_FILE.test(name)).sort()
    .map(name => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')));
}

function saveAsaStateResults({ year, source, results }, dir = ARCHIVE_DIR, now = () => new Date()) {
  const file = path.join(dir, 'asa-state-' + year + '.json');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ year, source, savedAt: now().toISOString(), results }, null, 1) + '\n');
  return file;
}

module.exports = { loadAsaSnapshots, saveAsaSnapshot, loadAsaStateResults, saveAsaStateResults, ARCHIVE_DIR };
