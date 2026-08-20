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
