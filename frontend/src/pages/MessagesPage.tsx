import { MessageCircle, Send } from 'lucide-react'
import { FormEvent, useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getMe, getMessages, getProfileKey, listConversations, sendMessage } from '../api'
import { decryptMessage, encryptMessage, ensureE2eeIdentity, getE2eeFingerprint, type Decrypted } from '../e2ee'
import type { Conversation, Message } from '../types'

const displayName = (value: string | null | undefined) => value?.trim() || 'Unknown user'
const initials = (value: string | null | undefined) => displayName(value).slice(0, 2).toUpperCase()
type DisplayMessage = Decrypted<Message>

const REFRESH_AFTER_MS = 8000

type MessagesSnapshot = {
  profileKey: string
  conversations: Conversation[]
  conversationsUpdatedAt: number
  selected: string
  myProfileId: string
  messages: Map<string, DisplayMessage[]>
  messagesUpdatedAt: Map<string, number>
  messagingReady: Map<string, boolean>
  drafts: Map<string, string>
}

let cachedSnapshot: MessagesSnapshot | null = null
let pendingInitialization: { profileKey: string; promise: Promise<void> } | null = null
let pendingConversations: { profileKey: string; promise: Promise<Conversation[]> } | null = null
const pendingMessages = new Map<string, Promise<{ items: DisplayMessage[]; ready: boolean }>>()

const snapshotFor = (profileKey: string) => {
  if (cachedSnapshot?.profileKey === profileKey) return cachedSnapshot
  pendingMessages.clear()
  cachedSnapshot = {
    profileKey,
    conversations: [],
    conversationsUpdatedAt: 0,
    selected: '',
    myProfileId: '',
    messages: new Map(),
    messagesUpdatedAt: new Map(),
    messagingReady: new Map(),
    drafts: new Map(),
  }
  return cachedSnapshot
}

const refreshConversations = (snapshot: MessagesSnapshot, force = false) => {
  if (!force && Date.now() - snapshot.conversationsUpdatedAt < REFRESH_AFTER_MS) {
    return Promise.resolve(snapshot.conversations)
  }
  if (pendingConversations?.profileKey === snapshot.profileKey) return pendingConversations.promise

  const promise = listConversations()
    .then(items => {
      snapshot.conversations = items
      snapshot.conversationsUpdatedAt = Date.now()
      return items
    })
    .finally(() => {
      if (pendingConversations?.promise === promise) pendingConversations = null
    })

  pendingConversations = { profileKey: snapshot.profileKey, promise }
  return promise
}

const initializeMessaging = (snapshot: MessagesSnapshot) => {
  if (snapshot.myProfileId) return refreshConversations(snapshot).then(() => undefined)
  if (pendingInitialization?.profileKey === snapshot.profileKey) return pendingInitialization.promise

  const promise = getMe()
    .then(async me => {
      await ensureE2eeIdentity(me.id)
      snapshot.myProfileId = me.id
      await refreshConversations(snapshot, true)
    })
    .finally(() => {
      if (pendingInitialization?.promise === promise) pendingInitialization = null
    })

  pendingInitialization = { profileKey: snapshot.profileKey, promise }
  return promise
}

const refreshMessages = (
  snapshot: MessagesSnapshot,
  conversationId: string,
  myProfileId: string,
  partnerId: string,
  force = false,
) => {
  const updatedAt = snapshot.messagesUpdatedAt.get(conversationId) || 0
  if (!force && Date.now() - updatedAt < REFRESH_AFTER_MS) {
    return Promise.resolve({
      items: snapshot.messages.get(conversationId) || [],
      ready: snapshot.messagingReady.get(conversationId) || false,
    })
  }

  const pendingKey = `${snapshot.profileKey}:${conversationId}`
  const pending = pendingMessages.get(pendingKey)
  if (pending) return pending

  const promise = Promise.all([getMessages(conversationId), getE2eeFingerprint(partnerId)])
    .then(async ([items, fingerprint]) => {
      const decrypted = await Promise.all(items.map(item =>
        decryptMessage('conversation', conversationId, myProfileId, partnerId, item)))
      const result = { items: decrypted, ready: Boolean(fingerprint) }
      snapshot.messages.set(conversationId, result.items)
      snapshot.messagingReady.set(conversationId, result.ready)
      snapshot.messagesUpdatedAt.set(conversationId, Date.now())
      return result
    })
    .finally(() => {
      if (pendingMessages.get(pendingKey) === promise) pendingMessages.delete(pendingKey)
    })

  pendingMessages.set(pendingKey, promise)
  return promise
}

export default function MessagesPage() {
  const [params] = useSearchParams()
  const profileKey = getProfileKey() || ''
  const snapshot = snapshotFor(profileKey)
  const initialSelected = params.get('conversation') || snapshot.selected || snapshot.conversations[0]?.id || ''
  const [conversations, setConversations] = useState<Conversation[]>(() => snapshot.conversations)
  const [selected, setSelected] = useState(initialSelected)
  const [messages, setMessages] = useState<DisplayMessage[]>(() => snapshot.messages.get(initialSelected) || [])
  const [myProfileId, setMyProfileId] = useState(() => snapshot.myProfileId)
  const [messagingReady, setMessagingReady] = useState(() => snapshot.messagingReady.get(initialSelected) || false)
  const [draft, setDraft] = useState(() => snapshot.drafts.get(initialSelected) || '')
  const [error, setError] = useState('')

  const loadConversations = useCallback(async (force = false) => {
    const items = await refreshConversations(snapshot, force)
    setConversations(items)
    setSelected(current => {
      const next = items.some(item => item.id === current) ? current : items[0]?.id || ''
      snapshot.selected = next
      if (next !== current) {
        setMessages(snapshot.messages.get(next) || [])
        setMessagingReady(snapshot.messagingReady.get(next) || false)
        setDraft(snapshot.drafts.get(next) || '')
      }
      return next
    })
  }, [snapshot])

  useEffect(() => {
    if (!getProfileKey()) return
    let stopped = false
    initializeMessaging(snapshot).then(() => {
      if (stopped) return
      setMyProfileId(snapshot.myProfileId)
      setConversations(snapshot.conversations)
      setSelected(current => {
        const next = snapshot.conversations.some(item => item.id === current) ? current : snapshot.conversations[0]?.id || ''
        snapshot.selected = next
        if (next !== current) {
          setMessages(snapshot.messages.get(next) || [])
          setMessagingReady(snapshot.messagingReady.get(next) || false)
          setDraft(snapshot.drafts.get(next) || '')
        }
        return next
      })
    }).catch(cause => { if (!stopped) setError(cause instanceof Error ? cause.message : 'Could not initialize messaging') })
    return () => { stopped = true }
  }, [snapshot])

  const active = conversations.find(conversation => conversation.id === selected)
  const partnerId = active?.otherProfile?.id || ''

  useEffect(() => {
    if (!selected || !myProfileId || !partnerId) return
    let stopped = false
    setMessages(snapshot.messages.get(selected) || [])
    setMessagingReady(snapshot.messagingReady.get(selected) || false)
    setDraft(snapshot.drafts.get(selected) || '')
    const load = async (force = false) => {
      try {
        const result = await refreshMessages(snapshot, selected, myProfileId, partnerId, force)
        if (!stopped) { setMessages(result.items); setMessagingReady(result.ready); setError('') }
      } catch (cause) {
        if (!stopped) setError(cause instanceof Error ? cause.message : 'Could not load messages')
      }
    }
    void load()
    const poll = window.setInterval(() => { void load(true) }, REFRESH_AFTER_MS)
    return () => { stopped = true; window.clearInterval(poll) }
  }, [selected, myProfileId, partnerId, snapshot])

  const selectConversation = (conversationId: string) => {
    snapshot.selected = conversationId
    setSelected(conversationId)
    setMessages(snapshot.messages.get(conversationId) || [])
    setMessagingReady(snapshot.messagingReady.get(conversationId) || false)
    setDraft(snapshot.drafts.get(conversationId) || '')
  }

  const changeDraft = (value: string) => {
    snapshot.drafts.set(selected, value)
    setDraft(value)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!draft.trim() || !selected || !myProfileId || !partnerId) return
    try {
      const encrypted = await encryptMessage('conversation', selected, myProfileId, partnerId, draft.trim())
      const sent = await sendMessage(selected, encrypted)
      const decrypted = await decryptMessage('conversation', selected, myProfileId, partnerId, sent)
      setMessages(current => {
        const next = [...current, decrypted]
        snapshot.messages.set(selected, next)
        snapshot.messagesUpdatedAt.set(selected, Date.now())
        return next
      })
      snapshot.drafts.delete(selected)
      setDraft('')
      await loadConversations(true)
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
          return <button key={conversation.id} className={selected === conversation.id ? 'active' : ''} onClick={() => selectConversation(conversation.id)}>
            <span className="mini-avatar">{initials(username)}</span>
            <span><strong>{username}</strong><small>{preview}</small></span>
          </button>
        })}
        {!conversations.length && <div className="inbox-empty"><p>No conversations yet.</p><Link to="/">Browse profiles</Link></div>}
      </aside>
      <section className="thread">
        {active ? <>
          <header>
            <span className="mini-avatar">{initials(active.otherProfile?.leetcodeUsername)}</span>
            <div><strong>{displayName(active.otherProfile?.leetcodeUsername)}</strong><small>{active.otherProfile?.preferredLanguage || 'Language not set'} · {active.otherProfile?.timezone || 'Timezone not set'}</small></div>
            {active.otherProfile?.id && <Link to={`/profiles/${active.otherProfile.id}`}>View profile</Link>}
          </header>
          <div className="message-list">{messages.map(message => <div key={message.id} className={message.senderId === active.otherProfile?.id ? 'message' : 'message mine'}><strong>{displayName(message.senderUsername)}</strong><p>{message.displayContent}</p>{message.decryptionState === 'legacy' && <small>Sent before private messaging was enabled</small>}<time>{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div>)}</div>
          <form onSubmit={submit}><input value={draft} onChange={event => changeDraft(event.target.value)} maxLength={1000} placeholder={messagingReady ? 'Write a message…' : 'Messaging isn’t ready yet…'} aria-label="Message"/><button aria-label="Send message" disabled={!draft.trim() || !messagingReady}><Send size={18}/></button></form>
        </> : <div className="thread-empty"><MessageCircle/><h2>Pick a conversation</h2><p>Your messages will appear here.</p></div>}
      </section>
    </div>
  </main>
}
