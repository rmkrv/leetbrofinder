import { Check, Clock3, Handshake, Play, UserPlus, Users, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  acceptConnectionRequest,
  acceptSessionInvite,
  createSessionInvite,
  declineSessionInvite,
  getProfileKey,
  listConnections,
  listSessionInvites,
} from '../api'
import type { Connection, SessionInvite } from '../types'

const SESSION_KEY = 'leetbrofinder.coop-session-id'

export default function ConnectionsPage() {
  const [items, setItems] = useState<Connection[]>([])
  const [invites, setInvites] = useState<SessionInvite[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busyId, setBusyId] = useState('')
  const navigate = useNavigate()

  const load = useCallback(async () => {
    try {
      const [connections, sessionInvites] = await Promise.all([
        listConnections(),
        listSessionInvites(),
      ])
      setItems(connections)
      setInvites(sessionInvites)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load connections')
    }
  }, [])

  useEffect(() => {
    if (!getProfileKey()) return
    void load()
    const poll = window.setInterval(load, 3000)
    return () => window.clearInterval(poll)
  }, [load])

  const run = async (id: string, action: () => Promise<unknown>, success?: string) => {
    setBusyId(id)
    setError('')
    setNotice('')
    try {
      await action()
      if (success) setNotice(success)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setBusyId('')
    }
  }

  const acceptConnection = (id: string) => run(id, () => acceptConnectionRequest(id))

  const invite = (connection: Connection) => run(
    connection.id,
    () => createSessionInvite(connection.otherProfile.id),
    `Session request sent to ${connection.otherProfile.leetcodeUsername}.`,
  )

  const acceptInvite = async (inviteRequest: SessionInvite) => {
    setBusyId(inviteRequest.id)
    setError('')
    try {
      const accepted = await acceptSessionInvite(inviteRequest.id)
      if (!accepted.sessionId) throw new Error('The session could not be opened')
      localStorage.setItem(SESSION_KEY, accepted.sessionId)
      navigate('/session')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not accept session request')
      setBusyId('')
    }
  }

  const openSession = (sessionId: string) => {
    localStorage.setItem(SESSION_KEY, sessionId)
    navigate('/session')
  }

  if (!getProfileKey()) {
    return <main className="narrow-page"><div className="surface blocked"><Users/><h2>Log in to see connections</h2><Link className="primary" to="/login">Log in</Link></div></main>
  }

  const incoming = invites.filter(item => item.status === 'PENDING' && item.direction === 'INCOMING')
  const pendingFor = (profileId: string) => invites.find(item => item.status === 'PENDING' && item.otherPlayer.id === profileId)
  const readyFor = (profileId: string) => invites.find(item => item.status === 'ACCEPTED' && item.sessionId && item.otherPlayer.id === profileId)

  return (
    <main className="connections-page">
      <div className="page-heading">
        <p className="eyebrow">Your network</p>
        <h1>Connections</h1>
        <p>Invite an existing connection into a private live coding session.</p>
      </div>

      {error && <p className="form-error">{error}</p>}
      {notice && <p className="form-success">{notice}</p>}

      {incoming.length > 0 && (
        <section className="session-invites">
          <p className="eyebrow">Session requests</p>
          {incoming.map(item => (
            <article className="surface invite-row" key={item.id}>
              <div className="mini-avatar">{item.otherPlayer.leetcodeUsername.slice(0, 2).toUpperCase()}</div>
              <div>
                <strong>{item.otherPlayer.leetcodeUsername}</strong>
                <span><Clock3 size={14}/> wants to code together</span>
              </div>
              <div className="invite-actions">
                <button className="secondary" disabled={busyId === item.id} onClick={() => run(item.id, () => declineSessionInvite(item.id))}><X size={16}/> Decline</button>
                <button className="primary" disabled={busyId === item.id} onClick={() => acceptInvite(item)}><Play size={16}/> Join session</button>
              </div>
            </article>
          ))}
        </section>
      )}

      <div className="connection-list">
        {items.map(item => {
          const pending = pendingFor(item.otherProfile.id)
          const ready = readyFor(item.otherProfile.id)
          return (
            <article className="surface connection-row" key={item.id}>
              <div className="mini-avatar">{item.otherProfile.leetcodeUsername.slice(0, 2).toUpperCase()}</div>
              <div>
                <strong>{item.otherProfile.leetcodeUsername}</strong>
                <span>{item.status === 'ACCEPTED' ? 'Connected' : item.direction === 'INCOMING' ? 'Wants to connect' : 'Request sent'}</span>
                {item.status === 'ACCEPTED' && item.otherProfile.contactUsername && <a href={contactHref(item.otherProfile.contactType, item.otherProfile.contactUsername)} target="_blank" rel="noreferrer">{item.otherProfile.contactType}: {item.otherProfile.contactUsername}</a>}
              </div>
              <div className="connection-actions">
                {item.status === 'PENDING' && item.direction === 'INCOMING' && <button className="primary" disabled={busyId === item.id} onClick={() => acceptConnection(item.id)}><Check size={16}/> Accept</button>}
                {item.status === 'ACCEPTED' && ready?.sessionId && <button className="primary" onClick={() => openSession(ready.sessionId!)}><Play size={16}/> Open session</button>}
                {item.status === 'ACCEPTED' && !ready && <button className="secondary" disabled={Boolean(pending) || busyId === item.id} onClick={() => invite(item)}><UserPlus size={16}/> {pending ? 'Request sent' : 'Request session'}</button>}
                {item.status === 'ACCEPTED' && <Handshake className="connected-icon"/>}
              </div>
            </article>
          )
        })}
      </div>

      {items.length === 0 && <div className="surface empty-state"><Users/><h3>No connections yet</h3><p>Start a shared session, then send your coding partner a request.</p><Link className="primary" to="/session">Start a session</Link></div>}
    </main>
  )
}

function contactHref(type:string|null,username:string){if(!type)return '#';const value=username.replace(/^@/,'');if(type.toLowerCase().includes('discord'))return `https://discord.com/users/${encodeURIComponent(value)}`;if(type.toLowerCase().includes('telegram'))return `https://t.me/${encodeURIComponent(value)}`;return '#'}
