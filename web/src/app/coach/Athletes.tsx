import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import type { AthleteRow } from '../../lib/types'
import { useBrand } from '../../App'
import { Modal, Spinner, Empty, ErrorNote } from '../../components/ui'

export default function Athletes() {
  const brand = useBrand()
  const [rows, setRows] = useState<AthleteRow[] | null>(null)
  const [q, setQ] = useState('')
  const [inviting, setInviting] = useState(false)

  useEffect(() => { api.get<AthleteRow[]>('/athletes').then(setRows).catch(console.error) }, [])

  if (!rows) return <Spinner />
  const filtered = rows.filter(r => r.name.toLowerCase().includes(q.toLowerCase()))

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl capitalize">{brand.terms.athletes}</h1>
        <div className="flex gap-2">
          <input className="field max-w-52" placeholder="Search..." value={q} onChange={e => setQ(e.target.value)} />
          <button className="btn" onClick={() => setInviting(true)}>Invite</button>
        </div>
      </div>
      {filtered.length === 0 ? (
        <Empty>No {brand.terms.athletes} yet. Invite your first one.</Empty>
      ) : (
        <div className="card divide-y divide-line">
          {filtered.map(a => (
            <Link key={a.id} to={`/coach/athletes/${a.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface2">
              <div>
                <div className="font-semibold">{a.name}</div>
                <div className="text-xs text-muted">{a.email}</div>
              </div>
              <div className="text-right text-xs text-muted">
                <div>{a.recent_sessions} sessions in 28 days</div>
                <div>{a.last_active ? `Last active ${a.last_active.slice(0, 10)}` : 'No activity yet'}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
      {inviting && <InviteModal onClose={() => setInviting(false)} />}
    </div>
  )
}

function InviteModal({ onClose }: { onClose: () => void }) {
  const brand = useBrand()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')

  async function create() {
    try {
      const res = await api.post<{ code: string }>('/auth/invites', { athleteName: name, email })
      setCode(res.code)
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed') }
  }

  return (
    <Modal title={`Invite ${brand.terms.athlete}`} onClose={onClose}>
      {code ? (
        <div className="space-y-3 text-center">
          <p className="text-sm text-muted">Share this code. They enter it on the sign-in screen under "Create your account".</p>
          <div className="tile p-4 text-3xl font-bold tracking-widest">{code}</div>
          <button className="btn w-full" onClick={onClose}>Done</button>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="label">Name</label>
            <input className="field" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <label className="label">Email (optional)</label>
            <input className="field" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <ErrorNote error={error} />
          <button className="btn w-full" disabled={!name.trim()} onClick={create}>Create invite code</button>
        </div>
      )}
    </Modal>
  )
}
