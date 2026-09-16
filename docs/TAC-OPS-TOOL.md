# TAC Ops tool

The coach-lead console inside the training app: `/coach/tac`.

Version 1.0 · 16 September 2026

---

## What it is

Chris's job at Teneriffe Athletic Club was living across a dozen email threads, a
Google Sheet and his head. TAC Ops gives it one place, sitting alongside the
athlete-facing modules rather than replacing them.

| Tab | What it holds |
|---|---|
| **Overview** | Hours against the contracted band, what is on today, what is overdue, next Community Day |
| **Plan** | A week at a time, both directions of Google Calendar sync |
| **To-do** | Now / Next / Later, with owners, due dates and a link to the KPI each one serves |
| **KPIs** | The board from `TAC-COACH-REPORTING.md`, with a reading per period and a trend line |
| **Reflections** | Typed or dictated, tagged, with a "this changed the programming" flag |
| **Timesheet** | Against the 6 to 10 hour contract from 14 Sep, week by week, CSV out |
| **Game Day** | All 50 Community Day sessions, filterable by team size and gear |

Everything persists through the API into SQLite, per the project rule. No feature
localStorage.

---

## Google Calendar

Deliberately no OAuth. Two one-way pipes beat one bidirectional sync that fights
itself over which side is right.

**Out — the planner into Google.** The server publishes
`/api/tac/calendar/<token>.ics`. In Google Calendar: *Other calendars → From URL*,
paste, done. Every planner block, including recurring ones, appears on the phone and
stays current.

Two things worth knowing. Google refreshes a subscribed URL on its own schedule,
usually every few hours rather than instantly, so anything needed on the phone *right
now* should also be added in Google directly. And the URL is the credential: anyone
holding it can read the plan. There is a Rotate button for when that matters.

**In — Google into the planner.** Paste a calendar's *secret address in iCal format*
(Google Calendar → that calendar's settings → Integrate calendar). The server mirrors
it read-only into `tac_feed_events` and the planner draws those events greyed out
alongside the plan. Nothing is ever written back into Google.

Both the `coachchrischan.com.au` and the `c93chan@gmail.com` calendars can be added as
separate feeds; they show side by side.

The ICS parser handles unfolded lines, date and date-time DTSTART/DTEND, UTC
conversion, and DAILY/WEEKLY/MONTHLY recurrence with INTERVAL, BYDAY, COUNT and
UNTIL. Anything more exotic lands as its first occurrence rather than disappearing.

---

## Running it on a phone

The app currently binds to `127.0.0.1:8129`, which means it works on the machine it
runs on and nowhere else. Three ways to change that, in order of effort:

1. **Tailscale or a similar private network.** Fifteen minutes. The laptop keeps
   running the app, the phone reaches it over the tailnet, nothing is exposed to the
   public internet. Best effort-to-value ratio if the laptop is usually on.
2. **A small hosted box** (Fly.io Sydney, Railway, a $6 VPS). The app is a single Node
   process plus a SQLite file, so this is a Dockerfile and a volume. Needs the app to
   bind `0.0.0.0` and sit behind HTTPS.
3. **Supabase Sydney**, per `docs/BACKEND.md`. The right answer once real athlete data
   is in play, and a bigger job than either of the above.

For today, the phone-usable copy is the published TAC Ops artifact, which carries the
handbook, the 50 sessions and the three picks. The app in this repo is the one that
holds live state.

---

## TrainHeroic

The project rule stands: this app never calls TrainHeroic's API. What it can do is
import.

TrainHeroic's Workout Builder exports JSON, and the app already understands that shape
(`web/src/lib/params.ts` and the workout content model). A **Pull from TrainHeroic**
box on the Game Day tab that accepts a pasted export and turns it into a session in the
library is a small, contained job and is on the to-do list rather than in this build,
because the shape of the export from the TAC account has not been confirmed yet.

What this means in practice: TrainHeroic stays the source of truth for delivered
strength sessions. Members log there, maxes live there. TAC Ops holds the planning,
the reporting and the Saturday library, which TrainHeroic has no place for.

---

## Data model

```
tac_kpis ──< tac_kpi_readings          one reading per period, re-posting overwrites
tac_todos ──> tac_kpis                 optional link: which number does this move
tac_plan_items                          rrule stored once, expanded on read
tac_feeds ──< tac_feed_events          read-only mirror of a Google ICS feed
tac_reflections                         tags as JSON, source typed | voice
tac_timesheet                           minutes derived from start/end, or entered
tac_class_notes                         the four-field post-class note
tac_settings                            contract band, start date, ICS token, timezone
```

All rows are scoped to `coach_id`. Athletes never see any of it.

---

## Seeded state

The seed is real state as of 16 September 2026, not demo filler: 12 KPIs, 15 open
to-dos drawn from the actual email threads, the standing week in the planner, three
week-one reflections (including the pull-up change), two class notes, and the timesheet
showing 4h 30m from the 14 September start.

---

## Open questions

These change the shape of the tool, so they are worth answering before the next build:

1. **Where does this run?** Tailscale, a hosted box, or Supabase. Decides whether the
   phone talks to this app or to the artifact.
2. **Timesheet start.** The 4h 30m so far is recorded as Monday 14 Sep 05:15–06:00 on
   the floor for the Conditioning launch, plus Tuesday 15 Sep 04:30–08:15 for Upper
   Body. If the real split is different, it is two edits on the Timesheet tab.
3. **Is 04:30–08:15 the standing Tuesday and Thursday block?** The planner assumes yes,
   as a weekly recurrence.
4. **Is the $50 rate per class or per hour?** Changes whether the timesheet needs an
   invoice view or just a total.
5. **Which Google calendar is the real one** for TAC work: `coachchrischan.com.au`,
   `c93chan@gmail.com`, or both.
6. **Programming hours.** The contract is 6 to 10 hours, roughly 3 of which are
   programming in the launch phase. Should the tool warn when programming time drops
   below that, or is it purely a record?
7. **Do other coaches get logins?** Post-class notes are much better submitted by Dana
   and Harry directly than relayed. That means athlete-role users with a coach flag, or
   a second coach role.
8. **Class times** for Conditioning, HYROX and Saturday Community Day, so the planner
   and the handbook stop saying TBC.

---

*Companion documents: `TAC-COACH-HANDBOOK.md`, `TAC-COACH-REPORTING.md`,
`TAC-GAME-DAY-LIBRARY.md`.*
