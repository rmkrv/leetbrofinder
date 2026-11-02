import { ArrowUpRight, Code2, MapPin, MessageCircle, Trophy } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Profile } from '../types'

export const activityLabel = (value: string) => ({ RANDOM_PROBLEMS: 'Random problems', CONTESTS: 'Contests', DSA_PRACTICE: 'DSA practice', INTERVIEW_PREP: 'Interview prep' }[value] || value)
export const presenceLabel = (profile: Profile, detailed = false) => {
  if (profile.lookingNow) return 'Looking now'
  if (!profile.lastSeenAt) return 'Seen recently'
  const seen = new Date(profile.lastSeenAt)
  return `Last seen ${seen.toLocaleString(undefined, detailed ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' })}`
}

export default function BroCard({ profile, onMessage }: { profile: Profile; onMessage?: (profile: Profile) => void }) {
  const initials = profile.leetcodeUsername.slice(0, 2).toUpperCase()
  return <article className="card card-border group h-full bg-base-200/80 transition-colors hover:border-secondary/35 hover:bg-base-200">
    <div className="card-body gap-4 p-5">
      <div className="flex min-w-0 items-center gap-3">
        <div className={`avatar ${profile.lookingNow ? 'avatar-online' : ''} ${profile.avatarUrl ? '' : 'avatar-placeholder'}`}>
          <div className="size-11 rounded-selector border border-base-300 bg-neutral text-neutral-content">{profile.avatarUrl ? <img src={profile.avatarUrl} alt=""/> : <span className="font-mono text-xs font-semibold">{initials}</span>}</div>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-2 truncate font-mono text-sm font-semibold">{profile.leetcodeUsername}{profile.verified && <span className="badge badge-success badge-xs" title="Verified LeetCode account" aria-label="Verified LeetCode account">✓</span>}</h3>
          <p className="mt-1 flex items-center gap-1 truncate text-xs text-base-content/70"><MapPin size={13}/>{profile.timezone || 'Timezone not set'}</p>
        </div>
        <Link className="btn btn-ghost btn-square btn-sm opacity-70 group-hover:opacity-100" aria-label={`Open ${profile.leetcodeUsername}'s profile`} to={`/profiles/${profile.id}`}><ArrowUpRight size={17}/></Link>
      </div>

      <div className="flex items-center gap-2 text-xs text-base-content/75"><span className={`status status-sm ${profile.lookingNow ? 'status-success' : 'status-neutral'}`}></span>{presenceLabel(profile)}</div>
      {profile.bio && <p className="line-clamp-2 text-sm leading-6 text-base-content/75" title={profile.bio}>{profile.bio}</p>}

      <div className="grid grid-cols-3 divide-x divide-base-300 rounded-field border border-base-300 bg-base-100/60 py-3">
        <div className="grid place-items-center gap-1 px-2 text-center"><Trophy size={14} className="text-warning"/><strong className="font-mono text-sm">{profile.contestRating ? Math.round(profile.contestRating).toLocaleString() : '—'}</strong><span className="text-[.65rem] text-base-content/65">rating</span></div>
        <div className="grid place-items-center gap-1 px-2 text-center"><Code2 size={14} className="text-secondary"/><strong className="font-mono text-sm">{profile.totalSolved}</strong><span className="text-[.65rem] text-base-content/65">solved</span></div>
        <div className="grid place-items-center gap-1 px-2 text-center"><span className="font-mono text-xs text-secondary">{profile.preferredLanguage?.slice(0, 2) || '—'}</span><strong className="max-w-full truncate text-sm">{profile.preferredLanguage || 'Any'}</strong><span className="text-[.65rem] text-base-content/65">language</span></div>
      </div>

      <div className="flex min-h-6 flex-wrap gap-1.5">{profile.activities.map(activity => <span className="badge badge-ghost badge-sm" key={activity}>{activityLabel(activity)}</span>)}</div>
      <div className="card-actions mt-auto">
        <button className="btn btn-block" onClick={() => onMessage?.(profile)} disabled={!onMessage}><MessageCircle size={16}/> Message</button>
      </div>
    </div>
  </article>
}
