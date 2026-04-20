# Trading Management System

Dark-themed SPA for managing prop-firm accounts, trading strategies, and backtesting sessions. Vanilla HTML/CSS/JS frontend + local Node.js/SQLite backend.

## Prerequisites

- [Node.js](https://nodejs.org/) 18+ (`node --version`)

## Run

```bash
cd server
npm install      # first time only
npm start        # serves frontend + API on http://localhost:3000
```

Then open **http://localhost:3000** in your browser.

> Don't open `index.html` directly via `file://` — it needs the server for API calls.

## Data

- **Database**: `tms.db` (SQLite file in project root) — open with [DB Browser for SQLite](https://sqlitebrowser.org/), DBeaver, or TablePlus
- **Screenshots**: saved to `uploads/bt-*.png`
- Both are gitignored; back them up by copying the files.

## Pages

- `#dashboard` — account summaries + strategy win rates
- `#accounts` — portfolio accounts (prop challenge / instant / own funds / EA)
- `#strategies` — strategy definitions with detail drill-down
- `#backtesting` — screenshot gallery of logged trade setups
- `#calculator` — XAU/USD risk/lot calculator (original tool)

## Dev

```bash
cd server
npm run dev      # node --watch for auto-restart
```

See [`.claude/CLAUDE.md`](.claude/CLAUDE.md) for architecture details.
