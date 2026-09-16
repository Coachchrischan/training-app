// The one screen worth opening at 4:25am in the car park: hours against contract,
// what is on today, what is overdue, and which Game Day session is next.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, fmtDate } from '../../../lib/api'
import type { TacOverview, TacTodo } from '../../../lib/types'
import { Spinner, Empty, ErrorNote } from '../../../components/ui'

export default function Overview() {
  const [data, setData] = useState<TacOverview | null>(null)
  const [todos, setTodos] = useState<TacTodo[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([api.get<TacOverview>('/tac/overview'), api.get<TacTodo[]>('/tac/todos')])
      .then(([o, t]) => { setData(o); setTodos(t) })
      .catch(e => setError(String(e.message || e)))
  }, [])

  if (error) return <ErrorNote error={error} />
  if (!data) return <Spinner />

  const { minHours, maxHours } = data.contract
  const week = data.hours.thisWeek
  const overdue = todos.filter(t => t.due && t.due < data.today)
  const nowList = todos.filter(t => t.priority === 'now' && t.status !== 'done').slice(0, 5)

  return (
    <div className="space-y-5">
      <section className="card p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg">This week</h2>
          <span className="text-xs text-muted">Contracted {minHours} to {maxHours} hours per week</span>
        </div>
        <div className="mt-2 text-4xl font-bold">{fmtHours(week)}</div>
        <ContractBar hours={week} min={minHours} max={maxHours} />
        <p className="mt-2 text-sm text-muted">
          {week < minHours
            ? `${fmtHours(minHours - week)} short of the bottom of the band.`
            : week > maxHours
              ? `${fmtHours(week - maxHours)} over the top of the band. Worth flagging with Johno.`
              : 'Inside the contracted band.'}
          {' '}Total since {fmtDate(data.contract.start)}: <strong>{fmtHours(data.hours.sinceStart)}</strong>.
        </p>
        <Link to="/coach/tac/timesheet" className="btn btn-sm mt-3">Log hours</Link>
      </section>

      <div className="grid gap-4 sm:grid-cols-3">
        <Tile label="Open to-dos" value={data.openTodos} to="/coach/tac/todos" />
        <Tile label="Due in 7 days" value={data.dueSoon} to="/coach/tac/todos" tone={data.dueSoon ? 'warn' : undefined} />
        <Tile label="Reflections this week" value={data.reflectionsThisWeek} to="/coach/tac/reflections" />
      </div>

      <section className="card p-4">
        <h2 className="mb-2 text-lg">Today</h2>
        {data.todayPlan.length === 0 ? <Empty>Nothing planned for today</Empty> : (
          <ul className="divide-y divide-line text-sm">
            {data.todayPlan.map(p => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                <span className="font-medium">{p.title}</span>
                <span className="shrink-0 text-xs text-muted">
                  {p.start_time ? `${p.start_time}${p.end_time ? `–${p.end_time}` : ''}` : 'all day'}
                </span>
              </li>
            ))}
          </ul>
        )}
        <Link to="/coach/tac/plan" className="btn btn-ghost btn-sm mt-3">Open the planner</Link>
      </section>

      {overdue.length > 0 && (
        <section className="card p-4">
          <h2 className="mb-2 text-lg text-danger">Overdue</h2>
          <ul className="divide-y divide-line text-sm">
            {overdue.map(t => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-2">
                <span className="font-medium">{t.title}</span>
                <span className="shrink-0 text-xs text-danger">{fmtDate(t.due!)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {nowList.length > 0 && (
        <section className="card p-4">
          <h2 className="mb-2 text-lg">Do now</h2>
          <ul className="divide-y divide-line text-sm">
            {nowList.map(t => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-2">
                <span className="font-medium">{t.title}</span>
                <span className="shrink-0 text-xs text-muted">{t.due ? fmtDate(t.due) : t.area}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.nextGameDay && (
        <section className="card p-4">
          <h2 className="mb-1 text-lg">Next Community Day</h2>
          <p className="text-sm">
            <strong>{fmtDate(data.nextGameDay.date)}</strong> · {data.nextGameDay.workoutId}
          </p>
          <p className="mt-1 text-sm text-muted">{data.nextGameDay.why}</p>
          <Link to="/coach/tac/gameday" className="btn btn-sm mt-3">Open the library</Link>
        </section>
      )}
    </div>
  )
}

export function fmtHours(h: number): string {
  const total = Math.round(h * 60)
  return `${Math.floor(total / 60)}h ${String(total % 60).padStart(2, '0')}m`
}

// The contract is a band, not a target, so the bar shows the band rather than a
// single goal line: under 6 and over 10 are both worth knowing about.
function ContractBar({ hours, min, max }: { hours: number; min: number; max: number }) {
  const scale = Math.max(max * 1.3, hours * 1.1, 1)
  const pct = (v: number) => `${Math.min(100, (v / scale) * 100)}%`
  const inBand = hours >= min && hours <= max
  return (
    <div className="mt-3">
      <div className="relative h-3 w-full rounded-full bg-surface2">
        <div className="absolute inset-y-0 rounded-full bg-line" style={{ left: pct(min), width: `calc(${pct(max)} - ${pct(min)})` }} />
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: pct(hours), background: inBand ? 'var(--ok)' : 'var(--danger)' }}
        />
      </div>
      <div className="mt-1 flex justify-between text-xs text-muted">
        <span>0</span><span>{min}h</span><span>{max}h</span>
      </div>
    </div>
  )
}

function Tile({ label, value, to, tone }: { label: string; value: number; to: string; tone?: 'warn' }) {
  return (
    <Link to={to} className="card block p-4 hover:bg-surface2">
      <div className={`text-3xl font-bold ${tone === 'warn' ? 'text-danger' : ''}`}>{value}</div>
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</div>
    </Link>
  )
}
