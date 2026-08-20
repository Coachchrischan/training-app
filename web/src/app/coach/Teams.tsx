import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import type { Team, AthleteRow } from '../../lib/types'
import { useBrand } from '../../App'
import { Modal, Empty, Spinner } from '../../components/ui'

export default function Teams() {
  const brand = useBrand()
  const [teams, setTeams] = useState<Team[] | null>(null)
  const [athletes, setAthletes] = useState<AthleteRow[]>([])
  const [creating, setCreating] = useState(false)
  const reload = () => api.get<Team[]>('/teams').then(setTeams)

  useEffect(() => {
    reload()
    api.get<AthleteRow[]>('/athletes').then(setAthletes)
  }, [])

  if (!teams) return <Spinner />

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl">Teams</h1>
        <button className="btn" onClick={() => setCreating(true)}>+ New team</button>
      </div>
      {teams.length === 0 ? (
        <Empty>Group programming lives here. Create a team, add {brand.terms.athletes}, then program once for everyone.</Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {teams.map(t => (
            <div key={t.id} className="card p-4">
              <div className="mb-1 flex items-center justify-between">
                <h2 className="text-lg">{t.name}</h2>
                <Link className="btn btn-sm" to={`/coach/calendar?team=${t.id}`}>Calendar</Link>
              </div>
              {t.description && <p className="mb-2 text-sm text-muted">{t.description}</p>}
              <div className="mb-2 text-xs font-semibold uppercase text-muted">{t.members.length} members</div>
              <ul className="space-y-1 text-sm">
                {t.members.map(m => (
                  <li key={m.id} className="flex items-center justify-between">
                    {m.name}
                    <button className="text-xs text-danger" onClick={() =>
                      api.del(`/teams/${t.id}/members/${m.id}`).then(reload)}>remove</button>
                  </li>
                ))}
              </ul>
              <AddMember team={t} athletes={athletes} onDone={reload} />
            </div>
          ))}
        </div>
      )}
      {creating && <CreateTeam onClose={() => { setCreating(false); reload() }} />}
    </div>
  )
}

function AddMember({ team, athletes, onDone }: { team: Team; athletes: AthleteRow[]; onDone: () => void }) {
  const candidates = athletes.filter(a => !team.members.some(m => m.id === a.id))
  if (!candidates.length) return null
  return (
    <select
      className="field mt-2 !min-h-9 py-1 text-sm"
      value=""
      onChange={e => e.target.value && api.post(`/teams/${team.id}/members`, { athleteId: Number(e.target.value) }).then(onDone)}
    >
      <option value="">+ Add member...</option>
      {candidates.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
    </select>
  )
}

function CreateTeam({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  return (
    <Modal title="New team" onClose={onClose}>
      <div className="space-y-4">
        <div><label className="label">Name</label><input className="field" value={name} onChange={e => setName(e.target.value)} autoFocus /></div>
        <div><label className="label">Description</label><input className="field" value={description} onChange={e => setDescription(e.target.value)} /></div>
        <button className="btn w-full" disabled={!name.trim()} onClick={() =>
          api.post('/teams', { name, description }).then(onClose)}>Create</button>
      </div>
    </Modal>
  )
}
