// Coach home: activity feed + who-needs-me-today triage (the TrueCoach idea).
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, todayIso, shiftIso } from '../../lib/api'
import type { AthleteRow, Result } from '../../lib/types'
import { useBrand } from '../../App'
import { Spinner, Empty } from '../../components/ui'

export default function Dashboard() {
  const brand = useBrand()
  const [athletes, setAthletes] = useState<AthleteRow[] | null>(null)
  const [feed, setFeed] = useState<(Result & { athleteName: string })[]>([])

  useEffect(() => {
    api.get<AthleteRow[]>('/athletes').then(async rows => {
      setAthletes(rows)
      const all: (Result & { athleteName: string })[] = []
      await Promise.all(rows.map(async a => {
        const rs = await api.get<Result[]>(`/results?athleteId=${a.id}&from=${shiftIso(todayIso(), -14)}`)
        for (const r of rs) all.push({ ...r, athleteName: a.name })
      }))
      all.sort((x, y) => (y.finished_at || '').localeCompare(x.finished_at || ''))
      setFeed(all.slice(0, 20))
    }).catch(console.error)
  }, [])

  if (!athletes) return <Spinner />

  const quiet = athletes.filter(a => !a.last_active || a.last_active.slice(0, 10) < shiftIso(todayIso(), -7))

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl">Welcome back</h1>
        <p className="text-sm text-muted">{brand.tagline}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label={`Active ${brand.terms.athletes}`} value={athletes.length} to="/coach/athletes" />
        <Stat label="Sessions logged (14 days)" value={feed.length} to="/coach/analytics" />
        <Stat label="Gone quiet (7+ days)" value={quiet.length} to="/coach/athletes" tone={quiet.length ? 'warn' : 'ok'} />
      </div>

      {quiet.length > 0 && (
        <section className="card p-4">
          <h2 className="mb-2 text-lg">Needs a nudge</h2>
          <ul className="divide-y divide-line text-sm">
            {quiet.map(a => (
              <li key={a.id} className="flex items-center justify-between py-2">
                <span className="font-medium">{a.name}</span>
                <span className="flex items-center gap-3">
                  <span className="text-xs text-muted">{a.last_active ? `last active ${a.last_active.slice(0, 10)}` : 'never logged'}</span>
                  <Link to="/coach/messages" className="btn btn-sm">Message</Link>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card p-4">
        <h2 className="mb-2 text-lg">Latest activity</h2>
        {feed.length === 0 ? <Empty>Nothing logged in the last fortnight</Empty> : (
          <ul className="divide-y divide-line text-sm">
            {feed.map(r => (
              <li key={`${r.id}`} className="flex items-center justify-between py-2">
                <div>
                  <span className="font-medium">{r.athleteName}</span>
                  <span className="text-muted"> completed </span>
                  <span className="font-medium">{r.workout_title}</span>
                  {r.session_rpe ? <span className="text-muted"> · RPE {r.session_rpe}</span> : null}
                </div>
                <span className="text-xs text-muted">{r.workout_date}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function Stat({ label, value, to, tone }: { label: string; value: number; to: string; tone?: 'warn' | 'ok' }) {
  return (
    <Link to={to} className="card block p-4 hover:bg-surface2">
      <div className={`text-3xl font-bold ${tone === 'warn' ? 'text-danger' : ''}`}>{value}</div>
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</div>
    </Link>
  )
}
