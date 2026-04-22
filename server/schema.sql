CREATE TABLE IF NOT EXISTS accounts (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  type          TEXT NOT NULL,
  company       TEXT,
  capital       REAL,
  status        TEXT,
  rules         TEXT,           -- JSON object
  strategy_ids  TEXT,           -- JSON array of strategy ids
  ea_name       TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS strategies (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  color          TEXT,
  description    TEXT,
  entry_methods  TEXT,          -- JSON array
  timeframes     TEXT,          -- JSON array
  instruments    TEXT,          -- JSON array
  preferred_rr   REAL,
  max_sl_pips    REAL,
  notes          TEXT,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS journals (
  id               TEXT PRIMARY KEY,
  strategy_id      TEXT,
  account_id       TEXT,
  instrument       TEXT,
  timeframe        TEXT,
  direction        TEXT,
  entry_date       INTEGER,     -- unix ms
  result           TEXT,        -- win | loss | be
  r_achieved       REAL,
  amount           REAL,        -- dollar P&L magnitude (always positive, sign derived from result)
  screenshot_path  TEXT,        -- e.g. /uploads/bt-xxx.png
  description      TEXT,
  tags             TEXT,        -- JSON array
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL,
  FOREIGN KEY (strategy_id) REFERENCES strategies(id) ON DELETE SET NULL,
  FOREIGN KEY (account_id)  REFERENCES accounts(id)   ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_journals_strategy ON journals(strategy_id);
CREATE INDEX IF NOT EXISTS idx_journals_account  ON journals(account_id);
CREATE INDEX IF NOT EXISTS idx_journals_created  ON journals(created_at DESC);
