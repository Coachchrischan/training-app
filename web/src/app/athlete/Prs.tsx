// Working maxes + PRs. TrainHeroic rule preserved: auto-updates from training
// until a max is tested/manually set, then it stays put until re-tested.
import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { useAuth } from '../../App'
import type { MaxRow } from '../../lib/types'
import { Spinner, Empty, ExercisePicker } from '../../components/ui'

export default function Prs() {
  const { user } = useAuth()
  const [maxes, setMaxes] = useState<MaxRow[] | null>(null)
  const reload = () => api.get<MaxRow[]>(`/athletes/${user!.id}/maxes`).then(setMaxes)
  useEffect(() => { reload() }, [])

  if (!maxes) return <Spinner />

  return (
    <div className="space-y-3">
      <h1 className="text-xl">Working maxes</h1>
      <p className="text-xs text-muted">
        “auto” maxes update themselves as you train. Once you test one, it only changes when you re-test it.
      </p>
      {maxes.length === 0 ? <Empty>No maxes yet. They appear as you log training.</Empty> : (
        <div className="card divide-y divide-line">
          {maxes.map(m => (
            <div key={m.exercise_id} className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="text-sm font-semibold">{m.title}</div>
                <div className="text-xs text-muted">{m.source} · {m.recorded_at.slice(0, 10)}</div>
              </div>
              <div className="text-lg font-bold">{m.value_kg} kg</div>
            </div>
          ))}
        </div>
      )}
      <div className="card p-3">
        <div className="label">Tested a new max? Record it</div>
        <AddTested athleteId={user!.id} onSaved={reload} />
      </div>
    </div>
  )
}

function AddTested({ athleteId, onSaved }: { athleteId: number; onSaved: () => void }) {
  const [exercise, setExercise] = useState<{ id: number; title: string } | null>(null)
  const [val, setVal] = useState('')
  return exercise ? (
    <div className="flex items-center gap-2 text-sm">
      <span className="flex-1 truncate font-medium">{exercise.title}</span>
      <input className="field !min-h-10 w-24 py-1" type="number" step="0.5" inputMode="decimal" placeholder="kg" value={val} onChange={e => setVal(e.target.value)} />
      <button className="btn btn-sm" disabled={!(Number(val) > 0)} onClick={() =>
        api.put(`/athletes/${athleteId}/maxes/${exercise.id}`, { valueKg: Number(val), source: 'tested' })
          .then(() => { setExercise(null); setVal(''); onSaved() })}>Save</button>
    </div>
  ) : (
    <ExercisePicker onPick={setExercise} />
  )
}
