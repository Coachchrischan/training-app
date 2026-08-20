import { createContext, useContext, useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { api, ApiError } from './lib/api'
import type { User } from './lib/types'
import { BRANDS, activeBrandId, type BrandConfig } from './brands'
import Login from './app/Login'
import CoachLayout from './app/coach/CoachLayout'
import AthleteLayout from './app/athlete/AthleteLayout'

interface AuthCtx {
  user: User | null
  setUser: (u: User | null) => void
  brand: BrandConfig
}

const Ctx = createContext<AuthCtx>(null!)
export const useAuth = () => useContext(Ctx)
export const useBrand = () => useContext(Ctx).brand

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)
  const brand = BRANDS[activeBrandId()]

  useEffect(() => {
    api.get<User>('/auth/me')
      .then(setUser)
      .catch((e: unknown) => { if (!(e instanceof ApiError && e.status === 401)) console.error(e) })
      .finally(() => setReady(true))
  }, [])

  if (!ready) {
    return <div className="grid h-full place-items-center text-muted">Loading...</div>
  }

  return (
    <Ctx.Provider value={{ user, setUser, brand }}>
      {!user ? (
        <Login />
      ) : user.role === 'coach' ? (
        <Routes>
          <Route path="/coach/*" element={<CoachLayout />} />
          <Route path="*" element={<Navigate to="/coach" replace />} />
        </Routes>
      ) : (
        <Routes>
          <Route path="/me/*" element={<AthleteLayout />} />
          <Route path="*" element={<Navigate to="/me" replace />} />
        </Routes>
      )}
    </Ctx.Provider>
  )
}
