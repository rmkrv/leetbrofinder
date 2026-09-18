import { Lock, MessageCircle, Send } from 'lucide-react'
import { FormEvent, useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getMe, getMessages, getProfileKey, listConversations, sendMessage } from '../api'
import { decryptMessage, encryptMessage, ensureE2eeIdentity, formatFingerprint, getE2eeFingerprint, type Decrypted } from '../e2ee'
import type { Conversation, Message } from '../types'

const displayName = (value: string | null | undefined) => value?.trim() || 'Unknown user'
const initials = (value: string | null | undefined) => displayName(value).slice(0, 2).toUpperCase()
type DisplayMessage = Decrypted<Message>

export default function MessagesPage() {
  const [params] = useSearchParams()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selected, setSelected] = useState(params.get('conversation') || '')
  const [messages, setMessages] = useState<DisplayMessage[]>([])
  const [myProfileId, setMyProfileId] = useState('')
  const [partnerFingerprint, setPartnerFingerprint] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')

  const loadConversations = useCallback(async () => {
    const items = await listConversations()
    setConversations(items)
    setSelected(current => current || items[0]?.id || '')
  }, [])

  useEffect(() => {
    if (!getProfileKey()) return
    let stopped = false
    getMe().then(async me => {
      await ensureE2eeIdentity(me.id)
      if (stopped) return
      setMyProfileId(me.id)
      await loadConversations()
    }).catch(cause => { if (!stopped) setError(cause instanceof Error ? cause.message : 'Could not initialize messaging') })
    return () => { stopped = true }
  }, [loadConversations])

  const active = conversations.find(conversation => conversation.id === selected)
  const partnerId = active?.otherProfile?.id || ''

  useEffect(() => {
    if (!selected || !myProfileId || !partnerId) return
    let stopped = false
    setMessages([])
    setPartnerFingerprint(null)
    const load = async () => {
      try {
        const [items, fingerprint] = await Promise.all([getMessages(selected), getE2eeFingerprint(partnerId)])
        const decrypted = await Promise.all(items.map(item =>
          decryptMessage('conversation', selected, myProfileId, partnerId, item)))
        if (!stopped) { setMessages(decrypted); setPartnerFingerprint(fingerprint); setError('') }
      } catch (cause) {
        if (!stopped) setError(cause instanceof Error ? cause.message : 'Could not load messages')
      }
    }
    void load()
    const poll = window.setInterval(load, 8000)
    return () => { stopped = true; window.clearInterval(poll) }
  }, [selected, myProfileId, partnerId])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!draft.trim() || !selected || !myProfileId || !partnerId) return
    try {
      const encrypted = await encryptMessage('conversation', selected, myProfileId, partnerId, draft.trim())
      const sent = await sendMessage(selected, encrypted)
      const decrypted = await decryptMessage('conversation', selected, myProfileId, partnerId, sent)
      setMessages(current => [...current, decrypted])
      setDraft('')
      await loadConversations()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send message')
    }
  }

  if (!getProfileKey()) return <main className="narrow-page"><div className="surface blocked"><MessageCircle size={28}/><h2>Log in to see your conversations</h2><p>Use your LeetCode username and LeetBroFinder password.</p><Link className="primary" to="/login">Log in</Link></div></main>

  return <main className="messages-page">
    <div className="page-heading"><h1>Messages</h1><p>Messages are end-to-end encrypted.</p></div>
    {error && <div className="notice error">{error}</div>}
    <div className="message-shell surface">
      <aside>
        <h2>Inbox</h2>
        {conversations.map(conversation => {
          const username = displayName(conversation.otherProfile?.leetcodeUsername)
          const preview = conversation.lastMessage?.cryptoVersion ? 'New message' : conversation.lastMessage?.content || 'New conversation'
          return <button key={conversation.id} className={selected === conversation.id ? 'active' : ''} onClick={() => setSelected(conversation.id)}>
            <span className="mini-avatar">{initials(username)}</span>
            <span><strong>{username}</strong><small>{preview}</small></span>
          </button>
        })}
        {!conversations.length && <div className="inbox-empty"><p>No conversations yet.</p><Link to="/">Find someone to message</Link></div>}
      </aside>
      <section className="thread">
        {active ? <>
          <header>
            <span className="mini-avatar">{initials(active.otherProfile?.leetcodeUsername)}</span>
            <div><strong>{displayName(active.otherProfile?.leetcodeUsername)}</strong><small>{active.otherProfile?.preferredLanguage || 'Language not set'} · {active.otherProfile?.timezone || 'Timezone not set'}</small>{partnerFingerprint && <small title={`Full fingerprint: ${partnerFingerprint}`}><Lock size={11}/> Security code: {formatFingerprint(partnerFingerprint)}</small>}</div>
            {active.otherProfile?.id && <Link to={`/profiles/${active.otherProfile.id}`}>View profile</Link>}
          </header>
          <div className="message-list">{messages.map(message => <div key={message.id} className={message.senderId === active.otherProfile?.id ? 'message' : 'message mine'}><strong>{displayName(message.senderUsername)}</strong><p>{message.displayContent}</p>{message.decryptionState === 'legacy' && <small>Sent before private messaging was enabled</small>}<time>{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div>)}</div>
          <form onSubmit={submit}><input value={draft} onChange={event => setDraft(event.target.value)} maxLength={1000} placeholder={partnerFingerprint ? 'Write a message…' : 'Messaging isn’t ready yet…'} aria-label="Message"/><button aria-label="Send message" disabled={!draft.trim() || !partnerFingerprint}><Send size={18}/></button></form>
        </> : <div className="thread-empty"><MessageCircle/><h2>Pick a conversation</h2><p>Your messages will appear here.</p></div>}
      </section>
    </div>
  </main>
}
