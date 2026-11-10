'use strict';

// When the TAGR standings are rebuilt, and whether a rebuild is good enough to
// go on the site.
//
// A source being down never empties the site: new standings only replace the
// published ones when they look healthy. Otherwise the site keeps what it has
// and a later run tries again.

const fs = require('fs');
const crypto = require('crypto');

// The published standings are this object. The site splits it in two:
// `result` is api/tgr.json, and the rest is api/status.json.
const FORMAT = 1;

// Results from weekend shoots are posted by Monday, so rebuild Tuesday morning.
const WEEKLY_REBUILD = { weekday: 2, hour: 6, timeZone: 'America/Chicago' };

// For the first day after the weekly rebuild time, a page that cannot be read
// holds new standings back, in case it comes back. After that they are
// published without it and the page is remembered as given up on, so a page
// that is gone for good holds up neither this rebuild nor next week's.
const PATIENT_FOR_MS = 24 * 60 * 60 * 1000;

// A source that returns under half of what it did last time has broken, not shrunk.
const MIN_SHARE_OF_PREVIOUS = 0.5;
const SOURCES = [['txAsa', 'TX ASA'], ['tfaa', 'TFAA Outdoor'], ['tfaaIndoor', 'TFAA Indoor']];

const QUARTER_HOUR = 15 * 60 * 1000;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ---- Weekly schedule ----

const formatters = new Map();
function localTime(date, timeZone) {
  if (!formatters.has(timeZone)) {
    formatters.set(timeZone, new Intl.DateTimeFormat('en-US', {
      timeZone, weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23'
    }));
  }
  const parts = {};
  for (const p of formatters.get(timeZone).formatToParts(date)) parts[p.type] = p.value;
  return { weekday: WEEKDAYS.indexOf(parts.weekday), hour: Number(parts.hour), minute: Number(parts.minute) };
}

function isRebuildTime(date, schedule) {
  const t = localTime(date, schedule.timeZone);
  return t.weekday === schedule.weekday && t.hour === schedule.hour && t.minute === 0;
}

// Walks the clock a quarter hour at a time, which lands on every time zone's
// "on the hour" and needs no daylight-saving arithmetic.
function findRebuildTime(fromMs, stepMs, schedule) {
  let t = fromMs;
  for (let i = 0; i <= 8 * 24 * 4; i++, t += stepMs) {
    if (isRebuildTime(new Date(t), schedule)) return new Date(t);
  }
  throw new Error('No weekly rebuild time found for ' + JSON.stringify(schedule));
}

function lastRebuildTimeAtOrBefore(date, schedule = WEEKLY_REBUILD) {
  return findRebuildTime(Math.floor(date.getTime() / QUARTER_HOUR) * QUARTER_HOUR, -QUARTER_HOUR, schedule);
}

function nextRebuildTimeAfter(date, schedule = WEEKLY_REBUILD) {
  return findRebuildTime(Math.floor(date.getTime() / QUARTER_HOUR) * QUARTER_HOUR + QUARTER_HOUR, QUARTER_HOUR, schedule);
}

// Whether the published standings are missing, from before this week's
// rebuild time, or worked out by other ranking code.
function rebuildIsDue(published, engineId, at, schedule = WEEKLY_REBUILD) {
  return !published || published.engineId !== engineId || new Date(published.builtAt) < lastRebuildTimeAtOrBefore(at, schedule);
}

// Whether a page that cannot be read should still hold new standings back at this time.
function stillPatient(at, schedule = WEEKLY_REBUILD) {
  return at - lastRebuildTimeAtOrBefore(at, schedule) < PATIENT_FOR_MS;
}

// ---- Is a rebuild good enough to publish? ----

// The pages a build could not read, leaving out those the published standings
// were already published without.
function newProblemsIn(build, previous) {
  const givenUpOn = previous ? previous.pagesGivenUpOn : [];
  return build.problems.filter(p => !givenUpOn.includes(p.url));
}

// Returns the reasons a fresh build must not replace the published standings.
// An empty list means publish it. `sameRules` is false when the published
// standings were built by different ranking code: a fix can rightly halve
// what a source gives, so their counts are not compared.
function reasonsNotToPublish(build, previous, { patient, sameRules = true }) {
  const reasons = [];
  const counts = build.result.sources;
  if (build.result.adult.length + build.result.youth.length === 0) reasons.push('it has no archers');
  for (const [key, label] of SOURCES) {
    const before = previous && sameRules ? previous.result.sources[key] : 0;
    if (!counts[key]) {
      reasons.push(label + ' returned no results');
    } else if (before > 0 && counts[key] < before * MIN_SHARE_OF_PREVIOUS) {
      reasons.push(label + ' dropped from ' + before + ' results to ' + counts[key]);
    }
  }
  const newProblems = newProblemsIn(build, previous);
  if (reasons.length === 0 && previous && patient && newProblems.length > 0) {
    reasons.push(describeProblems(newProblems));
  }
  return reasons;
}

function describeProblems(problems) {
  const first = problems[0];
  const pages = problems.length === 1 ? '1 source page' : problems.length + ' source pages';
  return pages + ' could not be read (' + first.what + ': ' + first.error + ')';
}

// ---- Rebuilding ----

// Changes whenever the ranking code changes, so standings worked out by an
// older version of the rules are rebuilt on the next run instead of next week.
function fingerprintOf(file) {
  return crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex').slice(0, 12);
}

// The published standings as read back from the site, or null when they are
// not standings this code can use, so a damaged file is rebuilt, not kept.
function asPublished(saved) {
  const r = saved && saved.result;
  if (!r || saved.format !== FORMAT || !Array.isArray(r.adult) || !Array.isArray(r.youth) || !r.sources) return null;
  return { ...saved, problems: saved.problems || [], pagesGivenUpOn: saved.pagesGivenUpOn || [] };
}

// Works out new standings and decides whether they replace the published ones.
//   build       reads the sources and works out the ranking
//   published   the standings on the site now, or null
//   engineId    fingerprint of the ranking code
//   patient     whether a page that cannot be read still holds the rebuild back
// Returns { published, reasons, problems, standings }: `standings` is set
// only when they are to be published.
async function rebuild({ build, published, engineId, patient }) {
  let fresh;
  try {
    fresh = await build();
  } catch (err) {
    return { published: false, reasons: ['the rebuild failed: ' + (err && err.message ? err.message : err)], problems: [], standings: null };
  }
  const reasons = reasonsNotToPublish(fresh, published, { patient, sameRules: !published || published.engineId === engineId });
  if (reasons.length > 0) return { published: false, reasons, problems: fresh.problems, standings: null };

  const unreadable = fresh.problems.map(p => p.url);
  return {
    published: true,
    reasons: [],
    problems: fresh.problems,
    standings: {
      format: FORMAT,
      builtAt: fresh.result.updatedAt,
      engineId,
      problems: fresh.problems,
      // Out of patience: everything still unreadable is given up on.
      // Otherwise keep only the earlier given-up pages that are still unreadable.
      pagesGivenUpOn: patient ? (published ? published.pagesGivenUpOn : []).filter(url => unreadable.includes(url)) : unreadable,
      result: fresh.result
    }
  };
}

module.exports = {
  rebuild,
  rebuildIsDue,
  stillPatient,
  reasonsNotToPublish,
  describeProblems,
  asPublished,
  fingerprintOf,
  lastRebuildTimeAtOrBefore,
  nextRebuildTimeAfter,
  WEEKLY_REBUILD,
  PATIENT_FOR_MS,
  FORMAT
};
