# Claude Design Prompt — Interactive Trading Management System

## Project Vision

Design and build a full-featured **Trading Management System** — a dark-themed, data-rich web application where a trader can manage multiple portfolio accounts (prop firm, own funds, EA robots), define and attach trading strategies, and store backtesting results with screenshots and notes. The system grows out of an existing XAU/USD risk calculator, so visual continuity (dark space theme, gold accents, card-based layout) must be preserved.

---

## Design Constraints

- **Color system**: Dark space background (`#07090F`), gold primary (`#F59E0B` → `#FDE68A`), muted white text, red/green for P&L
- **Typography**: Clean, monospaced numbers for financial data; sans-serif for labels
- **Layout**: Full-width dashboard with collapsible right sidebar navigation
- **Density**: Information-dense but not cluttered — traders need data at a glance
- **Tech stack**: Vanilla HTML/CSS/JS with ES modules, no framework, localStorage or IndexedDB for persistence (no backend)
- **Responsive**: Desktop-first (1280px+), readable on tablet

---

## Page Structure & Navigation

### Global Layout

```
┌─────────────────────────────────────────────┬──────────────────┐
│  Header: Logo + Account Selector + Theme     │                  │
├─────────────────────────────────────────────│  Right Sidebar   │
│                                             │                  │
│  Main Content Area                          │  ─ Accounts      │
│  (changes per page)                         │  ─ Strategies    │
│                                             │  ─ Backtesting   │
│                                             │                  │
│                                             │  [+ Add New]     │
└─────────────────────────────────────────────┴──────────────────┘
```

The **right sidebar** is always visible. Each nav item links to its dedicated page. A contextual `+ Add New` button at the bottom of the sidebar opens the relevant add-form for whichever page is active.

---

## Pages

### 1. Dashboard (Homepage)

**Purpose**: Bird's-eye view of all active accounts and strategy performance.

**Layout sections** (top to bottom):

#### A. Account Summary Strip (horizontal scroll)
- One card per portfolio account
- Shows: Account name, type badge (Prop Challenge / Prop Instant / Own Funds / EA Robot), current balance, P&L today, drawdown used %
- Active account highlighted with gold border
- Click to drill into that account

#### B. Strategy Win Rate Panel
- Grid of strategy cards (one per strategy)
- Each card shows: Strategy name, win rate %, total trades, avg R:R, profit factor
- Sparkline equity curve (small canvas chart)
- Filter by: All accounts / specific account

#### C. Recent Activity Feed
- Last 10 trade journal entries (if journal feature is added later)
- Last 3 backtesting sessions uploaded
- Timestamp, strategy tag, account tag

#### D. Risk Calculator Widget (existing)
- Embed the existing lot size calculator as a collapsible widget at the bottom
- Inherits the active account's balance and rules automatically

---

### 2. Accounts Page

**Purpose**: View and manage all portfolio accounts.

#### Account Type System

Four account types, each with different fields:

| Type | Badge Color | Key Fields |
|------|------------|------------|
| Prop Firm Challenge | Gold | Company, Challenge tier, capital, daily loss limit, max loss, profit target, max lot, max risk%, phase (Phase 1 / Phase 2 / Funded) |
| Prop Firm Instant | Blue | Company, capital, daily loss limit, max loss, payout schedule (bi-weekly/monthly), payout split % |
| Own Funds | Green | Capital, risk appetite (conservative/moderate/aggressive), attached strategies |
| EA Robot | Purple | Capital, EA name, broker, VPS info, attached EA strategies (one EA can have multiple strategies) |

#### Account List View
- Card grid, 2–3 columns
- Each card: account type badge, company logo placeholder (initials), account number, balance bar (current vs starting capital), key rule pills
- Status dot: Active / Paused / Passed / Blown

#### Add / Edit Account Form (slide-in panel)
Fields depend on selected account type. Common fields:
- Account name (custom label)
- Account type (dropdown → changes form fields below)
- Company / Broker name
- Starting capital
- Account number (optional)
- Status

Type-specific fields:
- **Prop firm**: Daily loss %, max loss %, profit target %, max lot size, max risk per trade %, payout schedule
- **Own funds**: Risk appetite toggle, personal daily stop %
- **EA Robot**: EA name, broker, VPS host (text), strategy attachment (multi-select from strategies list)

**Strategy Attachment** (all types except EA have this):
- Multi-select chip picker from the strategies database
- Shows selected strategies as removable chips below
- Each chip color-coded to the strategy's assigned color

---

### 3. Strategies Page

**Purpose**: Define, view, and manage trading strategies.

#### Strategy Card Grid
Each strategy card shows:
- Strategy name + color swatch
- Entry method summary (1-line description)
- Timeframes it operates on (M15, H1, H4, D1 — multi-select pills)
- Instruments (XAU/USD, indices, forex — pills)
- Win rate (overall)
- Accounts attached to this strategy (avatar chips)
- Last backtested date

#### Add / Edit Strategy Form
Fields:
- **Strategy name** (e.g., "London Breakout", "OB Retracement")
- **Color tag** (color picker — used throughout the app to identify this strategy)
- **Description** (textarea — market entry logic, confluence factors)
- **Entry confirmation method** (multi-select chips):
  - Order Block (OB)
  - Fair Value Gap (FVG)
  - Break of Structure (BOS)
  - Change of Character (CHoCH)
  - Liquidity Sweep
  - Support / Resistance
  - Custom (text input)
- **Timeframes** (multi-select: M1, M5, M15, M30, H1, H4, D1, W1)
- **Instruments** (multi-select: XAU/USD, US30, NAS100, EUR/USD, GBP/USD, custom)
- **Preferred R:R** (number input, default from risk calculator)
- **Max SL pips** (number)
- **Notes** (rich textarea)

#### Strategy Detail Page (click to expand)
- Full description
- Performance stats pulled from backtesting entries (total trades, win %, avg R:R, profit factor, max drawdown)
- List of linked backtesting sessions with thumbnails
- Accounts using this strategy

---

### 4. Backtesting Page

**Purpose**: Store, browse, and review backtesting sessions done in TradingView.

#### Backtesting Gallery
- Masonry or 3-column grid of backtesting cards
- Each card:
  - Screenshot thumbnail (uploaded image)
  - Strategy tag (color chip)
  - Account tag (which account this applies to)
  - Instrument + timeframe
  - Result: Win / Loss / Breakeven badge
  - Entry date of the trade setup
  - Short description preview
  - Created date

- Filter bar: by strategy, by account, by result (Win/Loss/BE), by instrument, by date range

#### Add Backtesting Entry Form (slide-in or full modal)
Fields:
- **Strategy** (select from strategies list — required)
- **Account** (select which account this data applies to)
- **Instrument** (select or type)
- **Timeframe** (select)
- **Trade direction** (Long / Short toggle)
- **Entry date** (date picker)
- **Result** (Win / Loss / Breakeven)
- **R achieved** (number — actual R:R realized, e.g. 2.8)
- **Screenshot** (file upload → stored as base64 in IndexedDB)
  - Image preview shown immediately after upload
  - Click to expand fullscreen
- **Description** (textarea — what you saw, why you entered, what happened)
- **Tags** (free-form chips, e.g. "clean setup", "late entry", "news spike")

#### Backtesting Detail View (click card → expand)
- Large screenshot display
- Full description
- All metadata (strategy, account, instrument, timeframe, result, R)
- Tags
- Edit / Delete actions

---

## Data Model (localStorage / IndexedDB)

```js
// accounts[]
{
  id, name, type, company, capital, status,
  rules: { dailyLossPct, maxLossPct, targetPct, maxLot, maxRiskPct, payoutSchedule, payoutSplit },
  strategyIds: [],   // attached strategy IDs
  eaName,            // EA Robot only
  createdAt, updatedAt
}

// strategies[]
{
  id, name, color, description,
  entryMethods: [],
  timeframes: [],
  instruments: [],
  preferredRR, maxSLPips, notes,
  createdAt, updatedAt
}

// backtests[]
{
  id, strategyId, accountId,
  instrument, timeframe, direction,
  entryDate, result, rAchieved,
  screenshotData,   // base64 string
  description, tags: [],
  createdAt, updatedAt
}
```

---

## UI Component Specifications

### Cards
- Background: `rgba(255,255,255,0.04)` with `1px solid rgba(255,255,255,0.08)` border
- Hover: border brightens to `rgba(249,168,37,0.3)`, slight lift shadow
- Border radius: `16px`
- Padding: `20px 24px`

### Badges / Type Pills
- Prop Challenge: gold background, dark text
- Prop Instant: `#3B82F6` blue
- Own Funds: `#10B981` green
- EA Robot: `#8B5CF6` purple
- Win: `#10B981`, Loss: `#EF4444`, BE: `#6B7280`

### Forms (slide-in panel)
- Slides in from the right, 420px wide, full height
- Dark overlay behind it
- Header with title + close button
- Footer with Cancel / Save buttons (gold Save button)
- Fields: labeled inputs, consistent spacing, inline validation

### Charts
- Use `<canvas>` with a minimal charting helper (no library)
- Equity sparklines: 60×30px inline
- Full win rate chart on dashboard: bar or donut

### Sidebar Navigation
- Width: 240px, fixed right
- Background: `rgba(0,0,0,0.4)` with blur backdrop
- Nav items: icon + label, active state gold underline
- Bottom `+ Add New` button: gold, full width

---

## Interactions & Micro-Animations

- Slide-in forms: `transform: translateX(100%)` → `translateX(0)`, `300ms ease`
- Card hover: `transform: translateY(-2px)`, `200ms ease`
- Badge state change (e.g. Blown): subtle pulse animation
- Screenshot upload: drag-and-drop zone with dashed gold border, scale animation on drop
- Strategy color picker: swatch grid with checkmark on selected
- Number inputs in forms: up/down arrows styled like the existing slider
- Empty states: illustrated placeholder (SVG) with `+ Add your first X` CTA

---

## Existing Features to Preserve

- **Risk Calculator**: Keep as a floating widget or dedicated tab, auto-populate balance from selected account
- **Dark/light theme toggle**: Extend to all new pages
- **Space background + starfield**: Present on all pages as base layer
- **Sun effect** in light mode: apply globally
- **Favicon**: existing `favicon.svg`

---

## Deliverables Expected from Claude Design

1. Full HTML/CSS/JS implementation in the existing modular file structure:
   ```
   css/
     base.css, components.css, background.css
     + accounts.css, strategies.css, backtesting.css
   js/
     state.js, calc.js, ui.js, theme.js, background.js, main.js
     + db.js         (IndexedDB wrapper)
     + accounts.js   (account CRUD + render)
     + strategies.js (strategy CRUD + render)
     + backtesting.js (backtest CRUD + render)
     + router.js     (hash-based SPA routing)
   index.html        (updated with all sections)
   ```

2. Routing via `location.hash` (`#dashboard`, `#accounts`, `#strategies`, `#backtesting`)

3. All CRUD operations (Create, Read, Update, Delete) for accounts, strategies, backtests

4. Strategy-to-account attachment working bidirectionally (attach strategy to account, see accounts on strategy detail)

5. Backtesting image upload → stored in IndexedDB, displayed as `<img>` from base64

6. Dashboard aggregating live stats from stored data

7. Responsive layout that does not break at 1024px

---

## Out of Scope (for now)

- Real broker API integration
- User authentication / multi-user
- Cloud sync
- Live trade execution
- PDF export (add later)
- Trade journal (separate future feature)
