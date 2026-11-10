#!/usr/bin/env node
'use strict';

// Builds the TAGR site into a folder: the rankings page, "How TAGR Works" and
// api/tgr.json. The "Site" workflow runs this and publishes the folder on
// GitHub Pages.
//
//   node scripts/build-site.js --out DIR
//       --published URL   where the site is published. Its standings are kept when a rebuild
//                         is not good enough to publish, and reused when no rebuild is due.
//       --scheduled       the weekly timer is running this: do nothing unless a rebuild is due
//       --force           rebuild the standings even when the published ones are this week's
//       --from DIR        read the source pages saved by "check.js --save", not the live sites
//
// In a GitHub job it sets two outputs: "deploy" (the folder holds a site to
// publish) and "behind" (a rebuild was due and could not be published).

const fs = require('fs');
const engine = require('../tagr/engine');
const { fetchText, savedPages } = require('../tagr/fetch');
const { fingerprintOf } = require('../tagr/publish');
const { runSiteJob, fetchPublished } = require('../tagr/site');

const args = process.argv.slice(2);
const valueOf = flag => (args.includes(flag) ? args[args.indexOf(flag) + 1] : null);
const outDir = valueOf('--out');
const publishedUrl = valueOf('--published');
const fromDir = valueOf('--from');
const scheduled = args.includes('--scheduled');
const force = args.includes('--force');

function day(date) {
  return new Date(date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' });
}

// Shown on the run's page on GitHub, and passed to the jobs that follow.
function report(lines, outputs) {
  for (const line of lines) console.log(line);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n\n') + '\n');
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(outputs).map(([key, value]) => key + '=' + value + '\n').join(''));
  }
}

async function main() {
  if (!outDir) throw new Error('Say where to build the site: --out DIR');

  const published = publishedUrl ? await fetchPublished(publishedUrl) : null;
  if (publishedUrl) {
    console.log(published
      ? 'The site at ' + publishedUrl + ' has the standings built ' + day(published.builtAt) + '.'
      : 'The site at ' + publishedUrl + ' has no standings yet.');
  }

  const source = fromDir ? savedPages(fromDir) : fetchText;
  const { deploy, behind, rebuild, standings } = await runSiteJob({
    outDir,
    published,
    scheduled,
    force,
    build: () => engine.buildRankings({ fetchText: source }),
    engineId: fingerprintOf(require.resolve('../tagr/engine'))
  });

  const lines = [];
  if (!rebuild) {
    lines.push('No rebuild was due: the standings are this week\'s.');
  } else if (rebuild.published) {
    const s = standings.result.sources;
    lines.push('The standings were rebuilt: ' + s.total + ' archers from ' + s.txAsa + ' Texas ASA, ' + s.tfaa + ' TFAA Outdoor and ' + s.tfaaIndoor + ' TFAA Indoor results.');
    if (rebuild.problems.length > 0) {
      lines.push('Published although these could not be read: ' + rebuild.problems.map(p => p.what + ' (' + p.error + ')').join('; ') + '.');
    }
  } else {
    lines.push('The standings were NOT rebuilt: ' + rebuild.reasons.join('; ') + '.');
    lines.push(standings
      ? 'The site keeps the standings built ' + day(standings.builtAt) + '. The next run tries again.'
      : 'There are no standings to show yet, so nothing is published.');
  }
  lines.push(deploy ? 'The site is in ' + outDir + ', ready to publish.' : 'Nothing new to publish.');
  report(lines, { deploy, behind });
}

main().catch(err => {
  console.error(err && err.stack ? err.stack : err);
  process.exitCode = 1;
});
