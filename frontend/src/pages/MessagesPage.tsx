import { MessageCircle, Send } from 'lucide-react'
import { FormEvent, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getMessages, getProfileKey, listConversations, sendMessage } from '../api'
import type { Conversation, Message } from '../types'

const displayName = (value: string | null | undefined) => value?.trim() || 'Unknown user'
const initials = (value: string | null | undefined) => displayName(value).slice(0, 2).toUpperCase()

export default function MessagesPage() {
  const [params] = useSearchParams()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selected, setSelected] = useState(params.get('conversation') || '')
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')

  const loadConversations = () => listConversations()
    .then(items => {
      setConversations(items)
      if (!selected && items[0]) setSelected(items[0].id)
    })
    .catch(error => setError(error.message))

  useEffect(() => { if (getProfileKey()) loadConversations() }, [])

  useEffect(() => {
    if (!selected) return
    const load = () => getMessages(selected).then(setMessages).catch(error => setError(error.message))
    load()
    const poll = setInterval(load, 8000)
    return () => clearInterval(poll)
  }, [selected])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!draft.trim() || !selected) return
    try {
      const sent = await sendMessage(selected, draft)
      setMessages(current => [...current, sent])
      setDraft('')
      loadConversations()
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not send message')
    }
  }

  if (!getProfileKey()) return <main className="narrow-page"><div className="surface blocked"><MessageCircle size={28}/><h2>Log in to see your conversations</h2><p>Use your LeetCode username and LeetBroFinder password.</p><Link className="primary" to="/login">Log in</Link></div></main>

  const active = conversations.find(conversation => conversation.id === selected)
  return <main className="messages-page">
    <div className="page-heading"><p className="eyebrow">Direct messages</p><h1>Conversations</h1></div>
    {error && <div className="notice error">{error}</div>}
    <div className="message-shell surface">
      <aside>
        <h2>Inbox</h2>
        {conversations.map(conversation => {
          const username = displayName(conversation.otherProfile?.leetcodeUsername)
          return <button key={conversation.id} className={selected === conversation.id ? 'active' : ''} onClick={() => setSelected(conversation.id)}>
            <span className="mini-avatar">{initials(username)}</span>
            <span><strong>{username}</strong><small>{conversation.lastMessage?.content || 'New conversation'}</small></span>
          </button>
        })}
        {!conversations.length && <div className="inbox-empty"><p>No conversations yet.</p><Link to="/">Find someone to message</Link></div>}
      </aside>
      <section className="thread">
        {active ? <>
          <header>
            <span className="mini-avatar">{initials(active.otherProfile?.leetcodeUsername)}</span>
            <div><strong>{displayName(active.otherProfile?.leetcodeUsername)}</strong><small>{active.otherProfile?.preferredLanguage || 'Language not set'} · {active.otherProfile?.timezone || 'Timezone not set'}</small></div>
            {active.otherProfile?.id && <Link to={`/profiles/${active.otherProfile.id}`}>View profile</Link>}
          </header>
          <div className="message-list">{messages.map(message => <div key={message.id} className={message.senderId === active.otherProfile?.id ? 'message' : 'message mine'}><strong>{displayName(message.senderUsername)}</strong><p>{message.content}</p><time>{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div>)}</div>
          <form onSubmit={submit}><input value={draft} onChange={event => setDraft(event.target.value)} maxLength={1000} placeholder="Write a message…" aria-label="Message"/><button aria-label="Send message" disabled={!draft.trim()}><Send size={18}/></button></form>
        </> : <div className="thread-empty"><MessageCircle/><h2>Pick a conversation</h2><p>Your messages will appear here.</p></div>}
      </section>
    </div>
  </main>
}
