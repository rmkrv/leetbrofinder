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

const REFRESH_AFTER_MS = 15_000

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
  const [initializing, setInitializing] = useState(!snapshot.myProfileId)
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
      .finally(() => { if (!stopped) setInitializing(false) })
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
      if (document.visibilityState !== 'visible') return
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
    const poll = window.setInterval(() => { if (document.visibilityState === 'visible') void load(true) }, REFRESH_AFTER_MS)
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

  if (!getProfileKey()) return <main className="mx-auto max-w-xl px-4 py-16"><div className="card card-border bg-base-200"><div className="card-body items-center text-center"><MessageCircle className="text-secondary" size={28}/><h1 className="card-title">Log in to see your conversations</h1><p className="text-base-content/70">Private messages are tied to your verified profile and this device.</p><Link className="btn btn-primary mt-3" to="/login">Log in</Link></div></div></main>

  return <main className="mx-auto max-w-6xl px-3 py-8 sm:px-6 lg:py-12">
    <header className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><p className="mb-2 font-mono text-xs text-secondary">// private channel</p><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Messages</h1></div><p className="flex items-center gap-2 text-sm text-base-content/68"><span className="status status-success"></span>Messages are end-to-end encrypted.</p></header>
    {error && <div role="alert" className="alert alert-error alert-soft mb-4"><span>{error}</span></div>}
    <div className="grid min-h-[39rem] overflow-hidden rounded-box border border-base-300 bg-base-200/80 lg:grid-cols-[19rem_1fr]">
      <aside className="border-b border-base-300 p-3 lg:border-r lg:border-b-0">
        <h2 className="px-3 py-2 font-mono text-xs text-base-content/65">Inbox</h2>
        {initializing ? <div className="space-y-2 p-2">{Array.from({length: 3}).map((_, index) => <div className="skeleton h-16 w-full" key={index}></div>)}</div> : <ul className="menu w-full gap-1 p-0">{conversations.map(conversation => {
          const username = displayName(conversation.otherProfile?.leetcodeUsername)
          const preview = conversation.lastMessage?.cryptoVersion ? 'Encrypted message' : conversation.lastMessage?.content || 'New conversation'
          return <li key={conversation.id}><button className={`grid grid-cols-[auto_1fr_auto] items-center gap-3 ${selected === conversation.id ? 'menu-active' : ''}`} onClick={() => selectConversation(conversation.id)}>
            <div className="avatar avatar-placeholder"><div className="grid size-9 place-items-center rounded-selector bg-neutral font-mono text-xs text-neutral-content">{initials(username)}</div></div>
            <span className="min-w-0 text-left"><strong className="block truncate text-sm">{username}</strong><small className="block truncate text-base-content/65">{preview}</small></span>
            {conversation.unreadCount > 0 && <span className="badge badge-secondary badge-sm" aria-label={`${conversation.unreadCount} unread messages`}>{conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}</span>}
          </button></li>
        })}</ul>}
        {!initializing && !conversations.length && <div className="grid place-items-center px-4 py-12 text-center"><MessageCircle className="mb-3 text-base-content/50"/><p className="text-sm text-base-content/68">No conversations yet.</p><Link className="btn btn-ghost btn-sm mt-2" to="/">Browse profiles</Link></div>}
      </aside>
      <section className="flex min-h-[32rem] min-w-0 flex-col">
        {active ? <>
          <header className="flex items-center gap-3 border-b border-base-300 px-4 py-3 sm:px-5">
            <div className="avatar avatar-placeholder"><div className="grid size-9 place-items-center rounded-selector bg-neutral font-mono text-xs text-neutral-content">{initials(active.otherProfile?.leetcodeUsername)}</div></div>
            <div className="min-w-0 flex-1"><strong className="block truncate text-sm">{displayName(active.otherProfile?.leetcodeUsername)}</strong><small className="block truncate text-base-content/65">{active.otherProfile?.preferredLanguage || 'Language not set'} · {active.otherProfile?.timezone || 'Timezone not set'}</small></div>
            {active.otherProfile?.id && <Link className="btn btn-ghost btn-sm" to={`/profiles/${active.otherProfile.id}`}>View profile</Link>}
          </header>
          <div className="flex max-h-[31rem] flex-1 flex-col gap-2 overflow-y-auto p-4 sm:p-5" aria-live="polite">{messages.map(message => {
            const mine = message.senderId === myProfileId
            return <div key={message.id} className={`chat ${mine ? 'chat-end' : 'chat-start'}`}>
              <div className="chat-header text-xs text-base-content/65">{displayName(message.senderUsername)}</div>
              <div className={`chat-bubble max-w-[min(34rem,85vw)] whitespace-pre-wrap break-words ${mine ? 'chat-bubble-neutral' : ''}`}><p>{message.displayContent}</p>{message.decryptionState === 'legacy' && <small className="mt-2 block text-warning">Sent before private messaging was enabled</small>}</div>
              <div className="chat-footer mt-1 flex items-center gap-2 text-[.68rem] text-base-content/60"><time>{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{message.editedAt && ' · edited'}</time>{mine && editingId !== message.id && <span className="flex gap-1"><button className="btn btn-ghost btn-square btn-xs" onClick={() => startEditing(message)} disabled={message.decryptionState === 'failed' || busyId === message.id} aria-label="Edit message" title="Edit message"><Pencil size={12}/></button><button className={`btn btn-square btn-xs ${deleteConfirmId === message.id ? 'btn-error' : 'btn-ghost'}`} onClick={() => void removeMessage(message.id)} disabled={busyId === message.id} aria-label={deleteConfirmId === message.id ? 'Confirm delete message' : 'Delete message'} title={deleteConfirmId === message.id ? 'Click again to confirm' : 'Delete message'}><Trash2 size={12}/></button></span>}</div>
            </div>
          })}{messages.length === 0 && <div className="m-auto text-center text-sm text-base-content/60"><MessageCircle className="mx-auto mb-3"/><p>No messages yet. Start with a practice goal.</p></div>}</div>
          <form ref={composerFormRef} className="border-t border-base-300 p-3 sm:p-4" onSubmit={submit}>
            {editingId && <div className="alert alert-info alert-soft mb-3 py-2"><Pencil size={14}/><span className="text-sm">Editing message</span><button className="btn btn-ghost btn-square btn-xs ml-auto" type="button" onClick={cancelEdit} disabled={busyId === editingId} aria-label="Cancel edit"><X size={16}/></button></div>}
            {!messagingReady && active && <p className="mb-2 flex items-center gap-2 text-xs text-base-content/65"><span className="loading loading-spinner loading-xs"></span>Preparing private messaging on this device…</p>}
            <div className="flex items-end gap-2"><textarea className="textarea min-h-11 flex-1 resize-none" ref={composerRef} rows={1} value={editingId ? editDraft : draft} onChange={event => editingId ? setEditDraft(event.target.value) : changeDraft(event.target.value)} onKeyDown={event => sendOnEnter(event, composerFormRef.current)} maxLength={1000} placeholder={editingId ? 'Edit your message…' : messagingReady ? 'Write a message…' : 'Messaging isn’t ready yet…'} aria-label={editingId ? 'Edit message' : 'Message'} disabled={!messagingReady || Boolean(busyId)}/><button className="btn btn-primary btn-square" aria-label={editingId ? 'Save edit' : 'Send message'} disabled={!(editingId ? editDraft : draft).trim() || !messagingReady || Boolean(busyId)}>{busyId ? <span className="loading loading-spinner loading-sm"></span> : editingId ? <Check size={18}/> : <Send size={18}/>}</button></div>
          </form>
        </> : <div className="m-auto grid place-items-center p-8 text-center"><MessageCircle className="mb-4 text-base-content/50"/><h2 className="text-xl font-semibold">Pick a conversation</h2><p className="mt-2 text-sm text-base-content/65">Your encrypted thread will open here.</p></div>}
      </section>
    </div>
  </main>
}
