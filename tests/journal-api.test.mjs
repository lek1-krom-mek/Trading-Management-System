import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startTestServer } from './helpers/test-server.mjs';

function fullSop(confirmed = []) {
  const obj = {};
  for (let i = 1; i <= 8; i++) {
    obj[`rule_${i}`] = { confirmed: confirmed.includes(i), note: '' };
  }
  return obj;
}

function request(app, method, path, body) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const port = server.address().port;
      const opts = {
        method, hostname: '127.0.0.1', port, path,
        headers: { 'content-type': 'application/json' },
      };
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

test('PUT /api/journals with full sopChecks persists grade + count', async () => {
  const { app, db, cleanup } = startTestServer();
  try {
    const r = await request(app, 'PUT', '/api/journals', {
      id: 'j1', instrument: 'XAU/USD', result: 'win', amount: 100,
      sopChecks: fullSop([1,2,3,4,5,6,7]),
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.grade, 'A');
    assert.equal(r.body.confluenceCount, 7);
    assert.equal(r.body.preGrading, false);

    const row = db.prepare('SELECT grade, confluence_count, pre_grading FROM journals WHERE id = ?').get('j1');
    assert.equal(row.grade, 'A');
    assert.equal(row.confluence_count, 7);
    assert.equal(row.pre_grading, 0);
  } finally { cleanup(); }
});

test('PUT /api/journals without sopChecks marks entry as pre_grading', async () => {
  const { app, cleanup } = startTestServer();
  try {
    const r = await request(app, 'PUT', '/api/journals', {
      id: 'j2', instrument: 'XAU/USD', result: 'loss', amount: 50,
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.grade, null);
    assert.equal(r.body.preGrading, true);
  } finally { cleanup(); }
});

test('PUT /api/journals with partial sopChecks → 400', async () => {
  const { cleanup, app } = startTestServer();
  try {
    const r = await request(app, 'PUT', '/api/journals', {
      id: 'j3', sopChecks: { rule_1: { confirmed: true } },
    });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /missing rule key/);
  } finally { cleanup(); }
});

test('round-trip via GET returns sopChecks unchanged', async () => {
  const { app, cleanup } = startTestServer();
  try {
    const sop = fullSop([1,3,5,7]);
    sop.rule_1.note = 'OB confirmed at 2785';
    await request(app, 'PUT', '/api/journals', {
      id: 'j4', sopChecks: sop, result: 'be', amount: 0,
    });
    const r = await request(app, 'GET', '/api/journals/j4');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.sopChecks, sop);
    assert.equal(r.body.grade, 'C');
    assert.equal(r.body.confluenceCount, 4);
  } finally { cleanup(); }
});
