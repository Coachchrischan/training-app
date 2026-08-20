// Shared DTOs matching the server's JSON shapes.

export type Role = 'coach' | 'athlete'

export interface User { id: number; email: string; name: string; role: Role; coachId?: number | null }

export interface AthleteRow {
  id: number; name: string; email: string; notes: string
  profile: { level?: string; goals?: string[] } | null
  recent_sessions: number; last_active: string | null
}

export interface Team { id: number; coach_id: number; name: string; description: string; members: { id: number; name: string }[] }

export interface Exercise { id: number; title: string; video_url: string; cues: string; tags: string[]; custom: 0 | 1 }

// ---- Prescription model: the anti-2-column-limit core ----
export type ParamType =
  | 'reps' | 'reps_range' | 'load_kg' | 'percent_1rm' | 'rpe' | 'rir'
  | 'tempo' | 'rest_sec' | 'time' | 'distance_m' | 'calories'

export interface ParamColumn { type: ParamType; values: (string | number | null)[] }

export interface WorkoutExercise {
  id: string
  exerciseId: number | null
  name: string
  cue: string
  videoUrl?: string
  sets: number
  columns: ParamColumn[]
}

export type BlockKind = 'standard' | 'superset' | 'circuit' | 'amrap' | 'emom'

export interface WorkoutBlock {
  id: string; title: string; kind: BlockKind; instructions: string
  timeCapMin?: number
  exercises: WorkoutExercise[]
}

export interface WorkoutContent { instructions: string; blocks: WorkoutBlock[] }

export interface Workout {
  id: number; owner_type: 'athlete' | 'team'; owner_id: number
  date: string; position: number; title: string
  status: 'draft' | 'published'
  content: WorkoutContent
}

// ---- Results ----
export interface SetResult { completed: boolean; actual: Record<string, number | string | null> }
export interface ExerciseResult { blockId: string; entryId: string; exerciseId: number | null; name?: string; sets: SetResult[]; note?: string }
export interface ResultContent { exercises: ExerciseResult[]; score?: { type: 'rounds_reps' | 'time' | 'reps'; value: string } }

export interface Result {
  id: number; workout_id: number; athlete_user_id: number
  status: 'completed' | 'partial'; duration_min: number | null; session_rpe: number | null
  comment: string; content: ResultContent; finished_at: string
  workout_title?: string; workout_date?: string
}

// ---- Health tasks ----
export type TaskType = 'weight' | 'water' | 'supplement' | 'habit' | 'checkin_form' | 'readiness' | 'note'

export interface HealthTask {
  id: number; owner_type: 'athlete' | 'team'; owner_id: number
  date: string; type: TaskType; title: string
  config: Record<string, unknown>
}

export interface TaskCompletion { id: number; task_id: number; athlete_user_id: number; value: Record<string, unknown>; completed_at: string }

export interface CalendarData { workouts: Workout[]; tasks: HealthTask[]; results: Result[]; completions: TaskCompletion[] }

export interface MaxRow { exercise_id: number; title: string; value_kg: number; source: 'tested' | 'manual' | 'auto'; recorded_at: string }

export interface CheckinForm {
  id: number; coach_id: number; title: string
  questions: { id: string; type: 'scale' | 'text' | 'choice' | 'number'; label: string; min?: number; max?: number; options?: string[] }[]
}

export interface Message { id: number; from_user_id: number; from_name: string; to_type: 'user' | 'team'; to_id: number; body: string; created_at: string }
