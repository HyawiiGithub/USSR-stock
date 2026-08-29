# USSR Economy — Integrated Red Star Exchange

This is the **FULL bot economy** integrated into the USSR-stock website, built from `bot stuff/bot.js`.

## What is integrated?
- **GSI Index** (100pt history + live change%)
- **Inflation** (100pt, money printed vs reserves)
- **Gold Standard** (price floats with inflation, stock vs money supply, backing % gauge)
- **Companies** (14 corps, 6 state + 8 private, share price history, market cap, specialization, wage)
- **Supply × Demand** (per crafted item 60-150%, supply factor 0.6-1.4, balanced target)
- **Demand History** (60pt per item)
- **AI Store + Global Consumption** (state distribution simulation)
- **World Map** (6 regions × 15 SSRs, census, food stock vs demand)
- **Food Security** (region stock = Σ FoodValues, demand = ceil(employees*2 + pop*0.5))
- **Crafting & Buildings** (25 recipes, 8 mines, 7 factories, margin calc)

All formulas match `bot.js` exactly (`getGoldPrice`, `getSupplyFactor`, `getBalancedDemandTarget`, etc.).

## Run locally (with backend)
```bash
cd "website for ahd"
npm install
node server.js   # default http://localhost:3001
# open http://localhost:3001/ussr.html
```

API served by `server.js`:
- `GET /api/ussr/overview` — everything
- `GET /api/ussr/gsi|gold|inflation|companies|market|ai-store|worldmap`

Served with no auth (bot economy is public). Refreshes every 10s with smooth Chart.js transitions.

## Deploy to GitHub Pages (USSR-stock repo)
This folder is **static-only ready**: `index.html` + `ussr.js` fallback to client-side mock if `/api/ussr/overview` 404s.

Push to `HyawiiGithub/USSR-stock`:
```bash
# from this folder
git init
git remote add origin https://github.com/HyawiiGithub/USSR-stock.git
git add index.html ussr.js
git commit -m "feat: integrate FULL USSR bot economy — all graphs, smooth Red Star design LOCK"
git push -u origin main --force
# enable Pages: Settings → Pages → Branch: main / root
```

Or copy into existing clone:
```bash
git clone https://github.com/HyawiiGithub/USSR-stock.git
cp index.html ussr.js USSR-stock/
cd USSR-stock && git add . && git commit -m "integrate economy" && git push
```

## Design — LOCK
Soviet Constructivism + brutalist paper: deep crimson `#5f0909`, oxblood `#240303`, gold `#efc94c`, cream `#eee5cd`. 
Typography Playfair Display + Inter + JetBrains Mono. 
Smoother: 60fps, transform-only, `animation: {duration:600}` on charts, `prefers-reduced-motion` respected, skeleton → live diff, 10s poll.

Files:
- `index.html` — new locked design, 5 views (Overview / Markets & GSI / Companies / World Map / Production)
- `ussr.js` — fetches `/api/ussr/overview` or falls back to client mock, renders 9 charts
- `ussr-economy-data.mjs` — backend generator (used by `website for ahd/server.js`)

Backend source of truth remains `bot stuff/bot.js` — this site is a read-only mirror.
