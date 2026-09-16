// The KPI board. One number per row, the target next to it, and the trend from the
// readings. Adding a reading is a two-tap job so it actually gets done each week.
import { useEffect, useState } from 'react'
import { api } from '../../../lib/api'
import type { TacKpi } from '../../../lib/types'
import { Spinner, Empty, ErrorNote, Modal, LineChart } from '../../../components/ui'
import { Field } from './Todos'

const AREAS = ['classes', 'programming', 'trainheroic', 'standards', 'contract', 'general']

export default function Kpis() {
  const [kpis, setKpis] = useState<TacKpi[] | null>(null)
  const [error, setError] = useState('')
  const [reading, setReading] = useState<TacKpi | null>(null)
  const [editing, setEditing] = useState<TacKpi | 'new' | null>(null)

  const load = () => api.get<TacKpi[]>('/tac/kpis').then(setKpis).catch(e => setError(String(e.message || e)))
  useEffect(() => { load() }, [])

  if (error) return <ErrorNote error={error} />
  if (!kpis) return <Spinner />

  const areas = [...new Set(kpis.map(k => k.area))]

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button className="btn btn-sm" onClick={() => setEditing('new')}>Add a KPI</button>
      </div>

      {kpis.length === 0 && <Empty>No KPIs on the board yet</Empty>}

      {areas.map(area => (
        <section key={area} className="card p-4">
          <h2 className="mb-2 text-lg capitalize">{area}</h2>
          <ul className="divide-y divide-line">
            {kpis.filter(k => k.area === area).map(k => (
              <KpiRow key={k.id} kpi={k} onReading={() => setReading(k)} onEdit={() => setEditing(k)} />
            ))}
          </ul>
        </section>
      ))}

      {reading && <ReadingModal kpi={reading} onClose={() => setReading(null)} onSaved={() => { setReading(null); load() }} />}
      {editing && (
        <KpiModal
          kpi={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}
    </div>
  )
}

function KpiRow({ kpi, onReading, onEdit }: { kpi: TacKpi; onReading: () => void; onEdit: () => void }) {
  const [open, setOpen] = useState(false)
  const latest = kpi.readings.at(-1)
  const previous = kpi.readings.at(-2)
  const hitting = latest && kpi.target != null
    ? (kpi.direction === 'up' ? latest.value >= kpi.target : latest.value <= kpi.target)
    : null
  const delta = latest && previous ? latest.value - previous.value : null
  // "Better" depends on the KPI's direction: a falling no-show rate is good news.
  const improving = delta == null ? null : (kpi.direction === 'up' ? delta > 0 : delta < 0)

  return (
    <li className="py-3">
      <div className="flex items-start justify-between gap-3">
        <button className="min-w-0 flex-1 text-left" onClick={() => setOpen(!open)}>
          <div className="font-medium">{kpi.name}</div>
          <div className="mt-0.5 text-xs text-muted">
            {kpi.cadence}
            {kpi.target != null && ` · target ${kpi.direction === 'up' ? '≥' : '≤'} ${kpi.target}${kpi.unit}`}
            {latest && ` · last ${latest.period}`}
          </div>
        </button>
        <div className="shrink-0 text-right">
          <div className={`text-2xl font-bold ${hitting === false ? 'text-danger' : hitting ? 'text-ok' : ''}`}>
            {latest ? `${latest.value}${kpi.unit}` : '—'}
          </div>
          {delta != null && delta !== 0 && (
            <div className={`text-xs ${improving ? 'text-ok' : 'text-danger'}`}>
              {delta > 0 ? '+' : ''}{Math.round(delta * 10) / 10}{kpi.unit} on last
            </div>
          )}
        </div>
      </div>

      {open && (
        <div className="mt-3 space-y-3">
          {kpi.notes && <p className="text-sm text-muted">{kpi.notes}</p>}
          {kpi.readings.length >= 2
            ? <LineChart points={kpi.readings.map(r => ({ x: r.period, y: r.value }))} unit={kpi.unit} />
            : <p className="text-sm text-muted">Needs two readings before a trend means anything.</p>}
          {kpi.readings.length > 0 && (
            <ul className="text-sm">
              {[...kpi.readings].reverse().slice(0, 6).map(r => (
                <li key={r.id} className="flex justify-between border-b border-line py-1 last:border-0">
                  <span className="text-muted">{r.period}</span>
                  <span className="font-medium">{r.value}{kpi.unit}{r.note ? ` · ${r.note}` : ''}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <button className="btn btn-sm" onClick={onReading}>Add reading</button>
            <button className="btn btn-ghost btn-sm" onClick={onEdit}>Edit</button>
          </div>
        </div>
      )}
    </li>
  )
}

function ReadingModal({ kpi, onClose, onSaved }: { kpi: TacKpi; onClose: () => void; onSaved: () => void }) {
  const [period, setPeriod] = useState(defaultPeriod(kpi.cadence))
  const [value, setValue] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  async function save() {
    try {
      await api.post(`/tac/kpis/${kpi.id}/readings`, { period, value: Number(value), note })
      onSaved()
    } catch (e) { setError(String((e as Error).message)) }
  }

  const existing = kpi.readings.find(r => r.period === period)

  return (
    <Modal title={kpi.name} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Period">
          <input className="field" value={period} onChange={e => setPeriod(e.target.value)} />
        </Field>
        <Field label={`Value${kpi.unit ? ` (${kpi.unit})` : ''}`}>
          <input type="number" step="any" autoFocus className="field" value={value} onChange={e => setValue(e.target.value)} />
        </Field>
        <Field label="Note">
          <input className="field" value={note} onChange={e => setNote(e.target.value)} />
        </Field>
        {existing && <p className="text-sm text-muted">{period} is already {existing.value}{kpi.unit}. Saving replaces it.</p>}
        <ErrorNote error={error} />
        <div className="flex justify-end gap-2">
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn btn-sm" onClick={save}>Save</button>
        </div>
      </div>
    </Modal>
  )
}

function KpiModal({ kpi, onClose, onSaved }: { kpi: TacKpi | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: kpi?.name ?? '', area: kpi?.area ?? 'classes', unit: kpi?.unit ?? '',
    target: kpi?.target == null ? '' : String(kpi.target),
    direction: kpi?.direction ?? 'up',
    cadence: kpi?.cadence ?? 'monthly',
    notes: kpi?.notes ?? '',
  })
  const [error, setError] = useState('')

  async function save() {
    if (!form.name.trim()) { setError('Give it a name'); return }
    try {
      const body = { ...form, target: form.target === '' ? null : Number(form.target) }
      if (kpi) await api.put(`/tac/kpis/${kpi.id}`, body)
      else await api.post('/tac/kpis', body)
      onSaved()
    } catch (e) { setError(String((e as Error).message)) }
  }

  return (
    <Modal title={kpi ? 'Edit KPI' : 'New KPI'} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Name"><input className="field" autoFocus value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Area">
            <select className="field" value={form.area} onChange={e => setForm({ ...form, area: e.target.value })}>
              {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </Field>
          <Field label="Cadence">
            <select className="field" value={form.cadence} onChange={e => setForm({ ...form, cadence: e.target.value as TacKpi['cadence'] })}>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
            </select>
          </Field>
          <Field label="Target"><input type="number" step="any" className="field" value={form.target} onChange={e => setForm({ ...form, target: e.target.value })} /></Field>
          <Field label="Unit"><input className="field" placeholder="% or people" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} /></Field>
          <Field label="Good is">
            <select className="field" value={form.direction} onChange={e => setForm({ ...form, direction: e.target.value as 'up' | 'down' })}>
              <option value="up">Higher</option>
              <option value="down">Lower</option>
            </select>
          </Field>
        </div>
        <Field label="Notes"><textarea className="field" rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field>
        <ErrorNote error={error} />
        <div className="flex justify-between gap-2">
          {kpi
            ? <button className="btn btn-ghost btn-sm" onClick={() => api.del(`/tac/kpis/${kpi.id}`).then(onSaved)}>Delete</button>
            : <span />}
          <span className="flex gap-2">
            <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
            <button className="btn btn-sm" onClick={save}>Save</button>
          </span>
        </div>
      </div>
    </Modal>
  )
}

// Weekly KPIs are keyed by ISO week, everything else by month or quarter, so the
// periods sort lexically and line up on the chart without extra date handling.
function defaultPeriod(cadence: TacKpi['cadence']): string {
  const now = new Date()
  const y = now.getFullYear()
  if (cadence === 'monthly') return `${y}-${String(now.getMonth() + 1).padStart(2, '0')}`
  if (cadence === 'quarterly') return `${y}-Q${Math.floor(now.getMonth() / 3) + 1}`
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
  const week1 = new Date(d.getFullYear(), 0, 4)
  const week = 1 + Math.round(((d.getTime() - week1.getTime()) / 864e5 - 3 + ((week1.getDay() + 6) % 7)) / 7)
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`
}
