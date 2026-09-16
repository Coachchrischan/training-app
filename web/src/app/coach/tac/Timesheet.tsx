// Hours against the 6 to 10 hour contract, from the start date on Mon 14 Sep.
// Weeks run Monday to Sunday because that is how the contract is counted.
import { useEffect, useMemo, useState } from 'react'
import { api, todayIso, mondayOf, shiftIso, fmtDate } from '../../../lib/api'
import type { TacTimeEntry, TacContract, TacTimeCategory } from '../../../lib/types'
import { Spinner, Empty, ErrorNote } from '../../../components/ui'
import { fmtHours } from './Overview'
import { Field } from './Todos'

const CATEGORIES: TacTimeCategory[] = ['coaching', 'programming', 'admin', 'meeting', 'content', 'setup', 'travel']

export default function Timesheet() {
  const [entries, setEntries] = useState<TacTimeEntry[] | null>(null)
  const [contract, setContract] = useState<TacContract | null>(null)
  const [error, setError] = useState('')

  const load = () => api.get<{ entries: TacTimeEntry[]; contract: TacContract }>('/tac/timesheet')
    .then(r => { setEntries(r.entries); setContract(r.contract) })
    .catch(e => setError(String(e.message || e)))

  useEffect(() => { load() }, [])

  const weeks = useMemo(() => {
    if (!entries || !contract) return []
    const byWeek = new Map<string, TacTimeEntry[]>()
    // Every week from the contract start to this week appears, even empty ones. A
    // week with nothing logged is the week most worth seeing.
    for (let w = mondayOf(contract.start); w <= mondayOf(todayIso()); w = shiftIso(w, 7)) byWeek.set(w, [])
    for (const e of entries) {
      const w = mondayOf(e.date)
      if (!byWeek.has(w)) byWeek.set(w, [])
      byWeek.get(w)!.push(e)
    }
    return [...byWeek.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([week, rows]) => ({ week, rows, minutes: rows.reduce((s, r) => s + r.minutes, 0) }))
  }, [entries, contract])

  if (error) return <ErrorNote error={error} />
  if (!entries || !contract) return <Spinner />

  const totalMinutes = entries.reduce((s, e) => s + e.minutes, 0)
  const byCategory = CATEGORIES
    .map(c => ({ c, m: entries.filter(e => e.category === c).reduce((s, e) => s + e.minutes, 0) }))
    .filter(x => x.m > 0)

  return (
    <div className="space-y-4">
      <section className="card p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg">Since {fmtDate(contract.start)}</h2>
          <span className="text-xs text-muted">Contracted {contract.minHours} to {contract.maxHours} hours per week</span>
        </div>
        <div className="mt-1 text-4xl font-bold">{fmtHours(totalMinutes / 60)}</div>
        {byCategory.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {byCategory.map(x => (
              <span key={x.c} className="rounded-full border border-line px-2 py-0.5 text-muted">
                {x.c} {fmtHours(x.m / 60)}
              </span>
            ))}
          </div>
        )}
        <button className="btn btn-ghost btn-sm mt-3" onClick={() => downloadCsv(entries)}>Export CSV</button>
      </section>

      <AddEntry onAdded={load} />

      {weeks.map(({ week, rows, minutes }) => {
        const hours = minutes / 60
        const state = hours < contract.minHours ? 'under' : hours > contract.maxHours ? 'over' : 'in'
        return (
          <section key={week} className="card p-4">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-base font-semibold">
                Week of {fmtDate(week)}
              </h3>
              <span className={`text-sm font-semibold ${state === 'in' ? 'text-ok' : state === 'over' ? 'text-danger' : 'text-muted'}`}>
                {fmtHours(hours)}
                <span className="ml-2 text-xs font-normal text-muted">
                  {state === 'in' ? 'in band' : state === 'over' ? `${fmtHours(hours - contract.maxHours)} over` : `${fmtHours(contract.minHours - hours)} short`}
                </span>
              </span>
            </div>
            {rows.length === 0 ? <Empty>Nothing logged this week</Empty> : (
              <ul className="divide-y divide-line text-sm">
                {rows.sort((a, b) => a.date.localeCompare(b.date)).map(e => (
                  <li key={e.id} className="flex items-start justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <div className="font-medium">{fmtDate(e.date)}</div>
                      <div className="text-muted">
                        {e.start_time && e.end_time ? `${e.start_time}–${e.end_time} · ` : ''}{e.category}
                      </div>
                      {e.notes && <div className="mt-0.5 text-muted">{e.notes}</div>}
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="font-semibold">{fmtHours(e.minutes / 60)}</span>
                      <button
                        className="btn-ghost btn btn-sm"
                        aria-label={`Delete ${e.date} entry`}
                        onClick={() => api.del(`/tac/timesheet/${e.id}`).then(load)}
                      >✕</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}

function AddEntry({ onAdded }: { onAdded: () => void }) {
  const [form, setForm] = useState({
    date: todayIso(), startTime: '', endTime: '', minutes: '',
    category: 'coaching' as TacTimeCategory, notes: '',
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Typing a start and end is faster than doing the arithmetic, so show the
  // derived duration live and let the minutes box stay empty most of the time.
  const derived = form.startTime && form.endTime ? span(form.startTime, form.endTime) : 0

  async function save() {
    setBusy(true); setError('')
    try {
      await api.post('/tac/timesheet', { ...form, minutes: form.minutes ? Number(form.minutes) : undefined })
      setForm({ ...form, startTime: '', endTime: '', minutes: '', notes: '' })
      onAdded()
    } catch (e) { setError(String((e as Error).message)) }
    setBusy(false)
  }

  return (
    <section className="card p-4">
      <h2 className="mb-3 text-lg">Log hours</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Date">
          <input type="date" className="field" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
        </Field>
        <Field label="Start">
          <input type="time" className="field" value={form.startTime} onChange={e => setForm({ ...form, startTime: e.target.value })} />
        </Field>
        <Field label="End">
          <input type="time" className="field" value={form.endTime} onChange={e => setForm({ ...form, endTime: e.target.value })} />
        </Field>
        <Field label="Category">
          <select className="field" value={form.category} onChange={e => setForm({ ...form, category: e.target.value as TacTimeCategory })}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label={derived ? `Minutes (${fmtHours(derived / 60)} from the times)` : 'Minutes (if no times)'}>
          <input
            type="number" min="1" className="field" placeholder={derived ? String(derived) : ''}
            value={form.minutes} onChange={e => setForm({ ...form, minutes: e.target.value })}
          />
        </Field>
        <Field label="Notes">
          <input className="field" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
        </Field>
      </div>
      <ErrorNote error={error} />
      <button className="btn btn-sm mt-3" onClick={save} disabled={busy}>Add entry</button>
    </section>
  )
}

function span(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const mins = (eh * 60 + em) - (sh * 60 + sm)
  return mins < 0 ? mins + 1440 : mins
}

function downloadCsv(entries: TacTimeEntry[]) {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const rows = [
    ['date', 'start', 'end', 'minutes', 'hours', 'category', 'notes'].join(','),
    ...entries.map(e => [e.date, e.start_time ?? '', e.end_time ?? '', e.minutes, (e.minutes / 60).toFixed(2), e.category, e.notes].map(esc).join(',')),
  ].join('\n')
  const url = URL.createObjectURL(new Blob([rows], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `tac-timesheet-${todayIso()}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
