import { NavLink, Routes, Route, Navigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { useAuth, useBrand } from '../../App'
import Today from './Today'
import LogSession from './LogSession'
import History from './History'
import Prs from './Prs'
import Messages from '../shared/Messages'

export default function AthleteLayout() {
  const { user, setUser } = useAuth()
  const brand = useBrand()

  const tabs = [
    { to: '/me', label: 'Today', icon: '☀️', end: true },
    { to: '/me/history', label: 'History', icon: '📅' },
    { to: '/me/prs', label: 'PRs', icon: '🏆' },
    { to: '/me/messages', label: 'Messages', icon: '💬' },
  ]

  return (
    <div className="mx-auto flex min-h-full max-w-lg flex-col">
      <header className="flex items-center justify-between px-4 pb-2 pt-4">
        <div>
          <div className="display text-lg leading-none">{brand.appName}</div>
          <div className="text-xs text-muted">{user?.name}</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => api.post('/auth/logout').then(() => setUser(null))}>
          Sign out
        </button>
      </header>

      <main className="flex-1 px-4 pb-24">
        <Routes>
          <Route index element={<Today />} />
          <Route path="log/:workoutId" element={<LogSession />} />
          <Route path="history" element={<History />} />
          <Route path="prs" element={<Prs />} />
          <Route path="messages" element={<Messages />} />
          <Route path="*" element={<Navigate to="/me" replace />} />
        </Routes>
      </main>

      <nav className="fixed inset-x-0 bottom-0 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-lg">
          {tabs.map(t => (
            /* Active state uses a top bar and weight as well as colour, never colour
               alone (BlueZone's primary and muted are both dark blues). */
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-0.5 border-t-4 py-2 text-xs ${
                  isActive ? 'border-primary font-bold text-primary' : 'border-transparent font-medium text-muted'}`}
            >
              <span aria-hidden className="text-lg leading-none">{t.icon}</span>
              {t.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
