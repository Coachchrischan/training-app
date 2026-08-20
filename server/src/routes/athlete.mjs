// Athlete-side writes: logging results, completing health tasks, body metrics.
import { Router } from 'express'
import { db, j } from '../db.mjs'
import { requireAuth, ownsAthlete, athleteTeamIds } from '../auth.mjs'

const r = Router()

// Epley estimated 1RM; used for the auto working-max rule:
// auto-update until a max is tested/manual, then never auto-adjust again (TrainHeroic parity).
// Capped at 10 reps: Epley diverges badly on high-rep sets, so a set of 20 must never
// silently redefine an athlete's working max.
export const E1RM_REP_CAP = 10

export function e1rm(loadKg, reps) {
  if (!(loadKg > 0) || !(reps > 0) || reps > E1RM_REP_CAP) return null
  if (reps === 1) return loadKg
  return loadKg * (1 + reps / 30)
}

// Only sets the athlete actually ticked off count as performed work. The logging screen
// prefills every set from the prescription, so counting un-ticked rows would invent
// training that never happened (phantom maxes, inflated tonnage).
export function completedSets(sets) {
  return (sets || []).filter(s => s?.completed === true)
}

function maybeAutoMax(athleteId, exerciseId, sets) {
  if (!exerciseId) return
  const pinned = db.prepare(`
    SELECT 1 FROM maxes WHERE athlete_user_id = ? AND exercise_id = ? AND source IN ('tested','manual') LIMIT 1
  `).get(athleteId, exerciseId)
  if (pinned) return
  let best = null
  for (const s of completedSets(sets)) {
    const est = e1rm(Number(s?.actual?.load_kg), Number(s?.actual?.reps))
    if (est && (!best || est > best)) best = est
  }
  if (!best) return
  const current = db.prepare(`
    SELECT value_kg FROM maxes WHERE athlete_user_id = ? AND exercise_id = ? ORDER BY recorded_at DESC, id DESC LIMIT 1
  `).get(athleteId, exerciseId)
  const rounded = Math.round(best * 2) / 2
  if (!current || rounded > current.value_kg) {
    db.prepare("INSERT INTO maxes (athlete_user_id, exercise_id, value_kg, source) VALUES (?, ?, ?, 'auto')")
      .run(athleteId, exerciseId, rounded)
  }
}

function canLog(user, workout) {
  if (user.role === 'coach') {
    // Coaches can log on behalf of their athletes (TrainHeroic mobile parity)
    return workout.owner_type === 'athlete' ? ownsAthlete(user.id, workout.owner_id) : true
  }
  if (workout.owner_type === 'athlete') return workout.owner_id === user.id
  return athleteTeamIds(user.id).includes(workout.owner_id)
}

r.post('/results', requireAuth, (req, res) => {
  const { workoutId, athleteId, status, durationMin, sessionRpe, comment, content } = req.body || {}
  const w = db.prepare('SELECT * FROM workouts WHERE id = ?').get(Number(workoutId))
  if (!w) return res.status(404).json({ error: 'Workout not found' })
  const targetAthlete = req.user.role === 'coach' ? Number(athleteId) : req.user.id
  if (!canLog(req.user, w)) return res.status(403).json({ error: 'Not your session' })
  if (req.user.role === 'coach' && !ownsAthlete(req.user.id, targetAthlete)) return res.status(403).json({ error: 'Not your athlete' })

  db.prepare(`
    INSERT INTO results (workout_id, athlete_user_id, status, duration_min, session_rpe, comment, content)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (workout_id, athlete_user_id) DO UPDATE SET
      status = excluded.status, duration_min = excluded.duration_min, session_rpe = excluded.session_rpe,
      comment = excluded.comment, content = excluded.content, finished_at = datetime('now')
  `).run(w.id, targetAthlete, status === 'partial' ? 'partial' : 'completed',
    durationMin ?? null, sessionRpe ?? null, String(comment || ''), JSON.stringify(content || { exercises: [] }))

  for (const ex of content?.exercises || []) maybeAutoMax(targetAthlete, Number(ex.exerciseId), ex.sets)
  res.json({ ok: true })
})

r.get('/results', requireAuth, (req, res) => {
  const athleteId = req.user.role === 'coach' ? Number(req.query.athleteId) : req.user.id
  if (req.user.role === 'coach' && !ownsAthlete(req.user.id, athleteId)) return res.status(404).json({ error: 'Not found' })
  const from = String(req.query.from || '1970-01-01')
  const to = String(req.query.to || '2999-12-31')
  const rows = db.prepare(`
    SELECT rs.*, w.title AS workout_title, w.date AS workout_date FROM results rs
    JOIN workouts w ON w.id = rs.workout_id
    WHERE rs.athlete_user_id = ? AND w.date >= ? AND w.date <= ?
    ORDER BY w.date DESC, rs.finished_at DESC LIMIT 200
  `).all(athleteId, from, to)
  res.json(rows.map(x => j(x, 'content')))
})

// ---- Health task completion ----
r.post('/tasks/:id/complete', requireAuth, (req, res) => {
  const t = db.prepare('SELECT * FROM health_tasks WHERE id = ?').get(Number(req.params.id))
  if (!t) return res.status(404).json({ error: 'Task not found' })
  const athleteId = req.user.role === 'coach' ? Number(req.body?.athleteId) : req.user.id
  if (req.user.role === 'coach' && !ownsAthlete(req.user.id, athleteId)) return res.status(403).json({ error: 'Not your athlete' })
  if (req.user.role === 'athlete') {
    const mine = (t.owner_type === 'athlete' && t.owner_id === req.user.id)
      || (t.owner_type === 'team' && athleteTeamIds(req.user.id).includes(t.owner_id))
    if (!mine) return res.status(403).json({ error: 'Not your task' })
  }
  const value = req.body?.value || {}
  db.prepare(`
    INSERT INTO task_completions (task_id, athlete_user_id, value) VALUES (?, ?, ?)
    ON CONFLICT (task_id, athlete_user_id) DO UPDATE SET value = excluded.value, completed_at = datetime('now')
  `).run(t.id, athleteId, JSON.stringify(value))

  // Weight check-ins also land in the metrics series
  if (t.type === 'weight' && value.weight_kg > 0) {
    db.prepare("INSERT INTO metrics (athlete_user_id, metric, value) VALUES (?, 'weight_kg', ?)").run(athleteId, Number(value.weight_kg))
  }
  // Readiness surveys produce a 1-5 score (sleep/mood/energy/stress/soreness average)
  if (t.type === 'readiness') {
    const keys = ['sleep', 'mood', 'energy', 'stress', 'soreness']
    const vals = keys.map(k => Number(value[k])).filter(v => v >= 1 && v <= 5)
    if (vals.length === keys.length) {
      const score = vals.reduce((a, b) => a + b, 0) / vals.length
      db.prepare("INSERT INTO metrics (athlete_user_id, metric, value) VALUES (?, 'readiness', ?)").run(athleteId, Math.round(score * 10) / 10)
    }
  }
  res.json({ ok: true })
})

r.delete('/tasks/:id/complete', requireAuth, (req, res) => {
  const t = db.prepare('SELECT * FROM health_tasks WHERE id = ?').get(Number(req.params.id))
  if (!t) return res.status(404).json({ error: 'Task not found' })
  const athleteId = req.user.role === 'coach' ? Number(req.body?.athleteId) : req.user.id
  db.prepare('DELETE FROM task_completions WHERE task_id = ? AND athlete_user_id = ?').run(t.id, athleteId)
  res.json({ ok: true })
})

// ---- Metrics (body weight etc.) ----
r.get('/metrics', requireAuth, (req, res) => {
  const athleteId = req.user.role === 'coach' ? Number(req.query.athleteId) : req.user.id
  if (req.user.role === 'coach' && !ownsAthlete(req.user.id, athleteId)) return res.status(404).json({ error: 'Not found' })
  const metric = String(req.query.metric || 'weight_kg')
  res.json(db.prepare(`
    SELECT value, recorded_at FROM metrics WHERE athlete_user_id = ? AND metric = ? ORDER BY recorded_at LIMIT 500
  `).all(athleteId, metric))
})

r.post('/metrics', requireAuth, (req, res) => {
  const athleteId = req.user.role === 'coach' ? Number(req.body?.athleteId) : req.user.id
  if (req.user.role === 'coach' && !ownsAthlete(req.user.id, athleteId)) return res.status(404).json({ error: 'Not found' })
  const { metric, value } = req.body || {}
  if (!metric || !Number.isFinite(Number(value))) return res.status(400).json({ error: 'metric + numeric value required' })
  db.prepare('INSERT INTO metrics (athlete_user_id, metric, value) VALUES (?, ?, ?)').run(athleteId, String(metric), Number(value))
  res.json({ ok: true })
})

export default r
