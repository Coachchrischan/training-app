import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../../lib/api'
import type { AthleteRow, MaxRow, Result } from '../../lib/types'
import { useBrand } from '../../App'
import { Spinner, LineChart, ExercisePicker, Empty } from '../../components/ui'

export default function AthleteDetail() {
  const { id } = useParams()
  const brand = useBrand()
  const athleteId = Number(id)
  const [athlete, setAthlete] = useState<AthleteRow | null>(null)
  const [maxes, setMaxes] = useState<MaxRow[]>([])
  const [results, setResults] = useState<Result[]>([])
  const [weight, setWeight] = useState<{ value: number; recorded_at: string }[]>([])
  const [notes, setNotes] = useState('')
  const [notesSaved, setNotesSaved] = useState(true)

  useEffect(() => {
    api.get<AthleteRow[]>('/athletes').then(rows => {
      const a = rows.find(r => r.id === athleteId) || null
      setAthlete(a)
      setNotes(a?.notes || '')
    })
    api.get<MaxRow[]>(`/athletes/${athleteId}/maxes`).then(setMaxes)
    api.get<Result[]>(`/results?athleteId=${athleteId}`).then(setResults)
    api.get<{ value: number; recorded_at: string }[]>(`/metrics?athleteId=${athleteId}&metric=weight_kg`).then(setWeight)
  }, [athleteId])

  if (!athlete) return <Spinner />

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <Link to="/coach/athletes" className="text-sm text-muted underline">← {brand.terms.athletes}</Link>
          <h1 className="text-2xl">{athlete.name}</h1>
        </div>
        <Link className="btn" to={`/coach/calendar?athlete=${athleteId}`}>Open calendar</Link>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="card p-4">
          <h2 className="mb-3 text-lg">Working maxes</h2>
          {maxes.length === 0 && <Empty>No maxes recorded yet</Empty>}
          <ul className="divide-y divide-line">
            {maxes.map(m => (
              <MaxRowView key={m.exercise_id} m={m} athleteId={athleteId} onSaved={() =>
                api.get<MaxRow[]>(`/athletes/${athleteId}/maxes`).then(setMaxes)} />
            ))}
          </ul>
          <div className="mt-3">
            <div className="label">Add a max</div>
            <AddMax athleteId={athleteId} onSaved={() => api.get<MaxRow[]>(`/athletes/${athleteId}/maxes`).then(setMaxes)} />
          </div>
        </section>

        <section className="card p-4">
          <h2 className="mb-3 text-lg">Private notes</h2>
          <textarea
            className="field min-h-32"
            value={notes}
            onChange={e => { setNotes(e.target.value); setNotesSaved(false) }}
            placeholder={`Only you see these. History, preferences, flags for this ${brand.terms.athlete}.`}
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-muted">{notesSaved ? 'Saved' : 'Unsaved changes'}</span>
            <button className="btn btn-sm" disabled={notesSaved}
              onClick={() => api.patch(`/athletes/${athleteId}`, { notes }).then(() => setNotesSaved(true))}>
              Save notes
            </button>
          </div>
        </section>

        <section className="card p-4">
          <h2 className="mb-3 text-lg">Bodyweight trend</h2>
          <LineChart unit=" kg" points={weight.map(w => ({ x: w.recorded_at, y: w.value }))} />
        </section>

        <section className="card p-4">
          <h2 className="mb-3 text-lg">Recent sessions</h2>
          {results.length === 0 ? <Empty>Nothing logged yet</Empty> : (
            <ul className="divide-y divide-line text-sm">
              {results.slice(0, 8).map(r => (
                <li key={r.id} className="flex items-center justify-between py-2">
                  <div>
                    <div className="font-medium">{r.workout_title}</div>
                    <div className="text-xs text-muted">{r.workout_date} · {r.status}{r.session_rpe ? ` · RPE ${r.session_rpe}` : ''}</div>
                  </div>
                  {r.comment && <div className="max-w-48 truncate text-xs text-muted" title={r.comment}>“{r.comment}”</div>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

function MaxRowView({ m, athleteId, onSaved }: { m: MaxRow; athleteId: number; onSaved: () => void }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(String(m.value_kg))
  return (
    <li className="flex items-center justify-between gap-2 py-2 text-sm">
      <div>
        <span className="font-medium">{m.title}</span>
        <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${m.source === 'auto' ? 'bg-surface2 text-muted' : 'bg-primary text-primary-ink'}`}>
          {m.source}
        </span>
      </div>
      {editing ? (
        <span className="flex items-center gap-1">
          <input className="field !min-h-9 w-20 py-1" type="number" step="0.5" value={val} onChange={e => setVal(e.target.value)} />
          <button className="btn btn-sm" onClick={() =>
            api.put(`/athletes/${athleteId}/maxes/${m.exercise_id}`, { valueKg: Number(val), source: 'tested' })
              .then(() => { setEditing(false); onSaved() })}>Save</button>
        </span>
      ) : (
        <button className="font-semibold underline decoration-dotted" onClick={() => setEditing(true)}>{m.value_kg} kg</button>
      )}
    </li>
  )
}

function AddMax({ athleteId, onSaved }: { athleteId: number; onSaved: () => void }) {
  const [exercise, setExercise] = useState<{ id: number; title: string } | null>(null)
  const [val, setVal] = useState('')
  return exercise ? (
    <div className="flex items-center gap-2 text-sm">
      <span className="flex-1 truncate font-medium">{exercise.title}</span>
      <input className="field !min-h-9 w-24 py-1" type="number" step="0.5" placeholder="kg" value={val} onChange={e => setVal(e.target.value)} />
      <button className="btn btn-sm" disabled={!(Number(val) > 0)} onClick={() =>
        api.put(`/athletes/${athleteId}/maxes/${exercise.id}`, { valueKg: Number(val), source: 'tested' })
          .then(() => { setExercise(null); setVal(''); onSaved() })}>Add</button>
      <button className="btn btn-ghost btn-sm" onClick={() => setExercise(null)}>✕</button>
    </div>
  ) : (
    <ExercisePicker onPick={e => setExercise(e)} />
  )
}
