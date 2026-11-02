import { ExternalLink, Handshake, Headphones, LoaderCircle, LogOut, Mic, MicOff, RefreshCw, Send, Sparkles, Users } from 'lucide-react'
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  acceptCoopProblem, getCoopMessages, getCoopSession, getCurrentCoopSession, getProfileKey, getVoiceSignals,
  joinCoopSession, joinSessionVoice, leaveCoopSession, leaveSessionVoice, muteSessionVoice,
  rerollCoopProblem, sendConnectionRequest, sendCoopMessage, sendVoiceSignal, suggestCoopProblem,
} from '../api'
import { decryptMessage, encryptMessage, ensureE2eeIdentity, getE2eeFingerprint, type Decrypted } from '../e2ee'
import type { CoopMessage, CoopSession, VoiceSignal } from '../types'

const SESSION_KEY = 'leetbrofinder.coop-session-id'
type DisplayCoopMessage = Decrypted<CoopMessage>

export default function CoopSessionPage() {
  const [session, setSession] = useState<CoopSession | null>(null)
  const [messages, setMessages] = useState<DisplayCoopMessage[]>([])
  const [messagingReady, setMessagingReady] = useState(false)
  const [message, setMessage] = useState('')
  const [suggestion, setSuggestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [restoring, setRestoring] = useState(true)
  const voice = useSessionVoice(session, setSession)
  const myId = session ? (session.voiceInitiator ? session.playerOne.id : session.playerTwo?.id) : null

  useEffect(() => {
    if (!getProfileKey()) return
    const id = localStorage.getItem(SESSION_KEY)
    const restore = id ? getCoopSession(id).catch(() => getCurrentCoopSession()) : getCurrentCoopSession()
    restore.then(current => {
      if (current) { localStorage.setItem(SESSION_KEY, current.id); setSession(current) }
      else localStorage.removeItem(SESSION_KEY)
    }).catch(() => localStorage.removeItem(SESSION_KEY)).finally(() => setRestoring(false))
  }, [])

  useEffect(() => {
    if (!session || ['CLOSED', 'CANCELLED'].includes(session.state)) return
    const poll = window.setInterval(() => getCoopSession(session.id).then(setSession).catch(() => {}), 2000)
    return () => window.clearInterval(poll)
  }, [session?.id, session?.state])

  useEffect(() => {
    if (!session || !myId || !session.partner || !['NEGOTIATING', 'ACTIVE'].includes(session.state)) return
    let stopped = false
    setMessagingReady(false)
    const partnerId = session.partner.id
    const load = async () => {
      try {
        await ensureE2eeIdentity(myId)
        const [items, fingerprint] = await Promise.all([getCoopMessages(session.id), getE2eeFingerprint(partnerId)])
        const decrypted = await Promise.all(items.map(item =>
          decryptMessage('coop-session', session.id, myId, partnerId, item)))
        if (!stopped) { setMessages(decrypted); setMessagingReady(Boolean(fingerprint)) }
      } catch (cause) {
        if (!stopped) setError(cause instanceof Error ? cause.message : 'Could not load session messages')
      }
    }
    void load()
    const poll = window.setInterval(load, 5000)
    return () => { stopped = true; window.clearInterval(poll) }
  }, [session?.id, session?.state, session?.partner?.id, myId])

  const act = async (operation: () => Promise<CoopSession>) => {
    setBusy(true); setError(''); setNotice('')
    try { setSession(await operation()) } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong') }
    finally { setBusy(false) }
  }
  const findSomeone = async () => {
    setBusy(true); setError(''); setNotice('')
    try {
      const next = await joinCoopSession()
      localStorage.setItem(SESSION_KEY, next.id)
      setSession(next)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not join the queue') }
    finally { setBusy(false) }
  }
  const leave = async () => {
    if (!session) return
    await voice.leave()
    await act(async () => {
      const closed = await leaveCoopSession(session.id)
      localStorage.removeItem(SESSION_KEY)
      return closed
    })
  }
  const suggest = async (event: FormEvent) => {
    event.preventDefault()
    if (!session || !suggestion.trim()) return
    await act(() => suggestCoopProblem(session.id, suggestion.trim()))
    setSuggestion('')
  }
  const chat = async (event: FormEvent) => {
    event.preventDefault()
    if (!session || !session.partner || !myId || !message.trim()) return
    try {
      const encrypted = await encryptMessage('coop-session', session.id, myId, session.partner.id, message.trim())
      const sent = await sendCoopMessage(session.id, encrypted)
      const decrypted = await decryptMessage('coop-session', session.id, myId, session.partner.id, sent)
      setMessages(current => [...current.filter(item => item.id !== sent.id), decrypted])
      setMessage('')
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not send message') }
  }
  const connect = async () => {
    if (!session?.partner) return
    setBusy(true); setError('')
    try {
      const result = await sendConnectionRequest(session.partner.id, session.id)
      setNotice(result.status === 'ACCEPTED' ? 'You are already connected.' : 'Connection request sent.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not send connection request') }
    finally { setBusy(false) }
  }
  const reset = () => { localStorage.removeItem(SESSION_KEY); setSession(null); setMessages([]); setMessagingReady(false); setNotice(''); setError('') }

  if (!getProfileKey()) return <main className="mx-auto max-w-xl px-4 py-16"><div className="card card-border bg-base-200"><div className="card-body items-center text-center"><Users className="text-secondary" size={30}/><h1 className="card-title">Log in to find a coding partner</h1><p className="text-base-content/70">Shared sessions use your verified LeetCode profile.</p><Link className="btn btn-primary mt-3" to="/login">Log in</Link></div></div></main>

  const rerollMine = Boolean(session?.rerollRequestedById && session.rerollRequestedById === myId)

  return <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:py-16">
    <header className="mx-auto mb-10 max-w-3xl text-center"><p className="mb-4 font-mono text-xs text-secondary">// cooperative workspace</p><h1 className="text-4xl font-semibold tracking-[-.05em] sm:text-6xl">Practice with a partner</h1><p className="mx-auto mt-5 max-w-2xl leading-7 text-base-content/70">Pair with someone around your level, agree on a problem, and work through it together on LeetCode.</p></header>

    {restoring && <div className="mx-auto max-w-2xl space-y-3" aria-label="Restoring session"><div className="skeleton h-28 w-full"></div><div className="skeleton h-56 w-full"></div></div>}
    {!restoring && !session && <section className="card card-border mx-auto max-w-2xl bg-base-200/85"><div className="card-body items-center p-8 text-center sm:p-12"><span className="grid size-16 place-items-center rounded-box border border-secondary/30 bg-secondary/10 text-secondary"><Users/></span><h2 className="card-title mt-3 text-2xl">Start a shared coding session</h2><p className="max-w-lg leading-7 text-base-content/70">We’ll look for a verified user with a reasonably similar contest rating. There are no winners, scores, or timers.</p>{error && <div role="alert" className="alert alert-error alert-soft mt-2"><span>{error}</span></div>}<button className="btn btn-primary mt-3" disabled={busy} onClick={() => void findSomeone()}>{busy ? <span className="loading loading-spinner loading-sm"></span> : <Users size={17}/>}Start matching</button></div></section>}

    {session?.state === 'SEARCHING' && <section className="card card-border mx-auto max-w-2xl bg-base-200/85"><div className="card-body items-center p-8 text-center sm:p-12"><span className="grid size-16 place-items-center rounded-full border border-secondary/30 bg-secondary/10 text-secondary"><LoaderCircle className="animate-spin"/></span><h2 className="card-title mt-3 text-2xl">Searching for a coding partner…</h2><p className="max-w-lg leading-7 text-base-content/70">You can leave this page open. Your shared session appears as soon as someone joins.</p><button className="btn mt-3" disabled={busy} onClick={() => void leave()}><LogOut size={16}/>Leave queue</button></div></section>}

    {session && ['NEGOTIATING', 'ACTIVE'].includes(session.state) && session.partner && <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="space-y-4">
        <div className="card card-border bg-base-200/80"><div className="card-body flex-row flex-wrap items-center justify-between gap-5 p-5"><Player session={session}/><div className="text-left sm:text-right"><p className="flex items-center gap-2 text-sm font-semibold sm:justify-end"><span className="status status-success"></span>{session.state === 'ACTIVE' ? 'Session open' : 'Choosing a problem'}</p><small className="mt-1 block text-base-content/65">{session.state === 'ACTIVE' ? 'Solve and compare approaches at your own pace' : 'Both people must accept the same problem'}</small></div></div></div>

        {session.problem && <article className="card card-border overflow-hidden bg-base-200/85"><div className="card-body gap-5 p-6 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-mono text-xs text-secondary">// {session.proposedById ? 'suggested problem' : 'server suggestion'}</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">{session.problem.title}</h2><span className={`badge badge-soft mt-3 ${session.problem.difficulty === 'Easy' ? 'badge-success' : session.problem.difficulty === 'Medium' ? 'badge-warning' : 'badge-error'}`}>{session.problem.difficulty}</span></div><a className="btn shrink-0" href={session.problem.url} target="_blank" rel="noreferrer">Open on LeetCode <ExternalLink size={16}/></a></div></article>}

        {session.state === 'NEGOTIATING' && <section className="card card-border bg-base-200/80"><div className="card-body gap-5 p-5 sm:p-6">
          <div className="grid gap-2 sm:grid-cols-2"><span className={`alert py-3 text-sm ${session.myAccepted ? 'alert-success alert-soft' : ''}`}>{session.myAccepted ? <span className="status status-success"></span> : <span className="status status-neutral"></span>}{session.myAccepted ? 'You accepted' : 'Waiting for you'}</span><span className={`alert py-3 text-sm ${session.partnerAccepted ? 'alert-success alert-soft' : ''}`}>{session.partnerAccepted ? <span className="status status-success"></span> : <span className="status status-neutral"></span>}{session.partnerAccepted ? `${session.partner.leetcodeUsername} accepted` : `Waiting for ${session.partner.leetcodeUsername}`}</span></div>
          <div className="flex flex-wrap gap-2"><button className="btn btn-primary" disabled={busy || session.myAccepted} onClick={() => void act(() => acceptCoopProblem(session.id))}>{session.myAccepted ? 'Accepted' : 'Accept this problem'}</button><button className="btn" disabled={busy || rerollMine} onClick={() => void act(() => rerollCoopProblem(session.id))}><RefreshCw size={16}/>{rerollMine ? 'Waiting for agreement' : session.rerollRequestedById ? 'Agree to reroll' : 'Request reroll'}</button></div>
          <form className="grid gap-3 border-t border-base-300 pt-5 sm:grid-cols-[1fr_auto] sm:items-end" onSubmit={suggest}><fieldset className="fieldset"><legend className="fieldset-legend">Or suggest a LeetCode URL or exact title</legend><input className="input w-full" maxLength={500} value={suggestion} onChange={event => setSuggestion(event.target.value)} placeholder="https://leetcode.com/problems/two-sum/"/></fieldset><button className="btn" disabled={busy || !suggestion.trim()}><Sparkles size={16}/>Suggest</button></form>
        </div></section>}

        {session.state === 'ACTIVE' && <div role="status" className="alert alert-success alert-soft"><Sparkles/><div><h3 className="font-semibold">Session open</h3><p className="text-sm">Discuss tradeoffs and compare solutions here.</p></div></div>}
        {notice && <div role="status" className="alert alert-success alert-soft"><span>{notice} <Link className="link" to="/connections">View connections</Link></span></div>}
        {error && <div role="alert" className="alert alert-error alert-soft"><span>{error}</span></div>}
        <div className="flex flex-wrap gap-2">{session.state === 'ACTIVE' && <button className="btn btn-primary" disabled={busy} onClick={() => void connect()}><Handshake size={17}/>Connect with player</button>}<button className="btn" disabled={busy} onClick={() => void leave()}><LogOut size={16}/>Leave session</button></div>
      </section>

      <aside className="space-y-4">
        <VoicePanel session={session} voice={voice}/>
        <section className="card card-border min-h-[26rem] bg-base-200/80"><div className="card-body p-5"><div><p className="font-mono text-xs text-secondary">// discussion</p><h3 className="mt-1 text-lg font-semibold">Session notes</h3></div><div className="flex max-h-72 flex-1 flex-col gap-2 overflow-y-auto py-2">{messages.map(item => <div key={item.id} className={`chat ${item.senderId === myId ? 'chat-end' : 'chat-start'}`}><div className="chat-header text-xs text-base-content/65">{item.senderId === myId ? 'You' : item.senderUsername}</div><div className="chat-bubble text-sm"><p>{item.displayContent}</p>{item.decryptionState === 'legacy' && <small className="mt-1 block text-warning">Sent before private messaging was enabled</small>}</div></div>)}{messages.length === 0 && <p className="m-auto text-center text-sm text-base-content/60">Say hello, share a hint, or compare complexity.</p>}</div><form className="flex items-end gap-2" onSubmit={chat}><input className="input min-w-0 flex-1" maxLength={1000} value={message} onChange={event => setMessage(event.target.value)} placeholder={messagingReady ? 'Write a message…' : 'Messaging isn’t ready yet…'} disabled={!messagingReady}/><button className="btn btn-primary btn-square" disabled={!message.trim() || !messagingReady} aria-label="Send message">{messagingReady ? <Send size={16}/> : <span className="loading loading-spinner loading-sm"></span>}</button></form></div></section>
      </aside>
    </div>}

    {session && ['CLOSED', 'CANCELLED'].includes(session.state) && <section className="card card-border mx-auto max-w-2xl bg-base-200/85"><div className="card-body items-center p-8 text-center"><Users className="text-base-content/55"/><h2 className="card-title text-2xl">{session.state === 'CANCELLED' ? 'Search ended' : 'Shared session closed'}</h2><p className="text-base-content/70">{session.startedAt ? 'You can still connect with your coding partner.' : 'No session was started.'}</p>{notice && <div className="alert alert-success alert-soft"><span>{notice}</span></div>}{error && <div className="alert alert-error alert-soft"><span>{error}</span></div>}<div className="flex flex-wrap justify-center gap-2">{session.startedAt && session.partner && <button className="btn btn-primary" disabled={busy} onClick={() => void connect()}><Handshake size={17}/>Connect with player</button>}<button className="btn" onClick={reset}>Search again</button></div></div></section>}
  </main>
}

function Player({ session }: { session: CoopSession }) {
  const partner = session.partner!
  return <div className="flex items-center gap-3"><div className="avatar avatar-placeholder"><div className="size-11 rounded-selector bg-neutral text-neutral-content"><span className="font-mono text-xs">{partner.leetcodeUsername.slice(0, 2).toUpperCase()}</span></div></div><div><small className="block text-base-content/65">Your coding partner</small><strong className="block">{partner.leetcodeUsername}</strong><span className="text-sm text-base-content/68">{partner.contestRating ? `${Math.round(partner.contestRating)} rating` : 'Unrated'}</span></div></div>
}

function VoicePanel({ session, voice }: { session: CoopSession; voice: ReturnType<typeof useSessionVoice> }) {
  return <section className="card card-border bg-base-200/80"><div className="card-body gap-4 p-5"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-field bg-secondary/10 text-secondary"><Headphones size={19}/></span><div><p className="font-mono text-xs text-secondary">// voice</p><h3 className="font-semibold">Audio room</h3></div></div><p className="flex items-center gap-2 text-sm text-base-content/70"><span className={`status ${session.partnerVoice.joined ? 'status-success' : 'status-neutral'}`}></span>{session.partnerVoice.joined ? `${session.partner?.leetcodeUsername} is ${session.partnerVoice.muted ? 'muted' : 'in voice'}` : `${session.partner?.leetcodeUsername} is not in voice`}</p>{voice.error && <div role="alert" className="alert alert-error alert-soft py-2 text-sm"><span>{voice.error}</span></div>}{!voice.joined ? <button className="btn btn-primary" onClick={() => void voice.join()}><Mic size={16}/>Join voice</button> : <div className="flex flex-wrap gap-2"><button className="btn" onClick={() => void voice.toggleMute()}>{voice.muted ? <MicOff size={16}/> : <Mic size={16}/>}{voice.muted ? 'Unmute' : 'Mute'}</button><button className="btn btn-error btn-soft" onClick={() => void voice.leave()}><LogOut size={16}/>Leave voice</button></div>}<audio ref={voice.audioRef} autoPlay/></div></section>
}

function useSessionVoice(session: CoopSession | null, refresh: (value: CoopSession) => void) {
  const [joined, setJoined] = useState(false)
  const [muted, setMuted] = useState(false)
  const [error, setError] = useState('')
  const audioRef = useRef<HTMLAudioElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const peerRef = useRef<RTCPeerConnection | null>(null)
  const afterRef = useRef(0)
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([])
  const offerSentRef = useRef(false)
  const sessionIdRef = useRef<string | null>(null)
  sessionIdRef.current = session?.id ?? null

  const closePeer = useCallback(() => {
    peerRef.current?.close(); peerRef.current = null
    pendingIceRef.current = []; offerSentRef.current = false
    if (audioRef.current) audioRef.current.srcObject = null
  }, [])

  const ensurePeer = useCallback(() => {
    if (peerRef.current) return peerRef.current
    if (!sessionIdRef.current || !streamRef.current) throw new Error('Join voice first')
    const id = sessionIdRef.current
    const peer = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] })
    streamRef.current.getTracks().forEach(track => peer.addTrack(track, streamRef.current!))
    peer.ontrack = event => { if (audioRef.current) audioRef.current.srcObject = event.streams[0] }
    peer.onicecandidate = event => { if (event.candidate) void sendVoiceSignal(id, 'ICE', JSON.stringify(event.candidate.toJSON())).catch(() => {}) }
    peerRef.current = peer
    return peer
  }, [])

  const flushIce = useCallback(async (peer: RTCPeerConnection) => {
    const pending = pendingIceRef.current.splice(0)
    for (const candidate of pending) await peer.addIceCandidate(candidate)
  }, [])

  const handleSignal = useCallback(async (signal: VoiceSignal) => {
    const id = sessionIdRef.current
    if (!id) return
    const peer = ensurePeer()
    if (signal.type === 'OFFER') {
      await peer.setRemoteDescription(JSON.parse(signal.payload))
      await flushIce(peer)
      const answer = await peer.createAnswer(); await peer.setLocalDescription(answer)
      await sendVoiceSignal(id, 'ANSWER', JSON.stringify(answer))
    } else if (signal.type === 'ANSWER') {
      if (peer.signalingState === 'have-local-offer') { await peer.setRemoteDescription(JSON.parse(signal.payload)); await flushIce(peer) }
    } else {
      const candidate = JSON.parse(signal.payload) as RTCIceCandidateInit
      if (peer.remoteDescription) await peer.addIceCandidate(candidate); else pendingIceRef.current.push(candidate)
    }
  }, [ensurePeer, flushIce])

  const join = useCallback(async () => {
    if (!sessionIdRef.current) return
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      await joinSessionVoice(sessionIdRef.current)
      streamRef.current = stream; setJoined(true); setMuted(false)
      refresh(await getCoopSession(sessionIdRef.current))
    } catch (e) {
      streamRef.current?.getTracks().forEach(track => track.stop()); streamRef.current = null
      setError(e instanceof Error ? e.message : 'Microphone access failed')
    }
  }, [refresh])

  const leave = useCallback(async () => {
    const id = sessionIdRef.current
    closePeer(); streamRef.current?.getTracks().forEach(track => track.stop()); streamRef.current = null
    setJoined(false); setMuted(false); afterRef.current = 0
    if (id) await leaveSessionVoice(id).catch(() => {})
  }, [closePeer])

  const toggleMute = useCallback(async () => {
    if (!sessionIdRef.current) return
    const next = !muted
    streamRef.current?.getAudioTracks().forEach(track => { track.enabled = !next })
    try { await muteSessionVoice(sessionIdRef.current, next); setMuted(next) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not update microphone') }
  }, [muted])

  useEffect(() => {
    if (!joined || !session || !['NEGOTIATING', 'ACTIVE'].includes(session.state)) return
    let stopped = false
    const poll = async () => {
      try {
        const signals = await getVoiceSignals(session.id, afterRef.current)
        for (const signal of signals) { afterRef.current = Math.max(afterRef.current, signal.id); await handleSignal(signal) }
      } catch (e) { if (!stopped) setError(e instanceof Error ? e.message : 'Voice connection failed') }
    }
    void poll(); const timer = window.setInterval(poll, 700)
    return () => { stopped = true; window.clearInterval(timer) }
  }, [joined, session?.id, session?.state, handleSignal])

  useEffect(() => {
    if (!joined || !session?.partnerVoice.joined) { if (joined) closePeer(); return }
    if (!session.voiceInitiator || offerSentRef.current) return
    offerSentRef.current = true
    const offer = async () => {
      try {
        const peer = ensurePeer(); const description = await peer.createOffer()
        await peer.setLocalDescription(description)
        await sendVoiceSignal(session.id, 'OFFER', JSON.stringify(description))
      } catch (e) { offerSentRef.current = false; setError(e instanceof Error ? e.message : 'Voice connection failed') }
    }
    void offer()
  }, [joined, session?.id, session?.partnerVoice.joined, session?.voiceInitiator, closePeer, ensurePeer])

  useEffect(() => {
    if (joined && session && ['CLOSED', 'CANCELLED'].includes(session.state)) void leave()
  }, [joined, session?.state, leave])

  useEffect(() => () => {
    const id = sessionIdRef.current
    peerRef.current?.close(); streamRef.current?.getTracks().forEach(track => track.stop())
    if (id && streamRef.current) void leaveSessionVoice(id).catch(() => {})
  }, [])

  return { joined, muted, error, audioRef, join, leave, toggleMute }
}
