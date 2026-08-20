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
