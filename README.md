# Training App

One platform, three brands: Coach Chris Chan, Antenna Reef Athletic Club, BlueZone.
Coach web app + athlete PWA. TrainHeroic's structure, our own skin, plus the things it misses:
unlimited prescription columns (kg + %1RM + RPE + tempo together), health tasks on the calendar
(weight check-ins, water, supplements, habits), custom check-in forms, and clean data export.

## Run

Easiest: the **Training App** tile on the Launchpad (localhost:7777).

Manual:

```
cd server && npm install && npm run dev     # API on http://127.0.0.1:8129
cd web && npm install && npm run dev        # app on http://127.0.0.1:8128
```

Or both at once from this folder: `node launch.mjs`.

Requires Node 22.5+ (uses built-in `node:sqlite`). This machine runs Node 24.

## First login (seeded demo data)

| Role | Email | Password |
|---|---|---|
| Coach (Chris) | `coach@demo.local` | `coach1234` |
| Athlete | `abbey@demo.local` | `athlete1234` |
| Athlete | `jono@demo.local` | `athlete1234` |

The database seeds itself on first boot: ~2,800 exercises from the TrainHeroic library cache,
demo athletes, a demo team, one programmed week and sample health tasks.
Delete `server/data/app.db` to reset everything.

## Brands

Active brand: Settings → Brand (dev switcher, stored per browser), or `?brand=coach-chris-chan|antenna-reef|bluezone` once, or default `coach-chris-chan`.

## Git

This folder is intended to be its own private repo (TAC/coaching-tool pattern), gitignored from
the outer cowork repo. **Not yet initialised** — Claude's sandbox can't run host git reliably;
Chris: run `git init` here (or ask and I'll walk you through wiring it into push-cowork.bat).

## TAC Ops

`/coach/tac` is the coach-lead console for Teneriffe Athletic Club: KPI board, to-do
list, weekly planner with Google Calendar sync, reflections log (typed or dictated),
timesheet against the 6 to 10 hour contract, and the 50-session Saturday Community Day
library.

- `docs/TAC-OPS-TOOL.md` — how the tool works, including the Google Calendar setup
- `docs/TAC-COACH-HANDBOOK.md` — the onboarding document for a new coach
- `docs/TAC-COACH-REPORTING.md` — what coaches report and what happens to it
- `docs/TAC-GAME-DAY-LIBRARY.md` — the 50 sessions, generated from
  `server/src/data/tac-gameday.json` via `node scripts/render-gameday-doc.mjs`
