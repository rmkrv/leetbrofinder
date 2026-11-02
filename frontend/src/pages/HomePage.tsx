import { useEffect, useState } from 'react'
import { ArrowUpRight, Bolt, Clock3, Search, SlidersHorizontal, Users } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { getProfileKey, PROFILE_PRESENCE_EVENT, searchProfiles, startConversation, type ProfileFilters } from '../api'
import BroCard from '../components/BroCard'
import type { Profile } from '../types'

export default function HomePage() {
  const [filters, setFilters] = useState<ProfileFilters>({})
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [total, setTotal] = useState(0)
  const [advanced, setAdvanced] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    let active = true
    const load = () => {
      if (active) setLoading(true)
      void searchProfiles(filters).then(page => {
        if (active) { setProfiles(page.content); setTotal(page.totalElements); setError('') }
      }).catch(() => {
        if (active) { setProfiles([]); setTotal(0); setError('Could not load profiles. Check that the API is running.') }
      }).finally(() => { if (active) setLoading(false) })
    }
    const timer = window.setTimeout(load, 250)
    const poll = window.setInterval(load, 60_000)
    window.addEventListener(PROFILE_PRESENCE_EVENT, load)
    return () => { active = false; window.clearTimeout(timer); window.clearInterval(poll); window.removeEventListener(PROFILE_PRESENCE_EVENT, load) }
  }, [filters])

  const update = (key: keyof ProfileFilters, value: string) => setFilters(current => ({ ...current, [key]: value }))
  const message = async (profile: Profile) => {
    if (!getProfileKey()) { navigate('/login'); return }
    try { const conversation = await startConversation(profile.id); navigate(`/messages?conversation=${conversation.id}`) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not start conversation') }
  }
  const lookingNow = profiles.filter(profile => profile.lookingNow).length

  return <main className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-10">
    <section className="grid min-w-0 min-h-[36rem] items-center gap-10 py-16 lg:grid-cols-[1.15fr_.85fr] lg:py-24">
      <div className="min-w-0">
        <div className="mb-6 flex items-center gap-3 font-mono text-xs text-base-content/70"><span className="status status-success animate-pulse"></span>Verified people. Real practice.</div>
        <h1 className="max-w-4xl text-[2.65rem] font-semibold leading-[.98] tracking-[-.055em] sm:text-6xl lg:text-7xl">Find someone at your level.<br className="hidden sm:block"/><span className="text-base-content/55"> Solve better, together.</span></h1>
        <p className="mt-7 max-w-2xl text-lg leading-8 text-base-content/75">Match with verified LeetCode users for contests, problem sessions, and interview prep.</p>
      </div>
      <aside className="relative min-w-0 border-l border-secondary/40 bg-base-200/65 p-6 sm:p-8">
        <span className="absolute -left-1.5 top-8 size-3 rounded-full bg-secondary shadow-[0_0_0_6px_color-mix(in_oklab,var(--color-secondary)_15%,transparent)]"></span>
        <div className="mb-10 flex items-start justify-between gap-4">
          <div><p className="font-mono text-xs text-secondary">// instant pairing</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">Want to solve together now?</h2></div>
          <Bolt className="text-secondary" size={25}/>
        </div>
        <div className="mb-6 grid grid-cols-3 gap-2 text-center font-mono text-[.62rem] text-base-content/65 sm:text-[.68rem]"><span>level match</span><span>shared goals</span><span>live room</span></div>
        <Link className="btn btn-primary btn-block justify-between" to="/session">Start a live session <ArrowUpRight size={17}/></Link>
      </aside>
    </section>

    <section className="border-t border-base-300 pt-10" aria-labelledby="finder-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="mb-2 font-mono text-xs text-secondary">{total} matching profiles</p><h2 id="finder-title" className="text-3xl font-semibold tracking-tight">Find your next practice bro</h2></div>
        <p className="flex items-center gap-2 text-sm text-base-content/75"><span className="status status-success"></span>{lookingNow} looking now</p>
      </div>

      {error && <div role="alert" className="alert alert-error alert-soft mt-6"><span>{error}</span></div>}
      <div className="mt-7 grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(16rem,1.5fr)_repeat(3,minmax(10rem,.7fr))]">
        <label className="input w-full"><Search size={17} className="text-base-content/65"/><span className="sr-only">Search by username</span><input value={filters.query || ''} onChange={event => update('query', event.target.value)} placeholder="Search username…"/></label>
        <label><span className="sr-only">Language</span><select className="select w-full" value={filters.language || ''} onChange={event => update('language', event.target.value)}><option value="">All languages</option>{['C++', 'Python', 'Java', 'JavaScript', 'TypeScript', 'Go', 'Rust'].map(value => <option key={value}>{value}</option>)}</select></label>
        <label><span className="sr-only">Presence</span><select className="select w-full" value={filters.lookingNow || ''} onChange={event => update('lookingNow', event.target.value)}><option value="">All profiles</option><option value="true">Looking now</option></select></label>
        <button className={`btn ${advanced ? 'btn-active' : ''}`} onClick={() => setAdvanced(value => !value)} aria-expanded={advanced}><SlidersHorizontal size={17}/> More filters</button>
      </div>

      {advanced && <fieldset className="fieldset mt-3 grid gap-3 rounded-box border border-base-300 bg-base-200/70 p-4 sm:grid-cols-2 lg:grid-cols-4"><legend className="fieldset-legend px-1">Narrow the match</legend>
        <label className="fieldset"><span className="label">Min rating</span><input className="input w-full" inputMode="numeric" value={filters.minRating || ''} onChange={event => update('minRating', event.target.value)} placeholder="0"/></label>
        <label className="fieldset"><span className="label">Max rating</span><input className="input w-full" inputMode="numeric" value={filters.maxRating || ''} onChange={event => update('maxRating', event.target.value)} placeholder="3000"/></label>
        <label className="fieldset"><span className="label">Activity</span><select className="select w-full" value={filters.activity || ''} onChange={event => update('activity', event.target.value)}><option value="">Any activity</option><option value="RANDOM_PROBLEMS">Random problems</option><option value="CONTESTS">Contests</option><option value="DSA_PRACTICE">DSA practice</option><option value="INTERVIEW_PREP">Interview prep</option></select></label>
        <label className="fieldset"><span className="label">Timezone</span><input className="input w-full" value={filters.timezone || ''} onChange={event => update('timezone', event.target.value)} placeholder="e.g. Europe/Warsaw"/></label>
      </fieldset>}

      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {loading ? Array.from({ length: 4 }).map((_, index) => <div className="card card-border bg-base-200/70" key={index}><div className="card-body"><div className="flex gap-3"><div className="skeleton size-11 rounded-selector"></div><div className="flex-1 space-y-2"><div className="skeleton h-4 w-2/3"></div><div className="skeleton h-3 w-1/2"></div></div></div><div className="skeleton mt-3 h-20 w-full"></div><div className="skeleton h-9 w-full"></div></div></div>) : profiles.map(profile => <BroCard key={profile.id} profile={profile} onMessage={message}/>) }
      </div>
      {!loading && profiles.length === 0 && <div className="mt-6 grid place-items-center rounded-box border border-dashed border-base-300 bg-base-200/45 px-6 py-16 text-center"><Clock3 className="mb-4 text-base-content/55"/><h3 className="text-lg font-semibold">No bros match these filters yet.</h3><p className="mt-2 max-w-md text-sm text-base-content/70">Try widening your search or start a shared session.</p><Link className="btn mt-6" to="/session"><Users size={16}/> Start a session</Link></div>}
    </section>
  </main>
}
