# Trading Management System (TMS)

A free, **dark-themed desktop dashboard** for traders who want a single home for their **accounts, strategies, journal, and pre-trade checklists** — no subscriptions, no cloud, your data stays on your computer.

Built with plain HTML/CSS/JavaScript and an optional tiny local server. No build step, no framework, no telemetry.

> **Heads-up for non-technical users:** "build" here doesn't mean compiling code. It just means **install a couple of tools, copy the project to your computer, and double-click run**. The whole setup takes ~10 minutes the first time.

---

## What you can do with it

- **Track multiple trading accounts** — prop challenges, prop instant funding, your own money, EAs/bots, and backtests, each with its own rules (daily loss %, max loss %, profit target, risk per trade)
- **Define your strategies** — entry methods, timeframes, instruments, preferred R:R, plus a per-strategy setup checklist
- **Journal every trade** — with **two screenshots** (entry + exit), result, R achieved, dollar P&L, notes, and tags. Click a thumbnail for a fullscreen lightbox with zoom.
- **Cumulative P&L chart** — filter by time range, account, strategy, or account status
- **Sniper Adaptive Flow** — a 5-phase pre-trade checklist that automatically grades your setup (A+ / Baseline / Building / Skip) and tells you what position size to take
- **Trade calendar** — see your wins/losses day by day
- **Risk calculator** — quick position-size math
- **Works offline** — your data is yours, stored locally (SQLite file or browser IndexedDB)

---

## Two ways to use it

| Mode | What you do | Pros | Cons |
|------|-------------|------|------|
| **Local app (recommended)** | Install Node.js, run a tiny server on your laptop | Data in a SQLite file you can back up / open with any SQLite viewer | Need Node.js installed |
| **Browser-only** | Open the static site (no install) — e.g. host it on GitHub Pages | Zero install | Data lives **inside your browser**. Wipe the browser, lose the data. Use the in-app **Export** button often. |

The same UI works for both modes — the app auto-detects which one to use.

---

## Quick start

### Step 1 — Install the prerequisites

You only need **two things**: **Git** (to download the project) and **Node.js** (to run the local server).

<details>
<summary><b>🪟 Windows</b></summary>

1. **Install Git**
   - Download: https://git-scm.com/download/win
   - Run the installer. **Accept all defaults** (just keep clicking "Next").
   - This also installs **Git Bash**, a friendlier terminal we'll use later.

2. **Install Node.js**
   - Download the **LTS** version: https://nodejs.org/
   - Run the installer. Accept all defaults.
   - On the screen that asks about "Tools for Native Modules", **check the box** to install Chocolatey + build tools. This is what lets the database library work. (Takes ~5 min during install.)

3. **Verify**
   - Open **Git Bash** (search "Git Bash" in the Start menu)
   - Type these and press Enter:
     ```bash
     git --version
     node --version
     npm --version
     ```
   - You should see version numbers. If any say "command not found", restart your computer and try again.

</details>

<details>
<summary><b>🐧 Linux (Ubuntu / Debian)</b></summary>

Open a terminal and run:

```bash
sudo apt update
sudo apt install -y git curl build-essential

# Install Node.js LTS via NodeSource
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install -y nodejs

# Verify
git --version
node --version
npm --version
```

> **Fedora/RHEL users:** swap `apt` for `dnf` and `build-essential` for `make gcc gcc-c++`.
> **Arch users:** `sudo pacman -S git nodejs npm base-devel`.

</details>

<details>
<summary><b>🍎 macOS</b></summary>

**The easy way — Homebrew:**

1. Install Homebrew (if you don't have it). Open **Terminal** (Cmd+Space → "Terminal") and paste:
   ```bash
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   ```
   Follow the on-screen prompts (it'll ask for your password).

2. Install Git and Node:
   ```bash
   brew install git node
   ```

3. Verify:
   ```bash
   git --version
   node --version
   npm --version
   ```

**Or without Homebrew:**
- Git: https://git-scm.com/download/mac
- Node.js LTS: https://nodejs.org/

</details>

---

### Step 2 — Download (clone) the project

Pick a folder where you want the app to live (e.g. `Documents`). Open a terminal there:

- **Windows:** open **Git Bash**, type `cd ~/Documents`
- **macOS / Linux:** open **Terminal**, type `cd ~/Documents`

Then run:

```bash
git clone https://github.com/lek1-krom-mek/Trading-Management-System.git
cd Trading-Management-System
```

You now have a folder called `Trading-Management-System` with all the files.

---

### Step 3 — Install the app's dependencies

This downloads the tiny libraries the local server needs (one-time, ~30 seconds):

```bash
cd server
npm install
cd ..
```

> If you see a long red error about `better-sqlite3`, you're missing the C++ build tools.
> - **Windows:** rerun the Node.js installer and check "Tools for Native Modules"
> - **macOS:** `xcode-select --install`
> - **Linux:** `sudo apt install build-essential`

---

### Step 4 — Run it

From the project folder:

```bash
cd server
npm start
```

You'll see:
```
TMS server → http://localhost:3000
```

Open that URL in any modern browser (Chrome, Edge, Firefox, Safari, Brave). **Don't double-click `index.html`** — it needs the server running to save data.

To stop the server, go back to the terminal and press **Ctrl+C**.

To run it again later, open a terminal in the project folder and run `cd server && npm start`.

---

## Where is my data?

| Item | Local app mode | Browser-only mode |
|------|----------------|--------------------|
| Trades, accounts, strategies | `tms.db` (SQLite file in the project folder) | Inside your browser's IndexedDB |
| Screenshots | `uploads/` folder (PNG files) | Inside your browser's IndexedDB |

**Both modes are 100% local. Nothing is uploaded anywhere.**

### Backing up

- **Local app mode:** copy `tms.db` and the `uploads/` folder somewhere safe (Dropbox, USB stick, external drive).
- **Browser-only mode:** open the app → click **Data** in the sidebar → **Export** → save the JSON file. Do this regularly. Clearing your browser data **will delete everything**.
- You can also **Import** the JSON back in to restore.

### Inspecting the database

If you're curious, open `tms.db` with one of these free tools:
- [DB Browser for SQLite](https://sqlitebrowser.org/) (easiest)
- [DBeaver](https://dbeaver.io/) (more powerful)
- [TablePlus](https://tableplus.com/) (paid but slick)

---

## Updating to a new version

From the project folder:

```bash
git pull
cd server
npm install
```

Then restart the server (`Ctrl+C`, then `npm start` again). Your data is safe — `git pull` doesn't touch `tms.db` or `uploads/`.

---

## Pages / workspaces

| Page | What it's for |
|------|---------------|
| **Dashboard** | KPIs, cumulative P&L chart, account strip, doctrine quick links |
| **Accounts** | All your accounts with drawdown bars, rule chips, attached strategies. Click an account to drill down. |
| **Strategies** | Define your setups (entry methods, timeframes, instruments, R:R). Click a strategy to see its win rate, recent trades, and which accounts use it. |
| **Journal** | Gallery of every trade with screenshots. Click any thumbnail for the full detail modal + zoomable lightbox. |
| **Calendar** | Day-by-day overview of trades |
| **Sniper Entry** | The Orderflow Sniper Adaptive Flow — a 5-phase pre-trade checklist that grades your setup and tells you what size to take |
| **Risk Calculator** | Quick position-size / lot calculator |
| **Data** | Export / import / backup your data, switch storage modes |

---

## Hosting it online (advanced, optional)

If you want to access the app from your phone or share it with friends:

- **GitHub Pages / Netlify / Vercel (static):** push your fork to GitHub, enable Pages, point at the project root. The app will auto-fall-back to browser-only mode (data lives per-device).
- **A small VPS** (DigitalOcean, Hetzner, etc.): clone, run `npm start` behind a reverse proxy (Nginx/Caddy). You get a real database and screenshots in files.

> **Privacy reminder:** if you host this on a public URL with the local-server mode, **anyone who finds the URL can see your data** — there's no login built in. Keep it on `localhost` or behind a private network unless you add auth.

---

## Troubleshooting

<details>
<summary>"Cannot find module 'better-sqlite3'" or it fails to install</summary>

You're missing C++ build tools. Fix per OS:
- **Windows:** Rerun the Node.js installer and check the "Tools for Native Modules" box. Restart.
- **macOS:** `xcode-select --install`
- **Linux:** `sudo apt install build-essential python3`

Then in the project: `cd server && rm -rf node_modules && npm install`

</details>

<details>
<summary>"Port 3000 is already in use"</summary>

Another app is using port 3000. Either close it, or run TMS on a different port:

```bash
PORT=3001 npm start
```

Then open http://localhost:3001 instead.

</details>

<details>
<summary>"Database is locked" or "SQLITE_IOERR_SHMOPEN" (Windows + WSL users)</summary>

This only affects people running the project from a Windows drive inside WSL (e.g. `/mnt/c/...`). Either:
- Move the project into your WSL home folder (`~/`)
- Or run with the WAL workaround: `TMS_NO_WAL=1 npm start`

</details>

<details>
<summary>I opened <code>index.html</code> directly and it looks broken</summary>

You need to run the server (`cd server && npm start`) and open **http://localhost:3000**, not the file directly. The file:// protocol blocks the API the app uses.

</details>

<details>
<summary>I want to start fresh / delete all my data</summary>

- **Local mode:** stop the server, delete `tms.db` and `uploads/bt-*.png`, restart. (Back up first if unsure.)
- **Browser-only mode:** open the app → **Data** page → **Wipe local data**.

</details>

---

## Tech stack (for the curious)

- **Frontend:** vanilla HTML/CSS/JavaScript with ES modules — no React, no build step, no bundler
- **Local backend:** Node.js + Express + SQLite (via `better-sqlite3`) + multer for file uploads
- **Storage:** dual-mode — SQLite (local server) or IndexedDB (browser-only), auto-detected at runtime
- **Charts:** hand-rolled SVG, no external chart library
- **Routing:** simple hash router (`#dashboard`, `#accounts`, etc.)
- **No telemetry, no analytics, no external dependencies at runtime in browser-only mode**

---

## Contributing

Pull requests welcome! This is a personal trading tool I'm sharing in case it's useful to others. If you find bugs or want a feature:

1. Fork the repo
2. Create a branch (`git checkout -b my-feature`)
3. Commit your changes
4. Open a Pull Request

Please keep the spirit of the project: **no build step, no framework lock-in, no telemetry, data stays local.**

---

## License

MIT — see [LICENSE](LICENSE) for details. TL;DR: do whatever you want with this code, just keep the copyright notice. No warranty.

---

## Disclaimer

This is a **personal record-keeping tool**, not financial advice and not a trading platform. It doesn't connect to your broker, doesn't place trades, and doesn't guarantee any outcome. Trading carries risk; you can lose money. Use at your own risk.
