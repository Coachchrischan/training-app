// The prescription parameter registry. TrainHeroic caps a coach at two of these
// per exercise; here a coach stacks as many columns as the exercise needs
// (kg + %1RM + RPE + tempo together is the whole point).
import type { ParamType, ParamColumn, WorkoutExercise } from './types'

export interface ParamDef {
  type: ParamType
  label: string
  short: string
  input: 'number' | 'text'
  placeholder?: string
  step?: number
  loggable: boolean // does the athlete enter an actual for this param?
}

export const PARAM_DEFS: ParamDef[] = [
  { type: 'reps', label: 'Reps', short: 'Reps', input: 'number', loggable: true },
  { type: 'reps_range', label: 'Rep range', short: 'Range', input: 'text', placeholder: '8-12', loggable: true },
  { type: 'load_kg', label: 'Load (kg)', short: 'kg', input: 'number', step: 0.5, loggable: true },
  { type: 'percent_1rm', label: '% of 1RM', short: '%1RM', input: 'number', step: 2.5, loggable: false },
  { type: 'rpe', label: 'RPE', short: 'RPE', input: 'number', step: 0.5, loggable: true },
  { type: 'rir', label: 'Reps in reserve', short: 'RIR', input: 'number', loggable: true },
  { type: 'tempo', label: 'Tempo', short: 'Tempo', input: 'text', placeholder: '3-1-1', loggable: false },
  { type: 'rest_sec', label: 'Rest (sec)', short: 'Rest', input: 'number', step: 15, loggable: false },
  { type: 'time', label: 'Time', short: 'Time', input: 'text', placeholder: 'MM:SS', loggable: true },
  { type: 'distance_m', label: 'Distance (m)', short: 'm', input: 'number', step: 50, loggable: true },
  { type: 'calories', label: 'Calories', short: 'Cal', input: 'number', loggable: true },
]

export const paramDef = (t: ParamType): ParamDef => PARAM_DEFS.find(d => d.type === t)!

// Loggable actuals for an exercise: params the athlete records numbers against.
// %1RM prescriptions log as load_kg (the resolved weight).
export function loggableParams(ex: WorkoutExercise): ParamType[] {
  const out = new Set<ParamType>()
  for (const c of ex.columns) {
    if (c.type === 'percent_1rm') out.add('load_kg')
    else if (c.type === 'reps_range') out.add('reps')
    else if (paramDef(c.type).loggable) out.add(c.type)
  }
  if (!out.size) out.add('reps')
  return [...out]
}

// Compact human summary, e.g. "4 x 5 @ 75% · RPE 8 · rest 180s"
export function summariseExercise(ex: WorkoutExercise): string {
  const first = (t: ParamType) => {
    const c = ex.columns.find(col => col.type === t)
    if (!c) return null
    const vals = c.values.filter(v => v !== null && v !== '')
    if (!vals.length) return null
    const uniq = [...new Set(vals.map(String))]
    return uniq.length === 1 ? uniq[0] : vals.join(', ')
  }
  const bits: string[] = []
  const reps = first('reps') ?? first('reps_range')
  bits.push(reps ? `${ex.sets} x ${reps}` : `${ex.sets} sets`)
  const pct = first('percent_1rm')
  const kg = first('load_kg')
  if (pct) bits.push(`@ ${pct}%`)
  else if (kg) bits.push(`@ ${kg} kg`)
  const rpe = first('rpe')
  if (rpe) bits.push(`RPE ${rpe}`)
  const rir = first('rir')
  if (rir) bits.push(`${rir} RIR`)
  const tempo = first('tempo')
  if (tempo) bits.push(`tempo ${tempo}`)
  const rest = first('rest_sec')
  if (rest) bits.push(`rest ${rest}s`)
  const time = first('time')
  if (time) bits.push(time)
  const dist = first('distance_m')
  if (dist) bits.push(`${dist} m`)
  return bits.join(' · ')
}

// Resolve a %1RM column to kg for one athlete using their working max.
export function resolveLoad(percent: number | string | null, maxKg: number | undefined): number | null {
  const p = Number(percent)
  if (!maxKg || !(p > 0)) return null
  return Math.round((maxKg * p) / 100 / 2.5) * 2.5
}

export function makeColumn(type: ParamType, sets: number): ParamColumn {
  return { type, values: Array.from({ length: sets }, () => null) }
}

export function resizeColumns(ex: WorkoutExercise, sets: number): WorkoutExercise {
  return {
    ...ex,
    sets,
    columns: ex.columns.map(c => ({
      ...c,
      values: Array.from({ length: sets }, (_, i) => c.values[i] ?? c.values[c.values.length - 1] ?? null),
    })),
  }
}

export function rid(): string {
  return Math.random().toString(36).slice(2, 10)
}
