import { NavLink, Routes, Route, Navigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { useAuth, useBrand } from '../../App'
import Dashboard from './Dashboard'
import Athletes from './Athletes'
import AthleteDetail from './AthleteDetail'
import CalendarPage from './CalendarPage'
import Library from './Library'
import Teams from './Teams'
import Analytics from './Analytics'
import Messages from '../shared/Messages'
import Settings from './Settings'
import TacLayout from './tac/TacLayout'

const NAV = [
  { to: '/coach', label: 'Home', end: true },
  { to: '/coach/athletes', label: 'Athletes' },
  { to: '/coach/calendar', label: 'Calendar' },
  { to: '/coach/tac', label: 'TAC Ops' },
  { to: '/coach/library', label: 'Library' },
  { to: '/coach/teams', label: 'Teams' },
  { to: '/coach/analytics', label: 'Analytics' },
  { to: '/coach/messages', label: 'Messages' },
  { to: '/coach/settings', label: 'Settings' },
]

export default function CoachLayout() {
  const { user, setUser } = useAuth()
  const brand = useBrand()
  const nav = NAV.filter(n => {
    if (n.to.endsWith('/teams')) return brand.flags.teams
    if (n.to.endsWith('/analytics')) return brand.flags.analytics
    return true
  })

  const signOut = () => api.post('/auth/logout').then(() => setUser(null))

  return (
    <div className="flex min-h-full flex-col md:flex-row">
      {/* Phone: the console collapses to a scrolling top bar. The coach lead uses
          TAC Ops from a car park more often than from a desk. */}
      <header className="sticky top-0 z-30 border-b border-line bg-surface md:hidden">
        <div className="flex items-center justify-between gap-2 px-4 py-2">
          <div className="display truncate text-base leading-tight">{brand.appName}</div>
          <button className="btn btn-ghost btn-sm shrink-0" onClick={signOut}>Sign out</button>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2">
          {nav.map(n => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `shrink-0 rounded-full px-3 py-1.5 text-sm font-medium ${isActive ? 'bg-primary text-primary-ink' : 'tile'}`}
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-line bg-surface p-4 md:flex">
        <div className="mb-6">
          <div className="display text-lg leading-tight">{brand.appName}</div>
          <div className="text-xs text-muted">Coach console</div>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {nav.map(n => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `rounded-xl px-3 py-2 text-sm font-medium ${isActive ? 'bg-primary text-primary-ink' : 'hover:bg-surface2'}`}
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-4 border-t border-line pt-3 text-sm">
          <div className="mb-2 truncate font-medium">{user?.name}</div>
          <button className="btn btn-ghost btn-sm w-full" onClick={signOut}>Sign out</button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-6">
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path="athletes" element={<Athletes />} />
          <Route path="athletes/:id" element={<AthleteDetail />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="tac/*" element={<TacLayout />} />
          <Route path="library" element={<Library />} />
          <Route path="teams" element={<Teams />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="messages" element={<Messages />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/coach" replace />} />
        </Routes>
      </main>
    </div>
  )
}
