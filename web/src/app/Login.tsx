import { useState } from 'react'
import { api } from '../lib/api'
import type { User } from '../lib/types'
import { useAuth, useBrand } from '../App'

export default function Login() {
  const { setUser } = useAuth()
  const brand = useBrand()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const user = mode === 'login'
        ? await api.post<User>('/auth/login', { email, password })
        : await api.post<User>('/auth/register', { code, email, password, name })
      setUser(user)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-full place-items-center p-6">
      <div className="card w-full max-w-sm p-8">
        <h1 className="mb-1 text-3xl">{brand.appName}</h1>
        <p className="mb-6 text-sm text-muted">{brand.tagline}</p>
        <form onSubmit={submit} className="space-y-4">
          {mode === 'register' && (
            <>
              <div>
                <label className="label" htmlFor="code">Invite code</label>
                <input id="code" className="field" value={code} onChange={e => setCode(e.target.value)} autoComplete="off" />
              </div>
              <div>
                <label className="label" htmlFor="name">Your name</label>
                <input id="name" className="field" value={name} onChange={e => setName(e.target.value)} />
              </div>
            </>
          )}
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" type="email" className="field" value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input id="password" type="password" className="field" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
          </div>
          {error && <p className="text-sm font-medium text-danger">{error}</p>}
          <button className="btn w-full" disabled={busy}>
            {mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>
        <button
          className="mt-4 w-full text-center text-sm text-muted underline"
          onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}
        >
          {mode === 'login' ? 'Have an invite code? Create your account' : 'Back to sign in'}
        </button>
      </div>
    </div>
  )
}
