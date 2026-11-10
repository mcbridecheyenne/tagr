'use strict';

// The TAGR site as plain files, for a host that only serves files (GitHub
// Pages): the rankings page, "How TAGR Works", and the standings in
// api/tgr.json, which the rankings page and the phone app read.
//
// A run rebuilds the standings when they are due and puts them on the site
// only when they are good enough to publish (see publish.js). Otherwise the
// site keeps the standings it has.

const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const { rules } = require('./engine');
const { rebuild: rebuildStandings, rebuildIsDue, stillPatient, asPublished } = require('./publish');

const PAGES_DIR = path.join(__dirname, '..', 'pages');

// Each page, and how to get from it to the top of the site. Links are
// relative, so the site works at any address, such as
// https://<owner>.github.io/<repository>/.
const PAGES = [
  { file: 'index.html', template: 'rankings.ejs', toTop: '' },
  { file: 'how-it-works/index.html', template: 'how-it-works.ejs', toTop: '../' }
];
const STYLESHEET_FILE = 'style.css';
const STANDINGS_FILE = 'api/tgr.json';  // the ranking itself
const STATUS_FILE = 'api/status.json';  // when it was built, by which code, and which pages could not be read

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

// Writes the site into outDir, with the given standings.
async function writeSite(outDir, standings) {
  const { result, ...status } = standings;
  for (const page of PAGES) {
    const links = {
      rankings: page.toTop || './',
      how: page.toTop + 'how-it-works/',
      api: page.toTop + STANDINGS_FILE,
      css: page.toTop + STYLESHEET_FILE
    };
    const html = await ejs.renderFile(path.join(PAGES_DIR, page.template), { rules, links });
    write(path.join(outDir, page.file), html);
  }
  write(path.join(outDir, STYLESHEET_FILE), fs.readFileSync(path.join(PAGES_DIR, STYLESHEET_FILE)));
  write(path.join(outDir, STANDINGS_FILE), JSON.stringify(result));
  write(path.join(outDir, STATUS_FILE), JSON.stringify(status, null, 1));
}

// The standings the published site has now, or null when it has none yet.
// Throws when that cannot be found out: without knowing what is published, a
// rebuild could not be checked against it.
async function fetchPublished(siteUrl, fetchImpl = fetch) {
  const get = async file => {
    // The stamp gets past the copy the host's cache keeps for some minutes.
    const url = siteUrl.replace(/\/+$/, '') + '/' + file + '?t=' + Date.now();
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(30000) });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(siteUrl + ' answered ' + response.status + ' for ' + file);
    return response.json();
  };
  const status = await get(STATUS_FILE);
  const result = status && await get(STANDINGS_FILE);
  return result ? asPublished({ ...status, result }) : null;
}

// One run of the job that keeps the site up to date.
//   published   what fetchPublished gave: the standings on the site now, or null
//   scheduled   true when the weekly timer started the run, false for a change
//               to the code or a run by hand
//   force       rebuild the standings even when the published ones are this week's
//   build       reads the sources and works out the ranking
//   engineId    changes whenever the ranking code does
// Writes the site into outDir when there is something to publish, and returns:
//   deploy      outDir holds a site to publish
//   behind      a rebuild was due and could not be published
//   rebuild     what came of the rebuild, or null when none ran
//   standings   the standings the site has after this run, or null
async function runSiteJob({ outDir, published = null, scheduled = false, force = false, build, engineId, now = () => new Date() }) {
  const at = now();
  let standings = published;
  let rebuild = null;
  if (force || rebuildIsDue(published, engineId, at)) {
    // A change to the code or a run by hand always waits for an unreadable
    // page; the timer stops waiting a day after the weekly rebuild time.
    rebuild = await rebuildStandings({ build, published, engineId, patient: !scheduled || stillPatient(at) });
    if (rebuild.published) standings = rebuild.standings;
  }

  const behind = Boolean(rebuild) && !rebuild.published;
  // The timer has nothing to publish unless it has new standings. Any other
  // run publishes the pages again, because they may have changed.
  const deploy = Boolean(standings) && (scheduled ? Boolean(rebuild) && rebuild.published : true);
  if (deploy) await writeSite(outDir, standings);
  return { deploy, behind, rebuild, standings };
}

module.exports = { runSiteJob, writeSite, fetchPublished, STANDINGS_FILE, STATUS_FILE };
