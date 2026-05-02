import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export function startTestServer() {
  const dir = mkdtempSync(join(tmpdir(), 'tms-test-'));
  process.env.TMS_DB_PATH = join(dir, 'test.db');
  delete require.cache[require.resolve('../../server/server.js')];
  const { app, db } = require('../../server/server.js');
  return {
    app,
    db,
    cleanup() {
      try { db.close(); } catch {}
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
