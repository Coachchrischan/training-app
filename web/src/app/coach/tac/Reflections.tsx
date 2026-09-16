// The reflections log. Talk into it in the car or type it at the desk; either way
// it ends up in the same history, which is what makes the weekly patterns visible.
import { useEffect, useRef, useState } from 'react'
import { api, todayIso, fmtDate } from '../../../lib/api'
import type { TacReflection } from '../../../lib/types'
import { Spinner, Empty, ErrorNote } from '../../../components/ui'
import { Field } from './Todos'

const SUGGESTED_TAGS = ['programming', 'strength', 'conditioning', 'community day', 'members', 'coaches', 'room', 'scaling', 'trainheroic', 'operations']

export default function Reflections() {
  const [rows, setRows] = useState<TacReflection[] | null>(null)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')

  const load = () => api.get<TacReflection[]>('/tac/reflections')
    .then(setRows).catch(e => setError(String(e.message || e)))

  useEffect(() => { load() }, [])

  if (error) return <ErrorNote error={error} />
  if (!rows) return <Spinner />

  const visible = filter ? rows.filter(r => (r.tags || []).includes(filter)) : rows
  const allTags = [...new Set(rows.flatMap(r => r.tags || []))].sort()

  return (
    <div className="space-y-4">
      <Composer onSaved={load} />

      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            className={`rounded-full px-3 py-1 text-xs ${!filter ? 'bg-primary text-primary-ink' : 'tile'}`}
            onClick={() => setFilter('')}
          >All</button>
          {allTags.map(t => (
            <button
              key={t}
              className={`rounded-full px-3 py-1 text-xs ${filter === t ? 'bg-primary text-primary-ink' : 'tile'}`}
              onClick={() => setFilter(t)}
            >{t}</button>
          ))}
        </div>
      )}

      {visible.length === 0 ? <Empty>Nothing logged yet</Empty> : (
        <div className="space-y-3">
          {visible.map(r => (
            <article key={r.id} className="card p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-base font-semibold">{r.title || fmtDate(r.date)}</h3>
                <span className="text-xs text-muted">
                  {fmtDate(r.date)}{r.source === 'voice' ? ' · dictated' : ''}
                </span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm">{r.body}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                {r.changed_something === 1 && (
                  <span className="rounded-full border border-line px-2 py-0.5 font-semibold text-ok">changed something</span>
                )}
                {(r.tags || []).map(t => (
                  <span key={t} className="rounded-full border border-line px-2 py-0.5 text-muted">{t}</span>
                ))}
                <button
                  className="btn-ghost btn btn-sm ml-auto"
                  onClick={() => api.del(`/tac/reflections/${r.id}`).then(load)}
                >Delete</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}

function Composer({ onSaved }: { onSaved: () => void }) {
  const [form, setForm] = useState({ date: todayIso(), title: '', body: '', changedSomething: false })
  const [tags, setTags] = useState<string[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const { supported, listening, start, stop, transcript, reset, speechError } = useDictation()
  const bodyAtStart = useRef('')

  // Dictation appends to whatever is already in the box rather than replacing it,
  // so a voice note can be topped up by typing without losing either half.
  const body = listening || transcript ? `${bodyAtStart.current}${bodyAtStart.current && transcript ? ' ' : ''}${transcript}` : form.body

  async function save() {
    const text = body.trim()
    if (!text) { setError('Say or type something first'); return }
    setBusy(true); setError('')
    try {
      await api.post('/tac/reflections', {
        date: form.date,
        title: form.title,
        body: text,
        tags,
        source: transcript ? 'voice' : 'typed',
        changedSomething: form.changedSomething,
      })
      setForm({ date: todayIso(), title: '', body: '', changedSomething: false })
      setTags([])
      reset()
      bodyAtStart.current = ''
      onSaved()
    } catch (e) { setError(String((e as Error).message)) }
    setBusy(false)
  }

  return (
    <section className="card p-4">
      <h2 className="mb-3 text-lg">Add a reflection</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Date">
          <input type="date" className="field" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
        </Field>
        <Field label="Title (optional)">
          <input className="field" placeholder="The one-line version" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
        </Field>
      </div>

      <div className="mt-3">
        <Field label="What changed, and why">
          <textarea
            className="field"
            rows={5}
            value={body}
            onChange={e => { reset(); bodyAtStart.current = ''; setForm({ ...form, body: e.target.value }) }}
            placeholder="Talk or type. The thing that changed this week, what caused it, and what you are doing about it."
          />
        </Field>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {supported ? (
          <button
            className={`btn btn-sm ${listening ? 'bg-danger' : ''}`}
            onClick={() => {
              if (listening) { stop(); setForm({ ...form, body }); bodyAtStart.current = '' }
              else { bodyAtStart.current = body; start() }
            }}
          >
            {listening ? 'Stop recording' : 'Dictate'}
          </button>
        ) : (
          <span className="text-xs text-muted">
            Dictation needs Chrome or Safari. On any phone, the keyboard microphone works in the box above.
          </span>
        )}
        {listening && <span className="text-xs text-muted">Listening...</span>}
        <label className="ml-auto flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.changedSomething}
            onChange={e => setForm({ ...form, changedSomething: e.target.checked })}
          />
          This changed the programming
        </label>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {SUGGESTED_TAGS.map(t => (
          <button
            key={t}
            className={`rounded-full px-3 py-1 text-xs ${tags.includes(t) ? 'bg-primary text-primary-ink' : 'tile'}`}
            onClick={() => setTags(tags.includes(t) ? tags.filter(x => x !== t) : [...tags, t])}
          >{t}</button>
        ))}
      </div>

      <ErrorNote error={speechError || error} />
      <button className="btn btn-sm mt-3" onClick={save} disabled={busy}>Save reflection</button>
    </section>
  )
}

// Minimal Web Speech wrapper. Chrome and Safari only; everything else falls back to
// the phone keyboard's own microphone, which is why the button simply hides.
interface SpeechResultLike { isFinal: boolean; 0: { transcript: string } }
interface RecognitionLike {
  continuous: boolean; interimResults: boolean; lang: string
  start(): void; stop(): void
  onresult: ((e: { resultIndex: number; results: ArrayLike<SpeechResultLike> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}

function useDictation() {
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [speechError, setSpeechError] = useState('')
  const recognition = useRef<RecognitionLike | null>(null)
  const finalText = useRef('')

  const Ctor = typeof window !== 'undefined'
    ? ((window as unknown as Record<string, unknown>).SpeechRecognition
      || (window as unknown as Record<string, unknown>).webkitSpeechRecognition) as (new () => RecognitionLike) | undefined
    : undefined

  useEffect(() => () => { recognition.current?.stop() }, [])

  function start() {
    if (!Ctor) return
    setSpeechError('')
    const rec = new Ctor()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = 'en-AU'
    rec.onresult = e => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        if (res.isFinal) finalText.current += res[0].transcript
        else interim += res[0].transcript
      }
      setTranscript((finalText.current + interim).trimStart())
    }
    rec.onerror = e => {
      setSpeechError(e.error === 'not-allowed'
        ? 'Microphone access was blocked. Allow it in the browser settings and try again.'
        : `Dictation stopped: ${e.error}`)
      setListening(false)
    }
    rec.onend = () => setListening(false)
    recognition.current = rec
    rec.start()
    setListening(true)
  }

  function stop() {
    recognition.current?.stop()
    setListening(false)
  }

  function reset() {
    finalText.current = ''
    setTranscript('')
  }

  return { supported: !!Ctor, listening, start, stop, transcript, reset, speechError }
}
