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

// ---- TAC Ops ----
export type TacArea = 'classes' | 'programming' | 'trainheroic' | 'standards' | 'contract' | 'coaching' | 'admin' | 'content' | 'general'
export type TacTodoStatus = 'open' | 'doing' | 'blocked' | 'done'
export type TacPlanKind = 'class' | 'programming' | 'admin' | 'meeting' | 'content' | 'block'
export type TacTimeCategory = 'coaching' | 'programming' | 'admin' | 'meeting' | 'content' | 'setup' | 'travel'

export interface TacKpiReading { id: number; kpi_id: number; period: string; value: number; note: string; recorded_at: string }

export interface TacKpi {
  id: number; name: string; area: string; unit: string
  target: number | null; direction: 'up' | 'down'
  cadence: 'weekly' | 'monthly' | 'quarterly'
  notes: string; position: number; archived: 0 | 1
  readings: TacKpiReading[]
}

export interface TacTodo {
  id: number; title: string; detail: string; area: string
  priority: 'now' | 'normal' | 'later'
  owner: string; due: string | null; status: TacTodoStatus
  kpi_id: number | null; position: number; created_at: string; done_at: string | null
}

export interface TacPlanItem {
  id: number; date: string; start_time: string | null; end_time: string | null
  title: string; kind: TacPlanKind; location: string; notes: string
  todo_id: number | null; billable: 0 | 1; rrule: string; uid: string
  occurrence?: string; recurring?: 1
}

export interface TacFeedEvent {
  id: number; feed_id: number; uid: string; date: string
  start_time: string | null; end_time: string | null
  title: string; location: string; feed_name: string; feed_colour: string
}

export interface TacFeed {
  id: number; name: string; url: string; colour: string
  last_synced_at: string | null; last_error: string
}

export interface TacReflection {
  id: number; date: string; title: string; body: string
  tags: string[] | null; source: 'typed' | 'voice'; changed_something: 0 | 1; created_at: string
}

export interface TacTimeEntry {
  id: number; date: string; start_time: string | null; end_time: string | null
  minutes: number; category: TacTimeCategory; notes: string; invoiced: 0 | 1
}

export interface TacContract { minHours: number; maxHours: number; start: string }

export interface TacSettings {
  coach_id: number; contract_min_hours: number; contract_max_hours: number
  contract_start: string; ics_token: string; timezone: string; icsPath: string
}

export interface TacOverview {
  today: string; weekStart: string
  contract: TacContract
  hours: { thisWeek: number; sinceStart: number }
  openTodos: number; dueSoon: number; kpis: number; reflectionsThisWeek: number
  todayPlan: TacPlanItem[]
  nextGameDay: GameDayPick | null
}

export interface GameDayPick { date: string; workoutId: string; label: string; why: string; swapIf: string }

export interface GameDayWorkout {
  id: string; name: string; family: string
  teamSize: number; teams: string; durationMin: number
  stations: string; engine: string; flow: string[]
  score: string; scaling: { base: string; build: string; push: string }
  coachNotes: string[]; gear: string[]
}

export interface GameDayLibrary {
  version: number; updated: string; club: string; class: string
  room: {
    name: string; cap: number; note: string
    stations: Record<string, number>
    floor: string[]; previousAssumption: string; teamMaths: string[]
  }
  engagement: { definition: string; rules: string[]; sessionShape: string }
  lanes: { base: string; build: string; push: string }
  workouts: GameDayWorkout[]
  picks: GameDayPick[]
}
