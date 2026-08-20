// The logging flow: block-by-block, per-set check-off with a keypad-friendly
// table, rest timer, then a finish summary (duration + session RPE + comment).
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../../lib/api'
import { useAuth } from '../../App'
import type { Workout, ResultContent, ExerciseResult, Result, MaxRow } from '../../lib/types'
import { loggableParams, paramDef, summariseExercise, resolveLoad } from '../../lib/params'
import { Spinner, Modal } from '../../components/ui'

export default function LogSession() {
  const { workoutId } = useParams()
  const nav = useNavigate()
  const { user } = useAuth()
  const [workout, setWorkout] = useState<Workout | null>(null)
  const [blockIdx, setBlockIdx] = useState(0)
  const [entries, setEntries] = useState<ExerciseResult[]>([])
  const [startedAt] = useState(Date.now())
  const [finishing, setFinishing] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [maxes, setMaxes] = useState<Record<number, number>>({})

  useEffect(() => {
    api.get<Workout>(`/workouts/${workoutId}`).then(w => {
      setWorkout(w)
      // Prefill from a previous log if one exists, else scaffold from prescription
      api.get<Result[]>(`/results`).then(rs => {
        const prev = rs.find(r => r.workout_id === w.id)
        if (prev?.content?.exercises?.length) {
          setEntries(prev.content.exercises)
        } else {
          setEntries(w.content.blocks.flatMap(b => b.exercises.map(ex => ({
            blockId: b.id,
            entryId: ex.id,
            exerciseId: ex.exerciseId,
            name: ex.name,
            sets: Array.from({ length: ex.sets }, (_, si) => ({
              completed: false,
              actual: Object.fromEntries(loggableParams(ex).map(p => {
                const col = ex.columns.find(c => c.type === p)
                let v = col?.values[si] ?? null
                if (p === 'load_kg' && v == null) {
                  const pct = ex.columns.find(c => c.type === 'percent_1rm')?.values[si]
                  v = null // resolved below once maxes load
                  if (pct != null) v = `%${pct}` as unknown as number // placeholder, resolved in effect
                }
                if (p === 'reps' && v == null) {
                  const range = ex.columns.find(c => c.type === 'reps_range')?.values[si]
                  if (typeof range === 'string' && range.includes('-')) v = Number(range.split('-')[0]) || null
                }
                return [p, v]
              })),
            })),
          }))))
        }
      })
    }).catch(() => nav('/me'))
    api.get<MaxRow[]>(`/athletes/${user!.id}/maxes`).then(rows => {
      const m: Record<number, number> = {}
      for (const r of rows) m[r.exercise_id] = r.value_kg
      setMaxes(m)
    }).catch(() => {})
  }, [workoutId])

  // Resolve %1RM placeholders once both maxes and entries exist.
  // Guarded so identical content never re-triggers the effect (no loop).
  useEffect(() => {
    if (!Object.keys(maxes).length || !entries.length) return
    let changed = false
    const next = entries.map(e => ({
      ...e,
      sets: e.sets.map(s => {
        const load = s.actual.load_kg
        if (typeof load === 'string' && load.startsWith('%')) {
          changed = true
          const kg = e.exerciseId ? resolveLoad(load.slice(1), maxes[e.exerciseId]) : null
          return { ...s, actual: { ...s.actual, load_kg: kg } }
        }
        return s
      }),
    }))
    if (changed) setEntries(next)
  }, [maxes, entries])

  const blocks = workout?.content.blocks ?? []
  const block = blocks[blockIdx]
  const progress = useMemo(() => {
    const all = entries.flatMap(e => e.sets)
    const done = all.filter(s => s.completed).length
    return all.length ? Math.round((done / all.length) * 100) : 0
  }, [entries])

  if (!workout || !block) return <Spinner />

  const blockLetter = String.fromCharCode(65 + blockIdx)

  return (
    <div className="space-y-3 pb-8">
      <div className="flex items-center justify-between">
        <button className="btn btn-ghost" onClick={() => (dirty ? setLeaving(true) : nav('/me'))}>← Exit</button>
        <div className="text-sm font-semibold">{workout.title}</div>
        <span className="text-xs text-muted">{progress}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface2">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
      </div>

      <div className="flex items-center justify-between">
        <button className="btn btn-ghost btn-sm" disabled={blockIdx === 0} onClick={() => setBlockIdx(blockIdx - 1)}>← Prev</button>
        <div className="text-center">
          <div className="text-xs font-bold uppercase tracking-wide text-muted">Block {blockLetter} · {block.kind}</div>
          {block.title && <div className="text-sm font-semibold">{block.title}</div>}
        </div>
        <button className="btn btn-ghost btn-sm" disabled={blockIdx === blocks.length - 1} onClick={() => setBlockIdx(blockIdx + 1)}>Next →</button>
      </div>

      {block.instructions && <p className="tile p-3 text-sm">{block.instructions}</p>}

      {block.exercises.map(ex => {
        const entry = entries.find(e => e.entryId === ex.id)
        if (!entry) return null
        return (
          <div key={ex.id} className="card p-3">
            <div className="mb-1 flex items-start justify-between gap-2">
              <div>
                <div className="font-semibold">{ex.name}</div>
                <div className="text-xs text-muted">{summariseExercise(ex)}</div>
              </div>
              {ex.videoUrl && <a href={ex.videoUrl} target="_blank" rel="noreferrer" className="shrink-0 text-xs text-primary underline">demo</a>}
            </div>
            {ex.cue && <p className="mb-2 text-xs italic text-muted">“{ex.cue}”</p>}
            <SetTable
              entry={entry}
              onChange={next => { setDirty(true); setEntries(prev => prev.map(e => e.entryId === ex.id ? next : e)) }}
            />
          </div>
        )
      })}

      <RestTimer />

      {blockIdx === blocks.length - 1 ? (
        <button className="btn w-full" onClick={() => setFinishing(true)}>Finish session</button>
      ) : (
        <button className="btn w-full" onClick={() => setBlockIdx(blockIdx + 1)}>Next block →</button>
      )}

      {finishing && (
        <FinishSheet
          workout={workout}
          entries={entries}
          minutes={Math.max(1, Math.round((Date.now() - startedAt) / 60000))}
          onClose={() => setFinishing(false)}
          onDone={() => nav('/me')}
        />
      )}

      {leaving && (
        <Modal title="Leave this session?" onClose={() => setLeaving(false)}>
          <div className="space-y-3">
            <p className="text-sm">You have logged work that is not saved yet.</p>
            <button
              className="btn w-full"
              onClick={async () => {
                await api.post('/results', {
                  workoutId: workout.id,
                  status: 'partial',
                  durationMin: Math.max(1, Math.round((Date.now() - startedAt) / 60000)),
                  comment: '',
                  content: { exercises: entries },
                }).catch(() => {})
                nav('/me')
              }}
            >
              Save my progress and leave
            </button>
            <button className="btn btn-ghost w-full" onClick={() => setLeaving(false)}>Keep training</button>
            <button className="w-full py-2 text-center text-sm text-danger underline" onClick={() => nav('/me')}>
              Discard and leave
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function SetTable({ entry, onChange }: { entry: ExerciseResult; onChange: (e: ExerciseResult) => void }) {
  const params = Object.keys(entry.sets[0]?.actual ?? {}) as (keyof typeof paramShort)[]
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-[11px] uppercase tracking-wide text-muted">
          <th className="w-8 pb-1">Set</th>
          {params.map(p => <th key={p} className="pb-1">{paramShort[p] ?? p}</th>)}
          <th className="w-10 pb-1 text-right">✓</th>
        </tr>
      </thead>
      <tbody>
        {entry.sets.map((s, si) => (
          <tr key={si}>
            <td className="py-1.5 text-sm font-bold text-muted">{si + 1}</td>
            {params.map(p => (
              <td key={p} className="py-1 pr-2">
                <input
                  className="field w-full py-1"
                  type={p === 'time' ? 'text' : 'number'}
                  inputMode="decimal"
                  step={p === 'load_kg' ? 0.5 : 1}
                  value={s.actual[p] ?? ''}
                  onChange={e => {
                    const v = e.target.value === '' ? null : p === 'time' ? e.target.value : Number(e.target.value)
                    onChange({
                      ...entry,
                      sets: entry.sets.map((x, xi) => xi === si ? { ...x, actual: { ...x.actual, [p]: v } } : x),
                    })
                  }}
                />
              </td>
            ))}
            <td className="py-1 text-right">
              <button
                aria-label={s.completed ? `Set ${si + 1} done, tap to undo` : `Mark set ${si + 1} as done`}
                aria-pressed={s.completed}
                style={{ minWidth: 'var(--control-min)', minHeight: 'var(--control-min)' }}
                className={`rounded-full border text-lg font-bold ${s.completed ? 'border-transparent bg-primary text-primary-ink' : 'border-line bg-surface text-muted'}`}
                onClick={() => onChange({
                  ...entry,
                  sets: entry.sets.map((x, xi) => xi === si ? { ...x, completed: !x.completed } : x),
                })}
              >
                ✓
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const paramShort: Record<string, string> = {
  reps: 'Reps', load_kg: 'kg', rpe: 'RPE', rir: 'RIR', time: 'Time', distance_m: 'm', calories: 'Cal',
}

function RestTimer() {
  const [seconds, setSeconds] = useState(0)
  const [running, setRunning] = useState(false)
  const target = useRef(90)
  useEffect(() => {
    if (!running) return
    const t = setInterval(() => setSeconds(s => s + 1), 1000)
    return () => clearInterval(t)
  }, [running])
  const over = seconds >= target.current
  return (
    <div className="tile flex items-center justify-between p-3">
      <div className="text-sm font-semibold">Rest timer</div>
      <div className={`font-mono text-xl font-bold ${over && running ? 'text-ok' : ''}`}>
        {String(Math.floor(seconds / 60)).padStart(1, '0')}:{String(seconds % 60).padStart(2, '0')}
      </div>
      <div className="flex gap-1">
        {[60, 90, 120, 180].map(t => (
          <button key={t} className={`btn btn-ghost btn-sm ${target.current === t ? 'font-bold underline' : ''}`}
            onClick={() => { target.current = t; setSeconds(0); setRunning(true) }}>
            {t >= 60 ? `${t / 60}m` : `${t}s`}{t === 90 ? '' : ''}
          </button>
        ))}
        <button className="btn btn-sm" onClick={() => { setRunning(!running); if (!running && seconds >= target.current) setSeconds(0) }}>
          {running ? 'Stop' : 'Start'}
        </button>
      </div>
    </div>
  )
}

function FinishSheet({ workout, entries, minutes, onClose, onDone }: {
  workout: Workout; entries: ExerciseResult[]; minutes: number; onClose: () => void; onDone: () => void
}) {
  const [rpe, setRpe] = useState(7)
  const [durationMin, setDurationMin] = useState(minutes)
  const [comment, setComment] = useState('')
  const [error, setError] = useState('')
  const doneSets = entries.flatMap(e => e.sets).filter(s => s.completed).length
  const totalSets = entries.flatMap(e => e.sets).length

  async function save() {
    const content: ResultContent = { exercises: entries }
    try {
      await api.post('/results', {
        workoutId: workout.id,
        status: doneSets === totalSets ? 'completed' : 'partial',
        durationMin,
        sessionRpe: rpe,
        comment,
        content,
      })
      onDone()
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to save') }
  }

  return (
    <Modal title="Session summary" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-muted">{doneSets} of {totalSets} sets ticked off.</p>
        <div>
          <label className="label">How hard was that? (session RPE {rpe})</label>
          <input type="range" min={1} max={10} step={0.5} value={rpe} onChange={e => setRpe(Number(e.target.value))} className="w-full" />
          <div className="flex justify-between text-[10px] text-muted"><span>Easy</span><span>Max effort</span></div>
        </div>
        <div>
          <label className="label">Duration (minutes)</label>
          <input type="number" className="field" value={durationMin} onChange={e => setDurationMin(Number(e.target.value))} />
        </div>
        <div>
          <label className="label">Comment for your coach</label>
          <textarea className="field min-h-16" value={comment} onChange={e => setComment(e.target.value)} placeholder="Felt strong. Left knee fine today." />
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <button className="btn w-full" onClick={save}>Save session</button>
      </div>
    </Modal>
  )
}
