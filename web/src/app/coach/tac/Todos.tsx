// The TAC to-do list. Grouped by priority rather than by project, because at 5am
// the only question is what has to happen today.
import { useEffect, useState } from 'react'
import { api, todayIso, fmtDate } from '../../../lib/api'
import type { TacTodo, TacKpi, TacTodoStatus } from '../../../lib/types'
import { Spinner, Empty, ErrorNote, Modal } from '../../../components/ui'

const AREAS = ['classes', 'programming', 'trainheroic', 'standards', 'coaching', 'admin', 'content', 'contract', 'general']
const PRIORITIES: { id: TacTodo['priority']; label: string }[] = [
  { id: 'now', label: 'Now' },
  { id: 'normal', label: 'Next' },
  { id: 'later', label: 'Later' },
]

export default function Todos() {
  const [todos, setTodos] = useState<TacTodo[] | null>(null)
  const [kpis, setKpis] = useState<TacKpi[]>([])
  const [showDone, setShowDone] = useState(false)
  const [editing, setEditing] = useState<TacTodo | 'new' | null>(null)
  const [error, setError] = useState('')

  const load = () => Promise.all([
    api.get<TacTodo[]>(`/tac/todos?includeDone=${showDone ? '1' : '0'}`),
    api.get<TacKpi[]>('/tac/kpis'),
  ]).then(([t, k]) => { setTodos(t); setKpis(k) }).catch(e => setError(String(e.message || e)))

  useEffect(() => { load() }, [showDone])

  async function setStatus(t: TacTodo, status: TacTodoStatus) {
    await api.patch(`/tac/todos/${t.id}`, { status })
    load()
  }

  if (error) return <ErrorNote error={error} />
  if (!todos) return <Spinner />

  const today = todayIso()

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} />
          Show completed
        </label>
        <button className="btn btn-sm" onClick={() => setEditing('new')}>Add a to-do</button>
      </div>

      {todos.length === 0 && <Empty>Nothing on the list</Empty>}

      {PRIORITIES.map(p => {
        const rows = todos.filter(t => t.priority === p.id && t.status !== 'done')
        if (!rows.length) return null
        return (
          <section key={p.id} className="card p-4">
            <h2 className="mb-2 text-lg">{p.label}</h2>
            <ul className="divide-y divide-line">
              {rows.map(t => (
                <Row key={t.id} todo={t} today={today} kpis={kpis} onEdit={() => setEditing(t)} onStatus={setStatus} />
              ))}
            </ul>
          </section>
        )
      })}

      {showDone && todos.some(t => t.status === 'done') && (
        <section className="card p-4 opacity-70">
          <h2 className="mb-2 text-lg">Done</h2>
          <ul className="divide-y divide-line">
            {todos.filter(t => t.status === 'done').map(t => (
              <Row key={t.id} todo={t} today={today} kpis={kpis} onEdit={() => setEditing(t)} onStatus={setStatus} />
            ))}
          </ul>
        </section>
      )}

      {editing && (
        <TodoModal
          todo={editing === 'new' ? null : editing}
          kpis={kpis}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}
    </div>
  )
}

function Row({ todo, today, kpis, onEdit, onStatus }: {
  todo: TacTodo; today: string; kpis: TacKpi[]
  onEdit: () => void; onStatus: (t: TacTodo, s: TacTodoStatus) => void
}) {
  const overdue = todo.due && todo.due < today && todo.status !== 'done'
  const kpi = kpis.find(k => k.id === todo.kpi_id)
  return (
    <li className="py-2">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1.5"
          checked={todo.status === 'done'}
          onChange={e => onStatus(todo, e.target.checked ? 'done' : 'open')}
          aria-label={`Mark ${todo.title} done`}
        />
        <button className="min-w-0 flex-1 text-left" onClick={onEdit}>
          <div className={`font-medium ${todo.status === 'done' ? 'line-through opacity-60' : ''}`}>{todo.title}</div>
          {todo.detail && <div className="mt-0.5 text-sm text-muted">{todo.detail}</div>}
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
            <Chip>{todo.area}</Chip>
            {todo.status === 'doing' && <Chip tone="ok">in progress</Chip>}
            {todo.status === 'blocked' && <Chip tone="warn">blocked</Chip>}
            {todo.owner !== 'Chris' && <Chip>{todo.owner}</Chip>}
            {kpi && <Chip>KPI: {kpi.name}</Chip>}
            {todo.due && <span className={overdue ? 'font-semibold text-danger' : ''}>{fmtDate(todo.due)}</span>}
          </div>
        </button>
      </div>
    </li>
  )
}

function Chip({ children, tone }: { children: React.ReactNode; tone?: 'ok' | 'warn' }) {
  const colour = tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-danger' : 'text-muted'
  return <span className={`rounded-full border border-line px-2 py-0.5 ${colour}`}>{children}</span>
}

function TodoModal({ todo, kpis, onClose, onSaved }: {
  todo: TacTodo | null; kpis: TacKpi[]; onClose: () => void; onSaved: () => void
}) {
  const [form, setForm] = useState({
    title: todo?.title ?? '',
    detail: todo?.detail ?? '',
    area: todo?.area ?? 'general',
    priority: todo?.priority ?? 'normal',
    owner: todo?.owner ?? 'Chris',
    due: todo?.due ?? '',
    status: todo?.status ?? 'open',
    kpiId: todo?.kpi_id ? String(todo.kpi_id) : '',
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!form.title.trim()) { setError('Give it a title'); return }
    setBusy(true)
    try {
      const body = { ...form, due: form.due || null, kpiId: form.kpiId ? Number(form.kpiId) : null }
      if (todo) await api.patch(`/tac/todos/${todo.id}`, body)
      else await api.post('/tac/todos', body)
      onSaved()
    } catch (e) {
      setError(String((e as Error).message))
      setBusy(false)
    }
  }

  async function remove() {
    if (!todo) return
    setBusy(true)
    try { await api.del(`/tac/todos/${todo.id}`); onSaved() } catch (e) { setError(String((e as Error).message)); setBusy(false) }
  }

  return (
    <Modal title={todo ? 'Edit to-do' : 'New to-do'} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Title">
          <input className="field" autoFocus value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
        </Field>
        <Field label="Detail">
          <textarea className="field" rows={3} value={form.detail} onChange={e => setForm({ ...form, detail: e.target.value })} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Area">
            <select className="field" value={form.area} onChange={e => setForm({ ...form, area: e.target.value })}>
              {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </Field>
          <Field label="Priority">
            <select className="field" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value as TacTodo['priority'] })}>
              {PRIORITIES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </Field>
          <Field label="Owner">
            <input className="field" value={form.owner} onChange={e => setForm({ ...form, owner: e.target.value })} />
          </Field>
          <Field label="Due">
            <input type="date" className="field" value={form.due ?? ''} onChange={e => setForm({ ...form, due: e.target.value })} />
          </Field>
          <Field label="Status">
            <select className="field" value={form.status} onChange={e => setForm({ ...form, status: e.target.value as TacTodoStatus })}>
              <option value="open">Open</option>
              <option value="doing">In progress</option>
              <option value="blocked">Blocked</option>
              <option value="done">Done</option>
            </select>
          </Field>
          <Field label="Linked KPI">
            <select className="field" value={form.kpiId} onChange={e => setForm({ ...form, kpiId: e.target.value })}>
              <option value="">None</option>
              {kpis.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
            </select>
          </Field>
        </div>
        <ErrorNote error={error} />
        <div className="flex justify-between gap-2 pt-1">
          {todo
            ? <button className="btn btn-ghost btn-sm" onClick={remove} disabled={busy}>Delete</button>
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

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">{label}</span>
      {children}
    </label>
  )
}
