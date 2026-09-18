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
  const [partnerFingerprint, setPartnerFingerprint] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [suggestion, setSuggestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const voice = useSessionVoice(session, setSession)
  const myId = session ? (session.voiceInitiator ? session.playerOne.id : session.playerTwo?.id) : null

  useEffect(() => {
    if (!getProfileKey()) return
    const id = localStorage.getItem(SESSION_KEY)
    const restore = id ? getCoopSession(id).catch(() => getCurrentCoopSession()) : getCurrentCoopSession()
    restore.then(current => {
      if (current) { localStorage.setItem(SESSION_KEY, current.id); setSession(current) }
      else localStorage.removeItem(SESSION_KEY)
    }).catch(() => localStorage.removeItem(SESSION_KEY))
  }, [])

  useEffect(() => {
    if (!session || ['CLOSED', 'CANCELLED'].includes(session.state)) return
    const poll = window.setInterval(() => getCoopSession(session.id).then(setSession).catch(() => {}), 2000)
    return () => window.clearInterval(poll)
  }, [session?.id, session?.state])

  useEffect(() => {
    if (!session || !myId || !session.partner || !['NEGOTIATING', 'ACTIVE'].includes(session.state)) return
    let stopped = false
    setPartnerFingerprint(null)
    const partnerId = session.partner.id
    const load = async () => {
      try {
        await ensureE2eeIdentity(myId)
        const [items, fingerprint] = await Promise.all([getCoopMessages(session.id), getE2eeFingerprint(partnerId)])
        const decrypted = await Promise.all(items.map(item =>
          decryptMessage('coop-session', session.id, myId, partnerId, item)))
        if (!stopped) { setMessages(decrypted); setPartnerFingerprint(fingerprint) }
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
  const reset = () => { localStorage.removeItem(SESSION_KEY); setSession(null); setMessages([]); setPartnerFingerprint(null); setNotice(''); setError('') }

  if (!getProfileKey()) return <main className="narrow-page"><div className="surface blocked"><Users size={30}/><h2>Log in to find a coding partner</h2><p>Shared sessions use your verified LeetCode profile.</p><Link className="primary" to="/login">Log in</Link></div></main>

  const rerollMine = Boolean(session?.rerollRequestedById && session.rerollRequestedById === myId)

  return <main className="coop-page">
    <div className="page-heading center"><p className="eyebrow">Live practice, together</p><h1>Find someone</h1><p>Pair with someone around your level, agree on a problem, and work through it together on LeetCode.</p></div>

    {!session && <section className="surface session-lobby"><div className="session-icon"><Users/></div><h2>Start a shared coding session</h2><p>We’ll look for a verified user with a reasonably similar contest rating. There are no winners, scores, or timers.</p>{error && <p className="form-error">{error}</p>}<button className="primary" disabled={busy} onClick={findSomeone}>{busy ? <LoaderCircle className="spin"/> : <Users size={17}/>} Find someone</button></section>}

    {session?.state === 'SEARCHING' && <section className="surface session-lobby"><div className="radar searching"><LoaderCircle/></div><p className="eyebrow">Looking nearby</p><h2>Searching for a coding partner…</h2><p>You can leave this page open. Your shared session appears as soon as someone joins.</p><button className="secondary" disabled={busy} onClick={leave}><LogOut size={16}/> Leave queue</button></section>}

    {session && ['NEGOTIATING', 'ACTIVE'].includes(session.state) && session.partner && <div className="session-grid">
      <section className="session-main">
        <div className="surface partner-strip"><Player session={session}/><div className="session-state"><span className="online-dot"/><strong>{session.state === 'ACTIVE' ? 'Session open' : 'Choosing a problem'}</strong><small>{session.state === 'ACTIVE' ? 'Solve and compare approaches at your own pace' : 'Both people must accept the same problem'}</small></div></div>

        {session.problem && <article className="surface coop-problem"><div><p className="eyebrow">{session.proposedById ? 'Suggested problem' : 'Server suggestion'}</p><h2>{session.problem.title}</h2><span className={`difficulty ${session.problem.difficulty.toLowerCase()}`}>{session.problem.difficulty}</span></div><a className="secondary" href={session.problem.url} target="_blank" rel="noreferrer">Open on LeetCode <ExternalLink size={16}/></a></article>}

        {session.state === 'NEGOTIATING' && <section className="surface problem-controls">
          <div className="acceptance"><span className={session.myAccepted ? 'accepted' : ''}>{session.myAccepted ? 'You accepted' : 'Waiting for you'}</span><span className={session.partnerAccepted ? 'accepted' : ''}>{session.partnerAccepted ? `${session.partner.leetcodeUsername} accepted` : `Waiting for ${session.partner.leetcodeUsername}`}</span></div>
          <div className="control-row"><button className="primary" disabled={busy || session.myAccepted} onClick={() => act(() => acceptCoopProblem(session.id))}>{session.myAccepted ? 'Accepted' : 'Accept this problem'}</button><button className="secondary" disabled={busy || rerollMine} onClick={() => act(() => rerollCoopProblem(session.id))}><RefreshCw size={16}/>{rerollMine ? 'Waiting for agreement' : session.rerollRequestedById ? 'Agree to reroll' : 'Request reroll'}</button></div>
          <form className="suggest-form" onSubmit={suggest}><label>Or suggest a LeetCode URL or exact title<input maxLength={500} value={suggestion} onChange={e => setSuggestion(e.target.value)} placeholder="https://leetcode.com/problems/two-sum/"/></label><button className="secondary" disabled={busy || !suggestion.trim()}><Sparkles size={16}/> Suggest</button></form>
        </section>}

        {session.state === 'ACTIVE' && <section className="surface working-note"><Sparkles/><div><h3>You both accepted</h3><p>Work on the problem together. This room stays open so you can discuss tradeoffs and compare solutions afterward.</p></div></section>}

        {notice && <p className="form-success">{notice} <Link to="/connections">View connections</Link></p>}
        {error && <p className="form-error">{error}</p>}
        <div className="session-actions">{session.state === 'ACTIVE' && <button className="primary" disabled={busy} onClick={connect}><Handshake size={17}/> Connect with player</button>}<button className="secondary" disabled={busy} onClick={leave}><LogOut size={16}/> Leave session</button></div>
      </section>

      <aside className="session-side">
        <VoicePanel session={session} voice={voice}/>
        <section className="surface discussion"><div><p className="eyebrow">Discussion</p><h3>Session notes</h3></div><div className="session-messages">{messages.map(item => <div key={item.id} className={item.senderId === myId ? 'mine' : ''}><strong>{item.senderId === myId ? 'You' : item.senderUsername}</strong><p>{item.displayContent}</p>{item.decryptionState === 'legacy' && <small>Sent before private messaging was enabled</small>}</div>)}{messages.length === 0 && <p className="chat-empty">Say hello, share a hint, or compare complexity.</p>}</div><form onSubmit={chat}><input maxLength={1000} value={message} onChange={e => setMessage(e.target.value)} placeholder={partnerFingerprint ? 'Write a message…' : 'Messaging isn’t ready yet…'}/><button className="primary" disabled={!message.trim() || !partnerFingerprint} aria-label="Send message"><Send size={16}/></button></form></section>
      </aside>
    </div>}

    {session && ['CLOSED', 'CANCELLED'].includes(session.state) && <section className="surface session-lobby"><Users/><h2>{session.state === 'CANCELLED' ? 'Search ended' : 'Shared session closed'}</h2><p>{session.startedAt ? 'You can still connect with your coding partner.' : 'No session was started.'}</p>{notice && <p className="form-success">{notice}</p>}{error && <p className="form-error">{error}</p>}<div className="control-row">{session.startedAt && session.partner && <button className="primary" disabled={busy} onClick={connect}><Handshake size={17}/> Connect with player</button>}<button className="secondary" onClick={reset}>Find someone else</button></div></section>}
  </main>
}

function Player({ session }: { session: CoopSession }) {
  const partner = session.partner!
  return <div className="partner-person"><span className="mini-avatar">{partner.leetcodeUsername.slice(0, 2).toUpperCase()}</span><div><small>Your coding partner</small><strong>{partner.leetcodeUsername}</strong><span>{partner.contestRating ? `${Math.round(partner.contestRating)} rating` : 'Unrated'}</span></div></div>
}

function VoicePanel({ session, voice }: { session: CoopSession; voice: ReturnType<typeof useSessionVoice> }) {
  return <section className="surface voice-panel"><div className="voice-heading"><span><Headphones size={19}/></span><div><p className="eyebrow">Voice</p><h3>Talk while you solve</h3></div></div><p className="voice-presence"><i className={session.partnerVoice.joined ? 'online' : ''}/>{session.partnerVoice.joined ? `${session.partner?.leetcodeUsername} is ${session.partnerVoice.muted ? 'muted' : 'in voice'}` : `${session.partner?.leetcodeUsername} is not in voice`}</p>{voice.error && <p className="form-error">{voice.error}</p>}{!voice.joined ? <button className="primary" onClick={voice.join}><Mic size={16}/> Join voice</button> : <div className="voice-actions"><button className="secondary" onClick={voice.toggleMute}>{voice.muted ? <MicOff size={16}/> : <Mic size={16}/>} {voice.muted ? 'Unmute' : 'Mute'}</button><button className="secondary danger" onClick={voice.leave}><LogOut size={16}/> Leave voice</button></div>}<audio ref={voice.audioRef} autoPlay/></section>
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
