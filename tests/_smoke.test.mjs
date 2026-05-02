import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers/test-server.mjs';

test('test harness boots an isolated server with empty journals', () => {
  const { db, cleanup } = startTestServer();
  try {
    const rows = db.prepare('SELECT COUNT(*) AS n FROM journals').get();
    assert.equal(rows.n, 0);
  } finally {
    cleanup();
  }
});
