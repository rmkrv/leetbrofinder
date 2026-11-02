import { ArrowLeft, Check, Copy, ExternalLink, MessageCircle, Trophy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getProfile, getProfileKey, startConversation, PROFILE_AUTH_EVENT, PROFILE_PRESENCE_EVENT } from '../api'
import { activityLabel, presenceLabel } from '../components/BroCard'
import type { Profile } from '../types'

export default function UserProfilePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [signedIn, setSignedIn] = useState(() => Boolean(getProfileKey()))

  useEffect(() => {
    const syncAuth = () => setSignedIn(Boolean(getProfileKey()))
    window.addEventListener(PROFILE_AUTH_EVENT, syncAuth); window.addEventListener('storage', syncAuth)
    return () => { window.removeEventListener(PROFILE_AUTH_EVENT, syncAuth); window.removeEventListener('storage', syncAuth) }
  }, [])
  useEffect(() => {
    if (!id) return
    let active = true
    const load = () => { void getProfile(id).then(result => { if (active) setProfile(result) }).catch(cause => { if (active) setError(cause.message) }) }
    load()
    const presence = (event: Event) => {
      const status = (event as CustomEvent<Pick<Profile, 'id' | 'lookingNow' | 'lastSeenAt'>>).detail
      if (!status) { load(); return }
      if (status.id === id) setProfile(current => current ? { ...current, ...status } : current)
    }
    window.addEventListener(PROFILE_PRESENCE_EVENT, presence)
    const poll = window.setInterval(load, 60_000)
    return () => { active = false; window.clearInterval(poll); window.removeEventListener(PROFILE_PRESENCE_EVENT, presence) }
  }, [id])

  const message = async () => {
    if (!profile) return
    if (!getProfileKey()) { navigate('/login'); return }
    try { const conversation = await startConversation(profile.id); navigate(`/messages?conversation=${conversation.id}`) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not start conversation') }
  }
  const copyContact = async () => {
    if (!profile?.contactUsername) return
    await navigator.clipboard.writeText(profile.contactUsername); setCopied(true); window.setTimeout(() => setCopied(false), 1800)
  }
  const contactHref = profile?.contactType === 'LinkedIn' && profile.contactUsername
    ? `https://www.linkedin.com/in/${encodeURIComponent(profile.contactUsername.replace(/^@/, ''))}`
    : profile?.contactType === 'Telegram' && profile.contactUsername
      ? `https://t.me/${encodeURIComponent(profile.contactUsername.replace(/^@/, ''))}` : null

  if (error && !profile) return <main className="mx-auto max-w-xl px-4 py-16"><div className="card card-border bg-base-200"><div className="card-body items-center text-center"><h1 className="card-title">Profile unavailable</h1><p className="text-base-content/70">{error}</p><Link className="btn mt-3" to="/">Back to search</Link></div></div></main>
  if (!profile) return <main className="mx-auto max-w-5xl px-4 py-16"><div className="skeleton h-60 w-full" aria-label="Loading profile"></div></main>

  const metrics = [
    ['Total solved', profile.totalSolved], ['Easy', profile.easySolved], ['Medium', profile.mediumSolved],
    ['Hard', profile.hardSolved], ['Ranking', profile.contestRanking?.toLocaleString() || '—'], ['Contests', profile.contestsAttended],
  ]

  return <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:py-14">
    <Link className="btn btn-ghost btn-sm -ml-3 mb-4" to="/"><ArrowLeft size={16}/>Back to search</Link>
    <section className="card card-border bg-base-200/85"><div className="card-body gap-6 p-6 sm:flex-row sm:items-center sm:p-8">
      <div className={`avatar shrink-0 ${profile.lookingNow ? 'avatar-online' : ''} ${profile.avatarUrl ? '' : 'avatar-placeholder'}`}><div className="size-20 rounded-box border border-base-300 bg-neutral text-neutral-content sm:size-24">{profile.avatarUrl ? <img src={profile.avatarUrl} alt=""/> : <span className="font-mono text-xl font-semibold">{profile.leetcodeUsername.slice(0, 2).toUpperCase()}</span>}</div></div>
      <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-3"><h1 className="truncate text-3xl font-semibold tracking-tight sm:text-4xl">{profile.leetcodeUsername}</h1><span className="badge badge-success badge-soft">✓ Verified</span></div><p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-base-content/70"><span>{profile.preferredLanguage || 'Language not set'}</span><span aria-hidden="true">/</span><span>{profile.timezone || 'Timezone not set'}</span><span aria-hidden="true">/</span><span className="flex items-center gap-2"><span className={`status status-sm ${profile.lookingNow ? 'status-success' : 'status-neutral'}`}></span>{presenceLabel(profile, true)}</span></p>{profile.bio && <p className="mt-4 max-w-2xl leading-7 text-base-content/80">{profile.bio}</p>}</div>
      <div className="flex shrink-0 flex-col gap-2 sm:items-stretch"><button className="btn btn-primary" onClick={() => void message()}><MessageCircle size={17}/>Message</button>{signedIn && profile.contactUsername && (contactHref ? <a className="btn" href={contactHref} target="_blank" rel="noopener noreferrer"><ExternalLink size={16}/>{profile.contactType}: {profile.contactUsername}</a> : <button className="btn" onClick={() => void copyContact()}>{copied ? <Check size={16}/> : <Copy size={16}/>} {copied ? 'Copied' : `${profile.contactType}: ${profile.contactUsername}`}</button>)}</div>
    </div></section>

    {error && <div role="alert" className="alert alert-error alert-soft mt-4"><span>{error}</span></div>}
    <div className="mt-4 grid gap-4 lg:grid-cols-[1.25fr_.75fr]">
      <section className="card card-border bg-base-200/80"><div className="card-body p-5 sm:p-7"><div className="flex items-end gap-3 border-b border-base-300 pb-5"><Trophy className="mb-1 text-warning"/><strong className="font-mono text-4xl">{profile.contestRating ? Math.round(profile.contestRating) : '—'}</strong><span className="mb-1 text-sm text-base-content/65">contest rating</span></div><div className="stats stats-vertical mt-2 w-full bg-transparent sm:stats-horizontal">{metrics.slice(0, 3).map(([label, value]) => <div className="stat px-3" key={label}><div className="stat-title text-xs">{label}</div><div className="stat-value font-mono text-xl">{value}</div></div>)}</div><div className="stats stats-vertical w-full bg-transparent sm:stats-horizontal">{metrics.slice(3).map(([label, value]) => <div className="stat px-3" key={label}><div className="stat-title text-xs">{label}</div><div className="stat-value font-mono text-xl">{value}</div></div>)}</div></div></section>
      <section className="card card-border bg-base-200/80"><div className="card-body p-5 sm:p-7"><h2 className="card-title text-base">Looking for</h2><div className="flex flex-wrap gap-2">{profile.activities.map(activity => <span className="badge badge-ghost" key={activity}>{activityLabel(activity)}</span>)}</div><div className="divider my-1"></div><h2 className="card-title text-base">Languages on LeetCode</h2>{profile.languages.length ? <ul className="list">{profile.languages.slice(0, 6).map(language => <li className="list-row px-0 py-2" key={language.language}><span className="text-sm">{language.language}</span><strong className="font-mono text-sm">{language.problemsSolved}</strong></li>)}</ul> : <p className="text-sm text-base-content/68">Language activity appears after the next LeetCode refresh.</p>}</div></section>
    </div>
    {profile.recentActivity.length > 0 && <section className="card card-border mt-4 bg-base-200/80"><div className="card-body p-5 sm:p-7"><h2 className="card-title text-base">Recent accepted submissions</h2><ul className="list">{profile.recentActivity.map((activity, index) => <li key={`${activity.titleSlug}-${index}`}><a className="list-row rounded-field px-3 hover:bg-base-300/50" href={`https://leetcode.com/problems/${encodeURIComponent(activity.titleSlug)}/`} target="_blank" rel="noopener noreferrer"><span className="list-col-grow"><strong className="block text-sm">{activity.title}</strong><small className="text-base-content/65">{activity.language} · {activity.submittedAt ? new Date(activity.submittedAt).toLocaleDateString() : ''}</small></span><ExternalLink size={15} className="text-base-content/65"/></a></li>)}</ul></div></section>}
  </main>
}
