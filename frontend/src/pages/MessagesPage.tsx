import { Check, MessageCircle, Pencil, Send, Trash2, X } from 'lucide-react'
import { FormEvent, KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  deleteMessage,
  editMessage,
  getMe,
  getMessages,
  getProfileKey,
  listConversations,
  markConversationRead,
  sendMessage,
} from '../api'
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
      await markConversationRead(conversationId)
      snapshot.conversations = snapshot.conversations.map(item =>
        item.id === conversationId ? { ...item, unreadCount: 0 } : item)
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

const resizeTextarea = (target: HTMLTextAreaElement) => {
  target.style.height = '0px'
  target.style.height = `${Math.min(target.scrollHeight, 160)}px`
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
  const [editingId, setEditingId] = useState('')
  const [editDraft, setEditDraft] = useState('')
  const [deleteConfirmId, setDeleteConfirmId] = useState('')
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const composerFormRef = useRef<HTMLFormElement>(null)

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

  useEffect(() => {
    if (composerRef.current) resizeTextarea(composerRef.current)
  }, [draft, editDraft, editingId])

  useEffect(() => {
    if (editingId) composerRef.current?.focus()
  }, [editingId])

  useEffect(() => {
    if (!profileKey) return
    const poll = window.setInterval(() => {
      void loadConversations(true).catch(cause =>
        setError(cause instanceof Error ? cause.message : 'Could not refresh conversations'))
    }, REFRESH_AFTER_MS)
    return () => window.clearInterval(poll)
  }, [loadConversations, profileKey])

  const active = conversations.find(conversation => conversation.id === selected)
  const partnerId = active?.otherProfile?.id || ''

  useEffect(() => {
    if (!selected || !myProfileId || !partnerId) return
    let stopped = false
    setMessages(snapshot.messages.get(selected) || [])
    setMessagingReady(snapshot.messagingReady.get(selected) || false)
    setDraft(snapshot.drafts.get(selected) || '')
    setEditingId('')
    setDeleteConfirmId('')
    const load = async (force = false) => {
      try {
        const result = await refreshMessages(snapshot, selected, myProfileId, partnerId, force)
        if (!stopped) {
          setMessages(result.items)
          setMessagingReady(result.ready)
          setConversations(snapshot.conversations)
          setError('')
        }
      } catch (cause) {
        if (!stopped) setError(cause instanceof Error ? cause.message : 'Could not load messages')
      }
    }
    void load(true)
    const poll = window.setInterval(() => { void load(true) }, REFRESH_AFTER_MS)
    return () => { stopped = true; window.clearInterval(poll) }
  }, [selected, myProfileId, partnerId, snapshot])

  const selectConversation = (conversationId: string) => {
    setEditingId('')
    setEditDraft('')
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
    if (editingId) {
      await saveEdit(editingId)
      return
    }
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

  const sendOnEnter = (event: KeyboardEvent<HTMLTextAreaElement>, form: HTMLFormElement | null) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    form?.requestSubmit()
  }

  const startEditing = (message: DisplayMessage) => {
    if (message.decryptionState === 'failed') return
    setEditingId(message.id)
    setEditDraft(message.displayContent)
    setDeleteConfirmId('')
  }

  const cancelEdit = () => {
    setEditingId('')
    setEditDraft('')
    composerRef.current?.focus()
  }

  const saveEdit = async (messageId: string) => {
    if (!editDraft.trim() || !selected || !myProfileId || !partnerId) return
    setBusyId(messageId)
    try {
      const encrypted = await encryptMessage('conversation', selected, myProfileId, partnerId, editDraft.trim())
      const updated = await editMessage(selected, messageId, encrypted)
      const decrypted = await decryptMessage('conversation', selected, myProfileId, partnerId, updated)
      setMessages(current => {
        const next = current.map(message => message.id === messageId ? decrypted : message)
        snapshot.messages.set(selected, next)
        return next
      })
      cancelEdit()
      await loadConversations(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not edit message')
    } finally {
      setBusyId('')
    }
  }

  const removeMessage = async (messageId: string) => {
    if (deleteConfirmId !== messageId) {
      setDeleteConfirmId(messageId)
      setEditingId('')
      return
    }
    setBusyId(messageId)
    try {
      await deleteMessage(selected, messageId)
      setMessages(current => {
        const next = current.filter(message => message.id !== messageId)
        snapshot.messages.set(selected, next)
        return next
      })
      setDeleteConfirmId('')
      await loadConversations(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete message')
    } finally {
      setBusyId('')
    }
  }

  if (!getProfileKey()) return <main className="narrow-page"><div className="surface blocked"><MessageCircle size={28}/><h2>Log in to see your conversations</h2><Link className="primary" to="/login">Log in</Link></div></main>

  return <main className="messages-page">
    <div className="page-heading"><p>Messages are end-to-end encrypted.</p></div>
    {error && <div className="notice error">{error}</div>}
    <div className="message-shell surface">
      <aside>
        <h2>Inbox</h2>
        {conversations.map(conversation => {
          const username = displayName(conversation.otherProfile?.leetcodeUsername)
          const preview = conversation.lastMessage?.cryptoVersion ? 'Encrypted message' : conversation.lastMessage?.content || 'New conversation'
          return <button key={conversation.id} className={selected === conversation.id ? 'active' : ''} onClick={() => selectConversation(conversation.id)}>
            <span className="mini-avatar">{initials(username)}</span>
            <span><strong>{username}</strong><small>{preview}</small></span>
            {conversation.unreadCount > 0 && <span className="unread-badge" aria-label={`${conversation.unreadCount} unread messages`}>{conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}</span>}
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
          <div className="message-list">{messages.map(message => {
            const mine = message.senderId === myProfileId
            return <div key={message.id} className={mine ? 'message mine' : 'message'}>
              <strong>{displayName(message.senderUsername)}</strong>
              <p>{message.displayContent}</p>
              {message.decryptionState === 'legacy' && <small>Sent before private messaging was enabled</small>}
              <div className="message-meta">
                <time>{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{message.editedAt && ' · edited'}</time>
                {mine && editingId !== message.id && <span className="message-actions">
                  <button onClick={() => startEditing(message)} disabled={message.decryptionState === 'failed' || busyId === message.id} aria-label="Edit message" title="Edit message"><Pencil size={12}/></button>
                  <button className={deleteConfirmId === message.id ? 'confirm-delete' : ''} onClick={() => void removeMessage(message.id)} disabled={busyId === message.id} aria-label={deleteConfirmId === message.id ? 'Confirm delete message' : 'Delete message'} title={deleteConfirmId === message.id ? 'Click again to confirm' : 'Delete message'}><Trash2 size={12}/>{deleteConfirmId === message.id && <span>Confirm</span>}</button>
                </span>}
              </div>
            </div>
          })}</div>
          <form ref={composerFormRef} className="message-composer" onSubmit={submit}>
            {editingId && <div className="composer-edit-banner"><span><Pencil size={14}/> Editing message</span><button type="button" onClick={cancelEdit} disabled={busyId === editingId} aria-label="Cancel edit"><X size={16}/></button></div>}
            <div className="composer-input-row">
              <textarea ref={composerRef} rows={1} value={editingId ? editDraft : draft} onChange={event => editingId ? setEditDraft(event.target.value) : changeDraft(event.target.value)} onKeyDown={event => sendOnEnter(event, composerFormRef.current)} maxLength={1000} placeholder={editingId ? 'Edit your message…' : messagingReady ? 'Write a message…' : 'Messaging isn’t ready yet…'} aria-label={editingId ? 'Edit message' : 'Message'} disabled={!messagingReady || Boolean(busyId)}/>
              <button aria-label={editingId ? 'Save edit' : 'Send message'} disabled={!(editingId ? editDraft : draft).trim() || !messagingReady || Boolean(busyId)}>{editingId ? <Check size={18}/> : <Send size={18}/>}</button>
            </div>
          </form>
        </> : <div className="thread-empty"><MessageCircle/><h2>Pick a conversation</h2></div>}
      </section>
    </div>
  </main>
}
