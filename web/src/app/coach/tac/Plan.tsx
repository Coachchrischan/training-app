// The planner. A week at a time, with Google Calendar joined in both directions:
// planner items publish out through a secret ICS feed Google subscribes to, and
// Google calendars mirror in read-only so Chris can see the clash before he makes it.
import { useEffect, useState } from 'react'
import { api, todayIso, mondayOf, shiftIso, fmtDate } from '../../../lib/api'
import type { TacPlanItem, TacFeedEvent, TacFeed, TacSettings, TacPlanKind, TacTodo } from '../../../lib/types'
import { Spinner, ErrorNote, Modal } from '../../../components/ui'
import { Field } from './Todos'

const KINDS: TacPlanKind[] = ['class', 'programming', 'admin', 'meeting', 'content', 'block']
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function Plan() {
  const [weekStart, setWeekStart] = useState(mondayOf(todayIso()))
  const [items, setItems] = useState<TacPlanItem[]>([])
  const [external, setExternal] = useState<TacFeedEvent[]>([])
  const [todos, setTodos] = useState<TacTodo[]>([])
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<TacPlanItem | { date: string } | null>(null)
  const [showSync, setShowSync] = useState(false)

  const weekEnd = shiftIso(weekStart, 6)

  const load = () => Promise.all([
    api.get<{ items: TacPlanItem[]; external: TacFeedEvent[] }>(`/tac/plan?from=${weekStart}&to=${weekEnd}`),
    api.get<TacTodo[]>('/tac/todos'),
  ]).then(([p, t]) => { setItems(p.items); setExternal(p.external); setTodos(t); setReady(true) })
    .catch(e => setError(String(e.message || e)))

  useEffect(() => { setReady(false); load() }, [weekStart])

  if (error) return <ErrorNote error={error} />
  if (!ready) return <Spinner />

  const days = Array.from({ length: 7 }, (_, i) => shiftIso(weekStart, i))
  const today = todayIso()

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button className="btn btn-ghost btn-sm" onClick={() => setWeekStart(shiftIso(weekStart, -7))}>‹</button>
          <span className="text-sm font-semibold">{fmtDate(weekStart)} to {fmtDate(weekEnd)}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setWeekStart(shiftIso(weekStart, 7))}>›</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setWeekStart(mondayOf(today))}>This week</button>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => setShowSync(true)}>Google Calendar</button>
      </div>

      <div className="space-y-3">
        {days.map((d, i) => {
          const mine = items.filter(x => x.date === d)
          const theirs = external.filter(x => x.date === d)
          return (
            <section key={d} className={`card p-4 ${d === today ? 'border-primary' : ''}`}>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-base font-semibold">
                  {DAY_NAMES[i]} <span className="text-muted">{fmtDate(d).replace(/^\w+,?\s*/, '')}</span>
                </h2>
                <button className="btn btn-ghost btn-sm" onClick={() => setEditing({ date: d })}>Add</button>
              </div>

              {mine.length === 0 && theirs.length === 0 && (
                <p className="text-sm text-muted">Nothing planned</p>
              )}

              <ul className="space-y-1.5">
                {mine.map(it => (
                  <li key={`${it.id}-${it.date}`}>
                    <button
                      className="tile flex w-full items-start gap-3 p-2 text-left hover:bg-surface2"
                      onClick={() => setEditing(it)}
                    >
                      <span className="w-24 shrink-0 text-sm tabular-nums text-muted">
                        {it.start_time ? `${it.start_time}${it.end_time ? `–${it.end_time}` : ''}` : 'all day'}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{it.title}</span>
                        <span className="block text-xs text-muted">
                          {it.kind}{it.location ? ` · ${it.location}` : ''}{it.recurring ? ' · repeats' : ''}
                          {!it.billable ? ' · not billable' : ''}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
                {theirs.map(ev => (
                  <li key={ev.id} className="tile flex items-start gap-3 p-2 opacity-70">
                    <span className="w-24 shrink-0 text-sm tabular-nums text-muted">
                      {ev.start_time ? `${ev.start_time}${ev.end_time ? `–${ev.end_time}` : ''}` : 'all day'}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm">{ev.title}</span>
                      <span className="block text-xs text-muted">{ev.feed_name}{ev.location ? ` · ${ev.location}` : ''}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>

      {editing && (
        <PlanModal
          item={'id' in editing ? editing : null}
          date={'id' in editing ? editing.date : editing.date}
          todos={todos}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}
      {showSync && <SyncModal onClose={() => setShowSync(false)} onChanged={load} />}
    </div>
  )
}

function PlanModal({ item, date, todos, onClose, onSaved }: {
  item: TacPlanItem | null; date: string; todos: TacTodo[]
  onClose: () => void; onSaved: () => void
}) {
  const [form, setForm] = useState({
    date: item?.date ?? date,
    startTime: item?.start_time ?? '',
    endTime: item?.end_time ?? '',
    title: item?.title ?? '',
    kind: item?.kind ?? ('block' as TacPlanKind),
    location: item?.location ?? '',
    notes: item?.notes ?? '',
    todoId: item?.todo_id ? String(item.todo_id) : '',
    billable: item ? item.billable === 1 : true,
    rrule: item?.rrule ?? '',
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!form.title.trim()) { setError('Give it a title'); return }
    setBusy(true); setError('')
    try {
      const body = { ...form, todoId: form.todoId ? Number(form.todoId) : null }
      if (item) await api.put(`/tac/plan/${item.id}`, body)
      else await api.post('/tac/plan', body)
      onSaved()
    } catch (e) { setError(String((e as Error).message)); setBusy(false) }
  }

  async function logIt() {
    if (!item) return
    setBusy(true); setError('')
    try { await api.post(`/tac/plan/${item.id}/log`); onSaved() } catch (e) { setError(String((e as Error).message)); setBusy(false) }
  }

  return (
    <Modal title={item ? 'Edit block' : 'New block'} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Title"><input className="field" autoFocus value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Date"><input type="date" className="field" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></Field>
          <Field label="Start"><input type="time" className="field" value={form.startTime} onChange={e => setForm({ ...form, startTime: e.target.value })} /></Field>
          <Field label="End"><input type="time" className="field" value={form.endTime} onChange={e => setForm({ ...form, endTime: e.target.value })} /></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Kind">
            <select className="field" value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value as TacPlanKind })}>
              {KINDS.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </Field>
          <Field label="Location"><input className="field" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} /></Field>
          <Field label="Repeats">
            <select className="field" value={form.rrule} onChange={e => setForm({ ...form, rrule: e.target.value })}>
              <option value="">Does not repeat</option>
              <option value="FREQ=WEEKLY">Weekly on this day</option>
              <option value="FREQ=WEEKLY;BYDAY=MO,WE,FR">Weekly Mon, Wed, Fri</option>
              <option value="FREQ=WEEKLY;BYDAY=TU,TH">Weekly Tue, Thu</option>
              <option value="FREQ=WEEKLY;INTERVAL=2">Fortnightly</option>
              <option value="FREQ=MONTHLY">Monthly</option>
            </select>
          </Field>
          <Field label="Linked to-do">
            <select className="field" value={form.todoId} onChange={e => setForm({ ...form, todoId: e.target.value })}>
              <option value="">None</option>
              {todos.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Notes"><textarea className="field" rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.billable} onChange={e => setForm({ ...form, billable: e.target.checked })} />
          Counts towards the contracted hours
        </label>
        <ErrorNote error={error} />
        <div className="flex flex-wrap justify-between gap-2">
          {item
            ? <span className="flex gap-2">
                <button className="btn btn-ghost btn-sm" onClick={() => api.del(`/tac/plan/${item.id}`).then(onSaved)} disabled={busy}>Delete</button>
                <button className="btn btn-ghost btn-sm" onClick={logIt} disabled={busy}>Log to timesheet</button>
              </span>
            : <span />}
          <span className="flex gap-2">
            <button className="btn btn-ghost btn-sm" onClick={onClose} disabled={busy}>Cancel</button>
            <button className="btn btn-sm" onClick={save} disabled={busy}>Save</button>
          </span>
        </div>
      </div>
    </Modal>
  )
}

function SyncModal({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [settings, setSettings] = useState<TacSettings | null>(null)
  const [feeds, setFeeds] = useState<TacFeed[]>([])
  const [form, setForm] = useState({ name: '', url: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')

  const load = () => Promise.all([api.get<TacSettings>('/tac/settings'), api.get<TacFeed[]>('/tac/feeds')])
    .then(([s, f]) => { setSettings(s); setFeeds(f) })
    .catch(e => setError(String(e.message || e)))

  useEffect(() => { load() }, [])

  const icsUrl = settings ? `${location.origin}${settings.icsPath}` : ''

  async function addFeed() {
    setError(''); setBusy('add')
    try { await api.post('/tac/feeds', form); setForm({ name: '', url: '' }); await load() }
    catch (e) { setError(String((e as Error).message)) }
    setBusy('')
  }

  async function sync(id: number) {
    setError(''); setBusy(`sync-${id}`)
    try { await api.post(`/tac/feeds/${id}/sync`); await load(); onChanged() }
    catch (e) { setError(String((e as Error).message)) }
    setBusy('')
  }

  return (
    <Modal title="Google Calendar" onClose={onClose} wide>
      {!settings ? <Spinner /> : (
        <div className="space-y-5">
          <section>
            <h3 className="text-base font-semibold">Push the plan into Google</h3>
            <p className="mt-1 text-sm text-muted">
              In Google Calendar, go to <strong>Other calendars → From URL</strong> and paste this address.
              Everything in this planner then shows up on your phone, and it keeps itself up to date.
              Treat the address like a password: anyone who has it can read your plan.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <input className="field flex-1" readOnly value={icsUrl} onFocus={e => e.currentTarget.select()} />
              <button className="btn btn-sm" onClick={() => navigator.clipboard?.writeText(icsUrl)}>Copy</button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={async () => {
                  if (!confirm('Rotating the address stops any calendar already subscribed to the old one. Continue?')) return
                  await api.post('/tac/settings/rotate-ics')
                  load()
                }}
              >Rotate</button>
            </div>
            <p className="mt-2 text-xs text-muted">
              Google refreshes a subscribed URL on its own schedule, typically every few hours rather than instantly.
              For a change you need on the phone right now, add it in Google as well.
            </p>
          </section>

          <section>
            <h3 className="text-base font-semibold">Pull Google into the planner</h3>
            <p className="mt-1 text-sm text-muted">
              In Google Calendar, open a calendar&apos;s settings and copy its <strong>secret address in iCal format</strong>.
              Paste it here and the planner shows those events alongside the plan, read-only. Nothing is ever written
              back into Google.
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
              <input className="field" placeholder="Name, e.g. chris@coachchrischan" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              <input className="field" placeholder="https://calendar.google.com/calendar/ical/.../basic.ics" value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} />
              <button className="btn btn-sm" onClick={addFeed} disabled={busy === 'add'}>Add</button>
            </div>

            {feeds.length > 0 && (
              <ul className="mt-3 divide-y divide-line text-sm">
                {feeds.map(f => (
                  <li key={f.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <div className="font-medium">{f.name}</div>
                      <div className="text-xs text-muted">
                        {f.last_error
                          ? <span className="text-danger">{f.last_error}</span>
                          : f.last_synced_at ? `Last synced ${f.last_synced_at}` : 'Never synced'}
                      </div>
                    </div>
                    <span className="flex shrink-0 gap-2">
                      <button className="btn btn-sm" onClick={() => sync(f.id)} disabled={busy === `sync-${f.id}`}>
                        {busy === `sync-${f.id}` ? 'Syncing...' : 'Sync'}
                      </button>
                      <button className="btn-ghost btn btn-sm" onClick={() => api.del(`/tac/feeds/${f.id}`).then(() => { load(); onChanged() })}>Remove</button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <ErrorNote error={error} />
        </div>
      )}
    </Modal>
  )
}
