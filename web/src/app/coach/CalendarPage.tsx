// Coach calendar: week strip x owner selector, sessions + health tasks per day.
// Copy / delete / publish per session; click through to the Session Builder.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, ApiError, todayIso, mondayOf, shiftIso, fmtDate } from '../../lib/api'
import type { AthleteRow, CalendarData, Team, Workout, HealthTask } from '../../lib/types'
import { useBrand } from '../../App'
import { Spinner, Modal } from '../../components/ui'
import SessionBuilder from './SessionBuilder'
import AssignTaskModal from './AssignTaskModal'
import { summariseExercise } from '../../lib/params'

const TASK_ICONS: Record<string, string> = {
  weight: '⚖️', water: '💧', supplement: '💊', habit: '✅', checkin_form: '📝', readiness: '🌤️', note: '📌',
}

export default function CalendarPage() {
  const brand = useBrand()
  const [params, setParams] = useSearchParams()
  const [athletes, setAthletes] = useState<AthleteRow[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [weekStart, setWeekStart] = useState(mondayOf(todayIso()))
  const [data, setData] = useState<CalendarData | null>(null)
  const [editing, setEditing] = useState<Workout | null>(null)
  const [taskDay, setTaskDay] = useState<string | null>(null)
  const [copying, setCopying] = useState<Workout | null>(null)

  const ownerType = (params.get('team') ? 'team' : 'athlete') as 'athlete' | 'team'
  const ownerId = Number(params.get('team') || params.get('athlete') || 0)

  useEffect(() => {
    api.get<AthleteRow[]>('/athletes').then(rows => {
      setAthletes(rows)
      if (!ownerId && rows.length) setParams({ athlete: String(rows[0].id) }, { replace: true })
    })
    if (brand.flags.teams) api.get<Team[]>('/teams').then(setTeams)
  }, [])

  const reload = useCallback(() => {
    if (!ownerId) return
    api.get<CalendarData>(
      `/calendar?ownerType=${ownerType}&ownerId=${ownerId}&from=${weekStart}&to=${shiftIso(weekStart, 6)}`
    ).then(setData).catch(console.error)
  }, [ownerType, ownerId, weekStart])

  useEffect(reload, [reload])

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => shiftIso(weekStart, i)), [weekStart])

  if (!ownerId) return <Spinner />

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl">Calendar</h1>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="field !min-h-10 w-56 py-1"
            value={`${ownerType}:${ownerId}`}
            onChange={e => {
              const [t, id] = e.target.value.split(':')
              setParams(t === 'team' ? { team: id } : { athlete: id })
            }}
          >
            <optgroup label={brand.terms.athletes}>
              {athletes.map(a => <option key={a.id} value={`athlete:${a.id}`}>{a.name}</option>)}
            </optgroup>
            {brand.flags.teams && teams.length > 0 && (
              <optgroup label="Teams">
                {teams.map(t => <option key={t.id} value={`team:${t.id}`}>{t.name}</option>)}
              </optgroup>
            )}
          </select>
          <div className="flex items-center gap-1">
            <button className="btn btn-ghost btn-sm" onClick={() => setWeekStart(shiftIso(weekStart, -7))}>←</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setWeekStart(mondayOf(todayIso()))}>This week</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setWeekStart(shiftIso(weekStart, 7))}>→</button>
          </div>
        </div>
      </div>

      {!data ? <Spinner /> : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-7">
          {days.map(day => (
            <DayCell
              key={day}
              day={day}
              data={data}
              onNew={() => api.post<{ id: number }>('/workouts', { ownerType, ownerId, date: day, title: 'Session' })
                .then(({ id }) => api.get<Workout>(`/workouts/${id}`)).then(w => { setEditing(w); reload() })}
              onNewTask={() => setTaskDay(day)}
              onOpen={w => setEditing(w)}
              onCopy={w => setCopying(w)}
              onDelete={async w => {
                if (!confirm(`Delete "${w.title}"?`)) return
                try {
                  await api.del(`/workouts/${w.id}`)
                } catch (err) {
                  // 409: the session has logged results, which deleting would destroy.
                  if (err instanceof ApiError && err.status === 409) {
                    if (!confirm(`${err.message}.\n\nDelete anyway and lose that logged training?`)) return
                    await api.del(`/workouts/${w.id}?force=1`)
                  } else throw err
                }
                reload()
              }}
              onPublishToggle={w => api.put(`/workouts/${w.id}`, { status: w.status === 'published' ? 'draft' : 'published' }).then(reload)}
              onDeleteTask={t => api.del(`/tasks/${t.id}`).then(reload)}
            />
          ))}
        </div>
      )}

      {editing && (
        <SessionBuilder
          workout={editing}
          athleteId={ownerType === 'athlete' ? ownerId : undefined}
          onClose={() => { setEditing(null); reload() }}
        />
      )}
      {taskDay && (
        <AssignTaskModal
          ownerType={ownerType} ownerId={ownerId} date={taskDay}
          onClose={() => { setTaskDay(null); reload() }}
        />
      )}
      {copying && (
        <CopyModal workout={copying} onClose={() => { setCopying(null); reload() }} />
      )}
    </div>
  )
}

function DayCell({ day, data, onNew, onNewTask, onOpen, onCopy, onDelete, onPublishToggle, onDeleteTask }: {
  day: string; data: CalendarData
  onNew: () => void; onNewTask: () => void
  onOpen: (w: Workout) => void; onCopy: (w: Workout) => void; onDelete: (w: Workout) => void
  onPublishToggle: (w: Workout) => void; onDeleteTask: (t: HealthTask) => void
}) {
  const workouts = data.workouts.filter(w => w.date === day)
  const tasks = data.tasks.filter(t => t.date === day)
  const isToday = day === todayIso()
  return (
    <div className={`tile flex min-h-44 flex-col p-2 ${isToday ? 'outline outline-2 outline-primary' : ''}`}>
      <div className="mb-1 flex items-center justify-between">
        <span className={`text-xs font-bold ${isToday ? 'text-primary' : 'text-muted'}`}>{fmtDate(day)}</span>
        <span className="flex gap-1">
          <button className="rounded px-1 text-xs text-muted hover:bg-surface2" title="Add health task" onClick={onNewTask}>+task</button>
          <button className="rounded px-1 text-xs text-muted hover:bg-surface2" title="Add session" onClick={onNew}>+session</button>
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1.5">
        {workouts.map(w => {
          const done = data.results.some(r => r.workout_id === w.id)
          return (
            <div key={w.id} className="group rounded-lg border border-line bg-surface p-2">
              <button className="w-full text-left" onClick={() => onOpen(w)}>
                <div className="flex items-center justify-between gap-1">
                  <span className="truncate text-sm font-semibold">{w.title}</span>
                  {done ? <span title="Logged" className="text-ok">●</span>
                    : w.status === 'draft' ? <span className="rounded bg-surface2 px-1 text-[10px] uppercase text-muted">draft</span> : null}
                </div>
                <div className="truncate text-[11px] text-muted">
                  {w.content.blocks.flatMap(b => b.exercises).slice(0, 2).map(e => e.name).join(' · ') || 'Empty'}
                </div>
              </button>
              {/* Always visible: hover-only actions are unreachable by keyboard and on tablets. */}
              <div className="mt-1 flex gap-1">
                <button className="rounded bg-surface2 px-1.5 py-0.5 text-[11px]" onClick={() => onPublishToggle(w)}>
                  {w.status === 'published' ? 'Unpublish' : 'Publish'}
                </button>
                <button className="rounded bg-surface2 px-1.5 py-0.5 text-[11px]" onClick={() => onCopy(w)}>Copy</button>
                <button className="rounded bg-surface2 px-1.5 py-0.5 text-[11px] text-danger" onClick={() => onDelete(w)}>Delete</button>
              </div>
            </div>
          )
        })}
        {tasks.map(t => {
          const done = data.completions.some(c => c.task_id === t.id)
          return (
            <div key={t.id} className="group flex items-center gap-1.5 rounded-lg bg-surface2/60 px-2 py-1 text-xs">
              <span aria-hidden>{TASK_ICONS[t.type] || '•'}</span>
              <span className={`flex-1 truncate ${done ? 'line-through opacity-60' : ''}`}>{t.title}</span>
              {done && <span className="text-ok">✓</span>}
              <button className="px-1 text-danger" aria-label={`Remove task: ${t.title}`} title="Remove task" onClick={() => onDeleteTask(t)}>✕</button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CopyModal({ workout, onClose }: { workout: Workout; onClose: () => void }) {
  const [toDate, setToDate] = useState(shiftIso(workout.date, 7))
  return (
    <Modal title={`Copy "${workout.title}"`} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-muted">Copies land as drafts, one week ahead by default. First exercise: {
          workout.content.blocks[0]?.exercises[0] ? summariseExercise(workout.content.blocks[0].exercises[0]) : 'none'
        }</p>
        <div>
          <label className="label">Copy to date</label>
          <input type="date" className="field" value={toDate} onChange={e => setToDate(e.target.value)} />
        </div>
        <button className="btn w-full" onClick={() => api.post(`/workouts/${workout.id}/copy`, { toDate }).then(onClose)}>
          Copy session
        </button>
      </div>
    </Modal>
  )
}
