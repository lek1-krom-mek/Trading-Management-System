# Trading Management System — CLAUDE.md

## Project Overview

A dark-themed, data-rich **single-page application** for managing trading portfolio accounts, strategies, and backtesting sessions. Vanilla HTML/CSS/JS frontend (ES modules, no framework, no build step) backed by a **local Node.js + SQLite server**.

Original design spec: [`.claude/trading-management-system-prompt.md`](.claude/trading-management-system-prompt.md)

---

## Tech Stack

- **Frontend**: Vanilla JavaScript (ES modules, no build step)
- **Backend**: Node.js + Express (`server/`)
- **Database**: SQLite via `better-sqlite3` — single `tms.db` file in project root, openable in DB Browser for SQLite / DBeaver / TablePlus
- **File uploads**: Screenshots saved to `uploads/` via `multer`, path stored in DB
- **Routing**: Hash-based SPA (`#dashboard`, `#accounts`, `#strategies`, `#backtesting`, `#calculator`)
- **Charts**: Native `<canvas>` — no chart library
- **Active account**: kept in browser `localStorage` (`tms-active-account`)

---

## File Structure

```
index.html                  # Frontend shell — all pages render into #app
tms.db                      # SQLite database (generated on first run, gitignored)
uploads/                    # Screenshot storage — bt-*.png (gitignored), plus reference pastes
.gitignore                  # Ignores tms.db + uploads/bt-*

css/
  base.css                  # Reset, variables, typography
  components.css            # Cards, badges, buttons, chips
  background.css            # Starfield / space background
  layout.css                # Header, sidebar, main grid
  forms.css                 # Slide-in form panel + field styles
  dashboard.css, accounts.css, strategies.css, backtesting.css

js/
  db.js                     # HTTP client: fetch-based wrapper around /api (getAll/get/put/del) + uploadScreenshot()
  store.js                  # In-memory cache over db.js, pub/sub change events
  router.js                 # Hash router: register(), go(), initRouter()
  state.js                  # Calculator state
  utils.js                  # el(), fmtMoney(), fmtPct(), ACCOUNT_TYPES, initials(), sparkline()
  ui.js, theme.js, background.js, main.js
  dashboard.js, accounts.js, strategies.js, backtesting.js
  forms.js                  # Slide-in panel + field builders. imageUpload uploads files via /api/upload

server/
  package.json              # express, better-sqlite3, multer, cors
  schema.sql                # Table definitions
  server.js                 # Express app — serves frontend + /api + /uploads
  .gitignore                # Ignores node_modules
```

---

## Architecture

### Runtime flow
```
Browser ──► localhost:3000  (Express)
              ├── static → index.html + css/ + js/
              ├── /uploads/* → screenshot files
              └── /api/* → SQLite via better-sqlite3
```

### Data flow (frontend)
```
tms.db (SQLite) ← server.js (/api) ← db.js (fetch) ← store.js (cache + events) ← page modules
```
- **Always** go through `store.js` for reads/writes, never call `db.js` directly from page modules.
- After any write, `store.js` calls `notify()` so subscribed views re-render.

### Field mapping
- DB columns are **snake_case**, JS objects are **camelCase**.
- Conversion happens in `server/server.js` via per-store `MAPPERS` (`toDb` / `fromDb`).
- Array/object fields (`rules`, `strategyIds`, `timeframes`, `tags`, etc.) are stored as JSON text.

### Screenshot flow
1. User drops/pastes/selects image in `imageUpload()` (forms.js)
2. Shows instant local preview via `URL.createObjectURL()`
3. POSTs file to `/api/upload` (multer saves to `uploads/bt-<timestamp>-<rand>.png`)
4. Server returns `{ path: '/uploads/bt-...png' }` — stored as `screenshotPath` on the backtest row
5. On backtest delete, server unlinks the file

### Routing
- Pages register handlers via `register(name, fn)` in `main.js`
- Navigate with `go('accounts')` — never mutate `location.hash` directly
- Sub-routes use `/` separator: `#strategies/abc123` → `param = 'abc123'`

---

## API Endpoints

All mounted under `/api` on `localhost:3000`.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/:store` | List all (sorted by `created_at DESC`) |
| GET | `/:store/:id` | Fetch one |
| PUT | `/:store` | Upsert (body = full object, `id` required) |
| DELETE | `/:store/:id` | Delete (cascades screenshot file for backtests) |
| POST | `/upload` | Multipart file upload → returns `{ path }` |

`:store` ∈ `accounts` | `strategies` | `backtests`.

---

## Database Schema

```sql
accounts(
  id TEXT PK, name, type, company, capital REAL, status,
  rules TEXT(json), strategy_ids TEXT(json), ea_name,
  created_at INTEGER, updated_at INTEGER
)

strategies(
  id TEXT PK, name, color, description,
  entry_methods TEXT(json), timeframes TEXT(json), instruments TEXT(json),
  preferred_rr REAL, max_sl_pips REAL, notes,
  created_at INTEGER, updated_at INTEGER
)

backtests(
  id TEXT PK, strategy_id FK→strategies(id) SET NULL,
  account_id FK→accounts(id) SET NULL,
  instrument, timeframe, direction,
  entry_date INTEGER, result, r_achieved REAL,
  screenshot_path TEXT,  -- e.g. /uploads/bt-xxx.png
  description, tags TEXT(json),
  created_at INTEGER, updated_at INTEGER
)
```

---

## Running

```bash
cd server
npm install        # first time only
npm start          # starts http://localhost:3000
```

Open `http://localhost:3000` in the browser (**not** `file://` — needs the server for `/api` calls).

Inspect data: open `tms.db` in any SQLite GUI. View uploaded screenshots under `uploads/`.

---

## Design System

| Token | Value | Use |
|-------|-------|-----|
| Background | `#07090F` | Page base |
| Gold primary | `#F59E0B` → `#FDE68A` | CTAs, active states |
| Profit | `#10B981` | Green P&L |
| Loss | `#EF4444` | Red P&L |
| Prop Challenge | gold | Badge |
| Prop Instant | `#3B82F6` | Badge |
| Own Funds | `#10B981` | Badge |
| EA Robot | `#8B5CF6` | Badge |

- Cards: `rgba(255,255,255,0.04)` bg, `16px` radius, hover border → `rgba(249,168,37,0.3)` + `translateY(-2px)`
- Forms: 420px slide-in from right, `300ms ease`, dark overlay behind

---

## Coding Conventions

- No framework, no build step — plain ES module `import/export`.
- No `innerHTML` with user-provided data — use `el()` from `utils.js`.
- Immutable updates — spread into new objects, never mutate `data.*` arrays in place.
- Files under 400 lines, organized by domain.
- No comments unless the WHY is non-obvious.
- Frontend talks to backend exclusively via `db.js` — page modules never `fetch` directly.

---

## Out of Scope

- Multi-user auth
- Cloud sync
- Real broker API
- Live trade execution
- PDF export
- Trade journal (planned later)
