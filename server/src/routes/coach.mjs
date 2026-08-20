import { Router } from 'express'
import { db, j } from '../db.mjs'
import { requireAuth, requireCoach, ownsAthlete } from '../auth.mjs'

const r = Router()

// ---- Athletes (roster) ----
r.get('/athletes', requireCoach, (req, res) => {
  const rows = db.prepare(`
    SELECT u.id, u.name, u.email, a.notes, a.profile,
      (SELECT COUNT(*) FROM results rs JOIN workouts w ON w.id = rs.workout_id
        WHERE rs.athlete_user_id = u.id AND rs.finished_at > datetime('now','-28 days')) AS recent_sessions,
      (SELECT MAX(finished_at) FROM results rs WHERE rs.athlete_user_id = u.id) AS last_active
    FROM athletes a JOIN users u ON u.id = a.user_id
    WHERE a.coach_id = ? ORDER BY u.name
  `).all(req.user.id)
  res.json(rows.map(x => j(x, 'profile')))
})

r.patch('/athletes/:id', requireCoach, (req, res) => {
  const id = Number(req.params.id)
  if (!ownsAthlete(req.user.id, id)) return res.status(404).json({ error: 'Athlete not found' })
  const { notes, profile } = req.body || {}
  if (notes !== undefined) db.prepare('UPDATE athletes SET notes = ? WHERE user_id = ?').run(String(notes), id)
  if (profile !== undefined) db.prepare('UPDATE athletes SET profile = ? WHERE user_id = ?').run(JSON.stringify(profile), id)
  res.json({ ok: true })
})

// ---- Working maxes ----
r.get('/athletes/:id/maxes', requireAuth, (req, res) => {
  const id = Number(req.params.id)
  const allowed = req.user.role === 'coach' ? ownsAthlete(req.user.id, id) : req.user.id === id
  if (!allowed) return res.status(404).json({ error: 'Not found' })
  const rows = db.prepare(`
    SELECT m.exercise_id, e.title, m.value_kg, m.source, m.recorded_at FROM maxes m
    JOIN exercises e ON e.id = m.exercise_id
    WHERE m.athlete_user_id = ?
      AND m.id IN (SELECT id FROM maxes m2 WHERE m2.athlete_user_id = m.athlete_user_id
                   AND m2.exercise_id = m.exercise_id ORDER BY m2.recorded_at DESC, m2.id DESC LIMIT 1)
    ORDER BY e.title
  `).all(id)
  res.json(rows)
})

r.put('/athletes/:id/maxes/:exerciseId', requireAuth, (req, res) => {
  const id = Number(req.params.id)
  const exerciseId = Number(req.params.exerciseId)
  const allowed = req.user.role === 'coach' ? ownsAthlete(req.user.id, id) : req.user.id === id
  if (!allowed) return res.status(404).json({ error: 'Not found' })
  const { valueKg, source } = req.body || {}
  const src = source === 'tested' ? 'tested' : 'manual'
  if (!(valueKg > 0)) return res.status(400).json({ error: 'valueKg must be positive' })
  db.prepare('INSERT INTO maxes (athlete_user_id, exercise_id, value_kg, source) VALUES (?, ?, ?, ?)')
    .run(id, exerciseId, Number(valueKg), src)
  res.json({ ok: true })
})

// ---- Teams ----
r.get('/teams', requireCoach, (req, res) => {
  const teams = db.prepare('SELECT * FROM teams WHERE coach_id = ? ORDER BY name').all(req.user.id)
  const members = db.prepare(`
    SELECT tm.team_id, u.id, u.name FROM team_members tm JOIN users u ON u.id = tm.athlete_user_id
    WHERE tm.team_id IN (SELECT id FROM teams WHERE coach_id = ?)
  `).all(req.user.id)
  res.json(teams.map(t => ({ ...t, members: members.filter(m => m.team_id === t.id).map(({ id, name }) => ({ id, name })) })))
})

r.post('/teams', requireCoach, (req, res) => {
  const { name, description } = req.body || {}
  if (!name) return res.status(400).json({ error: 'name required' })
  const id = db.prepare('INSERT INTO teams (coach_id, name, description) VALUES (?, ?, ?)')
    .run(req.user.id, String(name), String(description || '')).lastInsertRowid
  res.json({ id })
})

r.post('/teams/:id/members', requireCoach, (req, res) => {
  const teamId = Number(req.params.id)
  const team = db.prepare('SELECT * FROM teams WHERE id = ? AND coach_id = ?').get(teamId, req.user.id)
  if (!team) return res.status(404).json({ error: 'Team not found' })
  const athleteId = Number(req.body?.athleteId)
  if (!ownsAthlete(req.user.id, athleteId)) return res.status(400).json({ error: 'Not your athlete' })
  db.prepare('INSERT OR IGNORE INTO team_members (team_id, athlete_user_id) VALUES (?, ?)').run(teamId, athleteId)
  res.json({ ok: true })
})

r.delete('/teams/:id/members/:athleteId', requireCoach, (req, res) => {
  const team = db.prepare('SELECT * FROM teams WHERE id = ? AND coach_id = ?').get(Number(req.params.id), req.user.id)
  if (!team) return res.status(404).json({ error: 'Team not found' })
  db.prepare('DELETE FROM team_members WHERE team_id = ? AND athlete_user_id = ?').run(team.id, Number(req.params.athleteId))
  res.json({ ok: true })
})

// ---- Exercise library ----
r.get('/exercises', requireAuth, (req, res) => {
  const q = String(req.query.q || '').trim()
  const limit = Math.min(Number(req.query.limit) || 50, 200)
  let rows
  if (q) {
    rows = db.prepare(`
      SELECT id, title, video_url, cues, tags, custom FROM exercises
      WHERE title LIKE ? COLLATE NOCASE ORDER BY custom DESC, length(title) LIMIT ?
    `).all(`%${q}%`, limit)
  } else {
    rows = db.prepare('SELECT id, title, video_url, cues, tags, custom FROM exercises ORDER BY custom DESC, title LIMIT ?').all(limit)
  }
  res.json(rows.map(x => j(x, 'tags')))
})

r.post('/exercises', requireCoach, (req, res) => {
  const { title, videoUrl, cues, tags } = req.body || {}
  if (!title) return res.status(400).json({ error: 'title required' })
  const id = db.prepare('INSERT INTO exercises (title, video_url, cues, tags, custom, owner_coach_id) VALUES (?, ?, ?, ?, 1, ?)')
    .run(String(title).trim(), String(videoUrl || ''), String(cues || ''), JSON.stringify(tags || []), req.user.id).lastInsertRowid
  res.json({ id })
})

r.patch('/exercises/:id', requireCoach, (req, res) => {
  const row = db.prepare('SELECT * FROM exercises WHERE id = ? AND custom = 1 AND owner_coach_id = ?').get(Number(req.params.id), req.user.id)
  if (!row) return res.status(404).json({ error: 'Custom exercise not found' })
  const { title, videoUrl, cues, tags } = req.body || {}
  db.prepare('UPDATE exercises SET title = ?, video_url = ?, cues = ?, tags = ? WHERE id = ?').run(
    String(title ?? row.title), String(videoUrl ?? row.video_url), String(cues ?? row.cues),
    JSON.stringify(tags ?? JSON.parse(row.tags)), row.id)
  res.json({ ok: true })
})

// ---- Check-in forms ----
r.get('/forms', requireAuth, (req, res) => {
  const coachId = req.user.role === 'coach' ? req.user.id
    : db.prepare('SELECT coach_id FROM athletes WHERE user_id = ?').get(req.user.id)?.coach_id
  res.json(db.prepare('SELECT * FROM checkin_forms WHERE coach_id = ?').all(coachId || -1).map(x => j(x, 'questions')))
})

r.post('/forms', requireCoach, (req, res) => {
  const { title, questions } = req.body || {}
  if (!title) return res.status(400).json({ error: 'title required' })
  const id = db.prepare('INSERT INTO checkin_forms (coach_id, title, questions) VALUES (?, ?, ?)')
    .run(req.user.id, String(title), JSON.stringify(questions || [])).lastInsertRowid
  res.json({ id })
})

r.put('/forms/:id', requireCoach, (req, res) => {
  const row = db.prepare('SELECT * FROM checkin_forms WHERE id = ? AND coach_id = ?').get(Number(req.params.id), req.user.id)
  if (!row) return res.status(404).json({ error: 'Form not found' })
  const { title, questions } = req.body || {}
  db.prepare('UPDATE checkin_forms SET title = ?, questions = ? WHERE id = ?')
    .run(String(title ?? row.title), JSON.stringify(questions ?? JSON.parse(row.questions)), row.id)
  res.json({ ok: true })
})

// ---- Templates + Workout Builder import ----
r.get('/templates', requireCoach, (req, res) => {
  res.json(db.prepare('SELECT id, kind, name, created_at FROM templates WHERE coach_id = ? ORDER BY created_at DESC').all(req.user.id))
})
r.get('/templates/:id', requireCoach, (req, res) => {
  const row = db.prepare('SELECT * FROM templates WHERE id = ? AND coach_id = ?').get(Number(req.params.id), req.user.id)
  if (!row) return res.status(404).json({ error: 'Not found' })
  res.json(j(row, 'content'))
})
r.post('/templates', requireCoach, (req, res) => {
  const { kind, name, content } = req.body || {}
  if (!name || !['session', 'program'].includes(kind)) return res.status(400).json({ error: 'kind + name required' })
  const id = db.prepare('INSERT INTO templates (coach_id, kind, name, content) VALUES (?, ?, ?, ?)')
    .run(req.user.id, kind, String(name), JSON.stringify(content || {})).lastInsertRowid
  res.json({ id })
})
r.delete('/templates/:id', requireCoach, (req, res) => {
  db.prepare('DELETE FROM templates WHERE id = ? AND coach_id = ?').run(Number(req.params.id), req.user.id)
  res.json({ ok: true })
})

// ---- Workout Builder import ----
// Accepts the CrossFit Workout Builder's TrainHeroic-export JSON and writes the
// whole block onto an athlete's calendar as drafts. Exercise names resolve
// against the library by exact-then-fuzzy title match; misses import as
// name-only rows the coach can fix in the builder.
r.post('/import/workout-builder', requireCoach, (req, res) => {
  const { athleteId, program } = req.body || {}
  if (!ownsAthlete(req.user.id, Number(athleteId))) return res.status(400).json({ error: 'Not your athlete' })
  if (!Array.isArray(program?.sessions)) return res.status(400).json({ error: 'program.sessions missing' })

  const find = (title) => {
    const t = String(title || '').trim()
    if (!t) return null
    return db.prepare('SELECT id, video_url FROM exercises WHERE title = ? COLLATE NOCASE').get(t)
      || db.prepare('SELECT id, video_url FROM exercises WHERE title LIKE ? COLLATE NOCASE ORDER BY length(title) LIMIT 1').get(`%${t}%`)
  }

  const insW = db.prepare("INSERT INTO workouts (owner_type, owner_id, date, position, title, status, content) VALUES ('athlete', ?, ?, ?, ?, 'draft', ?)")
  let imported = 0, misses = []
  for (const s of program.sessions) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s.date))) continue
    const blocks = (s.blocks || []).map(b => ({
      id: Math.random().toString(36).slice(2, 10),
      title: String(b.title || ''),
      kind: 'standard',
      instructions: '',
      exercises: (b.exercises || []).map(e => {
        const hit = find(e.name)
        if (!hit) misses.push(e.name)
        const sets = Math.max(1, Math.min(10, Number(e.sets) || 1))
        const reps = Array.isArray(e.reps) ? e.reps : Array.from({ length: sets }, () => e.reps ?? null)
        const loads = Array.isArray(e.loadKg) ? e.loadKg : Array.from({ length: sets }, () => e.loadKg ?? null)
        const columns = []
        if (e.repUnit === 'min' || e.repUnit === 'seconds') {
          columns.push({ type: 'time', values: reps.map(v => v == null ? null : String(v)) })
        } else {
          columns.push({ type: 'reps', values: reps })
        }
        if (loads.some(v => v != null)) columns.push({ type: 'load_kg', values: loads })
        return {
          id: Math.random().toString(36).slice(2, 10),
          exerciseId: hit?.id ?? null,
          name: String(e.name || 'Unknown'),
          cue: String(e.cue || ''),
          videoUrl: hit?.video_url || undefined,
          sets,
          columns,
        }
      }),
    }))
    const position = db.prepare("SELECT COALESCE(MAX(position), -1) + 1 AS p FROM workouts WHERE owner_type = 'athlete' AND owner_id = ? AND date = ?")
      .get(Number(athleteId), String(s.date)).p
    insW.run(Number(athleteId), String(s.date), position, String(s.title || 'Session'),
      JSON.stringify({ instructions: '', blocks }))
    imported++
  }
  res.json({ imported, libraryMisses: [...new Set(misses)] })
})

// ---- Messages ----
// Who may a user exchange messages with:
//   coach   -> their own athletes, and their own teams
//   athlete -> their own coach, and teams they belong to
// Anything else is a 404, so ids cannot be probed.
function canMessageUser(user, otherId) {
  if (!otherId) return false
  if (user.role === 'coach') return ownsAthlete(user.id, otherId)
  const coach = db.prepare('SELECT coach_id FROM athletes WHERE user_id = ?').get(user.id)
  return coach?.coach_id === otherId
}

function canMessageTeam(user, teamId) {
  if (!teamId) return false
  if (user.role === 'coach') return !!db.prepare('SELECT 1 FROM teams WHERE id = ? AND coach_id = ?').get(teamId, user.id)
  return db.prepare('SELECT 1 FROM team_members WHERE team_id = ? AND athlete_user_id = ?').get(teamId, user.id) != null
}

r.get('/messages', requireAuth, (req, res) => {
  const withUser = Number(req.query.withUserId) || null
  const teamId = Number(req.query.teamId) || null
  if (teamId) {
    if (!canMessageTeam(req.user, teamId)) return res.status(404).json({ error: 'Not found' })
    return res.json(db.prepare(`
      SELECT m.*, u.name AS from_name FROM messages m JOIN users u ON u.id = m.from_user_id
      WHERE m.to_type = 'team' AND m.to_id = ? ORDER BY m.created_at LIMIT 500
    `).all(teamId))
  }
  if (withUser && !canMessageUser(req.user, withUser)) return res.status(404).json({ error: 'Not found' })
  if (withUser) {
    return res.json(db.prepare(`
      SELECT m.*, u.name AS from_name FROM messages m JOIN users u ON u.id = m.from_user_id
      WHERE m.to_type = 'user' AND ((m.from_user_id = ? AND m.to_id = ?) OR (m.from_user_id = ? AND m.to_id = ?))
      ORDER BY m.created_at LIMIT 500
    `).all(req.user.id, withUser, withUser, req.user.id))
  }
  // Conversation list
  res.json(db.prepare(`
    SELECT m.*, u.name AS from_name FROM messages m JOIN users u ON u.id = m.from_user_id
    WHERE (m.to_type = 'user' AND (m.to_id = ? OR m.from_user_id = ?)) ORDER BY m.created_at DESC LIMIT 100
  `).all(req.user.id, req.user.id))
})

r.post('/messages', requireAuth, (req, res) => {
  const { toType, toId, body } = req.body || {}
  if (!body || !['user', 'team'].includes(toType)) return res.status(400).json({ error: 'toType + body required' })
  const target = Number(toId)
  const allowed = toType === 'team' ? canMessageTeam(req.user, target) : canMessageUser(req.user, target)
  if (!allowed) return res.status(404).json({ error: 'Not found' })
  const id = db.prepare('INSERT INTO messages (from_user_id, to_type, to_id, body) VALUES (?, ?, ?, ?)')
    .run(req.user.id, toType, target, String(body)).lastInsertRowid
  res.json({ id })
})

export default r
