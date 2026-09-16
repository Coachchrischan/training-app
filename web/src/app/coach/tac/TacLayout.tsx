// TAC Ops: Chris's own console as coach lead, sitting alongside the athlete-facing
// modules. Tabs scroll horizontally so the whole thing works on a phone.
import { NavLink, Routes, Route, Navigate } from 'react-router-dom'
import Overview from './Overview'
import Plan from './Plan'
import Kpis from './Kpis'
import Todos from './Todos'
import Reflections from './Reflections'
import Timesheet from './Timesheet'
import GameDay from './GameDay'

const TABS = [
  { to: '/coach/tac', label: 'Overview', end: true },
  { to: '/coach/tac/plan', label: 'Plan' },
  { to: '/coach/tac/todos', label: 'To-do' },
  { to: '/coach/tac/kpis', label: 'KPIs' },
  { to: '/coach/tac/reflections', label: 'Reflections' },
  { to: '/coach/tac/timesheet', label: 'Timesheet' },
  { to: '/coach/tac/gameday', label: 'Game Day' },
]

export default function TacLayout() {
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header>
        <h1 className="text-2xl">TAC Ops</h1>
        <p className="text-sm text-muted">Teneriffe Athletic Club · Coach &amp; Programming Manager</p>
      </header>

      <nav className="-mx-1 flex gap-1 overflow-x-auto pb-1">
        {TABS.map(t => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              `shrink-0 rounded-full px-3 py-1.5 text-sm font-medium ${isActive ? 'bg-primary text-primary-ink' : 'tile hover:bg-surface2'}`}
          >
            {t.label}
          </NavLink>
        ))}
      </nav>

      <Routes>
        <Route index element={<Overview />} />
        <Route path="plan" element={<Plan />} />
        <Route path="todos" element={<Todos />} />
        <Route path="kpis" element={<Kpis />} />
        <Route path="reflections" element={<Reflections />} />
        <Route path="timesheet" element={<Timesheet />} />
        <Route path="gameday" element={<GameDay />} />
        <Route path="*" element={<Navigate to="/coach/tac" replace />} />
      </Routes>
    </div>
  )
}
