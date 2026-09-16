// Idempotent seed: runs on boot, does nothing if users already exist.
// Exercise library comes from the TrainHeroic cache used by the TAC tool
// (trainheroic-mcp/.exercise-cache.json). Read-only; we never call their API.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { db } from './db.mjs'
import { hashPassword } from './auth.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const CACHE = path.resolve(here, '..', '..', '..', 'trainheroic-mcp', '.exercise-cache.json')

export function seed() {
  const hasUsers = db.prepare('SELECT COUNT(*) AS n FROM users').get().n > 0
  if (!hasUsers) seedUsers()
  const hasExercises = db.prepare('SELECT COUNT(*) AS n FROM exercises').get().n > 0
  if (!hasExercises) seedExercises()
  const hasWorkouts = db.prepare('SELECT COUNT(*) AS n FROM workouts').get().n > 0
  if (!hasWorkouts) seedDemoWeek()
  const hasTac = db.prepare('SELECT COUNT(*) AS n FROM tac_kpis').get().n > 0
  if (!hasTac) seedTacOps()
}

function seedUsers() {
  const insUser = db.prepare('INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)')
  const coachId = insUser.run('coach@demo.local', hashPassword('coach1234'), 'Chris Chan', 'coach').lastInsertRowid

  const insAthlete = db.prepare('INSERT INTO athletes (user_id, coach_id, profile) VALUES (?, ?, ?)')
  const abbeyId = insUser.run('abbey@demo.local', hashPassword('athlete1234'), 'Abbey Carr', 'athlete').lastInsertRowid
  insAthlete.run(abbeyId, coachId, JSON.stringify({ level: 'intermediate', goals: ['strength', 'engine'] }))
  const jonoId = insUser.run('jono@demo.local', hashPassword('athlete1234'), 'Jono Angus', 'athlete').lastInsertRowid
  insAthlete.run(jonoId, coachId, JSON.stringify({ level: 'advanced', goals: ['pull-up strength'] }))
  const marieId = insUser.run('marie@demo.local', hashPassword('athlete1234'), 'Marie Solien', 'athlete').lastInsertRowid
  insAthlete.run(marieId, coachId, JSON.stringify({ level: 'beginner', goals: ['stay strong at home'] }))

  const teamId = db.prepare('INSERT INTO teams (coach_id, name, description) VALUES (?, ?, ?)')
    .run(coachId, 'Strength Class', 'Demo group programming team').lastInsertRowid
  const insMember = db.prepare('INSERT INTO team_members (team_id, athlete_user_id) VALUES (?, ?)')
  insMember.run(teamId, abbeyId)
  insMember.run(teamId, jonoId)

  console.log('[seed] users: coach@demo.local / coach1234, abbey|jono|marie@demo.local / athlete1234')
}

function seedExercises() {
  let list = []
  try {
    const raw = JSON.parse(fs.readFileSync(CACHE, 'utf8'))
    // Cache shape: either an array or { fetchedAt, exercises: [...] }
    const arr = Array.isArray(raw) ? raw : raw.exercises || raw.data || []
    list = arr.filter(e => (e.eType ?? 'e') === 'e' && e.title)
  } catch (err) {
    console.warn('[seed] exercise cache unavailable (' + err.message + '); seeding a minimal library')
  }
  const ins = db.prepare('INSERT INTO exercises (th_id, title, video_url, cues, tags, custom) VALUES (?, ?, ?, ?, ?, 0)')
  const seen = new Set()
  const tx = db.prepare('BEGIN'); const commit = db.prepare('COMMIT')
  tx.run()
  if (list.length) {
    for (const e of list) {
      const key = e.title.trim().toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      ins.run(e.id ?? null, e.title.trim(), e.video_url || '', e.points_of_performance || '', JSON.stringify(e.tags || []))
    }
  } else {
    for (const t of ['Back Squat', 'Front Squat', 'Deadlift', 'Bench Press', 'Strict Press', 'Pull Up', 'Push Up', 'Barbell Row', 'Romanian Deadlift', 'Goblet Squat', 'Plank', 'Sit To Stand'])
      ins.run(null, t, '', '', '[]')
  }
  commit.run()
  const n = db.prepare('SELECT COUNT(*) AS n FROM exercises').get().n
  console.log(`[seed] exercises: ${n}`)
}

function findExercise(title) {
  return db.prepare('SELECT id, title FROM exercises WHERE title = ? COLLATE NOCASE').get(title)
    || db.prepare("SELECT id, title FROM exercises WHERE title LIKE ? COLLATE NOCASE ORDER BY length(title) LIMIT 1").get(`%${title}%`)
}

function seedDemoWeek() {
  const coach = db.prepare("SELECT id FROM users WHERE role='coach' LIMIT 1").get()
  const abbey = db.prepare("SELECT id FROM users WHERE email='abbey@demo.local'").get()
  if (!coach || !abbey) return

  const squat = findExercise('Back Squat')
  const bench = findExercise('Bench Press')
  const row = findExercise('Barbell Row')
  const rdl = findExercise('Romanian Deadlift')

  // Working maxes so %1RM prescriptions resolve
  const insMax = db.prepare('INSERT INTO maxes (athlete_user_id, exercise_id, value_kg, source) VALUES (?, ?, ?, ?)')
  if (squat) insMax.run(abbey.id, squat.id, 110, 'tested')
  if (bench) insMax.run(abbey.id, bench.id, 62.5, 'tested')

  const monday = nextMonday()
  const mkDate = (offset) => shiftDate(monday, offset)

  const col = (type, values) => ({ type, values })
  const ex = (e, sets, columns, cue = '') => ({
    id: rid(), exerciseId: e?.id ?? null, name: e?.title ?? 'Unknown', cue, sets, columns,
  })

  const lower = {
    instructions: 'Week 1 of 4. Leave one rep in reserve on top sets.',
    blocks: [
      {
        id: rid(), title: 'A', kind: 'standard', instructions: '', exercises: [
          ex(squat, 4, [col('reps', [5, 5, 5, 5]), col('percent_1rm', [70, 75, 80, 80]), col('rpe', [7, 7.5, 8, 8]), col('rest_sec', [180, 180, 180, 180])], 'Brace hard, control the descent.'),
        ],
      },
      {
        id: rid(), title: 'B', kind: 'superset', instructions: 'B1 into B2, rest after the pair.', exercises: [
          ex(rdl, 3, [col('reps', [8, 8, 8]), col('load_kg', [60, 65, 65]), col('tempo', ['3-1-1', '3-1-1', '3-1-1'])], 'Push the hips back, bar close.'),
          ex(row, 3, [col('reps', [10, 10, 10]), col('load_kg', [40, 40, 42.5]), col('rir', [2, 2, 1])]),
        ],
      },
    ],
  }
  const upper = {
    instructions: '',
    blocks: [
      {
        id: rid(), title: 'A', kind: 'standard', instructions: '', exercises: [
          ex(bench, 5, [col('reps', [5, 5, 5, 3, 3]), col('percent_1rm', [65, 70, 75, 80, 82.5]), col('rest_sec', [150, 150, 180, 180, 180])], 'Feet planted, slight pause on the chest.'),
        ],
      },
    ],
  }

  const insW = db.prepare("INSERT INTO workouts (owner_type, owner_id, date, title, status, content) VALUES ('athlete', ?, ?, ?, ?, ?)")
  insW.run(abbey.id, mkDate(0), 'Lower Strength', 'published', JSON.stringify(lower))
  insW.run(abbey.id, mkDate(2), 'Upper Strength', 'published', JSON.stringify(upper))

  // Health tasks: the "more than exercise" layer
  const insT = db.prepare("INSERT INTO health_tasks (owner_type, owner_id, date, type, title, config, created_by) VALUES ('athlete', ?, ?, ?, ?, ?, ?)")
  for (let d = 0; d < 7; d++) {
    insT.run(abbey.id, mkDate(d), 'water', 'Drink 2L of water', JSON.stringify({ targetMl: 2000 }), coach.id)
    insT.run(abbey.id, mkDate(d), 'supplement', 'Take your supplements', JSON.stringify({ items: ['Creatine 5g', 'Vitamin D'] }), coach.id)
  }
  insT.run(abbey.id, mkDate(0), 'weight', 'Weekly weight check-in', JSON.stringify({ unit: 'kg' }), coach.id)
  insT.run(abbey.id, mkDate(0), 'readiness', 'Readiness check', JSON.stringify({}), coach.id)
  insT.run(abbey.id, mkDate(3), 'habit', '10 minute walk after dinner', JSON.stringify({ description: 'Easy pace. Consistency beats intensity.' }), coach.id)

  const formId = db.prepare('INSERT INTO checkin_forms (coach_id, title, questions) VALUES (?, ?, ?)').run(
    coach.id, 'Weekly check-in', JSON.stringify([
      { id: 'q1', type: 'scale', label: 'How was training this week?', min: 1, max: 5 },
      { id: 'q2', type: 'text', label: 'Any niggles or pain?' },
      { id: 'q3', type: 'choice', label: 'Nutrition this week was...', options: ['On track', 'Mostly on track', 'Off the rails'] },
    ])
  ).lastInsertRowid
  insT.run(abbey.id, mkDate(6), 'checkin_form', 'Weekly check-in', JSON.stringify({ formId }), coach.id)

  console.log('[seed] demo week programmed for Abbey starting ' + monday)
}

function rid() { return Math.random().toString(36).slice(2, 10) }
// Local-date formatting on purpose: toISOString() is UTC and shifts the day
// for anyone east of Greenwich (i.e. all of Australia).
function localIso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function nextMonday() {
  const d = new Date()
  const day = d.getDay()
  const diff = day === 1 ? 0 : (8 - day) % 7
  d.setDate(d.getDate() + diff)
  return localIso(d)
}
function shiftDate(iso, days) {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return localIso(d)
}

// ---- TAC Ops seed ----
// Real state, not demo filler: the KPI board from docs/TAC-COACH-REPORTING.md, the
// to-dos that are actually outstanding as of 16 Sep 2026, the timesheet from the
// contract start on Mon 14 Sep, and the week-one reflections. Everything here is
// editable in the UI; it exists so the tabs are useful on first open rather than empty.
function seedTacOps() {
  const coach = db.prepare("SELECT id FROM users WHERE role = 'coach' ORDER BY id LIMIT 1").get()
  if (!coach) return

  db.prepare(`INSERT OR IGNORE INTO tac_settings (coach_id, contract_min_hours, contract_max_hours, contract_start, ics_token, timezone)
    VALUES (?, 6, 10, '2026-09-14', ?, 'Australia/Brisbane')`)
    .run(coach.id, rid() + rid() + rid() + rid())

  const insKpi = db.prepare(`INSERT INTO tac_kpis (coach_id, name, area, unit, target, direction, cadence, notes, position)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
  const kpis = [
    ['Strength class attendance vs cap', 'classes', '%', 70, 'up', 'weekly', 'Cap is 20. Below 70% for two weeks running means the time slot is wrong, not the programming.'],
    ['Conditioning attendance vs cap', 'classes', '%', 70, 'up', 'weekly', 'Cap is 16 across Mon, Wed, Fri.'],
    ['Community Day attendance', 'classes', 'people', 16, 'up', 'weekly', 'The number that says whether the community product is working.'],
    ['Community Day repeat rate', 'classes', '%', 60, 'up', 'monthly', 'Came last Saturday and came again. Matters more than raw headcount.'],
    ['Booked but absent', 'classes', '%', 15, 'down', 'weekly', 'Booking discipline. Caps only protect people if no-shows stay low.'],
    ['TrainHeroic active users', 'trainheroic', 'users', 40, 'up', 'weekly', 'Trial ran to 26 Sep, then USD$20/month.'],
    ['TrainHeroic trial conversion', 'trainheroic', '%', 50, 'up', 'monthly', 'The number Johno will ask about first.'],
    ['Strength sessions published a week ahead', 'programming', '%', 100, 'up', 'weekly', 'Non-negotiable. Members were promised one week of visibility.'],
    ['Classes started on time', 'standards', '%', 100, 'up', 'weekly', 'The most visible standard in the building.'],
    ['Post-class notes submitted', 'standards', '%', 100, 'up', 'weekly', 'If this drops, the programming feedback loop is dead.'],
    ['Programming changes sourced from the floor', 'programming', 'count', 2, 'up', 'monthly', 'Zero in a month means coaches have stopped reporting, not that the program is perfect.'],
    ['Hours worked against contract', 'contract', 'hours', 8, 'up', 'weekly', 'Contracted 6 to 10. Sitting at the bottom of the band is as much a problem as sitting over it.'],
  ]
  const kpiIds = kpis.map((k, i) => insKpi.run(coach.id, k[0], k[1], k[2], k[3], k[4], k[5], k[6], i).lastInsertRowid)

  const insReading = db.prepare('INSERT INTO tac_kpi_readings (kpi_id, period, value, note) VALUES (?, ?, ?, ?)')
  insReading.run(kpiIds[11], '2026-W38', 4.5, 'Launch week. Mon floor time plus Tuesday Upper.')

  const insTodo = db.prepare(`INSERT INTO tac_todos (coach_id, title, detail, area, priority, owner, due, status, kpi_id, position)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
  const todos = [
    ['Send Alanah the Full Body Strength class description', 'She asked on 11 Sep for a description to load into GymMaster alongside the Upper and Lower ones. Still outstanding and the class is already bookable.', 'admin', 'now', 'Chris', '2026-09-17', 'open', null],
    ['Program the next three Community Days', 'Sat 19 Sep, 26 Sep, 3 Oct. Picks are in the Game Day library: GD-26 carousel, GD-35 sled heats, GD-50 championship.', 'programming', 'now', 'Chris', '2026-09-18', 'doing', 2],
    ['Call Dana about the Friday Conditioning session', 'She has questions on the ladder format and the holds. She offered Wednesday in person or a Thursday call.', 'coaching', 'now', 'Chris', '2026-09-17', 'open', null],
    ['Send Dana next week’s Conditioning programming by email', 'Johno asked for it by email again this week, then it moves to TrainHeroic once the conditioning side is loaded.', 'programming', 'now', 'Chris', '2026-09-18', 'open', null],
    ['Rebuild the pull-up progression', 'Weighted pull-ups were not achievable for enough of the room. Needs a real entry point and a ladder that everyone can start on.', 'programming', 'now', 'Chris', '2026-09-19', 'doing', 10],
    ['Confirm Conditioning, HYROX and Community Day class times', 'Needed to finish the coach handbook. Alanah or GymMaster will have them.', 'admin', 'now', 'Chris', '2026-09-18', 'open', null],
    ['Load the strength block into TrainHeroic a week ahead', 'Members were told sessions are visible one week in advance. This is a weekly recurring commitment, not a one-off.', 'trainheroic', 'normal', 'Chris', '2026-09-19', 'open', 7],
    ['Run each admin staff member through the TrainHeroic app', 'Katie done. Remaining front desk staff plus Dana.', 'trainheroic', 'normal', 'Chris', '2026-09-22', 'doing', 5],
    ['Record the block explainer video', 'Short video explaining the focus of the current block. Promised to members in the launch email.', 'content', 'normal', 'Chris', '2026-09-24', 'open', null],
    ['Agree the coach handbook with Johno', 'Sign off the class list, caps, standards and the escalation path, then run the new-coach morning off it.', 'standards', 'normal', 'Chris', '2026-09-26', 'open', null],
    ['Set the first monthly coach meeting', 'Johno: one hour, monthly, clear agenda, coaches paid the standard rate. Publish the agenda 48 hours out.', 'standards', 'normal', 'Chris', '2026-09-30', 'open', null],
    ['Start the post-class note habit with Dana and Harry', 'Four fields, 60 seconds, before they leave the building. It only works if it is easy.', 'standards', 'normal', 'Chris', '2026-09-29', 'open', 9],
    ['Clarify whether the $50 rate is per class or per hour', 'Affects how the timesheet maps to invoicing.', 'contract', 'normal', 'Chris', null, 'open', null],
    ['Plan the first community event off Community Day', 'The Saturday class is the engine for it. Once attendance holds, pick a date.', 'classes', 'later', 'Chris', null, 'open', 3],
    ['Six month strength plan: write blocks 3 and 4', 'Blocks 1 and 2 are done. Compound lifts hold through the phase, accessories rotate.', 'programming', 'later', 'Chris', '2026-10-15', 'open', null],
  ]
  todos.forEach((t, i) => insTodo.run(coach.id, t[0], t[1], t[2], t[3], t[4], t[5], t[6],
    t[7] == null ? null : kpiIds[t[7]], i))

  // Timesheet from the contract start. 4h30m logged so far: Monday floor time for the
  // Conditioning launch, plus the full Tuesday Upper Body block.
  const insTime = db.prepare(`INSERT INTO tac_timesheet (coach_id, date, start_time, end_time, minutes, category, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
  insTime.run(coach.id, '2026-09-14', '05:15', '06:00', 45, 'coaching', 'Monday Conditioning launch, on the floor with Dana for the first board')
  insTime.run(coach.id, '2026-09-15', '04:30', '08:15', 225, 'coaching', 'Tuesday Upper Body Strength: 5am, 6am and the new 7am, plus set-up and pack-down')

  // The standing week, published to Google through the ICS feed.
  const insPlan = db.prepare(`INSERT INTO tac_plan_items (coach_id, date, start_time, end_time, title, kind, location, notes, billable, rrule, uid)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
  const plans = [
    ['2026-09-15', '04:30', '08:15', 'Upper Body Strength (5, 6, 7am)', 'class', 'TAC strength floor', 'Set-up from 4:30, pack-down to 8:15.', 1, 'FREQ=WEEKLY;BYDAY=TU'],
    ['2026-09-17', '04:30', '08:15', 'Lower Body Strength (5, 6, 7am)', 'class', 'TAC strength floor', 'Set-up from 4:30, pack-down to 8:15.', 1, 'FREQ=WEEKLY;BYDAY=TH'],
    ['2026-09-19', '05:45', '08:00', 'Saturday: Full Body Strength + Community Day', 'class', 'Functional Training Zone / Group Fitness Room', 'Full Body 6am. Community Day time still to confirm.', 1, 'FREQ=WEEKLY;BYDAY=SA'],
    ['2026-09-16', '19:00', '20:30', 'Programming block: strength', 'programming', 'Home', 'Next week loaded to TrainHeroic a full week ahead.', 1, 'FREQ=WEEKLY;BYDAY=WE'],
    ['2026-09-18', '19:00', '20:00', 'Programming block: conditioning + Community Day', 'programming', 'Home', 'Conditioning board for Mon/Wed/Fri and the Saturday session.', 1, 'FREQ=WEEKLY;BYDAY=FR'],
    ['2026-09-17', '12:00', '12:30', 'Call Dana: Friday Conditioning questions', 'meeting', 'Phone', '', 1, ''],
    ['2026-09-30', '17:00', '18:00', 'Monthly coach meeting', 'meeting', 'TAC', 'One hour, agenda published 48 hours out. Coaches paid the standard rate.', 1, 'FREQ=MONTHLY'],
  ]
  for (const p of plans) insPlan.run(coach.id, p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7], p[8], rid() + rid())

  const insRef = db.prepare(`INSERT INTO tac_reflections (coach_id, date, title, body, tags, source, changed_something)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
  insRef.run(coach.id, '2026-09-16', 'Pull-ups were the wrong entry point',
    'The big one this week. The strength programming had weighted pull-ups as the prescription and nowhere near enough of the room can do a strict bodyweight pull-up, let alone a weighted one. Changing the progression so there is a real entry point and a ladder people can actually start on. This is the kind of thing that has to come back through the coaches rather than each of them quietly inventing their own patch on the floor.',
    JSON.stringify(['programming', 'strength', 'scaling']), 'typed', 1)
  insRef.run(coach.id, '2026-09-16', 'They prefer this style of training',
    'Consistent read across the week: people are enjoying this format more than what was running before. Dana said the Monday room freaked out a bit when they first saw the screens, then by the end it was lots of "oh that was really great" and "similar to what we normally do". Keep adding people and keep adding variety. The variety is doing the work, not the intensity.',
    JSON.stringify(['members', 'conditioning', 'feedback']), 'typed', 0)
  insRef.run(coach.id, '2026-09-16', 'Room is six of each, not eight',
    'Johno reset the Group Fitness Room. Six rowers, six skis, six bikes, six runners, two sled lanes. Eight rowers will not fit and eight bikes and skis are not gettable. Groups of six is now the standing unit and the room can push to 18. Every future session gets built on those numbers, including the Saturday library.',
    JSON.stringify(['room', 'programming', 'operations']), 'typed', 1)

  const insNote = db.prepare(`INSERT INTO tac_class_notes (coach_id, date, class_name, coach_name, booked, attended, did_not_work, people, lane_drift)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
  insNote.run(coach.id, '2026-09-14', 'Conditioning (Monday, mixed modal)', 'Dana', 14, 12,
    'Nothing structural. The screens were new so there was more hand-holding than usual at the top of the class.',
    'Whole room needed the board explained once. Second half ran itself.', 'build')
  insNote.run(coach.id, '2026-09-15', 'Upper Body Strength (6am)', 'Chris', 20, 18,
    'Weighted pull-ups. Not enough of the room has a strict bodyweight pull-up for the prescription to mean anything.',
    'Several members went to band-assisted on the spot.', 'base')

  console.log('[seed] TAC Ops: ' + kpis.length + ' KPIs, ' + todos.length + ' to-dos, timesheet from 2026-09-14')
}
