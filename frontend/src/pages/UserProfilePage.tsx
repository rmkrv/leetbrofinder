import { ArrowLeft, Check, Copy, ExternalLink, MessageCircle, Trophy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getProfile, getProfileKey, startConversation } from '../api'
import { activityLabel, statusLabel } from '../components/BroCard'
import type { Profile } from '../types'

export default function UserProfilePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!id) return
    getProfile(id).then(setProfile).catch(error => setError(error.message))
  }, [id])

  const message = async () => {
    if (!profile) return
    if (!getProfileKey()) {
      navigate('/login')
      return
    }
    try {
      const conversation = await startConversation(profile.id)
      navigate(`/messages?conversation=${conversation.id}`)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not start conversation')
    }
  }

  const copyContact = async () => {
    if (!profile?.contactUsername) return
    await navigator.clipboard.writeText(profile.contactUsername)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  if (error && !profile) return <main className="narrow-page"><div className="surface blocked"><h2>Profile unavailable</h2><p>{error}</p><Link to="/">Back to search</Link></div></main>
  if (!profile) return <main className="narrow-page"><div className="loading-block">Loading profile…</div></main>

  return <main className="detail-page">
    <Link className="back-link" to="/"><ArrowLeft size={16}/> Back to search</Link>
    <section className="profile-hero surface">
      <div className="large-avatar">{profile.avatarUrl ? <img src={profile.avatarUrl} alt=""/> : profile.leetcodeUsername.slice(0, 2).toUpperCase()}</div>
      <div className="profile-title">
        <div><h1>{profile.leetcodeUsername} <span>✓</span></h1><p>{profile.preferredLanguage || 'Language not set'} · {profile.timezone || 'Timezone not set'} · {statusLabel[profile.availability]}</p></div>
        <div className="profile-cta">
          <button className="primary" onClick={message}><MessageCircle size={17}/> Message</button>
          {profile.contactUsername && <button className="secondary" onClick={copyContact}>{copied ? <Check size={16}/> : <Copy size={16}/>} {copied ? 'Copied' : `${profile.contactType}: ${profile.contactUsername}`}</button>}
        </div>
      </div>
    </section>
    {error && <div className="notice error">{error}</div>}
    <div className="detail-grid">
      <section className="surface stats-panel"><h2>LeetCode snapshot</h2><div className="big-rating"><Trophy/><strong>{profile.contestRating ? Math.round(profile.contestRating) : '—'}</strong><span>contest rating</span></div><div className="metric-grid"><div><strong>{profile.totalSolved}</strong><span>Total solved</span></div><div><strong>{profile.easySolved}</strong><span>Easy</span></div><div><strong>{profile.mediumSolved}</strong><span>Medium</span></div><div><strong>{profile.hardSolved}</strong><span>Hard</span></div><div><strong>{profile.contestRanking?.toLocaleString() || '—'}</strong><span>Ranking</span></div><div><strong>{profile.contestsAttended}</strong><span>Contests</span></div></div></section>
      <section className="surface preference-panel"><h2>Looking for</h2><div className="tags large">{profile.activities.map(activity => <span key={activity}>{activityLabel(activity)}</span>)}</div><h2>Languages on LeetCode</h2>{profile.languages.length ? <div className="language-list">{profile.languages.slice(0, 6).map(language => <div key={language.language}><span>{language.language}</span><strong>{language.problemsSolved}</strong></div>)}</div> : <p className="muted">Language activity appears after the next LeetCode refresh.</p>}</section>
    </div>
    <section className="surface activity-panel"><h2>Recent accepted submissions</h2>{profile.recentActivity.length ? <div className="activity-list">{profile.recentActivity.map((activity, index) => <a key={`${activity.titleSlug}-${index}`} href={`https://leetcode.com/problems/${encodeURIComponent(activity.titleSlug)}/`} target="_blank" rel="noopener noreferrer"><span><strong>{activity.title}</strong><small>{activity.language} · {activity.submittedAt ? new Date(activity.submittedAt).toLocaleDateString() : ''}</small></span><ExternalLink size={15}/></a>)}</div> : <p className="muted">No recent public activity was returned by LeetCode.</p>}</section>
  </main>
}
