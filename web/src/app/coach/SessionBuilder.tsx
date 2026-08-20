// The session builder: blocks -> exercises -> unlimited parameter columns.
// This is the screen that breaks TrainHeroic's two-parameter ceiling:
// a coach can stack reps + %1RM + RPE + tempo + rest on one movement.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../../lib/api'
import type { Workout, WorkoutContent, WorkoutBlock, WorkoutExercise, ParamType, MaxRow, BlockKind } from '../../lib/types'
import { PARAM_DEFS, paramDef, makeColumn, resizeColumns, rid, resolveLoad } from '../../lib/params'
import { ExercisePicker } from '../../components/ui'

const BLOCK_KINDS: { value: BlockKind; label: string }[] = [
  { value: 'standard', label: 'Standard' },
  { value: 'superset', label: 'Superset' },
  { value: 'circuit', label: 'Circuit' },
  { value: 'amrap', label: 'AMRAP' },
  { value: 'emom', label: 'EMOM' },
]

export default function SessionBuilder({ workout, athleteId, onClose }: {
  workout: Workout; athleteId?: number; onClose: () => void
}) {
  const [title, setTitle] = useState(workout.title)
  const [content, setContent] = useState<WorkoutContent>(workout.content)
  const [status, setStatus] = useState(workout.status)
  const [saveState, setSaveState] = useState<'saved' | 'dirty' | 'saving'>('saved')
  const [saveError, setSaveError] = useState('')
  const [maxes, setMaxes] = useState<Record<number, number>>({})

  useEffect(() => {
    if (!athleteId) return
    api.get<MaxRow[]>(`/athletes/${athleteId}/maxes`).then(rows => {
      const map: Record<number, number> = {}
      for (const m of rows) map[m.exercise_id] = m.value_kg
      setMaxes(map)
    }).catch(() => {})
  }, [athleteId])

  // Debounced autosave (TrainHeroic parity: the builder saves as you type).
  // The edit counter means a change made while a PUT is in flight is not marked "saved":
  // only the state that was actually sent counts as saved.
  const editSeq = useRef(0)
  const savedSeq = useRef(0)
  const latest = useRef({ title, content, status })
  latest.current = { title, content, status }

  const save = useCallback(async () => {
    const seq = editSeq.current
    setSaveState('saving')
    try {
      await api.put(`/workouts/${workout.id}`, latest.current)
      savedSeq.current = seq
      setSaveState(editSeq.current === seq ? 'saved' : 'dirty')
      setSaveError('')
      return true
    } catch (e) {
      setSaveState('dirty')
      setSaveError(e instanceof Error ? e.message : 'Could not save')
      return false
    }
  }, [workout.id])

  useEffect(() => {
    if (saveState !== 'dirty') return
    const t = setTimeout(save, 700)
    return () => clearTimeout(t)
  }, [title, content, status, saveState, save])

  // Closing must not drop a pending debounce.
  async function closeSafely() {
    if (editSeq.current !== savedSeq.current) {
      const ok = await save()
      if (!ok && !confirm('That did not save. Close anyway and lose the last change?')) return
    }
    onClose()
  }

  const markDirty = () => { editSeq.current += 1; setSaveState('dirty') }
  const touch = (next: WorkoutContent) => { setContent(next); markDirty() }

  const setBlock = (id: string, fn: (b: WorkoutBlock) => WorkoutBlock) =>
    touch({ ...content, blocks: content.blocks.map(b => (b.id === id ? fn(b) : b)) })

  const moveBlock = (idx: number, dir: -1 | 1) => {
    const blocks = [...content.blocks]
    const j = idx + dir
    if (j < 0 || j >= blocks.length) return
    ;[blocks[idx], blocks[j]] = [blocks[j], blocks[idx]]
    touch({ ...content, blocks })
  }

  const blockLetter = (i: number) => String.fromCharCode(65 + i)

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-bg">
      <div className="mx-auto max-w-4xl p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <input
            className="field max-w-md !bg-transparent text-xl font-semibold"
            value={title}
            onChange={e => { setTitle(e.target.value); markDirty() }}
          />
          <div className="flex items-center gap-2">
            <span className={`text-xs ${saveError ? 'font-semibold text-danger' : 'text-muted'}`}>
              {saveError ? `Not saved: ${saveError}` : saveState === 'saved' ? 'Saved' : saveState === 'saving' ? 'Saving...' : 'Unsaved'}
            </span>
            <button
              className={`btn btn-sm ${status === 'published' ? 'btn-ghost' : ''}`}
              onClick={() => { setStatus(status === 'published' ? 'draft' : 'published'); markDirty() }}
            >
              {status === 'published' ? 'Published ✓' : 'Publish'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={closeSafely}>Close</button>
          </div>
        </div>

        <textarea
          className="field mb-4 min-h-16"
          placeholder="Session instructions the athlete sees before starting..."
          value={content.instructions}
          onChange={e => touch({ ...content, instructions: e.target.value })}
        />

        <div className="space-y-4">
          {content.blocks.map((block, bi) => (
            <div key={block.id} className="card p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="grid size-8 place-items-center rounded-full bg-primary font-bold text-primary-ink">{blockLetter(bi)}</span>
                <input
                  className="field !min-h-9 max-w-44 py-1 text-sm"
                  value={block.title}
                  placeholder="Block name"
                  onChange={e => setBlock(block.id, b => ({ ...b, title: e.target.value }))}
                />
                <select
                  className="field !min-h-9 w-32 py-1 text-sm"
                  value={block.kind}
                  onChange={e => setBlock(block.id, b => ({ ...b, kind: e.target.value as BlockKind }))}
                >
                  {BLOCK_KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
                </select>
                {(block.kind === 'amrap' || block.kind === 'emom') && (
                  <label className="flex items-center gap-1 text-sm">
                    <input
                      type="number" className="field !min-h-9 w-16 py-1" min={1}
                      value={block.timeCapMin ?? 10}
                      onChange={e => setBlock(block.id, b => ({ ...b, timeCapMin: Number(e.target.value) }))}
                    /> min
                  </label>
                )}
                <span className="flex-1" />
                <button className="btn btn-ghost btn-sm" disabled={bi === 0} onClick={() => moveBlock(bi, -1)}>↑</button>
                <button className="btn btn-ghost btn-sm" disabled={bi === content.blocks.length - 1} onClick={() => moveBlock(bi, 1)}>↓</button>
                <button className="btn btn-ghost btn-sm text-danger" onClick={() =>
                  touch({ ...content, blocks: content.blocks.filter(b => b.id !== block.id) })}>Delete</button>
              </div>

              {block.kind !== 'standard' && (
                <input
                  className="field mb-3 !min-h-9 py-1 text-sm"
                  placeholder={block.kind === 'superset' ? 'e.g. B1 into B2, rest 90s after the pair' : 'Block instructions'}
                  value={block.instructions}
                  onChange={e => setBlock(block.id, b => ({ ...b, instructions: e.target.value }))}
                />
              )}

              <div className="space-y-3">
                {block.exercises.map((ex, ei) => (
                  <ExerciseEditor
                    key={ex.id}
                    ex={ex}
                    label={`${blockLetter(bi)}${block.exercises.length > 1 ? ei + 1 : ''}`}
                    maxKg={ex.exerciseId ? maxes[ex.exerciseId] : undefined}
                    onChange={next => setBlock(block.id, b => ({ ...b, exercises: b.exercises.map(x => x.id === ex.id ? next : x) }))}
                    onRemove={() => setBlock(block.id, b => ({ ...b, exercises: b.exercises.filter(x => x.id !== ex.id) }))}
                    onMove={dir => setBlock(block.id, b => {
                      const list = [...b.exercises]; const j = ei + dir
                      if (j < 0 || j >= list.length) return b
                      ;[list[ei], list[j]] = [list[j], list[ei]]
                      return { ...b, exercises: list }
                    })}
                  />
                ))}
              </div>

              <div className="mt-3 max-w-md">
                <ExercisePicker onPick={e => setBlock(block.id, b => ({
                  ...b,
                  exercises: [...b.exercises, {
                    id: rid(), exerciseId: e.id, name: e.title, cue: '', videoUrl: e.video_url || undefined,
                    sets: 3, columns: [makeColumn('reps', 3), makeColumn('load_kg', 3)],
                  }],
                }))} />
              </div>
            </div>
          ))}
        </div>

        <button
          className="btn btn-ghost mt-4 w-full"
          onClick={() => touch({
            ...content,
            blocks: [...content.blocks, { id: rid(), title: '', kind: 'standard', instructions: '', exercises: [] }],
          })}
        >
          + Add block
        </button>
      </div>
    </div>
  )
}

function ExerciseEditor({ ex, label, maxKg, onChange, onRemove, onMove }: {
  ex: WorkoutExercise; label: string; maxKg?: number
  onChange: (e: WorkoutExercise) => void; onRemove: () => void; onMove: (dir: -1 | 1) => void
}) {
  const [open, setOpen] = useState(true)
  const available = useMemo(
    () => PARAM_DEFS.filter(d => !ex.columns.some(c => c.type === d.type)),
    [ex.columns],
  )

  const setCell = (ci: number, si: number, raw: string) => {
    const def = paramDef(ex.columns[ci].type)
    const value = raw === '' ? null : def.input === 'number' ? Number(raw) : raw
    onChange({
      ...ex,
      columns: ex.columns.map((c, i) => i === ci ? { ...c, values: c.values.map((v, j) => j === si ? value : v) } : c),
    })
  }

  const fillDown = (ci: number) => {
    const first = ex.columns[ci].values[0]
    onChange({ ...ex, columns: ex.columns.map((c, i) => i === ci ? { ...c, values: c.values.map(() => first) } : c) })
  }

  return (
    <div className="tile p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold text-muted">{label}</span>
        <span className="flex-1 truncate font-semibold">{ex.name}</span>
        <label className="flex items-center gap-1 text-sm text-muted">
          Sets
          <input
            type="number" min={1} max={10} className="field !min-h-9 w-14 py-1"
            value={ex.sets}
            onChange={e => onChange(resizeColumns(ex, Math.max(1, Math.min(10, Number(e.target.value) || 1))))}
          />
        </label>
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(!open)}>{open ? 'Collapse' : 'Expand'}</button>
        <button className="btn btn-ghost btn-sm" onClick={() => onMove(-1)}>↑</button>
        <button className="btn btn-ghost btn-sm" onClick={() => onMove(1)}>↓</button>
        <button className="btn btn-ghost btn-sm text-danger" onClick={onRemove}>✕</button>
      </div>

      {open && (
        <>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr>
                  <th className="w-12 pb-1 text-left text-xs font-semibold text-muted">Set</th>
                  {ex.columns.map((c, ci) => (
                    <th key={ci} className="pb-1 pr-2 text-left">
                      <span className="flex items-center gap-1">
                        <span className="text-xs font-semibold text-muted">{paramDef(c.type).label}</span>
                        <button className="text-xs text-muted hover:text-danger" title="Remove column"
                          onClick={() => onChange({ ...ex, columns: ex.columns.filter((_, i) => i !== ci) })}>✕</button>
                      </span>
                    </th>
                  ))}
                  <th className="pb-1 text-left">
                    {available.length > 0 && (
                      <select
                        className="field !min-h-8 w-28 py-0 text-xs"
                        value=""
                        onChange={e => e.target.value && onChange({ ...ex, columns: [...ex.columns, makeColumn(e.target.value as ParamType, ex.sets)] })}
                      >
                        <option value="">+ column</option>
                        {available.map(d => <option key={d.type} value={d.type}>{d.label}</option>)}
                      </select>
                    )}
                  </th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: ex.sets }, (_, si) => (
                  <tr key={si}>
                    <td className="py-0.5 text-xs font-medium text-muted">{si + 1}</td>
                    {ex.columns.map((c, ci) => {
                      const def = paramDef(c.type)
                      const v = c.values[si]
                      return (
                        <td key={ci} className="py-0.5 pr-2">
                          <span className="flex items-center gap-1">
                            <input
                              className="field !min-h-8 w-20 py-0 text-sm"
                              type={def.input}
                              step={def.step}
                              placeholder={def.placeholder}
                              value={v ?? ''}
                              onChange={e => setCell(ci, si, e.target.value)}
                            />
                            {si === 0 && ex.sets > 1 && (
                              <button className="text-[10px] text-muted" title="Fill all sets with this value" onClick={() => fillDown(ci)}>⤓</button>
                            )}
                            {c.type === 'percent_1rm' && v != null && (
                              <span className="whitespace-nowrap text-[11px] text-muted">
                                {maxKg ? `${resolveLoad(v, maxKg)} kg` : 'no max'}
                              </span>
                            )}
                          </span>
                        </td>
                      )
                    })}
                    <td />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <input
            className="field mt-2 !min-h-9 py-1 text-sm"
            placeholder="Cue the athlete sees (keep it about how to move, not the numbers)"
            value={ex.cue}
            onChange={e => onChange({ ...ex, cue: e.target.value })}
          />
        </>
      )}
    </div>
  )
}
