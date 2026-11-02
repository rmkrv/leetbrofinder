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
const REFRESH_AFTER_MS = 3000

type ConnectionsSnapshot = {
  profileKey: string
  items: Connection[]
  invites: SessionInvite[]
  updatedAt: number
}

let cachedSnapshot: ConnectionsSnapshot | null = null
let pendingLoad: { profileKey: string; promise: Promise<ConnectionsSnapshot> } | null = null

const snapshotFor = (profileKey: string) => cachedSnapshot?.profileKey === profileKey ? cachedSnapshot : null

const fetchSnapshot = (profileKey: string, force = false) => {
  const cached = snapshotFor(profileKey)
  if (!force && cached && Date.now() - cached.updatedAt < REFRESH_AFTER_MS) return Promise.resolve(cached)
  if (pendingLoad?.profileKey === profileKey) return pendingLoad.promise

  const promise = Promise.all([listConnections(), listSessionInvites()])
    .then(([items, invites]) => {
      const snapshot = { profileKey, items, invites, updatedAt: Date.now() }
      cachedSnapshot = snapshot
      return snapshot
    })
    .finally(() => {
      if (pendingLoad?.promise === promise) pendingLoad = null
    })

  pendingLoad = { profileKey, promise }
  return promise
}

export default function ConnectionsPage() {
  const profileKey = getProfileKey() || ''
  const initialSnapshot = snapshotFor(profileKey)
  const [items, setItems] = useState<Connection[]>(() => initialSnapshot?.items || [])
  const [invites, setInvites] = useState<SessionInvite[]>(() => initialSnapshot?.invites || [])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busyId, setBusyId] = useState('')
  const [loading, setLoading] = useState(!initialSnapshot)
  const navigate = useNavigate()

  const load = useCallback(async (force = false) => {
    try {
      const snapshot = await fetchSnapshot(profileKey, force)
      setItems(snapshot.items)
      setInvites(snapshot.invites)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load connections')
    } finally {
      setLoading(false)
    }
  }, [profileKey])

  useEffect(() => {
    if (!getProfileKey()) return
    void load()
    const poll = window.setInterval(() => { void load(true) }, REFRESH_AFTER_MS)
    return () => window.clearInterval(poll)
  }, [load])

  const run = async (id: string, action: () => Promise<unknown>, success?: string) => {
    setBusyId(id)
    setError('')
    setNotice('')
    try {
      await action()
      if (success) setNotice(success)
      if (pendingLoad?.profileKey === profileKey) await pendingLoad.promise.catch(() => undefined)
      await load(true)
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
    return <main className="mx-auto max-w-xl px-4 py-16"><div className="card card-border bg-base-200"><div className="card-body items-center text-center"><Users className="text-secondary"/><h1 className="card-title">Log in to see connections</h1><p className="text-base-content/70">Your coding network is tied to your verified profile.</p><Link className="btn btn-primary mt-3" to="/login">Log in</Link></div></div></main>
  }

  const incoming = invites.filter(item => item.status === 'PENDING' && item.direction === 'INCOMING')
  const pendingFor = (profileId: string) => invites.find(item => item.status === 'PENDING' && item.otherPlayer.id === profileId)
  const readyFor = (profileId: string) => invites.find(item => item.status === 'ACCEPTED' && item.sessionId && item.otherPlayer.id === profileId)

  return (
    <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:py-16">
      <header className="mb-9"><p className="mb-3 font-mono text-xs text-secondary">// your network</p><h1 className="text-4xl font-semibold tracking-[-.045em] sm:text-5xl">Connections</h1><p className="mt-4 max-w-2xl text-base-content/70">Invite an existing connection into a private live coding session.</p></header>

      {error && <div role="alert" className="alert alert-error alert-soft mb-4"><span>{error}</span></div>}
      {notice && <div role="status" className="alert alert-success alert-soft mb-4"><span>{notice}</span></div>}

      {loading && <div className="space-y-3" aria-label="Loading connections">{Array.from({length: 3}).map((_, index) => <div className="skeleton h-24 w-full" key={index}></div>)}</div>}

      {incoming.length > 0 && (
        <section className="mb-8">
          <div className="mb-3 flex items-center gap-3"><span className="status status-info animate-pulse"></span><h2 className="font-mono text-xs text-secondary">Session requests</h2></div>
          {incoming.map(item => (
            <article className="card card-border mb-3 bg-base-200" key={item.id}><div className="card-body flex-row flex-wrap items-center gap-4 p-5">
              <div className="avatar avatar-placeholder"><div className="size-11 rounded-selector bg-neutral text-neutral-content"><span className="font-mono text-xs">{item.otherPlayer.leetcodeUsername.slice(0, 2).toUpperCase()}</span></div></div>
              <div className="min-w-0 flex-1"><strong className="block truncate">{item.otherPlayer.leetcodeUsername}</strong><span className="mt-1 flex items-center gap-1 text-sm text-base-content/68"><Clock3 size={14}/>wants to code together</span></div>
              <div className="flex w-full gap-2 sm:w-auto">
                <button className="btn flex-1 sm:flex-none" disabled={busyId === item.id} onClick={() => void run(item.id, () => declineSessionInvite(item.id))}><X size={16}/>Decline</button>
                <button className="btn btn-primary flex-1 sm:flex-none" disabled={busyId === item.id} onClick={() => void acceptInvite(item)}>{busyId === item.id ? <span className="loading loading-spinner loading-sm"></span> : <Play size={16}/>}Join session</button>
              </div>
            </div></article>
          ))}
        </section>
      )}

      {!loading && <div className="space-y-3">
        {items.map(item => {
          const pending = pendingFor(item.otherProfile.id)
          const ready = readyFor(item.otherProfile.id)
          return (
            <article className="card card-border bg-base-200/75" key={item.id}><div className="card-body flex-row flex-wrap items-center gap-4 p-5">
              <div className="avatar avatar-placeholder"><div className="size-11 rounded-selector bg-neutral text-neutral-content"><span className="font-mono text-xs">{item.otherProfile.leetcodeUsername.slice(0, 2).toUpperCase()}</span></div></div>
              <div className="min-w-0 flex-1"><strong className="block truncate">{item.otherProfile.leetcodeUsername}</strong><span className="mt-1 flex items-center gap-2 text-sm text-base-content/68"><span className={`status status-sm ${item.status === 'ACCEPTED' ? 'status-success' : 'status-warning'}`}></span>{item.status === 'ACCEPTED' ? 'Connected' : item.direction === 'INCOMING' ? 'Wants to connect' : 'Request sent'}</span>{item.status === 'ACCEPTED' && item.otherProfile.contactUsername && <a className="link link-hover mt-1 block text-sm text-secondary" href={contactHref(item.otherProfile.contactType, item.otherProfile.contactUsername)} target="_blank" rel="noreferrer">{item.otherProfile.contactType}: {item.otherProfile.contactUsername}</a>}</div>
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                {item.status === 'PENDING' && item.direction === 'INCOMING' && <button className="btn btn-primary" disabled={busyId === item.id} onClick={() => void acceptConnection(item.id)}><Check size={16}/>Accept</button>}
                {item.status === 'ACCEPTED' && ready?.sessionId && <button className="btn btn-primary" onClick={() => openSession(ready.sessionId!)}><Play size={16}/>Open session</button>}
                {item.status === 'ACCEPTED' && !ready && <button className="btn" disabled={Boolean(pending) || busyId === item.id} onClick={() => void invite(item)}>{busyId === item.id ? <span className="loading loading-spinner loading-sm"></span> : <UserPlus size={16}/>} {pending ? 'Request sent' : 'Request session'}</button>}
                {item.status === 'ACCEPTED' && <Handshake className="ml-1 text-success" aria-label="Connected"/>}
              </div>
            </div></article>
          )
        })}
      </div>}

      {!loading && items.length === 0 && <div className="grid place-items-center rounded-box border border-dashed border-base-300 bg-base-200/45 px-6 py-16 text-center"><Users className="mb-4 text-base-content/55"/><h2 className="text-xl font-semibold">No connections yet</h2><p className="mt-2 max-w-md text-sm text-base-content/70">Start a shared session, then send your coding partner a request.</p><Link className="btn btn-primary mt-6" to="/session">Start a session</Link></div>}
    </main>
  )
}

function contactHref(type:string|null,username:string){if(!type)return '#';const value=username.replace(/^@/,'');if(type.toLowerCase().includes('discord'))return `https://discord.com/users/${encodeURIComponent(value)}`;if(type.toLowerCase().includes('telegram'))return `https://t.me/${encodeURIComponent(value)}`;return '#'}
