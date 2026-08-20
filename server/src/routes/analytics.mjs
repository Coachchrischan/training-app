// Coach analytics: compliance, tonnage, e1RM trend, readiness, leaderboard.
// All computed from results JSON at read time; volumes here are small.
import { Router } from 'express'
import { db, j } from '../db.mjs'
import { requireCoach, ownsAthlete } from '../auth.mjs'
import { e1rm, completedSets } from './athlete.mjs'

const r = Router()

function guardAthlete(req, res) {
  const id = Number(req.query.athleteId)
  if (!ownsAthlete(req.user.id, id)) { res.status(404).json({ error: 'Not found' }); return null }
  return id
}

// Sessions prescribed vs completed per ISO week
r.get('/compliance', requireCoach, (req, res) => {
  const athleteId = guardAthlete(req, res); if (!athleteId) return
  const from = String(req.query.from || isoShift(-56))
  const to = String(req.query.to || isoShift(0))
  const prescribed = db.prepare(`
    SELECT date FROM workouts WHERE owner_type = 'athlete' AND owner_id = ? AND status = 'published' AND date >= ? AND date <= ?
  `).all(athleteId, from, to)
  const done = db.prepare(`
    SELECT w.date FROM results rs JOIN workouts w ON w.id = rs.workout_id
    WHERE rs.athlete_user_id = ? AND w.date >= ? AND w.date <= ?
  `).all(athleteId, from, to)
  const weeks = {}
  for (const p of prescribed) { const k = weekKey(p.date); weeks[k] = weeks[k] || { prescribed: 0, completed: 0 }; weeks[k].prescribed++ }
  for (const d of done) { const k = weekKey(d.date); weeks[k] = weeks[k] || { prescribed: 0, completed: 0 }; weeks[k].completed++ }
  res.json(Object.entries(weeks).sort(([a], [b]) => a.localeCompare(b)).map(([week, v]) => ({ week, ...v })))
})

// Weekly tonnage (sum of reps x load across logged sets)
r.get('/tonnage', requireCoach, (req, res) => {
  const athleteId = guardAthlete(req, res); if (!athleteId) return
  const rows = db.prepare(`
    SELECT rs.content, w.date FROM results rs JOIN workouts w ON w.id = rs.workout_id
    WHERE rs.athlete_user_id = ? AND w.date >= ? ORDER BY w.date
  `).all(athleteId, String(req.query.from || isoShift(-84))).map(x => j(x, 'content'))
  const weeks = {}
  for (const row of rows) {
    const k = weekKey(row.date)
    let t = 0
    for (const ex of row.content?.exercises || [])
      for (const s of completedSets(ex.sets)) {
        const reps = Number(s?.actual?.reps), load = Number(s?.actual?.load_kg)
        if (reps > 0 && load > 0) t += reps * load
      }
    weeks[k] = (weeks[k] || 0) + t
  }
  res.json(Object.entries(weeks).sort(([a], [b]) => a.localeCompare(b)).map(([week, tonnage]) => ({ week, tonnage: Math.round(tonnage) })))
})

// Estimated 1RM trend for one exercise (best Epley per session)
r.get('/e1rm', requireCoach, (req, res) => {
  const athleteId = guardAthlete(req, res); if (!athleteId) return
  const exerciseId = Number(req.query.exerciseId)
  const rows = db.prepare(`
    SELECT rs.content, w.date FROM results rs JOIN workouts w ON w.id = rs.workout_id
    WHERE rs.athlete_user_id = ? ORDER BY w.date
  `).all(athleteId).map(x => j(x, 'content'))
  const out = []
  for (const row of rows) {
    let best = null
    for (const ex of row.content?.exercises || []) {
      if (Number(ex.exerciseId) !== exerciseId) continue
      for (const s of completedSets(ex.sets)) {
        const est = e1rm(Number(s?.actual?.load_kg), Number(s?.actual?.reps))
        if (est && (!best || est > best)) best = est
      }
    }
    if (best) out.push({ date: row.date, e1rm: Math.round(best * 10) / 10 })
  }
  res.json(out)
})

// Readiness + weight series proxy through metrics
r.get('/metric-series', requireCoach, (req, res) => {
  const athleteId = guardAthlete(req, res); if (!athleteId) return
  const metric = String(req.query.metric || 'readiness')
  res.json(db.prepare(`
    SELECT value, recorded_at FROM metrics WHERE athlete_user_id = ? AND metric = ? ORDER BY recorded_at LIMIT 500
  `).all(athleteId, metric))
})

// Team leaderboard for one exercise: best e1RM per athlete in a window
r.get('/leaderboard', requireCoach, (req, res) => {
  const teamId = Number(req.query.teamId)
  const team = db.prepare('SELECT * FROM teams WHERE id = ? AND coach_id = ?').get(teamId, req.user.id)
  if (!team) return res.status(404).json({ error: 'Team not found' })
  const exerciseId = Number(req.query.exerciseId)
  const members = db.prepare(`
    SELECT u.id, u.name FROM team_members tm JOIN users u ON u.id = tm.athlete_user_id WHERE tm.team_id = ?
  `).all(teamId)
  const out = []
  for (const m of members) {
    const rows = db.prepare(`
      SELECT rs.content FROM results rs JOIN workouts w ON w.id = rs.workout_id
      WHERE rs.athlete_user_id = ? AND w.date >= ?
    `).all(m.id, String(req.query.from || isoShift(-56))).map(x => j(x, 'content'))
    let best = null
    for (const row of rows)
      for (const ex of row.content?.exercises || []) {
        if (Number(ex.exerciseId) !== exerciseId) continue
        for (const s of completedSets(ex.sets)) {
          const est = e1rm(Number(s?.actual?.load_kg), Number(s?.actual?.reps))
          if (est && (!best || est > best)) best = est
        }
      }
    if (best) out.push({ athleteId: m.id, name: m.name, e1rm: Math.round(best * 10) / 10 })
  }
  out.sort((a, b) => b.e1rm - a.e1rm)
  res.json(out)
})

function isoShift(days) {
  const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10)
}
function weekKey(iso) {
  const d = new Date(iso + 'T00:00:00')
  const day = (d.getDay() + 6) % 7 // Monday = 0
  d.setDate(d.getDate() - day)
  return d.toISOString().slice(0, 10)
}

export default r
