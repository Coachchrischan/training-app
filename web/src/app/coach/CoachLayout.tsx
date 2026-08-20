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

const NAV = [
  { to: '/coach', label: 'Home', end: true },
  { to: '/coach/athletes', label: 'Athletes' },
  { to: '/coach/calendar', label: 'Calendar' },
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

  return (
    <div className="flex min-h-full">
      <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col border-r border-line bg-surface p-4">
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
          <button className="btn btn-ghost btn-sm w-full" onClick={() => api.post('/auth/logout').then(() => setUser(null))}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-6">
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path="athletes" element={<Athletes />} />
          <Route path="athletes/:id" element={<AthleteDetail />} />
          <Route path="calendar" element={<CalendarPage />} />
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
