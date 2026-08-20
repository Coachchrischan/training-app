# TrainHeroic functional map (research, 2026-08-16)

Compiled from public sources (trainheroic.com, support articles via search index, app store listings, the Peaksware UserVoice forum, competitor teardowns). Source URLs inline where they mattered; the full cited report lives in the session transcript. This is the reference for what "the base" replicates.

## Coach web app structure

Six-item nav (reduced from 11 in their redesign): **Home** (activity feed, filter by group/date), **Athletes** (roster + athlete drawer: working maxes, PRs, recent history, private notes), **Teams**, **Library** (programs, sessions, exercises), **Analytics** (+ Classic Reports), **Gym Tools** (workout preview, whiteboard, big-screen leaderboard), plus **Marketplace** and org settings.

Key mechanics worth knowing:

- **Program assignment is a snapshot copy, not a live link.** Edits to a Library program do not propagate to assigned calendars (their own support docs field the complaints).
- **Calendar**: copy/paste/delete/repeat sessions, multi-select with an action banner, real-time autosave.
- **Session builder**: session → blocks (one per exercise) → optional superset links; circuits for warm-ups. Session instructions up to 10,000 chars.
- **THE two-parameter ceiling**: each exercise gets exactly two prescription columns picked from sets/reps/rep-range/weight/weight%/time/distance/calories/height. RPE goes in notes, tempo goes in the exercise NAME, rest goes in superset instructions. Their own forum: "Allow more than 2 parameters" = 118 votes, status "Planned", unshipped. **This is our core divergence and it ships today.**
- **%1RM auto-calc** from a working max. Working-max rule: auto-updates from training until tested/manually set, then never auto-adjusts until re-tested. (Replicated exactly.)
- **Readiness surveys**: fixed 5 questions (sleep/mood/energy/stress/soreness) → 1-5 score. Not customisable. (We ship custom check-in forms as well.)
- **Messaging**: TH Chat (DMs + team announcements) separate from per-session comments. Form-check videos: 1 minute cap, 30-day expiry, YouTube-hosted exercise demos only.
- **Roles**: head coach + assistant coach ($9.99/mo each), nothing granular.
- **Athlete app**: start session → block-by-block swipe → per-set check-off/keypad → finish → summary (perceived-intensity slider, duration, comments). Timers (incl. AMRAP/EMOM), offline via airplane-mode detection, auto-sync on reconnect.

## Documented gaps (their own forum votes)

| Votes | Gap | Our status |
|---|---|---|
| 118 | More than 2 parameters | **Shipped** (unlimited columns) |
| 78/52/50 | Reordering (mid-session, drag-drop, mobile) | Partial (up/down reorder; dnd upgrade queued) |
| 59 | Reps/weight per side | Queued (column variant) |
| 57 | Public API / export | Ours by architecture (own DB, REST API) |
| 57 | Body metrics tracking | **Shipped** (weight check-ins → metrics series) |
| 51 | Dark mode | Queued (token-level, cheap) |
| 49 | Nutrition & meal tracking | Deliberately deferred (integration, not own DB) |
| — | Rounds+reps / AMRAP / EMOM scoring | Block kinds shipped; scoring UI queued |
| — | Custom check-in forms | **Shipped** |
| — | Health/habit tasks on the calendar | **Shipped** (their coaches fake it with dummy exercises) |

## Pricing reference

Seat ladder $9.99 (1) → $74.99 (50) → $199.99 (500)/mo; assistant coaches $9.99 each; athlete free with coach, Athlete Pro $4.99/mo; marketplace 30% + fees on marketplace-sourced sales. No public API; coach export limited to the athlete contact list.
