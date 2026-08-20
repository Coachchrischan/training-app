// Small shared UI kit. Everything reads semantic tokens only.
import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import type { Exercise } from '../lib/types'

export function Modal({ title, onClose, children, wide }: {
  title: string; onClose: () => void; children: React.ReactNode; wide?: boolean
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={`card max-h-[90vh] w-full overflow-y-auto p-6 ${wide ? 'max-w-3xl' : 'max-w-md'}`}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl">{title}</h2>
          <button className="btn-ghost btn btn-sm" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="tile grid place-items-center p-8 text-center text-sm text-muted">{children}</div>
}

export function Spinner() {
  return <div className="p-6 text-center text-sm text-muted">Loading...</div>
}

export function ErrorNote({ error }: { error: string }) {
  return error ? <p className="my-2 text-sm font-medium text-danger">{error}</p> : null
}

// Debounced exercise search against the library API.
export function ExercisePicker({ onPick, autoFocus }: { onPick: (e: Exercise) => void; autoFocus?: boolean }) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Exercise[]>([])
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    clearTimeout(timer.current)
    if (!q.trim()) { setHits([]); return }
    timer.current = setTimeout(() => {
      api.get<Exercise[]>(`/exercises?q=${encodeURIComponent(q.trim())}&limit=12`)
        .then(r => { setHits(r); setOpen(true) })
        .catch(() => {})
    }, 200)
    return () => clearTimeout(timer.current)
  }, [q])

  return (
    <div className="relative">
      <input
        className="field"
        placeholder="Search exercises..."
        value={q}
        autoFocus={autoFocus}
        onChange={e => setQ(e.target.value)}
        onFocus={() => hits.length && setOpen(true)}
      />
      {open && hits.length > 0 && (
        <ul className="card absolute z-20 mt-1 max-h-64 w-full overflow-y-auto p-1">
          {hits.map(h => (
            <li key={h.id}>
              <button
                className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-surface2"
                onClick={() => { onPick(h); setQ(''); setHits([]); setOpen(false) }}
              >
                {h.title}
                {h.custom ? <span className="ml-2 text-xs text-muted">custom</span> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Minimal dependency-free line chart (SVG), for metric/e1RM/tonnage trends.
export function LineChart({ points, height = 120, unit }: { points: { x: string; y: number }[]; height?: number; unit?: string }) {
  if (points.length < 2) return <Empty>Not enough data yet</Empty>
  const w = 560
  const ys = points.map(p => p.y)
  const min = Math.min(...ys), max = Math.max(...ys)
  const pad = (max - min) * 0.15 || 1
  const lo = min - pad, hi = max + pad
  const px = (i: number) => (i / (points.length - 1)) * (w - 20) + 10
  const py = (y: number) => height - 14 - ((y - lo) / (hi - lo)) * (height - 28)
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${px(i).toFixed(1)},${py(p.y).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full" role="img" aria-label="Trend chart">
      <path d={d} fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" />
      {points.map((p, i) => <circle key={i} cx={px(i)} cy={py(p.y)} r="3" fill="var(--primary)" />)}
      <text x="10" y="12" fontSize="11" fill="var(--muted)">{max}{unit}</text>
      <text x="10" y={height - 3} fontSize="11" fill="var(--muted)">{min}{unit}</text>
    </svg>
  )
}
