// The Saturday Community Day library. Filterable by team size and gear, because the
// two questions on a Friday night are "how many are coming" and "what is free".
import { useEffect, useMemo, useState } from 'react'
import { api, fmtDate } from '../../../lib/api'
import type { GameDayLibrary, GameDayWorkout } from '../../../lib/types'
import { Spinner, Empty, ErrorNote } from '../../../components/ui'

const TEAM_LABEL: Record<number, string> = { 2: 'Pairs', 3: 'Trios', 4: 'Quads' }

export default function GameDay() {
  const [lib, setLib] = useState<GameDayLibrary | null>(null)
  const [error, setError] = useState('')
  const [size, setSize] = useState<number | null>(null)
  const [gear, setGear] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    api.get<GameDayLibrary>('/tac/gameday').then(setLib).catch(e => setError(String(e.message || e)))
  }, [])

  const filtered = useMemo(() => {
    if (!lib) return []
    const needle = q.trim().toLowerCase()
    return lib.workouts.filter(w =>
      (size == null || w.teamSize === size)
      && (gear == null || w.gear.includes(gear))
      && (!needle || `${w.id} ${w.name} ${w.family} ${w.engine}`.toLowerCase().includes(needle)))
  }, [lib, size, gear, q])

  if (error) return <ErrorNote error={error} />
  if (!lib) return <Spinner />

  const allGear = [...new Set(lib.workouts.flatMap(w => w.gear))].sort()

  return (
    <div className="space-y-4">
      <section className="card p-4">
        <h2 className="text-lg">What engaging means here</h2>
        <p className="mt-1 text-sm italic text-muted">{lib.engagement.definition}</p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
          {lib.engagement.rules.map((r, i) => <li key={i}>{r}</li>)}
        </ul>
        <p className="mt-3 text-sm text-muted">
          Room: {Object.entries(lib.room.stations).map(([k, v]) => `${v} ${k}`).join(', ')}. Cap {lib.room.cap}.
        </p>
      </section>

      <section className="card p-4">
        <h2 className="mb-2 text-lg">The next three Saturdays</h2>
        <ul className="space-y-3">
          {lib.picks.map(p => {
            const w = lib.workouts.find(x => x.id === p.workoutId)
            return (
              <li key={p.date} className="tile p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <strong className="text-sm">{fmtDate(p.date)}</strong>
                  <span className="text-xs text-muted">{p.workoutId} · {w?.name}</span>
                </div>
                <p className="mt-1 text-sm">{p.why}</p>
                <p className="mt-1 text-xs text-muted">Swap if: {p.swapIf}</p>
                <button className="btn btn-ghost btn-sm mt-2" onClick={() => { setOpen(p.workoutId); setSize(null); setGear(null); setQ(p.workoutId) }}>
                  Open the session
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      <div className="space-y-2">
        <input className="field" placeholder="Search the library..." value={q} onChange={e => setQ(e.target.value)} />
        <div className="flex flex-wrap gap-1.5">
          <Pill active={size == null} onClick={() => setSize(null)}>All sizes</Pill>
          {[2, 3, 4].map(n => (
            <Pill key={n} active={size === n} onClick={() => setSize(size === n ? null : n)}>{TEAM_LABEL[n]}</Pill>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Pill active={gear == null} onClick={() => setGear(null)}>All gear</Pill>
          {allGear.map(g => (
            <Pill key={g} active={gear === g} onClick={() => setGear(gear === g ? null : g)}>{g}</Pill>
          ))}
        </div>
      </div>

      <p className="text-sm text-muted">{filtered.length} of {lib.workouts.length} sessions</p>

      {filtered.length === 0 ? <Empty>Nothing matches those filters</Empty> : (
        <div className="space-y-2">
          {filtered.map(w => (
            <WorkoutCard key={w.id} w={w} open={open === w.id} onToggle={() => setOpen(open === w.id ? null : w.id)} />
          ))}
        </div>
      )}
    </div>
  )
}

function WorkoutCard({ w, open, onToggle }: { w: GameDayWorkout; open: boolean; onToggle: () => void }) {
  return (
    <article className="card p-4">
      <button className="w-full text-left" onClick={onToggle}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-base font-semibold">{w.id} · {w.name}</h3>
          <span className="text-xs text-muted">{TEAM_LABEL[w.teamSize] ?? `Teams of ${w.teamSize}`} · {w.teams} · {w.durationMin} min</span>
        </div>
        <p className="mt-1 text-sm text-muted">{w.engine}</p>
      </button>

      {open && (
        <div className="mt-3 space-y-3 border-t border-line pt-3 text-sm">
          <p><strong>Set-up.</strong> {w.stations}</p>
          <div>
            <strong>How it runs</strong>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {w.flow.map((f, i) => <li key={i}>{f}</li>)}
            </ul>
          </div>
          <p><strong>Score.</strong> {w.score}</p>
          <div className="grid gap-2 sm:grid-cols-3">
            <Lane label="Base" text={w.scaling.base} />
            <Lane label="Build" text={w.scaling.build} />
            <Lane label="Push" text={w.scaling.push} />
          </div>
          <div>
            <strong>Coach notes</strong>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {w.coachNotes.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          </div>
          <p className="text-xs text-muted">Gear: {w.gear.join(', ')}</p>
        </div>
      )}
    </article>
  )
}

function Lane({ label, text }: { label: string; text: string }) {
  return (
    <div className="tile p-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="text-sm">{text}</div>
    </div>
  )
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      className={`rounded-full px-3 py-1 text-xs ${active ? 'bg-primary text-primary-ink' : 'tile'}`}
      onClick={onClick}
    >{children}</button>
  )
}
