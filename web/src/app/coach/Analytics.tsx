import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import type { AthleteRow, Exercise } from '../../lib/types'
import { useBrand } from '../../App'
import { LineChart, ExercisePicker, Empty, Spinner } from '../../components/ui'

export default function Analytics() {
  const brand = useBrand()
  const [athletes, setAthletes] = useState<AthleteRow[]>([])
  const [athleteId, setAthleteId] = useState<number | null>(null)
  const [exercise, setExercise] = useState<Exercise | null>(null)
  const [compliance, setCompliance] = useState<{ week: string; prescribed: number; completed: number }[]>([])
  const [tonnage, setTonnage] = useState<{ week: string; tonnage: number }[]>([])
  const [e1rm, setE1rm] = useState<{ date: string; e1rm: number }[]>([])
  const [readiness, setReadiness] = useState<{ value: number; recorded_at: string }[]>([])

  useEffect(() => {
    api.get<AthleteRow[]>('/athletes').then(rows => {
      setAthletes(rows)
      if (rows.length) setAthleteId(rows[0].id)
    })
  }, [])

  useEffect(() => {
    if (!athleteId) return
    api.get<typeof compliance>(`/analytics/compliance?athleteId=${athleteId}`).then(setCompliance)
    api.get<typeof tonnage>(`/analytics/tonnage?athleteId=${athleteId}`).then(setTonnage)
    api.get<typeof readiness>(`/analytics/metric-series?athleteId=${athleteId}&metric=readiness`).then(setReadiness)
  }, [athleteId])

  useEffect(() => {
    if (!athleteId || !exercise) return
    api.get<typeof e1rm>(`/analytics/e1rm?athleteId=${athleteId}&exerciseId=${exercise.id}`).then(setE1rm)
  }, [athleteId, exercise])

  if (!athletes.length) return <Spinner />

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl">Analytics</h1>
        <select className="field !min-h-10 w-56 py-1" value={athleteId ?? ''} onChange={e => setAthleteId(Number(e.target.value))}>
          {athletes.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>

      <section className="card p-4">
        <h2 className="mb-2 text-lg">Compliance (sessions completed vs prescribed)</h2>
        {compliance.length === 0 ? <Empty>No published sessions in the window</Empty> : (
          <div className="flex items-end gap-2 overflow-x-auto pb-2">
            {compliance.map(c => (
              <div key={c.week} className="min-w-16 text-center">
                <div className="mx-auto flex h-24 w-8 flex-col justify-end rounded bg-surface2">
                  <div
                    className="rounded bg-primary"
                    style={{ height: `${c.prescribed ? Math.min(100, (c.completed / c.prescribed) * 100) : 0}%` }}
                    title={`${c.completed}/${c.prescribed}`}
                  />
                </div>
                <div className="mt-1 text-[10px] text-muted">{c.week.slice(5)}</div>
                <div className="text-xs font-semibold">{c.completed}/{c.prescribed}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="card p-4">
          <h2 className="mb-2 text-lg">Weekly tonnage</h2>
          <LineChart unit=" kg" points={tonnage.map(t => ({ x: t.week, y: t.tonnage }))} />
        </section>

        {brand.flags.readiness && (
          <section className="card p-4">
            <h2 className="mb-2 text-lg">Readiness trend</h2>
            <LineChart points={readiness.map(r => ({ x: r.recorded_at, y: r.value }))} />
          </section>
        )}

        <section className="card p-4 md:col-span-2">
          <h2 className="mb-2 text-lg">Estimated 1RM trend</h2>
          <div className="mb-3 max-w-sm">
            {exercise
              ? <button className="btn btn-ghost btn-sm" onClick={() => setExercise(null)}>{exercise.title} ✕</button>
              : <ExercisePicker onPick={setExercise} />}
          </div>
          {exercise
            ? <LineChart unit=" kg" points={e1rm.map(p => ({ x: p.date, y: p.e1rm }))} />
            : <Empty>Pick an exercise to see the trend</Empty>}
        </section>
      </div>
    </div>
  )
}
