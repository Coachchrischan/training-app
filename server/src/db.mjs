// SQLite via node:sqlite (Node 22.5+). Single file DB, WAL mode.
// Workout/session content is a JSON document (blocks -> exercises -> columns),
// mirroring the TrainHeroic hierarchy but WITHOUT the two-parameter limit.
import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(here, '..', 'data')
fs.mkdirSync(dataDir, { recursive: true })

export const db = new DatabaseSync(path.join(dataDir, 'app.db'))

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('coach','athlete')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS auth_tokens (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS athletes (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  coach_id INTEGER NOT NULL REFERENCES users(id),
  notes TEXT NOT NULL DEFAULT '',
  profile TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS invites (
  code TEXT PRIMARY KEY,
  coach_id INTEGER NOT NULL REFERENCES users(id),
  athlete_name TEXT NOT NULL,
  email TEXT,
  used_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  coach_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS team_members (
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  athlete_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (team_id, athlete_user_id)
);

CREATE TABLE IF NOT EXISTS exercises (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  th_id INTEGER,
  title TEXT NOT NULL,
  video_url TEXT NOT NULL DEFAULT '',
  cues TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  custom INTEGER NOT NULL DEFAULT 0,
  owner_coach_id INTEGER REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_exercises_title ON exercises(title);

CREATE TABLE IF NOT EXISTS workouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_type TEXT NOT NULL CHECK (owner_type IN ('athlete','team')),
  owner_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL DEFAULT 'Session',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  content TEXT NOT NULL DEFAULT '{"instructions":"","blocks":[]}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_workouts_owner_date ON workouts(owner_type, owner_id, date);

CREATE TABLE IF NOT EXISTS results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workout_id INTEGER NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  athlete_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','partial')),
  duration_min INTEGER,
  session_rpe REAL,
  comment TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '{"exercises":[]}',
  finished_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (workout_id, athlete_user_id)
);
CREATE INDEX IF NOT EXISTS idx_results_athlete ON results(athlete_user_id, finished_at);

CREATE TABLE IF NOT EXISTS maxes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  athlete_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise_id INTEGER NOT NULL REFERENCES exercises(id),
  value_kg REAL NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('tested','manual','auto')),
  recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_maxes_athlete ON maxes(athlete_user_id, exercise_id, recorded_at);

CREATE TABLE IF NOT EXISTS health_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_type TEXT NOT NULL CHECK (owner_type IN ('athlete','team')),
  owner_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('weight','water','supplement','habit','checkin_form','readiness','note')),
  title TEXT NOT NULL,
  config TEXT NOT NULL DEFAULT '{}',
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tasks_owner_date ON health_tasks(owner_type, owner_id, date);

CREATE TABLE IF NOT EXISTS task_completions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES health_tasks(id) ON DELETE CASCADE,
  athlete_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  value TEXT NOT NULL DEFAULT '{}',
  completed_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (task_id, athlete_user_id)
);

CREATE TABLE IF NOT EXISTS metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  athlete_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  metric TEXT NOT NULL,
  value REAL NOT NULL,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_metrics_athlete ON metrics(athlete_user_id, metric, recorded_at);

CREATE TABLE IF NOT EXISTS checkin_forms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  coach_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  questions TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_user_id INTEGER NOT NULL REFERENCES users(id),
  to_type TEXT NOT NULL CHECK (to_type IN ('user','team')),
  to_id INTEGER NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  read_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_messages_to ON messages(to_type, to_id, created_at);

CREATE TABLE IF NOT EXISTS templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  coach_id INTEGER NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK (kind IN ('session','program')),
  name TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`)

export function j(row, ...fields) {
  if (!row) return row
  const out = { ...row }
  for (const f of fields) {
    try { out[f] = JSON.parse(out[f] ?? 'null') } catch { out[f] = null }
  }
  return out
}

// ---- TAC Ops ----
// Chris's own coach-lead console: the KPI board, the to-do list, the planner that
// mirrors into Google Calendar, the reflections log, the timesheet against the
// 6-10 hour contract, and the per-class notes that feed the reporting loop
// (docs/TAC-COACH-REPORTING.md). Owned by a coach user, never visible to athletes.
db.exec(`
CREATE TABLE IF NOT EXISTS tac_kpis (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  coach_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  area TEXT NOT NULL DEFAULT 'general',
  unit TEXT NOT NULL DEFAULT '',
  target REAL,
  direction TEXT NOT NULL DEFAULT 'up' CHECK (direction IN ('up','down')),
  cadence TEXT NOT NULL DEFAULT 'monthly' CHECK (cadence IN ('weekly','monthly','quarterly')),
  notes TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tac_kpi_readings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kpi_id INTEGER NOT NULL REFERENCES tac_kpis(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  value REAL NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (kpi_id, period)
);

CREATE TABLE IF NOT EXISTS tac_todos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  coach_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  area TEXT NOT NULL DEFAULT 'general',
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('now','normal','later')),
  owner TEXT NOT NULL DEFAULT 'Chris',
  due TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','doing','blocked','done')),
  kpi_id INTEGER REFERENCES tac_kpis(id) ON DELETE SET NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  done_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_tac_todos_coach ON tac_todos(coach_id, status, due);

CREATE TABLE IF NOT EXISTS tac_plan_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  coach_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  start_time TEXT,
  end_time TEXT,
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'block' CHECK (kind IN ('class','programming','admin','meeting','content','block')),
  location TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  todo_id INTEGER REFERENCES tac_todos(id) ON DELETE SET NULL,
  billable INTEGER NOT NULL DEFAULT 1,
  rrule TEXT NOT NULL DEFAULT '',
  uid TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tac_plan_date ON tac_plan_items(coach_id, date);

-- A subscribed Google Calendar, added by pasting its secret ICS address. Read-only
-- by design: Google stays the source of truth for anything Google already owns, and
-- the planner pushes the other way through the ICS feed this server publishes.
CREATE TABLE IF NOT EXISTS tac_feeds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  coach_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  colour TEXT NOT NULL DEFAULT '',
  last_synced_at TEXT,
  last_error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Read-only mirror of a Google Calendar secret-ICS feed, so the planner shows
-- what is already on Chris's calendar without needing Google OAuth.
CREATE TABLE IF NOT EXISTS tac_feed_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  coach_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  feed_id INTEGER NOT NULL REFERENCES tac_feeds(id) ON DELETE CASCADE,
  uid TEXT NOT NULL,
  date TEXT NOT NULL,
  start_time TEXT,
  end_time TEXT,
  title TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  UNIQUE (feed_id, uid, date)
);
CREATE INDEX IF NOT EXISTS idx_tac_feed_events_date ON tac_feed_events(coach_id, date);

CREATE TABLE IF NOT EXISTS tac_reflections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  coach_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  source TEXT NOT NULL DEFAULT 'typed' CHECK (source IN ('typed','voice')),
  changed_something INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tac_reflections ON tac_reflections(coach_id, date);

CREATE TABLE IF NOT EXISTS tac_timesheet (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  coach_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  start_time TEXT,
  end_time TEXT,
  minutes INTEGER NOT NULL,
  category TEXT NOT NULL DEFAULT 'coaching'
    CHECK (category IN ('coaching','programming','admin','meeting','content','setup','travel')),
  notes TEXT NOT NULL DEFAULT '',
  invoiced INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tac_timesheet ON tac_timesheet(coach_id, date);

CREATE TABLE IF NOT EXISTS tac_class_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  coach_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  class_name TEXT NOT NULL,
  coach_name TEXT NOT NULL DEFAULT '',
  booked INTEGER,
  attended INTEGER,
  did_not_work TEXT NOT NULL DEFAULT '',
  people TEXT NOT NULL DEFAULT '',
  lane_drift TEXT NOT NULL DEFAULT '' CHECK (lane_drift IN ('','base','build','push','mixed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tac_class_notes ON tac_class_notes(coach_id, date);

CREATE TABLE IF NOT EXISTS tac_settings (
  coach_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  contract_min_hours REAL NOT NULL DEFAULT 6,
  contract_max_hours REAL NOT NULL DEFAULT 10,
  contract_start TEXT NOT NULL DEFAULT '2026-09-14',
  ics_token TEXT NOT NULL DEFAULT '',
  timezone TEXT NOT NULL DEFAULT 'Australia/Brisbane'
);
`)
