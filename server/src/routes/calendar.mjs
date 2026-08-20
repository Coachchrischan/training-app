import { Router } from 'express'
import { db, j } from '../db.mjs'
import { requireAuth, requireCoach, ownsAthlete, athleteTeamIds } from '../auth.mjs'

const r = Router()

function canSeeOwner(user, ownerType, ownerId) {
  if (user.role === 'coach') {
    if (ownerType === 'athlete') return ownsAthlete(user.id, ownerId)
    return !!db.prepare('SELECT 1 FROM teams WHERE id = ? AND coach_id = ?').get(ownerId, user.id)
  }
  if (ownerType === 'athlete') return user.id === ownerId
  return athleteTeamIds(user.id).includes(ownerId)
}

// Calendar window: workouts + health tasks for one owner (athlete or team).
// Athletes only ever see published workouts; coaches see drafts too.
r.get('/calendar', requireAuth, (req, res) => {
  const ownerType = req.query.ownerType === 'team' ? 'team' : 'athlete'
  const ownerId = Number(req.query.ownerId)
  const from = String(req.query.from || '1970-01-01')
  const to = String(req.query.to || '2999-12-31')
  if (!canSeeOwner(req.user, ownerType, ownerId)) return res.status(404).json({ error: 'Not found' })

  const statusFilter = req.user.role === 'coach' ? '' : " AND status = 'published'"
  const workouts = db.prepare(`
    SELECT * FROM workouts WHERE owner_type = ? AND owner_id = ? AND date >= ? AND date <= ?${statusFilter}
    ORDER BY date, position
  `).all(ownerType, ownerId, from, to).map(x => j(x, 'content'))

  const tasks = db.prepare(`
    SELECT * FROM health_tasks WHERE owner_type = ? AND owner_id = ? AND date >= ? AND date <= ?
    ORDER BY date, id
  `).all(ownerType, ownerId, from, to).map(x => j(x, 'config'))

  // For an athlete, also merge in anything programmed for their teams.
  let teamWorkouts = [], teamTasks = []
  if (ownerType === 'athlete') {
    const teams = athleteTeamIds(ownerId)
    if (teams.length) {
      const ph = teams.map(() => '?').join(',')
      teamWorkouts = db.prepare(`
        SELECT * FROM workouts WHERE owner_type = 'team' AND owner_id IN (${ph}) AND date >= ? AND date <= ?${statusFilter}
        ORDER BY date, position
      `).all(...teams, from, to).map(x => j(x, 'content'))
      teamTasks = db.prepare(`
        SELECT * FROM health_tasks WHERE owner_type = 'team' AND owner_id IN (${ph}) AND date >= ? AND date <= ?
      `).all(...teams, from, to).map(x => j(x, 'config'))
    }
  }

  // Attach results + completions for the viewing window.
  // An athlete only ever sees their OWN results and completions: on a team workout the
  // rows carry session comments, weights and readiness scores, which are private to the
  // athlete and their coach. Only the owning coach sees everyone's.
  const mineOnly = req.user.role !== 'coach'
  const ids = [...workouts, ...teamWorkouts].map(w => w.id)
  let results = []
  if (ids.length) {
    const ph = ids.map(() => '?').join(',')
    results = mineOnly
      ? db.prepare(`SELECT * FROM results WHERE workout_id IN (${ph}) AND athlete_user_id = ?`).all(...ids, req.user.id).map(x => j(x, 'content'))
      : db.prepare(`SELECT * FROM results WHERE workout_id IN (${ph})`).all(...ids).map(x => j(x, 'content'))
  }
  const taskIds = [...tasks, ...teamTasks].map(t => t.id)
  let completions = []
  if (taskIds.length) {
    const ph = taskIds.map(() => '?').join(',')
    completions = mineOnly
      ? db.prepare(`SELECT * FROM task_completions WHERE task_id IN (${ph}) AND athlete_user_id = ?`).all(...taskIds, req.user.id).map(x => j(x, 'value'))
      : db.prepare(`SELECT * FROM task_completions WHERE task_id IN (${ph})`).all(...taskIds).map(x => j(x, 'value'))
  }

  res.json({ workouts: [...workouts, ...teamWorkouts], tasks: [...tasks, ...teamTasks], results, completions })
})

// ---- Workouts CRUD (coach) ----
r.post('/workouts', requireCoach, (req, res) => {
  const { ownerType, ownerId, date, title, content, status } = req.body || {}
  if (!canSeeOwner(req.user, ownerType, Number(ownerId))) return res.status(404).json({ error: 'Not found' })
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) return res.status(400).json({ error: 'date must be YYYY-MM-DD' })
  const position = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM workouts WHERE owner_type = ? AND owner_id = ? AND date = ?')
    .get(ownerType, Number(ownerId), date).p
  const id = db.prepare(`
    INSERT INTO workouts (owner_type, owner_id, date, position, title, status, content) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(ownerType, Number(ownerId), date, position, String(title || 'Session'),
    status === 'published' ? 'published' : 'draft',
    JSON.stringify(content || { instructions: '', blocks: [] })).lastInsertRowid
  res.json({ id })
})

function coachWorkout(req, res) {
  const w = db.prepare('SELECT * FROM workouts WHERE id = ?').get(Number(req.params.id))
  if (!w || !canSeeOwner(req.user, w.owner_type, w.owner_id)) { res.status(404).json({ error: 'Not found' }); return null }
  return w
}

r.get('/workouts/:id', requireAuth, (req, res) => {
  const w = db.prepare('SELECT * FROM workouts WHERE id = ?').get(Number(req.params.id))
  if (!w || !canSeeOwner(req.user, w.owner_type, w.owner_id)) return res.status(404).json({ error: 'Not found' })
  if (req.user.role !== 'coach' && w.status !== 'published') return res.status(404).json({ error: 'Not found' })
  res.json(j(w, 'content'))
})

r.put('/workouts/:id', requireCoach, (req, res) => {
  const w = coachWorkout(req, res); if (!w) return
  const { title, date, content, status, position } = req.body || {}
  db.prepare(`
    UPDATE workouts SET title = ?, date = ?, content = ?, status = ?, position = ?, updated_at = datetime('now') WHERE id = ?
  `).run(String(title ?? w.title), String(date ?? w.date),
    JSON.stringify(content ?? JSON.parse(w.content)),
    ['draft', 'published'].includes(status) ? status : w.status,
    Number.isInteger(position) ? position : w.position, w.id)
  res.json({ ok: true })
})

// Deleting a workout cascades to its results (db.mjs), so logged training would be
// destroyed silently. Refuse when results exist unless the caller explicitly forces it,
// and tell them how many athletes logged against it.
r.delete('/workouts/:id', requireCoach, (req, res) => {
  const w = coachWorkout(req, res); if (!w) return
  const logged = db.prepare('SELECT COUNT(*) AS n FROM results WHERE workout_id = ?').get(w.id).n
  const force = req.query.force === '1' || req.body?.force === true
  if (logged > 0 && !force) {
    return res.status(409).json({
      error: `${logged} logged ${logged === 1 ? 'result' : 'results'} would be deleted with this session`,
      loggedResults: logged,
    })
  }
  db.prepare('DELETE FROM workouts WHERE id = ?').run(w.id)
  res.json({ ok: true, deletedResults: logged })
})

// Copy a session to another day/owner (the TrainHeroic week-to-week pattern, minus the pain)
r.post('/workouts/:id/copy', requireCoach, (req, res) => {
  const w = coachWorkout(req, res); if (!w) return
  const { toDate, toOwnerType, toOwnerId, includeStatus } = req.body || {}
  const ownerType = toOwnerType || w.owner_type
  const ownerId = Number(toOwnerId ?? w.owner_id)
  if (!canSeeOwner(req.user, ownerType, ownerId)) return res.status(404).json({ error: 'Target not found' })
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(toDate))) return res.status(400).json({ error: 'toDate must be YYYY-MM-DD' })
  const position = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM workouts WHERE owner_type = ? AND owner_id = ? AND date = ?')
    .get(ownerType, ownerId, toDate).p
  const id = db.prepare(`
    INSERT INTO workouts (owner_type, owner_id, date, position, title, status, content) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(ownerType, ownerId, String(toDate), position, w.title,
    includeStatus ? w.status : 'draft', w.content).lastInsertRowid
  res.json({ id })
})

// ---- Health tasks ----
r.post('/tasks', requireCoach, (req, res) => {
  const { ownerType, ownerId, dates, type, title, config } = req.body || {}
  if (!canSeeOwner(req.user, ownerType, Number(ownerId))) return res.status(404).json({ error: 'Not found' })
  const list = Array.isArray(dates) ? dates : [dates]
  if (!list.length || !list.every(d => /^\d{4}-\d{2}-\d{2}$/.test(String(d)))) {
    return res.status(400).json({ error: 'dates must be YYYY-MM-DD' })
  }
  const ins = db.prepare('INSERT INTO health_tasks (owner_type, owner_id, date, type, title, config, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)')
  const ids = list.map(d => ins.run(ownerType, Number(ownerId), String(d), String(type), String(title), JSON.stringify(config || {}), req.user.id).lastInsertRowid)
  res.json({ ids })
})

r.delete('/tasks/:id', requireCoach, (req, res) => {
  const t = db.prepare('SELECT * FROM health_tasks WHERE id = ?').get(Number(req.params.id))
  if (!t || !canSeeOwner(req.user, t.owner_type, t.owner_id)) return res.status(404).json({ error: 'Not found' })
  db.prepare('DELETE FROM health_tasks WHERE id = ?').run(t.id)
  res.json({ ok: true })
})

export default r
