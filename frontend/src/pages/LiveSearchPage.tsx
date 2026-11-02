import { LoaderCircle, Radio, SearchX, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { cancelLiveSearch, getLiveSearch, getProfileKey, joinLiveSearch } from '../api'
import BroCard from '../components/BroCard'
import type { LiveSearch } from '../types'

export default function LiveSearchPage() {
  const [search, setSearch] = useState<LiveSearch | null>(null)
  const [error, setError] = useState('')
  const [seconds, setSeconds] = useState(300)
  const start = async () => { setError(''); try { setSearch(await joinLiveSearch()) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not start live search') } }
  useEffect(() => {
    if (!search || search.status !== 'SEARCHING') return
    const poll = window.setInterval(() => getLiveSearch(search.id).then(setSearch).catch(() => {}), 3000)
    const tick = window.setInterval(() => setSeconds(Math.max(0, Math.floor((new Date(search.expiresAt).getTime() - Date.now()) / 1000))), 1000)
    return () => { window.clearInterval(poll); window.clearInterval(tick) }
  }, [search?.id, search?.status])
  const cancel = async () => { if (search) await cancelLiveSearch(search.id); setSearch(null); setSeconds(300) }

  if (!getProfileKey()) return <main className="mx-auto max-w-xl px-4 py-16"><div className="card card-border bg-base-200/85"><div className="card-body items-center text-center"><Radio className="text-secondary" size={30}/><h1 className="card-title mt-2">Log in to use live matching</h1><p className="text-base-content/70">Live search uses your verified profile to find someone near your level.</p><Link className="btn btn-primary mt-4" to="/login">Log in</Link></div></div></main>

  return <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:py-20">
    <header className="text-center"><p className="mb-4 font-mono text-xs text-secondary">// live matcher</p><h1 className="text-4xl font-semibold tracking-[-.045em] sm:text-5xl">Find a practice partner now.</h1><p className="mx-auto mt-5 max-w-xl leading-7 text-base-content/75">We compare contest rating first, then shared language and activity interests.</p></header>
    <div className="mt-10">
      {!search && <section className="card card-border bg-base-200/85"><div className="card-body items-center p-8 text-center sm:p-12"><span className="grid size-16 place-items-center rounded-full border border-secondary/30 bg-secondary/10 text-secondary"><Radio size={28}/></span><h2 className="card-title mt-2 text-2xl">Ready when you are</h2><p className="max-w-md leading-6 text-base-content/70">Your search stays active for five minutes. Keep this tab open and we’ll check automatically.</p>{error && <div role="alert" className="alert alert-error alert-soft mt-2"><span>{error}</span></div>}<button className="btn btn-primary mt-3" onClick={() => void start()}>Start live search</button></div></section>}
      {search?.status === 'SEARCHING' && <section className="card card-border bg-base-200/85" aria-live="polite"><div className="card-body items-center p-8 text-center sm:p-12"><span className="grid size-16 place-items-center rounded-full border border-secondary/30 bg-secondary/10 text-secondary"><LoaderCircle className="animate-spin" size={28}/></span><h2 className="font-mono text-4xl font-semibold tracking-tight">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</h2><p className="max-w-md text-base-content/70">Looking for the closest level among everyone in the queue.</p><progress className="progress progress-primary mt-2 w-full max-w-sm" value={seconds} max="300"></progress><button className="btn mt-3" onClick={() => void cancel()}><SearchX size={16}/>Cancel search</button></div></section>}
      {search?.status === 'MATCHED' && search.match && <section className="mx-auto max-w-sm"><div className="mb-5 flex items-center gap-3"><Sparkles className="text-secondary"/><div><p className="font-mono text-xs text-secondary">match confirmed</p><h2 className="text-2xl font-semibold">Meet your practice bro</h2></div></div><BroCard profile={search.match}/><Link className="btn btn-primary btn-block mt-4" to={`/profiles/${search.match.id}`}>Open profile and connect</Link></section>}
      {search && (search.status === 'EXPIRED' || search.status === 'CANCELLED') && <section className="card card-border bg-base-200/85"><div className="card-body items-center p-10 text-center"><SearchX className="text-base-content/55"/><h2 className="card-title">No match this round</h2><p className="text-base-content/70">The queue changes often. Start another search when you’re ready.</p><button className="btn btn-primary mt-3" onClick={() => { setSearch(null); setSeconds(300) }}>Try again</button></div></section>}
    </div>
  </main>
}
