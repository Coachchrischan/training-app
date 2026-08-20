// Messaging: coach picks a conversation partner; athletes talk to their coach.
import { useEffect, useRef, useState } from 'react'
import { api } from '../../lib/api'
import type { AthleteRow, Message } from '../../lib/types'
import { useAuth } from '../../App'
import { Empty } from '../../components/ui'

export default function Messages() {
  const { user } = useAuth()
  const isCoach = user?.role === 'coach'
  const [athletes, setAthletes] = useState<AthleteRow[]>([])
  const [withId, setWithId] = useState<number | null>(null)
  const [thread, setThread] = useState<Message[]>([])
  const [body, setBody] = useState('')
  const [error, setError] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isCoach) {
      api.get<AthleteRow[]>('/athletes').then(rows => {
        setAthletes(rows)
        if (rows.length) setWithId(rows[0].id)
      })
    } else {
      // Athlete: their coach id comes from /auth/me, so a first message needs no thread.
      setWithId(user?.coachId ?? null)
    }
  }, [isCoach, user])

  const reload = () => {
    if (!withId || withId < 0) return
    api.get<Message[]>(`/messages?withUserId=${withId}`).then(setThread).catch(() => {})
  }

  useEffect(reload, [withId])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [thread.length])
  useEffect(() => {
    const t = setInterval(reload, 15000)
    return () => clearInterval(t)
  }, [withId])

  async function send() {
    if (!body.trim() || !withId || withId < 0) return
    try {
      await api.post('/messages', { toType: 'user', toId: withId, body: body.trim() })
      setBody('')
      setError('')
      reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not send. Check your connection and try again.')
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-6rem)] max-w-3xl flex-col">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-2xl">Messages</h1>
        {isCoach && (
          <select className="field !min-h-10 w-56 py-1" value={withId ?? ''} onChange={e => setWithId(Number(e.target.value))}>
            {athletes.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
      </div>
      <div className="card flex-1 space-y-2 overflow-y-auto p-4">
        {thread.length === 0 && <Empty>No messages yet. Say hello.</Empty>}
        {thread.map(m => {
          const mine = m.from_user_id === user!.id
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${mine ? 'bg-primary text-primary-ink' : 'bg-surface2'}`}>
                {!mine && <div className="text-[10px] font-bold opacity-70">{m.from_name}</div>}
                {m.body}
                <div className={`mt-0.5 text-[10px] ${mine ? 'text-primary-ink/70' : 'text-muted'}`}>
                  {new Date(m.created_at + 'Z').toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          )
        })}
        <div ref={endRef} />
      </div>
      {error && <p className="mt-2 text-sm font-medium text-danger">{error}</p>}
      <div className="mt-3 flex gap-2">
        <input
          className="field flex-1"
          placeholder="Write a message..."
          value={body}
          onChange={e => setBody(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
        />
        <button className="btn" onClick={send} disabled={!body.trim()}>Send</button>
      </div>
    </div>
  )
}
