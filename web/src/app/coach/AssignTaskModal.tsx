// Assign health tasks to a day: the "more than exercise" layer.
// Weight check-ins, hydration, supplements, habits, readiness and custom
// check-in forms are first-class calendar items beside sessions.
import { useEffect, useState } from 'react'
import { api, shiftIso } from '../../lib/api'
import type { TaskType, CheckinForm } from '../../lib/types'
import { Modal, ErrorNote } from '../../components/ui'

const PRESETS: { type: TaskType; title: string; icon: string; config?: Record<string, unknown>; hint: string }[] = [
  { type: 'weight', title: 'Weight check-in', icon: '⚖️', config: { unit: 'kg' }, hint: 'Logs to their bodyweight trend' },
  { type: 'water', title: 'Drink 2L of water', icon: '💧', config: { targetMl: 2000 }, hint: 'Simple daily tick' },
  { type: 'supplement', title: 'Take your supplements', icon: '💊', config: { items: [] }, hint: 'Tick when taken' },
  { type: 'readiness', title: 'Readiness check', icon: '🌤️', hint: 'Sleep, mood, energy, stress, soreness → score' },
  { type: 'habit', title: 'Custom habit', icon: '✅', hint: 'Anything: walk, stretch, sleep by 10' },
  { type: 'checkin_form', title: 'Check-in form', icon: '📝', hint: 'One of your custom forms' },
]

export default function AssignTaskModal({ ownerType, ownerId, date, onClose }: {
  ownerType: 'athlete' | 'team'; ownerId: number; date: string; onClose: () => void
}) {
  const [picked, setPicked] = useState<typeof PRESETS[number] | null>(null)
  const [title, setTitle] = useState('')
  const [forms, setForms] = useState<CheckinForm[]>([])
  const [formId, setFormId] = useState<number | null>(null)
  const [repeat, setRepeat] = useState<'once' | 'daily-week' | 'weekly-4'>('once')
  const [error, setError] = useState('')

  useEffect(() => { api.get<CheckinForm[]>('/forms').then(setForms).catch(() => {}) }, [])

  async function assign() {
    if (!picked) return
    const dates =
      repeat === 'daily-week' ? Array.from({ length: 7 }, (_, i) => shiftIso(date, i))
      : repeat === 'weekly-4' ? Array.from({ length: 4 }, (_, i) => shiftIso(date, i * 7))
      : [date]
    const config = picked.type === 'checkin_form' ? { formId } : picked.config || {}
    try {
      await api.post('/tasks', {
        ownerType, ownerId, dates,
        type: picked.type,
        title: title.trim() || picked.title,
        config,
      })
      onClose()
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed') }
  }

  return (
    <Modal title="Add a health task" onClose={onClose}>
      {!picked ? (
        <div className="grid gap-2">
          {PRESETS.map(p => (
            <button key={p.type + p.title} className="tile flex items-center gap-3 p-3 text-left hover:bg-surface2"
              onClick={() => { setPicked(p); setTitle(p.title === 'Custom habit' || p.title === 'Check-in form' ? '' : p.title) }}>
              <span className="text-xl" aria-hidden>{p.icon}</span>
              <span>
                <span className="block text-sm font-semibold">{p.title}</span>
                <span className="block text-xs text-muted">{p.hint}</span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="label">Shown to them as</label>
            <input className="field" value={title} onChange={e => setTitle(e.target.value)} placeholder={picked.title} autoFocus />
          </div>
          {picked.type === 'checkin_form' && (
            <div>
              <label className="label">Form</label>
              {forms.length === 0 ? (
                <p className="text-sm text-muted">No forms yet. Build one under Library → Check-in forms.</p>
              ) : (
                <select className="field" value={formId ?? ''} onChange={e => setFormId(Number(e.target.value) || null)}>
                  <option value="">Choose a form...</option>
                  {forms.map(f => <option key={f.id} value={f.id}>{f.title}</option>)}
                </select>
              )}
            </div>
          )}
          <div>
            <label className="label">Repeat</label>
            <select className="field" value={repeat} onChange={e => setRepeat(e.target.value as typeof repeat)}>
              <option value="once">Just this day</option>
              <option value="daily-week">Every day for a week</option>
              <option value="weekly-4">Weekly for 4 weeks</option>
            </select>
          </div>
          <ErrorNote error={error} />
          <div className="flex gap-2">
            <button className="btn btn-ghost flex-1" onClick={() => setPicked(null)}>Back</button>
            <button
              className="btn flex-1"
              disabled={picked.type === 'checkin_form' ? !formId : !(title.trim() || picked.title)}
              onClick={assign}
            >
              Assign
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
