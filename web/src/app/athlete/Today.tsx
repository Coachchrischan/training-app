// The athlete's day: sessions AND health tasks in one stack (Everfit's Today
// pattern). Health tasks complete inline; sessions open the logging flow.
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, todayIso, shiftIso, fmtDate } from '../../lib/api'
import { useAuth, useBrand } from '../../App'
import type { CalendarData, HealthTask, CheckinForm, Workout } from '../../lib/types'
import { Spinner, Modal } from '../../components/ui'

export default function Today() {
  const { user } = useAuth()
  const brand = useBrand()
  const [day, setDay] = useState(todayIso())
  const [data, setData] = useState<CalendarData | null>(null)
  const [openTask, setOpenTask] = useState<HealthTask | null>(null)

  const reload = useCallback(() => {
    api.get<CalendarData>(`/calendar?ownerType=athlete&ownerId=${user!.id}&from=${day}&to=${day}`)
      .then(setData).catch(console.error)
  }, [user, day])

  useEffect(reload, [reload])

  if (!data) return <Spinner />

  const workouts = data.workouts
  const tasks = data.tasks
  const doneTasks = new Set(data.completions.map(c => c.task_id))
  const loggedWorkouts = new Set(data.results.map(r => r.workout_id))
  const allDone = workouts.every(w => loggedWorkouts.has(w.id)) && tasks.every(t => doneTasks.has(t.id))

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button className="btn btn-ghost btn-sm" onClick={() => setDay(shiftIso(day, -1))}>←</button>
        <button
          className="px-3 font-semibold"
          style={{ minHeight: 'var(--control-min)' }}
          onClick={() => setDay(todayIso())}
        >
          {day === todayIso() ? 'Today' : fmtDate(day)}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => setDay(shiftIso(day, 1))}>→</button>
      </div>

      {workouts.length === 0 && tasks.length === 0 && (
        <div className="card p-6 text-center">
          <div className="mb-1 text-3xl" aria-hidden>🌿</div>
          <div className="font-semibold">Rest day</div>
          <p className="text-sm text-muted">Nothing scheduled. Recovery counts as training.</p>
        </div>
      )}

      {workouts.map(w => (
        <SessionCard key={w.id} w={w} logged={loggedWorkouts.has(w.id)} sessionTerm={brand.terms.session} />
      ))}

      {tasks.map(t => (
        <TaskCard key={t.id} t={t} done={doneTasks.has(t.id)} onOpen={() => setOpenTask(t)} onQuickTick={() =>
          api.post(`/tasks/${t.id}/complete`, { value: {} }).then(reload)} />
      ))}

      {allDone && (workouts.length > 0 || tasks.length > 0) && (
        <div className="card border-ok p-4 text-center text-sm font-semibold text-ok">
          That's everything for the day. Nice work.
        </div>
      )}

      {openTask && (
        <TaskSheet task={openTask} onClose={() => { setOpenTask(null); reload() }} />
      )}
    </div>
  )
}

function SessionCard({ w, logged, sessionTerm }: { w: Workout; logged: boolean; sessionTerm: string }) {
  const exercises = w.content.blocks.flatMap(b => b.exercises)
  return (
    <div className="card p-4">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-lg">{w.title}</h2>
        {logged && <span className="rounded-full bg-surface2 px-2 py-0.5 text-xs font-bold text-ok">Done ✓</span>}
      </div>
      <p className="mb-3 text-xs text-muted">
        {exercises.length} exercises · {w.content.blocks.length} blocks
      </p>
      {w.content.instructions && <p className="mb-3 text-sm">{w.content.instructions}</p>}
      <Link to={`/me/log/${w.id}`} className="btn w-full">
        {logged ? `Review ${sessionTerm}` : `Start ${sessionTerm}`}
      </Link>
    </div>
  )
}

const TASK_META: Record<string, { icon: string }> = {
  weight: { icon: '⚖️' }, water: { icon: '💧' }, supplement: { icon: '💊' },
  habit: { icon: '✅' }, checkin_form: { icon: '📝' }, readiness: { icon: '🌤️' }, note: { icon: '📌' },
}

function TaskCard({ t, done, onOpen, onQuickTick }: { t: HealthTask; done: boolean; onOpen: () => void; onQuickTick: () => void }) {
  const needsSheet = t.type === 'weight' || t.type === 'readiness' || t.type === 'checkin_form'
  return (
    <div className={`tile flex items-center gap-3 p-3 ${done ? 'opacity-60' : ''}`}>
      <span className="text-xl" aria-hidden>{TASK_META[t.type]?.icon || '•'}</span>
      <div className="min-w-0 flex-1">
        <div className={`text-sm font-semibold ${done ? 'line-through' : ''}`}>{t.title}</div>
        {t.type === 'habit' && typeof t.config.description === 'string' && t.config.description && (
          <div className="truncate text-xs text-muted">{t.config.description}</div>
        )}
      </div>
      {done ? (
        <span className="text-ok" aria-label="Completed">✓</span>
      ) : (
        <button
          className="btn btn-sm"
          onClick={needsSheet ? onOpen : onQuickTick}
        >
          {needsSheet ? 'Open' : 'Done'}
        </button>
      )}
    </div>
  )
}

// Bottom-sheet-style completion for tasks needing input.
function TaskSheet({ task, onClose }: { task: HealthTask; onClose: () => void }) {
  const [weight, setWeight] = useState('')
  const [readiness, setReadiness] = useState<Record<string, number>>({ sleep: 3, mood: 3, energy: 3, stress: 3, soreness: 3 })
  const [form, setForm] = useState<CheckinForm | null>(null)
  const [answers, setAnswers] = useState<Record<string, string | number>>({})
  const [error, setError] = useState('')

  useEffect(() => {
    if (task.type === 'checkin_form' && task.config.formId) {
      api.get<CheckinForm[]>('/forms').then(fs => setForm(fs.find(f => f.id === task.config.formId) || null))
    }
  }, [task])

  async function submit(value: Record<string, unknown>) {
    try {
      await api.post(`/tasks/${task.id}/complete`, { value })
      onClose()
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed') }
  }

  return (
    <Modal title={task.title} onClose={onClose}>
      {task.type === 'weight' && (
        <div className="space-y-4">
          <div>
            <label className="label">Your weight today (kg)</label>
            <input type="number" step="0.1" inputMode="decimal" className="field text-lg" value={weight} onChange={e => setWeight(e.target.value)} autoFocus />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <button className="btn w-full" disabled={!(Number(weight) > 0)} onClick={() => submit({ weight_kg: Number(weight) })}>Save</button>
        </div>
      )}

      {task.type === 'readiness' && (
        <div className="space-y-4">
          {(['sleep', 'mood', 'energy', 'stress', 'soreness'] as const).map(k => (
            <div key={k}>
              <label className="label capitalize">{k === 'stress' ? 'Stress (5 = calm)' : k === 'soreness' ? 'Soreness (5 = fresh)' : k}</label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map(n => (
                  <button
                    key={n}
                    className={`h-11 flex-1 rounded-lg border text-sm font-bold ${readiness[k] === n ? 'border-transparent bg-primary text-primary-ink' : 'border-line bg-surface'}`}
                    onClick={() => setReadiness({ ...readiness, [k]: n })}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {error && <p className="text-sm text-danger">{error}</p>}
          <button className="btn w-full" onClick={() => submit(readiness)}>Save readiness</button>
        </div>
      )}

      {task.type === 'checkin_form' && (
        !form ? <p className="text-sm text-muted">Loading form...</p> : (
          <div className="space-y-4">
            {form.questions.map(q => (
              <div key={q.id}>
                <label className="label">{q.label}</label>
                {q.type === 'scale' && (
                  <div className="flex gap-1">
                    {Array.from({ length: (q.max ?? 5) - (q.min ?? 1) + 1 }, (_, i) => (q.min ?? 1) + i).map(n => (
                      <button key={n}
                        className={`h-11 flex-1 rounded-lg border text-sm font-bold ${answers[q.id] === n ? 'border-transparent bg-primary text-primary-ink' : 'border-line bg-surface'}`}
                        onClick={() => setAnswers({ ...answers, [q.id]: n })}>{n}</button>
                    ))}
                  </div>
                )}
                {q.type === 'text' && (
                  <textarea className="field min-h-20" value={String(answers[q.id] ?? '')} onChange={e => setAnswers({ ...answers, [q.id]: e.target.value })} />
                )}
                {q.type === 'number' && (
                  <input type="number" className="field" value={String(answers[q.id] ?? '')} onChange={e => setAnswers({ ...answers, [q.id]: Number(e.target.value) })} />
                )}
                {q.type === 'choice' && (
                  <div className="space-y-1">
                    {(q.options || []).map(o => (
                      <button key={o}
                        className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${answers[q.id] === o ? 'border-transparent bg-primary text-primary-ink' : 'border-line bg-surface'}`}
                        onClick={() => setAnswers({ ...answers, [q.id]: o })}>{o}</button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {error && <p className="text-sm text-danger">{error}</p>}
            <button className="btn w-full" onClick={() => submit({ answers })}>Submit check-in</button>
          </div>
        )
      )}
    </Modal>
  )
}
