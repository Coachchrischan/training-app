# Top-10 coaching apps: features worth stealing (research, 2026-08-16)

Ten apps analysed against Chris's needs (health tasks beyond exercise, check-ins, nutrition, AI assist, clean UI) for the three brands: **A** premium 1:1 rehab coaching, **B** athletic club group classes, **C** allied health older adults. Full cited report in the session transcript; this is the working summary.

## Per-app: the three best steals

**Everfit** (the named benchmark; deep-dived)
1. Typed Task entity beside Workout on the calendar (habit / body metric / progress photo / form / content). **We shipped this pattern today.**
2. Autoflow: sequences of workouts+tasks+announcements+auto-messages, in day-relative mode (1:1, rehab protocols) or exact-date mode (club challenges).
3. Form builder + Response Comparison (any two submissions side by side, e.g. week 1 vs week 12 pain scores).
- Everfit AI reality check: their AI is a text→structured-workout parser, recipe parser, meal-photo macros, barcode scanner. **No AI check-in summaries, no AI-drafted coach replies, no true program generation. That white space is ours to take.**
- Client app = 3 tabs (Today / Coaching / You); modules are commercial add-ons, so no tenant sees everything. Clean-UI mechanism = per-tenant module gating. **Shipped as brand feature flags.**

**ABC Trainerize**: habit taxonomy in five domains (movement/nutrition/portions/mindfulness/sleep) + Master Habit Programs; streaks with a noon-next-day grace window (adherence psychology, cheap to build); Smart Meal Planner with meal-swap.

**TrueCoach**: monthly habit cadence (rehab outcome measures, carer reports); roster triage columns (compliance, risk, due dates) — **our "needs a nudge" dashboard is v1 of this**; wearables in the same timeline as workouts. Clean because it refuses scope (no food DB, no CRM).

**PT Distinction**: result-triggered automation (fires on milestones, week numbers, assessment results, e.g. "week-6 pain > 4 → deload + flag coach"); assessment/movement-screen templates; AI content assistant. Template-first UX.

**TeamBuildr**: Weight Room View (tablet/kiosk mode, shared-device roster picker, huge targets) — unlock for club floor AND aged-care rooms; scheduled group wellness questionnaires with individual-vs-group comparison; 16+ exportable PDF/CSV reports (funders, GPs, families need documents, not logins).

**CoachRx (OPEX)**: Lifestyle Rx — habits carry a VALUE (count, 1-10 quality score), not just a tick. **We shipped value-carrying completions (weight, readiness scores); scale/count habit modes are a small extension.** Trends that surface patterns, not just charts; assessment → training-priority rules engine.

**Wodify**: at-risk scoring that creates an assigned staff task + drafted outreach (a human action, not a red dot); workflow "recipes"; digital whiteboard + leaderboard (suppressible per tenant — never in front of BlueZone clients).

**Hevy Coach**: best-in-class set-logging ergonomics (the most-used screen in the product — polish it hardest); deep body-measurement catalogue; the counter-example that scope discipline wins reviews.

**Volt Athletics**: Cortex Smart Sets — mid-session RPE prompt adjusts the NEXT set's load in real time. For rehab, swap RPE for pain/tolerance and cap progression. Automation as UI reduction: athlete sees one number, not a % table.

**Kahunas**: composite per-client health/adherence score (label it "engagement", not "health", for the allied-health brand); automated check-in cycles; voice-note replies (high personalisation per minute; more accessible for older clients). Also the cautionary tale: shipped breadth fast, reviews say buggy + clunky. **Do not build a food database.**

## Ranked shortlist for our roadmap

| # | Feature | Brands | Effort | Status |
|---|---|---|---|---|
| 1 | Typed task/habit entity on calendar | A B C | M | **Shipped v1** |
| 2 | Habits with a value (count / 1-10 scale) | A C | S | Partial (weight + readiness carry values) |
| 3 | Form builder + response comparison | A C | M | Forms shipped; comparison view queued |
| 4 | **Carer/proxy mode** (log on behalf of, audit trail) | C | M | **No competitor has this. BlueZone moat.** Queued |
| 5 | Autoflow-style sequencer (day-relative + exact-date) | A B C | L | Queued |
| 6 | Result-triggered automation with assigned tasks | A B C | L | Queued |
| 7 | Roster triage with adherence/risk columns | A B C | M | v1 shipped ("needs a nudge") |
| 8 | **AI check-in digest** (summary + draft reply, human-in-loop) | A C | M | White space — nobody does it. Queued |
| 9 | AI text→workout parser (doubles as migration tool) | A B | M | Queued |
| 10 | Macro targets + nutrition via integration (never own food DB) | A | M | Deferred by design |
| 11 | RPE/pain auto-regulation (adjust next set) | A B | M | Queued |
| 12 | Kiosk mode + per-tenant module gating | B C | M | Gating shipped; kiosk queued |

Cheap wins queued: streak grace window (S), voice-note replies (S), PDF progress exports (S-M), coach-private limitations/injuries field split from shared goals (S), habit taxonomy seed library (S).

## Two structural rules adopted

1. **Role-separated density** (TeamBuildr): dense coach console, single-purpose athlete screens, one-glance kiosk. Never one responsive UI for all three.
2. **Modules as per-tenant toggles** (Everfit/Wodify): breadth is fine if no single brand renders all of it. Already first-class in `web/src/brands/index.ts`.
