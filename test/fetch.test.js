'use strict';

const test = require('node:test');
const assert = require('node:assert');
const http = require('http');

const { fetchText, FetchError } = require('../tagr/fetch');

// Starts a local server whose answers the test scripts, and counts requests.
async function server(handler) {
  const hits = [];
  const srv = http.createServer((req, res) => {
    hits.push(req.url);
    handler(req, res, hits.length);
  });
  await new Promise(resolve => srv.listen(0, '127.0.0.1', resolve));
  return {
    url: 'http://127.0.0.1:' + srv.address().port,
    hits,
    close: () => new Promise(resolve => { srv.closeAllConnections(); srv.close(resolve); })
  };
}

const fast = { retryDelayMs: 1 };

test('returns the page body, including characters outside ASCII', async t => {
  const s = await server((req, res) => res.end('Peña, José — 300'));
  t.after(s.close);
  assert.strictEqual(await fetchText(s.url + '/results', fast), 'Peña, José — 300');
  assert.strictEqual(s.hits.length, 1);
});

test('tries again when the server has a passing problem', async t => {
  const s = await server((req, res, n) => {
    if (n < 3) { res.statusCode = 503; return res.end('busy'); }
    res.end('ok');
  });
  t.after(s.close);
  assert.strictEqual(await fetchText(s.url, fast), 'ok');
  assert.strictEqual(s.hits.length, 3);
});

test('gives up after three tries, and an error page is never returned as data', async t => {
  const s = await server((req, res) => { res.statusCode = 500; res.end('<html>Server error</html>'); });
  t.after(s.close);
  await assert.rejects(fetchText(s.url, fast), err => err instanceof FetchError && err.message === 'HTTP 500' && err.status === 500);
  assert.strictEqual(s.hits.length, 3);
});

test('does not retry a page that is not there', async t => {
  const s = await server((req, res) => { res.statusCode = 404; res.end('not found'); });
  t.after(s.close);
  await assert.rejects(fetchText(s.url, fast), /HTTP 404/);
  assert.strictEqual(s.hits.length, 1);
});

test('stops waiting on a server that does not answer', async t => {
  const s = await server(() => { /* never answers */ });
  t.after(s.close);
  await assert.rejects(fetchText(s.url, { ...fast, timeoutMs: 50, attempts: 2 }), /no answer within/);
  assert.strictEqual(s.hits.length, 2);
});

test('follows a redirect', async t => {
  const s = await server((req, res) => {
    if (req.url === '/old') { res.statusCode = 302; res.setHeader('Location', '/new'); return res.end(); }
    res.end('moved here');
  });
  t.after(s.close);
  assert.strictEqual(await fetchText(s.url + '/old', fast), 'moved here');
});

test('refuses a response that is far too large', async t => {
  const s = await server((req, res) => res.end('x'.repeat(5000)));
  t.after(s.close);
  await assert.rejects(fetchText(s.url, { ...fast, maxBytes: 1000 }), /larger than 1000 bytes/);
  assert.strictEqual(s.hits.length, 1);
});
