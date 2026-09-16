// TAC Ops: the coach-lead console. KPIs, to-dos, the planner (with Google Calendar
// in and out), reflections, the timesheet against the 6-10 hour contract, class
// notes, and the Game Day library.
//
// Google Calendar sync deliberately avoids OAuth:
//   out  -> this server publishes /api/tac/calendar/<token>.ics, which Google
//           subscribes to ("Other calendars -> From URL"). Planner items appear
//           in Google, on the phone, automatically.
//   in   -> Chris pastes a Google calendar's secret ICS address in as a feed and
//           the server mirrors it read-only, so the planner shows what is already
//           booked without ever writing back into Google.
// That keeps one source of truth per direction and needs no token refresh dance.
import { Router } from 'express'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { db, j } from '../db.mjs'
import { requireCoach } from '../auth.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const r = Router()

const GAMEDAY = JSON.parse(fs.readFileSync(path.join(here, '..', 'data', 'tac-gameday.json'), 'utf8'))

const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v))
const isTime = v => v == null || v === '' || /^\d{2}:\d{2}$/.test(String(v))
const str = (v, fallback = '') => (v == null ? fallback : String(v))

function settings(coachId) {
  let row = db.prepare('SELECT * FROM tac_settings WHERE coach_id = ?').get(coachId)
  if (!row) {
    db.prepare('INSERT INTO tac_settings (coach_id, ics_token) VALUES (?, ?)')
      .run(coachId, crypto.randomBytes(18).toString('hex'))
    row = db.prepare('SELECT * FROM tac_settings WHERE coach_id = ?').get(coachId)
  }
  return row
}

// Minutes between two HH:MM values, tolerating a block that runs past midnight.
function span(start, end) {
  if (!start || !end) return 0
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const mins = (eh * 60 + em) - (sh * 60 + sm)
  return mins < 0 ? mins + 1440 : mins
}

// ---------------------------------------------------------------- game day ----

r.get('/tac/gameday', requireCoach, (_req, res) => res.json(GAMEDAY))

// --------------------------------------------------------------- settings ----

r.get('/tac/settings', requireCoach, (req, res) => {
  const s = settings(req.user.id)
  res.json({ ...s, icsPath: `/api/tac/calendar/${s.ics_token}.ics` })
})

r.put('/tac/settings', requireCoach, (req, res) => {
  const s = settings(req.user.id)
  const { contractMinHours, contractMaxHours, contractStart, timezone } = req.body || {}
  if (contractStart != null && !isDate(contractStart)) return res.status(400).json({ error: 'contractStart must be YYYY-MM-DD' })
  db.prepare(`
    UPDATE tac_settings SET contract_min_hours = ?, contract_max_hours = ?, contract_start = ?, timezone = ?
    WHERE coach_id = ?
  `).run(
    Number(contractMinHours ?? s.contract_min_hours),
    Number(contractMaxHours ?? s.contract_max_hours),
    str(contractStart, s.contract_start),
    str(timezone, s.timezone),
    req.user.id,
  )
  res.json({ ok: true })
})

// Rotating the token immediately breaks any calendar already subscribed to the old
// URL. That is the point (it is how you revoke a leaked feed), so say so loudly.
r.post('/tac/settings/rotate-ics', requireCoach, (req, res) => {
  settings(req.user.id)
  const token = crypto.randomBytes(18).toString('hex')
  db.prepare('UPDATE tac_settings SET ics_token = ? WHERE coach_id = ?').run(token, req.user.id)
  res.json({ icsPath: `/api/tac/calendar/${token}.ics`, warning: 'Any calendar subscribed to the previous URL will stop updating.' })
})

// ------------------------------------------------------------------- KPIs ----

r.get('/tac/kpis', requireCoach, (req, res) => {
  const rows = db.prepare('SELECT * FROM tac_kpis WHERE coach_id = ? AND archived = 0 ORDER BY position, id').all(req.user.id)
  const readings = db.prepare(`
    SELECT rd.* FROM tac_kpi_readings rd JOIN tac_kpis k ON k.id = rd.kpi_id
    WHERE k.coach_id = ? ORDER BY rd.period
  `).all(req.user.id)
  res.json(rows.map(k => ({ ...k, readings: readings.filter(x => x.kpi_id === k.id) })))
})

r.post('/tac/kpis', requireCoach, (req, res) => {
  const { name, area, unit, target, direction, cadence, notes } = req.body || {}
  if (!str(name).trim()) return res.status(400).json({ error: 'name is required' })
  const position = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM tac_kpis WHERE coach_id = ?').get(req.user.id).p
  const id = db.prepare(`
    INSERT INTO tac_kpis (coach_id, name, area, unit, target, direction, cadence, notes, position)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.user.id, str(name).trim(), str(area, 'general'), str(unit), target == null ? null : Number(target),
    direction === 'down' ? 'down' : 'up',
    ['weekly', 'monthly', 'quarterly'].includes(cadence) ? cadence : 'monthly',
    str(notes), position).lastInsertRowid
  res.json({ id })
})

function ownKpi(req, res) {
  const k = db.prepare('SELECT * FROM tac_kpis WHERE id = ? AND coach_id = ?').get(Number(req.params.id), req.user.id)
  if (!k) { res.status(404).json({ error: 'Not found' }); return null }
  return k
}

r.put('/tac/kpis/:id', requireCoach, (req, res) => {
  const k = ownKpi(req, res); if (!k) return
  const { name, area, unit, target, direction, cadence, notes, archived } = req.body || {}
  db.prepare(`
    UPDATE tac_kpis SET name = ?, area = ?, unit = ?, target = ?, direction = ?, cadence = ?, notes = ?, archived = ?
    WHERE id = ?
  `).run(str(name, k.name), str(area, k.area), str(unit, k.unit),
    target === undefined ? k.target : (target == null ? null : Number(target)),
    direction === undefined ? k.direction : (direction === 'down' ? 'down' : 'up'),
    ['weekly', 'monthly', 'quarterly'].includes(cadence) ? cadence : k.cadence,
    str(notes, k.notes), archived ? 1 : 0, k.id)
  res.json({ ok: true })
})

r.delete('/tac/kpis/:id', requireCoach, (req, res) => {
  const k = ownKpi(req, res); if (!k) return
  db.prepare('DELETE FROM tac_kpis WHERE id = ?').run(k.id)
  res.json({ ok: true })
})

// One reading per period. Re-posting the same period overwrites it, so fixing a
// typo does not leave two competing numbers on the board.
r.post('/tac/kpis/:id/readings', requireCoach, (req, res) => {
  const k = ownKpi(req, res); if (!k) return
  const { period, value, note } = req.body || {}
  if (!str(period).trim()) return res.status(400).json({ error: 'period is required, e.g. 2026-09 or 2026-W38' })
  if (value == null || Number.isNaN(Number(value))) return res.status(400).json({ error: 'value must be a number' })
  db.prepare(`
    INSERT INTO tac_kpi_readings (kpi_id, period, value, note) VALUES (?, ?, ?, ?)
    ON CONFLICT (kpi_id, period) DO UPDATE SET value = excluded.value, note = excluded.note, recorded_at = datetime('now')
  `).run(k.id, str(period).trim(), Number(value), str(note))
  res.json({ ok: true })
})

// ----------------------------------------------------------------- to-dos ----

r.get('/tac/todos', requireCoach, (req, res) => {
  const includeDone = req.query.includeDone === '1'
  const rows = db.prepare(`
    SELECT * FROM tac_todos WHERE coach_id = ?${includeDone ? '' : " AND status != 'done'"}
    ORDER BY CASE priority WHEN 'now' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,
             CASE WHEN due IS NULL OR due = '' THEN 1 ELSE 0 END, due, position, id
  `).all(req.user.id)
  res.json(rows)
})

r.post('/tac/todos', requireCoach, (req, res) => {
  const { title, detail, area, priority, owner, due, kpiId } = req.body || {}
  if (!str(title).trim()) return res.status(400).json({ error: 'title is required' })
  if (due && !isDate(due)) return res.status(400).json({ error: 'due must be YYYY-MM-DD' })
  const position = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM tac_todos WHERE coach_id = ?').get(req.user.id).p
  const id = db.prepare(`
    INSERT INTO tac_todos (coach_id, title, detail, area, priority, owner, due, kpi_id, position)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.user.id, str(title).trim(), str(detail), str(area, 'general'),
    ['now', 'normal', 'later'].includes(priority) ? priority : 'normal',
    str(owner, 'Chris'), due || null, kpiId ? Number(kpiId) : null, position).lastInsertRowid
  res.json({ id })
})

r.patch('/tac/todos/:id', requireCoach, (req, res) => {
  const t = db.prepare('SELECT * FROM tac_todos WHERE id = ? AND coach_id = ?').get(Number(req.params.id), req.user.id)
  if (!t) return res.status(404).json({ error: 'Not found' })
  const b = req.body || {}
  if (b.due && !isDate(b.due)) return res.status(400).json({ error: 'due must be YYYY-MM-DD' })
  const status = ['open', 'doing', 'blocked', 'done'].includes(b.status) ? b.status : t.status
  db.prepare(`
    UPDATE tac_todos SET title = ?, detail = ?, area = ?, priority = ?, owner = ?, due = ?, status = ?, kpi_id = ?,
      done_at = CASE WHEN ? = 'done' AND done_at IS NULL THEN datetime('now') WHEN ? != 'done' THEN NULL ELSE done_at END
    WHERE id = ?
  `).run(str(b.title, t.title), str(b.detail, t.detail), str(b.area, t.area),
    ['now', 'normal', 'later'].includes(b.priority) ? b.priority : t.priority,
    str(b.owner, t.owner), b.due === undefined ? t.due : (b.due || null), status,
    b.kpiId === undefined ? t.kpi_id : (b.kpiId ? Number(b.kpiId) : null),
    status, status, t.id)
  res.json({ ok: true })
})

r.delete('/tac/todos/:id', requireCoach, (req, res) => {
  const t = db.prepare('SELECT * FROM tac_todos WHERE id = ? AND coach_id = ?').get(Number(req.params.id), req.user.id)
  if (!t) return res.status(404).json({ error: 'Not found' })
  db.prepare('DELETE FROM tac_todos WHERE id = ?').run(t.id)
  res.json({ ok: true })
})

// ---------------------------------------------------------------- planner ----

r.get('/tac/plan', requireCoach, (req, res) => {
  const from = str(req.query.from, '1970-01-01')
  const to = str(req.query.to, '2999-12-31')
  // A recurring block is stored once, on its first date. Expand it across the
  // window so the week and month views show every occurrence, and tag the copies
  // so the UI knows an edit hits the whole series.
  const items = db.prepare(`
    SELECT * FROM tac_plan_items WHERE coach_id = ? AND date <= ?
    ORDER BY date, COALESCE(start_time, '99:99'), id
  `).all(req.user.id, to).flatMap(it => {
    if (!it.rrule) return it.date >= from ? [{ ...it, occurrence: it.date }] : []
    return occurrences(it.date, it.rrule, from, to).map(d => ({ ...it, date: d, occurrence: d, recurring: 1 }))
  }).sort((a, b) => a.date.localeCompare(b.date) || String(a.start_time || '99:99').localeCompare(String(b.start_time || '99:99')))
  const external = db.prepare(`
    SELECT e.*, f.name AS feed_name, f.colour AS feed_colour FROM tac_feed_events e
    JOIN tac_feeds f ON f.id = e.feed_id
    WHERE e.coach_id = ? AND e.date >= ? AND e.date <= ?
    ORDER BY e.date, COALESCE(e.start_time, '99:99'), e.id
  `).all(req.user.id, from, to)
  res.json({ items, external })
})

r.post('/tac/plan', requireCoach, (req, res) => {
  const { date, startTime, endTime, title, kind, location, notes, todoId, billable, rrule } = req.body || {}
  if (!isDate(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' })
  if (!isTime(startTime) || !isTime(endTime)) return res.status(400).json({ error: 'times must be HH:MM' })
  if (!str(title).trim()) return res.status(400).json({ error: 'title is required' })
  const id = db.prepare(`
    INSERT INTO tac_plan_items (coach_id, date, start_time, end_time, title, kind, location, notes, todo_id, billable, rrule, uid)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.user.id, date, startTime || null, endTime || null, str(title).trim(),
    ['class', 'programming', 'admin', 'meeting', 'content', 'block'].includes(kind) ? kind : 'block',
    str(location), str(notes), todoId ? Number(todoId) : null, billable === false ? 0 : 1, str(rrule),
    crypto.randomUUID()).lastInsertRowid
  res.json({ id })
})

r.put('/tac/plan/:id', requireCoach, (req, res) => {
  const p = db.prepare('SELECT * FROM tac_plan_items WHERE id = ? AND coach_id = ?').get(Number(req.params.id), req.user.id)
  if (!p) return res.status(404).json({ error: 'Not found' })
  const b = req.body || {}
  if (b.date != null && !isDate(b.date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' })
  if (!isTime(b.startTime) || !isTime(b.endTime)) return res.status(400).json({ error: 'times must be HH:MM' })
  db.prepare(`
    UPDATE tac_plan_items SET date = ?, start_time = ?, end_time = ?, title = ?, kind = ?, location = ?, notes = ?,
      todo_id = ?, billable = ?, rrule = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(str(b.date, p.date), b.startTime === undefined ? p.start_time : (b.startTime || null),
    b.endTime === undefined ? p.end_time : (b.endTime || null), str(b.title, p.title),
    ['class', 'programming', 'admin', 'meeting', 'content', 'block'].includes(b.kind) ? b.kind : p.kind,
    str(b.location, p.location), str(b.notes, p.notes),
    b.todoId === undefined ? p.todo_id : (b.todoId ? Number(b.todoId) : null),
    b.billable === undefined ? p.billable : (b.billable ? 1 : 0), str(b.rrule, p.rrule), p.id)
  res.json({ ok: true })
})

r.delete('/tac/plan/:id', requireCoach, (req, res) => {
  const p = db.prepare('SELECT * FROM tac_plan_items WHERE id = ? AND coach_id = ?').get(Number(req.params.id), req.user.id)
  if (!p) return res.status(404).json({ error: 'Not found' })
  db.prepare('DELETE FROM tac_plan_items WHERE id = ?').run(p.id)
  res.json({ ok: true })
})

// A planned block that actually happened becomes a timesheet line. Keeps the two
// tabs honest with each other instead of Chris typing the same block twice.
r.post('/tac/plan/:id/log', requireCoach, (req, res) => {
  const p = db.prepare('SELECT * FROM tac_plan_items WHERE id = ? AND coach_id = ?').get(Number(req.params.id), req.user.id)
  if (!p) return res.status(404).json({ error: 'Not found' })
  if (!p.start_time || !p.end_time) return res.status(400).json({ error: 'Add a start and end time to the block before logging it' })
  const category = { class: 'coaching', programming: 'programming', admin: 'admin', meeting: 'meeting', content: 'content', block: 'admin' }[p.kind]
  const existing = db.prepare('SELECT id FROM tac_timesheet WHERE coach_id = ? AND date = ? AND start_time = ? AND end_time = ?')
    .get(req.user.id, p.date, p.start_time, p.end_time)
  if (existing) return res.status(409).json({ error: 'That block is already on the timesheet', id: existing.id })
  const id = db.prepare(`
    INSERT INTO tac_timesheet (coach_id, date, start_time, end_time, minutes, category, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(req.user.id, p.date, p.start_time, p.end_time, span(p.start_time, p.end_time), category, p.title).lastInsertRowid
  res.json({ id })
})

// ------------------------------------------------------------ reflections ----

r.get('/tac/reflections', requireCoach, (req, res) => {
  const from = str(req.query.from, '1970-01-01')
  const to = str(req.query.to, '2999-12-31')
  const rows = db.prepare(`
    SELECT * FROM tac_reflections WHERE coach_id = ? AND date >= ? AND date <= ?
    ORDER BY date DESC, id DESC
  `).all(req.user.id, from, to)
  res.json(rows.map(x => j(x, 'tags')))
})

r.post('/tac/reflections', requireCoach, (req, res) => {
  const { date, title, body, tags, source, changedSomething } = req.body || {}
  if (!isDate(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' })
  if (!str(body).trim()) return res.status(400).json({ error: 'body is required' })
  const id = db.prepare(`
    INSERT INTO tac_reflections (coach_id, date, title, body, tags, source, changed_something)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(req.user.id, date, str(title), str(body).trim(),
    JSON.stringify(Array.isArray(tags) ? tags.map(String) : []),
    source === 'voice' ? 'voice' : 'typed', changedSomething ? 1 : 0).lastInsertRowid
  res.json({ id })
})

r.patch('/tac/reflections/:id', requireCoach, (req, res) => {
  const x = db.prepare('SELECT * FROM tac_reflections WHERE id = ? AND coach_id = ?').get(Number(req.params.id), req.user.id)
  if (!x) return res.status(404).json({ error: 'Not found' })
  const b = req.body || {}
  db.prepare('UPDATE tac_reflections SET title = ?, body = ?, tags = ?, changed_something = ? WHERE id = ?')
    .run(str(b.title, x.title), str(b.body, x.body),
      b.tags === undefined ? x.tags : JSON.stringify(Array.isArray(b.tags) ? b.tags.map(String) : []),
      b.changedSomething === undefined ? x.changed_something : (b.changedSomething ? 1 : 0), x.id)
  res.json({ ok: true })
})

r.delete('/tac/reflections/:id', requireCoach, (req, res) => {
  const x = db.prepare('SELECT * FROM tac_reflections WHERE id = ? AND coach_id = ?').get(Number(req.params.id), req.user.id)
  if (!x) return res.status(404).json({ error: 'Not found' })
  db.prepare('DELETE FROM tac_reflections WHERE id = ?').run(x.id)
  res.json({ ok: true })
})

// -------------------------------------------------------------- timesheet ----

r.get('/tac/timesheet', requireCoach, (req, res) => {
  const s = settings(req.user.id)
  const from = str(req.query.from, s.contract_start)
  const to = str(req.query.to, '2999-12-31')
  const entries = db.prepare(`
    SELECT * FROM tac_timesheet WHERE coach_id = ? AND date >= ? AND date <= ?
    ORDER BY date, COALESCE(start_time, '99:99'), id
  `).all(req.user.id, from, to)
  res.json({
    entries,
    contract: {
      minHours: s.contract_min_hours,
      maxHours: s.contract_max_hours,
      start: s.contract_start,
    },
  })
})

r.post('/tac/timesheet', requireCoach, (req, res) => {
  const { date, startTime, endTime, minutes, category, notes } = req.body || {}
  if (!isDate(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' })
  if (!isTime(startTime) || !isTime(endTime)) return res.status(400).json({ error: 'times must be HH:MM' })
  const mins = minutes != null && !Number.isNaN(Number(minutes)) ? Math.round(Number(minutes)) : span(startTime, endTime)
  if (mins <= 0) return res.status(400).json({ error: 'Give a start and end time, or a number of minutes' })
  const id = db.prepare(`
    INSERT INTO tac_timesheet (coach_id, date, start_time, end_time, minutes, category, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(req.user.id, date, startTime || null, endTime || null, mins,
    ['coaching', 'programming', 'admin', 'meeting', 'content', 'setup', 'travel'].includes(category) ? category : 'coaching',
    str(notes)).lastInsertRowid
  res.json({ id, minutes: mins })
})

r.patch('/tac/timesheet/:id', requireCoach, (req, res) => {
  const t = db.prepare('SELECT * FROM tac_timesheet WHERE id = ? AND coach_id = ?').get(Number(req.params.id), req.user.id)
  if (!t) return res.status(404).json({ error: 'Not found' })
  const b = req.body || {}
  if (b.date != null && !isDate(b.date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' })
  if (!isTime(b.startTime) || !isTime(b.endTime)) return res.status(400).json({ error: 'times must be HH:MM' })
  const startTime = b.startTime === undefined ? t.start_time : (b.startTime || null)
  const endTime = b.endTime === undefined ? t.end_time : (b.endTime || null)
  const mins = b.minutes != null && !Number.isNaN(Number(b.minutes))
    ? Math.round(Number(b.minutes))
    : (startTime && endTime ? span(startTime, endTime) : t.minutes)
  db.prepare(`
    UPDATE tac_timesheet SET date = ?, start_time = ?, end_time = ?, minutes = ?, category = ?, notes = ?, invoiced = ?
    WHERE id = ?
  `).run(str(b.date, t.date), startTime, endTime, mins,
    ['coaching', 'programming', 'admin', 'meeting', 'content', 'setup', 'travel'].includes(b.category) ? b.category : t.category,
    str(b.notes, t.notes), b.invoiced === undefined ? t.invoiced : (b.invoiced ? 1 : 0), t.id)
  res.json({ ok: true, minutes: mins })
})

r.delete('/tac/timesheet/:id', requireCoach, (req, res) => {
  const t = db.prepare('SELECT * FROM tac_timesheet WHERE id = ? AND coach_id = ?').get(Number(req.params.id), req.user.id)
  if (!t) return res.status(404).json({ error: 'Not found' })
  db.prepare('DELETE FROM tac_timesheet WHERE id = ?').run(t.id)
  res.json({ ok: true })
})

// ------------------------------------------------------------ class notes ----

r.get('/tac/class-notes', requireCoach, (req, res) => {
  const from = str(req.query.from, '1970-01-01')
  const to = str(req.query.to, '2999-12-31')
  res.json(db.prepare(`
    SELECT * FROM tac_class_notes WHERE coach_id = ? AND date >= ? AND date <= ? ORDER BY date DESC, id DESC
  `).all(req.user.id, from, to))
})

r.post('/tac/class-notes', requireCoach, (req, res) => {
  const { date, className, coachName, booked, attended, didNotWork, people, laneDrift } = req.body || {}
  if (!isDate(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' })
  if (!str(className).trim()) return res.status(400).json({ error: 'className is required' })
  const id = db.prepare(`
    INSERT INTO tac_class_notes (coach_id, date, class_name, coach_name, booked, attended, did_not_work, people, lane_drift)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.user.id, date, str(className).trim(), str(coachName),
    booked == null || booked === '' ? null : Number(booked),
    attended == null || attended === '' ? null : Number(attended),
    str(didNotWork), str(people),
    ['base', 'build', 'push', 'mixed'].includes(laneDrift) ? laneDrift : '').lastInsertRowid
  res.json({ id })
})

r.delete('/tac/class-notes/:id', requireCoach, (req, res) => {
  const n = db.prepare('SELECT * FROM tac_class_notes WHERE id = ? AND coach_id = ?').get(Number(req.params.id), req.user.id)
  if (!n) return res.status(404).json({ error: 'Not found' })
  db.prepare('DELETE FROM tac_class_notes WHERE id = ?').run(n.id)
  res.json({ ok: true })
})

// ------------------------------------------------- Google Calendar feeds in ----

r.get('/tac/feeds', requireCoach, (req, res) => {
  res.json(db.prepare('SELECT id, name, url, colour, last_synced_at, last_error FROM tac_feeds WHERE coach_id = ? ORDER BY id').all(req.user.id))
})

r.post('/tac/feeds', requireCoach, (req, res) => {
  const { name, url, colour } = req.body || {}
  if (!str(name).trim()) return res.status(400).json({ error: 'name is required' })
  let parsed
  try { parsed = new URL(str(url)) } catch { return res.status(400).json({ error: 'url must be a full https:// ICS address' }) }
  if (parsed.protocol !== 'https:') return res.status(400).json({ error: 'url must be https' })
  const id = db.prepare('INSERT INTO tac_feeds (coach_id, name, url, colour) VALUES (?, ?, ?, ?)')
    .run(req.user.id, str(name).trim(), parsed.toString(), str(colour)).lastInsertRowid
  res.json({ id })
})

r.delete('/tac/feeds/:id', requireCoach, (req, res) => {
  const f = db.prepare('SELECT * FROM tac_feeds WHERE id = ? AND coach_id = ?').get(Number(req.params.id), req.user.id)
  if (!f) return res.status(404).json({ error: 'Not found' })
  db.prepare('DELETE FROM tac_feeds WHERE id = ?').run(f.id)
  res.json({ ok: true })
})

r.post('/tac/feeds/:id/sync', requireCoach, async (req, res, next) => {
  const f = db.prepare('SELECT * FROM tac_feeds WHERE id = ? AND coach_id = ?').get(Number(req.params.id), req.user.id)
  if (!f) return res.status(404).json({ error: 'Not found' })
  try {
    const from = str(req.query.from, new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10))
    const to = str(req.query.to, new Date(Date.now() + 120 * 864e5).toISOString().slice(0, 10))
    const text = await fetchIcs(f.url)
    const events = parseIcs(text, from, to)
    db.prepare('DELETE FROM tac_feed_events WHERE feed_id = ?').run(f.id)
    const ins = db.prepare(`
      INSERT OR IGNORE INTO tac_feed_events (coach_id, feed_id, uid, date, start_time, end_time, title, location)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    for (const e of events) ins.run(req.user.id, f.id, e.uid, e.date, e.startTime, e.endTime, e.title, e.location)
    db.prepare("UPDATE tac_feeds SET last_synced_at = datetime('now'), last_error = '' WHERE id = ?").run(f.id)
    res.json({ imported: events.length, from, to })
  } catch (err) {
    db.prepare('UPDATE tac_feeds SET last_error = ? WHERE id = ?').run(String(err.message || err).slice(0, 300), f.id)
    if (err.name === 'AbortError') return res.status(504).json({ error: 'The calendar feed did not respond in time' })
    next(err)
  }
})

async function fetchIcs(url) {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 15000)
  try {
    const resp = await fetch(url, { signal: ac.signal, headers: { accept: 'text/calendar' } })
    if (!resp.ok) throw new Error(`Calendar feed returned ${resp.status}`)
    return await resp.text()
  } finally {
    clearTimeout(timer)
  }
}

// ----------------------------------------------------------- ICS in and out ----

// Enough of RFC 5545 to read a Google secret-address feed: unfolded lines, VEVENTs,
// date and date-time DTSTART/DTEND, and DAILY/WEEKLY recurrence expanded across the
// requested window. Anything more exotic lands as its first occurrence only, which
// is better than dropping it.
export function parseIcs(text, from, to) {
  const lines = String(text).replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n')
  const out = []
  let cur = null
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = {}; continue }
    if (line === 'END:VEVENT') {
      if (cur && cur.start) out.push(...expand(cur, from, to))
      cur = null
      continue
    }
    if (!cur) continue
    const colon = line.indexOf(':')
    if (colon < 0) continue
    const rawKey = line.slice(0, colon)
    const value = line.slice(colon + 1)
    const key = rawKey.split(';')[0].toUpperCase()
    if (key === 'UID') cur.uid = value
    else if (key === 'SUMMARY') cur.title = unescapeIcs(value)
    else if (key === 'LOCATION') cur.location = unescapeIcs(value)
    else if (key === 'DTSTART') cur.start = parseIcsDate(value)
    else if (key === 'DTEND') cur.end = parseIcsDate(value)
    else if (key === 'RRULE') cur.rrule = value
    else if (key === 'STATUS') cur.status = value
  }
  return out
}

function unescapeIcs(v) {
  return v.replace(/\\n/gi, ' ').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\').trim()
}

// Returns { date, time } in the feed's own wall-clock terms. Feeds carrying a Z
// suffix are converted to local time so a 5am Brisbane class does not land on the
// planner as 7pm the day before.
function parseIcsDate(v) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(v.trim())
  if (!m) return null
  const [, y, mo, d, hh, mm, , z] = m
  if (!hh) return { date: `${y}-${mo}-${d}`, time: null }
  if (z) {
    const local = new Date(Date.UTC(+y, +mo - 1, +d, +hh, +mm))
    return { date: localIso(local), time: `${pad(local.getHours())}:${pad(local.getMinutes())}` }
  }
  return { date: `${y}-${mo}-${d}`, time: `${hh}:${mm}` }
}

function expand(ev, from, to) {
  if (ev.status === 'CANCELLED') return []
  const base = {
    uid: ev.uid || crypto.randomUUID(),
    title: ev.title || '(no title)',
    location: ev.location || '',
    startTime: ev.start.time,
    endTime: ev.end ? ev.end.time : null,
  }
  if (!ev.rrule) {
    return ev.start.date >= from && ev.start.date <= to ? [{ ...base, date: ev.start.date }] : []
  }
  return occurrences(ev.start.date, ev.rrule, from, to)
    .map(date => ({ ...base, uid: `${base.uid}-${date}`, date }))
}

const BYDAY = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 }
const pad = n => String(n).padStart(2, '0')
const localIso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

// Dates an RRULE produces inside [from, to]. Covers DAILY, WEEKLY and MONTHLY with
// INTERVAL, BYDAY, COUNT and UNTIL, which is everything this planner writes and
// everything a Google feed realistically hands back for a class timetable. Anything
// else falls back to the first occurrence rather than silently vanishing.
export function occurrences(first, rrule, from, to) {
  const rule = Object.fromEntries(String(rrule).split(';').filter(Boolean).map(p => p.split('=')))
  const freq = rule.FREQ
  if (!['DAILY', 'WEEKLY', 'MONTHLY'].includes(freq)) {
    return first >= from && first <= to ? [first] : []
  }
  const interval = Math.max(1, Number(rule.INTERVAL || 1))
  const until = rule.UNTIL ? parseIcsDate(rule.UNTIL)?.date : null
  const count = rule.COUNT ? Number(rule.COUNT) : null
  const days = rule.BYDAY
    ? rule.BYDAY.split(',').map(d => BYDAY[d.trim().slice(-2).toUpperCase()]).filter(n => n != null)
    : null

  const origin = new Date(first + 'T00:00:00')
  const cursor = new Date(origin)
  const stop = new Date(to + 'T00:00:00')
  const out = []
  let emitted = 0
  // Hard ceiling so a malformed endless rule cannot spin the request.
  for (let guard = 0; guard < 4000 && cursor <= stop; guard++) {
    const iso = localIso(cursor)
    if (until && iso > until) break
    let matches
    if (freq === 'DAILY') {
      matches = Math.round((cursor - origin) / 864e5) % interval === 0
    } else if (freq === 'WEEKLY') {
      const weeksIn = Math.floor((cursor - origin) / (7 * 864e5))
      matches = weeksIn % interval === 0 && (!days || days.includes(cursor.getDay()))
    } else {
      const monthsIn = (cursor.getFullYear() - origin.getFullYear()) * 12 + (cursor.getMonth() - origin.getMonth())
      matches = monthsIn % interval === 0 && cursor.getDate() === origin.getDate()
    }
    if (matches) {
      emitted++
      if (count && emitted > count) break
      if (iso >= from) out.push(iso)
    }
    cursor.setDate(cursor.getDate() + 1)
  }
  return out
}

// The published feed. Token-scoped rather than cookie-authed, because Google
// fetches it server-side with no session. Treat the URL like a password.
r.get('/tac/calendar/:token', (req, res) => {
  const token = String(req.params.token || '').replace(/\.ics$/i, '')
  const s = token && db.prepare('SELECT * FROM tac_settings WHERE ics_token = ?').get(token)
  if (!s) return res.status(404).type('text/plain').send('Not found')

  const from = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10)
  const items = db.prepare('SELECT * FROM tac_plan_items WHERE coach_id = ? AND date >= ? ORDER BY date').all(s.coach_id, from)

  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Training App//TAC Ops//EN',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:TAC Plan',
    `X-WR-TIMEZONE:${s.timezone}`,
  ]
  for (const it of items) {
    const uid = it.uid || `tac-plan-${it.id}`
    lines.push('BEGIN:VEVENT', `UID:${uid}@training-app`, `DTSTAMP:${stamp}`)
    if (it.start_time && it.end_time) {
      lines.push(`DTSTART;TZID=${s.timezone}:${icsStamp(it.date, it.start_time)}`)
      lines.push(`DTEND;TZID=${s.timezone}:${icsStamp(it.date, it.end_time)}`)
    } else {
      lines.push(`DTSTART;VALUE=DATE:${it.date.replace(/-/g, '')}`)
      lines.push(`DTEND;VALUE=DATE:${nextDay(it.date).replace(/-/g, '')}`)
    }
    lines.push(`SUMMARY:${icsEscape(`${it.title}`)}`)
    if (it.location) lines.push(`LOCATION:${icsEscape(it.location)}`)
    const desc = [it.notes, `TAC Ops · ${it.kind}${it.billable ? '' : ' · not billable'}`].filter(Boolean).join('\n')
    if (desc) lines.push(`DESCRIPTION:${icsEscape(desc)}`)
    if (it.rrule) lines.push(`RRULE:${it.rrule}`)
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')

  res.setHeader('content-type', 'text/calendar; charset=utf-8')
  res.setHeader('cache-control', 'no-cache')
  res.send(lines.map(foldIcs).join('\r\n') + '\r\n')
})

const icsStamp = (date, time) => `${date.replace(/-/g, '')}T${time.replace(':', '')}00`
const icsEscape = v => String(v).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
function nextDay(iso) {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + 1)
  return localIso(d)
}
// RFC 5545 caps a content line at 75 octets; Google is forgiving but Apple is not.
function foldIcs(line) {
  if (line.length <= 74) return line
  const parts = [line.slice(0, 74)]
  let rest = line.slice(74)
  while (rest.length > 73) { parts.push(' ' + rest.slice(0, 73)); rest = rest.slice(73) }
  if (rest) parts.push(' ' + rest)
  return parts.join('\r\n')
}

// --------------------------------------------------------------- overview ----

r.get('/tac/overview', requireCoach, (req, res) => {
  const s = settings(req.user.id)
  const today = new Date().toISOString().slice(0, 10)
  const monday = (() => {
    const d = new Date(today + 'T00:00:00')
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
    return d.toISOString().slice(0, 10)
  })()
  const weekMinutes = db.prepare('SELECT COALESCE(SUM(minutes), 0) AS m FROM tac_timesheet WHERE coach_id = ? AND date >= ?')
    .get(req.user.id, monday).m
  const totalMinutes = db.prepare('SELECT COALESCE(SUM(minutes), 0) AS m FROM tac_timesheet WHERE coach_id = ?').get(req.user.id).m
  res.json({
    today,
    weekStart: monday,
    contract: { minHours: s.contract_min_hours, maxHours: s.contract_max_hours, start: s.contract_start },
    hours: { thisWeek: weekMinutes / 60, sinceStart: totalMinutes / 60 },
    openTodos: db.prepare("SELECT COUNT(*) AS n FROM tac_todos WHERE coach_id = ? AND status != 'done'").get(req.user.id).n,
    dueSoon: db.prepare("SELECT COUNT(*) AS n FROM tac_todos WHERE coach_id = ? AND status != 'done' AND due IS NOT NULL AND due <= date('now', '+7 days')").get(req.user.id).n,
    kpis: db.prepare('SELECT COUNT(*) AS n FROM tac_kpis WHERE coach_id = ? AND archived = 0').get(req.user.id).n,
    reflectionsThisWeek: db.prepare('SELECT COUNT(*) AS n FROM tac_reflections WHERE coach_id = ? AND date >= ?').get(req.user.id, monday).n,
    todayPlan: db.prepare("SELECT * FROM tac_plan_items WHERE coach_id = ? AND date = ? ORDER BY COALESCE(start_time, '99:99')").all(req.user.id, today),
    nextGameDay: GAMEDAY.picks.find(p => p.date >= today) || null,
  })
})

export default r
