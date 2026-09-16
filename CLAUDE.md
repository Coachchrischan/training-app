# CLAUDE.md: Training-App

White-labelled coach + athlete training platform. Base replicates TrainHeroic's structure (coach web app + athlete PWA), then diverges where TrainHeroic is weak. Serves three brands from one codebase: **Coach Chris Chan** (Linden, default), **Antenna Reef Athletic Club** (placeholder brand assets), **BlueZone**.

## Rules

- **All persistence through the API** (`web/src/lib/api.ts` → `server/`). No feature localStorage; the only browser storage allowed is the auth cookie and the dev brand override.
- **Multi-parameter prescriptions are the point.** Never reintroduce TrainHeroic's 2-column limit. Prescription columns live in `web/src/lib/params.ts` + `server` workout content JSON.
- **Brand packs** live in `web/src/brands/<brand>/` (`tokens.css` + `config.ts`). Components use semantic tokens only (`--surface`, `--ink`, `--primary`...). Never hard-code a brand colour in a component.
- **Terminology is brand config** (`athlete` vs `client` etc.). Use `useBrand().t(...)` in UI copy.
- This app **never talks to TrainHeroic's API**. `trainheroic-mcp/` stays separate. The only TrainHeroic artefact used is the exercise-library seed (read at seed time from `../trainheroic-mcp/.exercise-cache.json`) and the Workout Builder export JSON import.
- Health tasks (weight check-ins, water, supplements, habits, check-in forms) are first-class calendar items alongside sessions, not an afterthought.
- Australian English in all UI copy. No em dashes. kg only.
- Ports are fixed: web **8128**, API **8129** (Launchpad tile "Training App").
- SQLite via `node:sqlite` (Node 22.5+). Do not add native DB deps.
- Demo/seed data is clearly fake (`demo-*` emails). Real athlete onboarding waits for the hosted backend decision (Supabase Sydney, see `docs/BACKEND.md`).
- **TAC Ops** (`/coach/tac`) is Chris's coach-lead console for Teneriffe Athletic Club: KPIs, to-dos, planner, reflections, timesheet, Game Day library. Coach-scoped only, athletes never see it. Google Calendar sync is ICS both ways, never OAuth: `docs/TAC-OPS-TOOL.md`.
- The Saturday Community Day library is generated, not hand-edited. Change `server/src/data/tac-gameday.json`, then run `node scripts/render-gameday-doc.mjs`.
- Group Fitness Room is **6 rowers, 6 skis, 6 bikes, 6 runners, 2 sled lanes**, groups of six, cap 20. Not eight of each. Programming is built on those numbers.

## Layout

```
Training-App/
├── CLAUDE.md            ← this file
├── README.md            ← run/dev instructions
├── launch.mjs           ← Launchpad entry: starts API + web dev server
├── server/              ← Express + node:sqlite API (port 8129)
│   ├── src/             ← index, db (schema), auth, seed, routes/
│   └── data/app.db      ← gitignored
├── web/                 ← React + Vite + TS + Tailwind v4 (port 8128)
│   └── src/             ← app/coach/ (incl. coach/tac/), app/athlete/, brands/, components/, lib/
├── scripts/             ← render-gameday-doc.mjs (JSON → docs)
└── docs/                ← research, data model, roadmap, status reports, TAC-*
```

## Status

Scaffolded 2026-08-16 during an autonomous build day. See `docs/STATUS-2026-08-16.md` for what shipped and the open decisions.
