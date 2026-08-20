import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import type { Result } from '../../lib/types'
import { Spinner, Empty } from '../../components/ui'

export default function History() {
  const [results, setResults] = useState<Result[] | null>(null)
  const [open, setOpen] = useState<number | null>(null)

  useEffect(() => { api.get<Result[]>('/results').then(setResults).catch(console.error) }, [])

  if (!results) return <Spinner />
  if (results.length === 0) return <Empty>No sessions logged yet. Your history builds here.</Empty>

  return (
    <div className="space-y-2">
      <h1 className="text-xl">History</h1>
      {results.map(r => (
        <div key={r.id} className="card p-3">
          <button className="w-full text-left" onClick={() => setOpen(open === r.id ? null : r.id)}>
            <div className="flex items-center justify-between">
              <span className="font-semibold">{r.workout_title}</span>
              <span className="text-xs text-muted">{r.workout_date}</span>
            </div>
            <div className="text-xs text-muted">
              {r.status === 'completed' ? 'Completed' : 'Partial'}
              {r.duration_min ? ` · ${r.duration_min} min` : ''}
              {r.session_rpe ? ` · RPE ${r.session_rpe}` : ''}
            </div>
          </button>
          {open === r.id && (
            <div className="mt-2 space-y-2 border-t border-line pt-2">
              {r.content.exercises.map((e, i) => (
                <div key={i} className="text-sm">
                  <div className="font-medium">{e.name || `Exercise ${i + 1}`}</div>
                  <div className="text-xs text-muted">
                    {e.sets.map((s, si) => {
                      const bits = Object.entries(s.actual)
                        .filter(([, v]) => v !== null && v !== '')
                        .map(([k, v]) => k === 'load_kg' ? `${v} kg` : k === 'reps' ? `${v}` : `${k} ${v}`)
                      return <span key={si} className={s.completed ? '' : 'opacity-50'}>{si ? ' · ' : ''}{bits.join(' @ ') || '—'}</span>
                    })}
                  </div>
                </div>
              ))}
              {r.comment && <p className="text-xs italic text-muted">“{r.comment}”</p>}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
