# How to log in

## 1. Start it

Open the **Launchpad** (localhost:7777) and click the **Training App** tile.
Give it about 15 seconds the first time, it starts two servers (the app and its API).

If you would rather not use the Launchpad, double-click nothing: open a terminal in
`C:\Users\User\Cowork\Training-App` and run `node launch.mjs`.

Then go to **http://localhost:8128**

## 2. Log in

**As the coach (you):**

| | |
|---|---|
| Email | `coach@demo.local` |
| Password | `coach1234` |

This is the coach console: dashboard, athletes, calendar, session builder, library,
teams, analytics, messages, settings.

**As an athlete (to see the other side):**

| Who | Email | Password |
|---|---|---|
| Abbey Carr (has a programmed week + health tasks + one logged session) | `abbey@demo.local` | `athlete1234` |
| Jono Angus | `jono@demo.local` | `athlete1234` |
| Marie Solien | `marie@demo.local` | `athlete1234` |

Abbey is the one to look at. She has the demo programming.

Tip: log in as the coach in your normal window, and as Abbey in a **private/incognito
window**, so you can see both sides at once without signing out.

## 3. Worth clicking, in this order

1. **Calendar** (coach) → click **Lower Strength** on the Monday.
   This is the session builder. Look at the Back Squat table: it has **Reps, % of 1RM,
   RPE and Rest all at once**, and the %1RM column shows the resolved kg beside it
   (77.5 kg, 82.5 kg...) worked out from Abbey's 110 kg squat max. TrainHeroic caps you
   at two of those columns. Use the **+ column** dropdown to add more.
2. Same calendar, look at the little rows under the sessions: **water, supplements,
   weight check-in, readiness**. Those are the health tasks. Hover a day and use
   **+task** to add one.
3. **Athletes → Abbey Carr**: working maxes (note "tested" vs "auto" badges), private
   notes, bodyweight trend.
4. Now the athlete side (Abbey): **Today** shows her session and her health tasks in one
   stack. Tap **Start session** to see the logging flow, rest timer and finish summary.
5. **Settings → Brand**: switch between Coach Chris Chan, Antenna Reef and BlueZone to
   see the same app re-skinned. BlueZone says "clients" instead of "athletes" and hides
   leaderboards.

## 4. Reset it

Everything lives in `server/data/app.db`. Delete that file and restart to get clean
demo data back. Nothing here touches TrainHeroic.
