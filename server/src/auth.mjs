import crypto from 'node:crypto'
import { db } from './db.mjs'

const SCRYPT_N = 16384
const COOKIE = 'ta_session'
const TTL_DAYS = 30

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, salt, 64, { N: SCRYPT_N }).toString('hex')
  return `scrypt$${SCRYPT_N}$${salt}$${hash}`
}

export function verifyPassword(password, stored) {
  const [scheme, n, salt, hash] = String(stored).split('$')
  if (scheme !== 'scrypt') return false
  const check = crypto.scryptSync(password, salt, 64, { N: Number(n) }).toString('hex')
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(check, 'hex'))
}

export function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex')
  const expires = new Date(Date.now() + TTL_DAYS * 864e5).toISOString()
  db.prepare('INSERT INTO auth_tokens (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expires)
  return token
}

export function destroySession(token) {
  if (token) db.prepare('DELETE FROM auth_tokens WHERE token = ?').run(token)
}

export function sessionCookie(token) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${TTL_DAYS * 86400}`
}

export function clearCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
}

export function readToken(req) {
  const raw = req.headers.cookie || ''
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === COOKIE) return v.join('=')
  }
  return null
}

export function currentUser(req) {
  const token = readToken(req)
  if (!token) return null
  const row = db.prepare(`
    SELECT u.id, u.email, u.name, u.role FROM auth_tokens t
    JOIN users u ON u.id = t.user_id
    WHERE t.token = ? AND t.expires_at > datetime('now')
  `).get(token)
  return row || null
}

export function requireAuth(req, res, next) {
  const user = currentUser(req)
  if (!user) return res.status(401).json({ error: 'Not signed in' })
  req.user = user
  next()
}

export function requireCoach(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'coach') return res.status(403).json({ error: 'Coach access only' })
    next()
  })
}

// A coach may act on an athlete only if that athlete belongs to them.
export function ownsAthlete(coachId, athleteUserId) {
  return !!db.prepare('SELECT 1 FROM athletes WHERE user_id = ? AND coach_id = ?').get(athleteUserId, coachId)
}

export function athleteTeamIds(athleteUserId) {
  return db.prepare('SELECT team_id FROM team_members WHERE athlete_user_id = ?').all(athleteUserId).map(r => r.team_id)
}
