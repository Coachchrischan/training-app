// Library: exercise catalogue (seeded + custom), check-in form builder.
import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import type { Exercise, CheckinForm } from '../../lib/types'
import { Modal, Empty, ErrorNote } from '../../components/ui'

export default function Library() {
  const [tab, setTab] = useState<'exercises' | 'forms' | 'import'>('exercises')
  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex items-center gap-2">
        <h1 className="mr-4 text-2xl">Library</h1>
        <button className={`btn btn-sm ${tab === 'exercises' ? '' : 'btn-ghost'}`} onClick={() => setTab('exercises')}>Exercises</button>
        <button className={`btn btn-sm ${tab === 'forms' ? '' : 'btn-ghost'}`} onClick={() => setTab('forms')}>Check-in forms</button>
        <button className={`btn btn-sm ${tab === 'import' ? '' : 'btn-ghost'}`} onClick={() => setTab('import')}>Import</button>
      </div>
      {tab === 'exercises' ? <Exercises /> : tab === 'forms' ? <Forms /> : <ImportPanel />}
    </div>
  )
}

function ImportPanel() {
  const [athletes, setAthletes] = useState<{ id: number; name: string }[]>([])
  const [athleteId, setAthleteId] = useState<number | null>(null)
  const [json, setJson] = useState('')
  const [outcome, setOutcome] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<{ id: number; name: string }[]>('/athletes').then(rows => {
      setAthletes(rows)
      if (rows.length) setAthleteId(rows[0].id)
    })
  }, [])

  async function run() {
    setError(''); setOutcome('')
    let program: unknown
    try { program = JSON.parse(json) } catch { setError('That is not valid JSON'); return }
    try {
      const res = await api.post<{ imported: number; libraryMisses: string[] }>('/import/workout-builder', { athleteId, program })
      setOutcome(`Imported ${res.imported} sessions as drafts.` +
        (res.libraryMisses.length ? ` Library misses to fix: ${res.libraryMisses.join(', ')}` : ''))
    } catch (e) { setError(e instanceof Error ? e.message : 'Import failed') }
  }

  return (
    <div className="card space-y-4 p-4">
      <div>
        <h2 className="text-lg">Workout Builder import</h2>
        <p className="text-sm text-muted">
          Paste the TrainHeroic-export JSON from the CrossFit Workout Builder. Sessions land on the
          calendar as drafts; exercise names fuzzy-match the library.
        </p>
      </div>
      <div>
        <label className="label">Athlete</label>
        <select className="field max-w-60" value={athleteId ?? ''} onChange={e => setAthleteId(Number(e.target.value))}>
          {athletes.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Export JSON</label>
        <textarea className="field min-h-40 font-mono text-xs" value={json} onChange={e => setJson(e.target.value)} placeholder='{"programName": "...", "sessions": [...]}' />
      </div>
      <ErrorNote error={error} />
      {outcome && <p className="text-sm font-medium text-ok">{outcome}</p>}
      <button className="btn" disabled={!json.trim() || !athleteId} onClick={run}>Import as drafts</button>
    </div>
  )
}

function Exercises() {
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<Exercise[]>([])
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => {
      api.get<Exercise[]>(`/exercises?q=${encodeURIComponent(q)}&limit=60`).then(setRows).catch(console.error)
    }, 200)
    return () => clearTimeout(t)
  }, [q])

  return (
    <div>
      <div className="mb-3 flex gap-2">
        <input className="field" placeholder="Search the library..." value={q} onChange={e => setQ(e.target.value)} />
        <button className="btn whitespace-nowrap" onClick={() => setAdding(true)}>+ Custom exercise</button>
      </div>
      <div className="card divide-y divide-line">
        {rows.map(e => (
          <div key={e.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">
                {e.title}
                {e.custom ? <span className="ml-2 rounded bg-surface2 px-1.5 text-[10px] uppercase text-muted">custom</span> : null}
              </div>
              {e.cues && <div className="truncate text-xs text-muted">{e.cues}</div>}
            </div>
            {e.video_url && (
              <a className="shrink-0 text-xs text-primary underline" href={e.video_url} target="_blank" rel="noreferrer">video</a>
            )}
          </div>
        ))}
        {rows.length === 0 && <div className="p-6 text-center text-sm text-muted">No matches</div>}
      </div>
      {adding && <AddExercise onClose={() => { setAdding(false); setQ(q => q) }} />}
    </div>
  )
}

function AddExercise({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [cues, setCues] = useState('')
  const [error, setError] = useState('')
  return (
    <Modal title="Custom exercise" onClose={onClose}>
      <div className="space-y-4">
        <div><label className="label">Name</label><input className="field" value={title} onChange={e => setTitle(e.target.value)} autoFocus /></div>
        <div><label className="label">Video URL (optional)</label><input className="field" value={videoUrl} onChange={e => setVideoUrl(e.target.value)} placeholder="YouTube, Vimeo, anything" /></div>
        <div><label className="label">Default cues (optional)</label><textarea className="field min-h-20" value={cues} onChange={e => setCues(e.target.value)} /></div>
        <ErrorNote error={error} />
        <button className="btn w-full" disabled={!title.trim()} onClick={() =>
          api.post('/exercises', { title, videoUrl, cues })
            .then(onClose)
            .catch(e => setError(e instanceof Error ? e.message : 'Failed'))}>
          Add to library
        </button>
      </div>
    </Modal>
  )
}

type Question = CheckinForm['questions'][number]

function Forms() {
  const [forms, setForms] = useState<CheckinForm[]>([])
  const [editing, setEditing] = useState<CheckinForm | 'new' | null>(null)
  const reload = () => api.get<CheckinForm[]>('/forms').then(setForms)
  useEffect(() => { reload() }, [])

  return (
    <div>
      <button className="btn mb-3" onClick={() => setEditing('new')}>+ New form</button>
      {forms.length === 0 ? <Empty>No check-in forms yet. Build one and assign it from the calendar.</Empty> : (
        <div className="card divide-y divide-line">
          {forms.map(f => (
            <button key={f.id} className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-surface2" onClick={() => setEditing(f)}>
              <span className="font-semibold">{f.title}</span>
              <span className="text-xs text-muted">{f.questions.length} questions</span>
            </button>
          ))}
        </div>
      )}
      {editing && (
        <FormEditor
          form={editing === 'new' ? null : editing}
          onClose={() => { setEditing(null); reload() }}
        />
      )}
    </div>
  )
}

function FormEditor({ form, onClose }: { form: CheckinForm | null; onClose: () => void }) {
  const [title, setTitle] = useState(form?.title || '')
  const [questions, setQuestions] = useState<Question[]>(form?.questions || [])
  const [error, setError] = useState('')

  const add = (type: Question['type']) => setQuestions([...questions, {
    id: Math.random().toString(36).slice(2, 8),
    type,
    label: '',
    ...(type === 'scale' ? { min: 1, max: 5 } : {}),
    ...(type === 'choice' ? { options: ['', ''] } : {}),
  }])

  const patch = (id: string, p: Partial<Question>) => setQuestions(questions.map(q => q.id === id ? { ...q, ...p } : q))

  async function save() {
    try {
      if (form) await api.put(`/forms/${form.id}`, { title, questions })
      else await api.post('/forms', { title, questions })
      onClose()
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed') }
  }

  return (
    <Modal title={form ? 'Edit form' : 'New check-in form'} onClose={onClose} wide>
      <div className="space-y-4">
        <div><label className="label">Form title</label><input className="field" value={title} onChange={e => setTitle(e.target.value)} /></div>
        {questions.map((q, i) => (
          <div key={q.id} className="tile space-y-2 p-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-muted">Q{i + 1} · {q.type}</span>
              <span className="flex-1" />
              <button className="text-xs text-danger" onClick={() => setQuestions(questions.filter(x => x.id !== q.id))}>Remove</button>
            </div>
            <input className="field !min-h-9 py-1" placeholder="Question text" value={q.label} onChange={e => patch(q.id, { label: e.target.value })} />
            {q.type === 'scale' && (
              <div className="flex items-center gap-2 text-sm">
                <input type="number" className="field !min-h-9 w-16 py-1" value={q.min} onChange={e => patch(q.id, { min: Number(e.target.value) })} />
                to
                <input type="number" className="field !min-h-9 w-16 py-1" value={q.max} onChange={e => patch(q.id, { max: Number(e.target.value) })} />
              </div>
            )}
            {q.type === 'choice' && (
              <div className="space-y-1">
                {(q.options || []).map((o, oi) => (
                  <input key={oi} className="field !min-h-9 py-1 text-sm" placeholder={`Option ${oi + 1}`} value={o}
                    onChange={e => patch(q.id, { options: (q.options || []).map((x, xi) => xi === oi ? e.target.value : x) })} />
                ))}
                <button className="text-xs text-primary underline" onClick={() => patch(q.id, { options: [...(q.options || []), ''] })}>+ option</button>
              </div>
            )}
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-ghost btn-sm" onClick={() => add('scale')}>+ Scale</button>
          <button className="btn btn-ghost btn-sm" onClick={() => add('text')}>+ Free text</button>
          <button className="btn btn-ghost btn-sm" onClick={() => add('choice')}>+ Multiple choice</button>
          <button className="btn btn-ghost btn-sm" onClick={() => add('number')}>+ Number</button>
        </div>
        <ErrorNote error={error} />
        <button className="btn w-full" disabled={!title.trim() || questions.some(q => !q.label.trim())} onClick={save}>Save form</button>
      </div>
    </Modal>
  )
}
