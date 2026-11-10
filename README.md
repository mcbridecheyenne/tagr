# TAGR · Texas Archery Global Ranking

TAGR ranks Texas archers across Texas ASA (3D) and TFAA (field and indoor) results, so archers from different organizations can be compared on one list.

- **The site:** https://mcbridecheyenne.github.io/tagr/
- **The standings as data**, for the phone app or anything else: https://mcbridecheyenne.github.io/tagr/api/tgr.json
- **When they were built**, and which source pages could not be read: https://mcbridecheyenne.github.io/tagr/api/status.json

## How it stays up to date

- Every Tuesday at 6:00 AM Central, the **Site** workflow reads the latest results from the Texas ASA Google Sheets and texasfieldarchery.org, works out the ranking, and publishes the site on GitHub Pages.
- New standings go on the site only when they look healthy: every source answered, and none gave less than half of what it gave last time. If a page cannot be read on Tuesday, the run waits up to a day for it to come back, then publishes without it.
- When a rebuild cannot be published, the site keeps the last good standings and the run turns red in the Actions tab. It tries again later that day and every morning after that.
- A change to the ranking code rebuilds the standings as soon as it is merged. A change to the pages alone publishes them with the standings the site already has.
- To rebuild by hand: Actions tab, **Site**, **Run workflow**.

GitHub switches off the timer of a public repository after 60 days without a commit. When 50 days pass without one, the workflow adds an empty commit, "Keep the weekly rebuild switched on", so the Tuesday rebuild keeps running.

## How the ranking works

The site's **How TAGR Works** page explains it. Its weights and national records are printed from the same numbers the code uses, so the page and the ranking cannot drift apart.

TFAA rounds are scored against the NFAA national record for each style (`NATIONAL_RECORDS` in `tagr/engine.js`), not against the perfect score. When NFAA publishes new records, update them there, with the date of the list they come from, and run `UPDATE_GOLDEN=1 npm test`.

## Working on it

Needs Node 20 or newer.

```
npm ci
npm test        # the tests, on made-up source pages (no network needed)
npm run check   # read the live sources and print a page-by-page summary
npm run build   # build the site into site/ from the live sources
```

`node scripts/check.js --save DIR` keeps every page it reads, and `--from DIR` (for either script) reads those pages instead of the live sites. The **Live check** workflow runs the check on GitHub, by hand or on a pull request that changes the ranking code.

| Path | What it does |
|---|---|
| `tagr/engine.js` | reads the sources and works out the ranking |
| `tagr/fetch.js` | fetches one page, with a time limit and retries |
| `tagr/publish.js` | when to rebuild, and whether new standings are good enough to publish |
| `tagr/site.js` | writes the site's files |
| `pages/` | the rankings page, How TAGR Works, and the stylesheet |
| `scripts/build-site.js` | what the Site workflow runs |
| `scripts/check.js` | the live check |
| `test/` | the tests, and the made-up source pages they read |
