import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startTestServer } from './helpers/test-server.mjs';

function fullSop(confirmed = []) {
  const obj = {};
  for (let i = 1; i <= 8; i++) obj[`rule_${i}`] = { confirmed: confirmed.includes(i), note: '' };
  return obj;
}

function request(app, method, path, body) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const port = server.address().port;
      const opts = { method, hostname: '127.0.0.1', port, path, headers: { 'content-type': 'application/json' } };
      const req = http.request(opts, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          server.close();
          let json = null; try { json = data ? JSON.parse(data) : null; } catch {}
          resolve({ status: res.statusCode, body: json });
        });
      });
      req.on('error', err => { server.close(); reject(err); });
      if (body !== undefined) req.write(JSON.stringify(body));
      req.end();
    });
  });
}

test('GET /api/accounts/:id returns dailyPnlToday=0 + capState=safe when no entries today', async () => {
  const { app, cleanup } = startTestServer();
  try {
    await request(app, 'PUT', '/api/accounts', { id: 'a1', name: 'A', type: 'prop_challenge', capital: 1000, startingCapital: 1000 });
    const r = await request(app, 'GET', '/api/accounts/a1');
    assert.equal(r.status, 200);
    assert.equal(r.body.dailyPnlToday, 0);
    assert.equal(r.body.capState, 'safe');
    assert.equal(r.body.personalDailyCapPct, 3.0);
    assert.equal(r.body.firmDailyCapPct, 5.0);
  } finally { cleanup(); }
});

test('account with -$22 today on $1000 balance reports capState=warning', async () => {
  const { app, cleanup } = startTestServer();
  try {
    await request(app, 'PUT', '/api/accounts', { id: 'a2', name: 'A2', type: 'prop_challenge', capital: 1000, startingCapital: 1000 });
    await request(app, 'PUT', '/api/journals', {
      id: 'j-today', accountId: 'a2', result: 'loss', amount: 22,
      entryDate: Date.now(),
      sopChecks: fullSop(),
    });
    const r = await request(app, 'GET', '/api/accounts/a2');
    assert.equal(r.body.capState, 'warning');
    assert.equal(r.body.dailyPnlToday, -22);
    assert.ok(r.body.personalCapPctUsed >= 70 && r.body.personalCapPctUsed < 90);
  } finally { cleanup(); }
});

test('GET /api/accounts (list) enriches every account', async () => {
  const { app, cleanup } = startTestServer();
  try {
    await request(app, 'PUT', '/api/accounts', { id: 'a3', name: 'A3', type: 'prop_instant', capital: 2000, startingCapital: 2000 });
    await request(app, 'PUT', '/api/accounts', { id: 'a4', name: 'A4', type: 'own_funds',     capital: 5000, startingCapital: 5000 });
    const r = await request(app, 'GET', '/api/accounts');
    assert.equal(r.status, 200);
    for (const acc of r.body) {
      assert.equal(typeof acc.capState, 'string');
      assert.equal(typeof acc.dailyPnlToday, 'number');
      assert.equal(typeof acc.personalCapDollars, 'number');
    }
  } finally { cleanup(); }
});

test('entry from yesterday does NOT count toward today', async () => {
  const { app, cleanup } = startTestServer();
  try {
    await request(app, 'PUT', '/api/accounts', { id: 'a5', name: 'A5', type: 'own_funds', capital: 1000, startingCapital: 1000 });
    const yesterday = Date.now() - 25 * 60 * 60 * 1000;
    await request(app, 'PUT', '/api/journals', {
      id: 'j-yesterday', accountId: 'a5', result: 'loss', amount: 100,
      entryDate: yesterday, sopChecks: fullSop(),
    });
    const r = await request(app, 'GET', '/api/accounts/a5');
    assert.equal(r.body.dailyPnlToday, 0);
    assert.equal(r.body.capState, 'safe');
  } finally { cleanup(); }
});
