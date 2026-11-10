'use strict';

const fs = require('fs');
const path = require('path');

// Fetches one page for TAGR, as text.
//
// The ranking is only as good as the pages it reads, so a request here has a
// time limit, treats an error status as a failure (an error page is not data),
// and is tried again a couple of times before giving up.

const USER_AGENT = 'TAGR-rankings/1.0 (Texas Archery Global Ranking)';

const DEFAULTS = {
  timeoutMs: 20000,
  maxBytes: 20 * 1024 * 1024,
  attempts: 3,
  retryDelayMs: 1500
};

class FetchError extends Error {
  constructor(message, { status = null, retryable = true } = {}) {
    super(message);
    this.name = 'FetchError';
    this.status = status;
    this.retryable = retryable;
  }
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getOnce(url, { timeoutMs, maxBytes }) {
  let res;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, 'Accept': '*/*' },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (err) {
    throw new FetchError(describe(err, timeoutMs));
  }
  if (!res.ok) {
    if (res.body) res.body.cancel().catch(() => {});
    // A 4xx means asking again will get the same answer, except "too many
    // requests" and "request timeout", which are worth another try.
    const retryable = res.status >= 500 || res.status === 429 || res.status === 408;
    throw new FetchError('HTTP ' + res.status, { status: res.status, retryable });
  }
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of res.body) {
      size += chunk.length;
      if (size > maxBytes) throw new FetchError('response is larger than ' + maxBytes + ' bytes', { retryable: false });
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString('utf8');
  } catch (err) {
    if (err instanceof FetchError) throw err;
    throw new FetchError(describe(err, timeoutMs));
  }
}

function describe(err, timeoutMs) {
  if (err && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
    return 'no answer within ' + Math.round(timeoutMs / 1000) + ' seconds';
  }
  const cause = err && err.cause && (err.cause.code || err.cause.message);
  return (err && err.message ? err.message : String(err)) + (cause ? ' (' + cause + ')' : '');
}

// Returns the page body. Throws a FetchError once every attempt has failed.
async function fetchText(url, options = {}) {
  const opts = { ...DEFAULTS, ...options };
  let lastError;
  for (let attempt = 1; attempt <= opts.attempts; attempt++) {
    try {
      return await getOnce(url, opts);
    } catch (err) {
      lastError = err;
      if (!err.retryable || attempt === opts.attempts) break;
      await wait(opts.retryDelayMs * attempt);
    }
  }
  throw lastError;
}

// Reads pages from a folder written by "scripts/check.js --save", in place of the
// live sites: for looking into a source, and where the sites cannot be reached.
function savedPages(dir) {
  const index = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
  const byUrl = new Map(index.map(page => [page.url, page]));
  return async url => {
    const page = byUrl.get(url);
    if (!page) throw new Error('not among the saved pages');
    if (!page.file) throw new Error(page.error || 'could not be read when the pages were saved');
    return fs.readFileSync(path.join(dir, page.file), 'utf8');
  };
}

module.exports = { fetchText, savedPages, FetchError, USER_AGENT };
