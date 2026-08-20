import express from 'express'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { seed } from './seed.mjs'
import authRoutes from './routes/auth.mjs'
import coachRoutes from './routes/coach.mjs'
import calendarRoutes from './routes/calendar.mjs'
import athleteRoutes from './routes/athlete.mjs'
import analyticsRoutes from './routes/analytics.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const PORT = 8129

seed()

const app = express()
app.use(express.json({ limit: '4mb' }))

app.use('/api/auth', authRoutes)
app.use('/api', coachRoutes)
app.use('/api', calendarRoutes)
app.use('/api', athleteRoutes)
app.use('/api/analytics', analyticsRoutes)

app.get('/api/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }))

// In production, serve the built web app; in dev, Vite (8128) proxies /api here.
const dist = path.join(here, '..', '..', 'web', 'dist')
if (fs.existsSync(dist)) {
  app.use(express.static(dist))
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')))
}

app.use((err, _req, res, _next) => {
  console.error('[api]', err)
  res.status(500).json({ error: err.message || 'Server error' })
})

app.listen(PORT, '127.0.0.1', () => console.log(`[api] listening on http://127.0.0.1:${PORT}`))
