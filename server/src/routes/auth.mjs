import { Router } from 'express'
import crypto from 'node:crypto'
import { db } from '../db.mjs'
import {
  hashPassword, verifyPassword, createSession, destroySession,
  sessionCookie, clearCookie, readToken, requireAuth, requireCoach,
} from '../auth.mjs'

const r = Router()

r.post('/login', (req, res) => {
  const { email, password } = req.body || {}
  const user = db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(String(email || '').trim())
  if (!user || !verifyPassword(String(password || ''), user.password_hash)) {
    return res.status(401).json({ error: 'Wrong email or password' })
  }
  const token = createSession(user.id)
  res.setHeader('Set-Cookie', sessionCookie(token))
  res.json({ id: user.id, email: user.email, name: user.name, role: user.role })
})

r.post('/logout', (req, res) => {
  destroySession(readToken(req))
  res.setHeader('Set-Cookie', clearCookie())
  res.json({ ok: true })
})

r.get('/me', requireAuth, (req, res) => {
  // Athletes carry their coach's id so the app can address messages without guessing.
  if (req.user.role === 'athlete') {
    const row = db.prepare('SELECT coach_id FROM athletes WHERE user_id = ?').get(req.user.id)
    return res.json({ ...req.user, coachId: row?.coach_id ?? null })
  }
  res.json(req.user)
})

// Coach creates an invite; athlete redeems it to register.
r.post('/invites', requireCoach, (req, res) => {
  const { athleteName, email } = req.body || {}
  if (!athleteName) return res.status(400).json({ error: 'athleteName required' })
  const code = crypto.randomBytes(4).toString('hex').toUpperCase()
  db.prepare('INSERT INTO invites (code, coach_id, athlete_name, email) VALUES (?, ?, ?, ?)')
    .run(code, req.user.id, athleteName, email || null)
  res.json({ code })
})

r.get('/invites', requireCoach, (req, res) => {
  res.json(db.prepare('SELECT * FROM invites WHERE coach_id = ? ORDER BY created_at DESC').all(req.user.id))
})

r.post('/register', (req, res) => {
  const { code, email, password, name } = req.body || {}
  const invite = db.prepare('SELECT * FROM invites WHERE code = ? AND used_by IS NULL').get(String(code || '').trim().toUpperCase())
  if (!invite) return res.status(400).json({ error: 'Invalid or used invite code' })
  if (!email || !password || String(password).length < 8) {
    return res.status(400).json({ error: 'Email and a password of at least 8 characters required' })
  }
  const exists = db.prepare('SELECT 1 FROM users WHERE email = ? COLLATE NOCASE').get(String(email).trim())
  if (exists) return res.status(400).json({ error: 'That email already has an account' })
  const userId = db.prepare('INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)')
    .run(String(email).trim(), hashPassword(String(password)), String(name || invite.athlete_name), 'athlete').lastInsertRowid
  db.prepare('INSERT INTO athletes (user_id, coach_id) VALUES (?, ?)').run(userId, invite.coach_id)
  db.prepare('UPDATE invites SET used_by = ? WHERE code = ?').run(userId, invite.code)
  const token = createSession(userId)
  res.setHeader('Set-Cookie', sessionCookie(token))
  res.json({ id: userId, email, name: name || invite.athlete_name, role: 'athlete' })
})

export default r
