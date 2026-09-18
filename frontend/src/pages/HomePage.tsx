import { useEffect, useState } from 'react'
import { ArrowUpRight, Bolt, Clock3, Search, SlidersHorizontal } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { getProfileKey, searchProfiles, startConversation, type ProfileFilters } from '../api'
import BroCard from '../components/BroCard'
import type { Profile } from '../types'

export default function HomePage() {
  const [filters,setFilters]=useState<ProfileFilters>({})
  const [profiles,setProfiles]=useState<Profile[]>([])
  const [total,setTotal]=useState(0)
  const [advanced,setAdvanced]=useState(false)
  const [error,setError]=useState('')
  const navigate=useNavigate()
  useEffect(()=>{ const timer=setTimeout(()=>{ searchProfiles(filters).then(page=>{setProfiles(page.content);setTotal(page.totalElements);setError('')}).catch(()=>{setProfiles([]);setTotal(0);setError('Could not load profiles. Check that the API is running.')}) },250); return()=>clearTimeout(timer)},[filters])
  const update=(key:keyof ProfileFilters,value:string)=>setFilters(current=>({...current,[key]:value}))
  const message=async(profile:Profile)=>{ if(!getProfileKey()){navigate('/login');return} try{const c=await startConversation(profile.id);navigate(`/messages?conversation=${c.id}`)}catch(e){setError(e instanceof Error?e.message:'Could not start conversation')} }
  const lookingNow=profiles.filter(p=>p.availability==='LOOKING_NOW').length
  return <main>
    <section className="intro"><div><p className="eyebrow">Practice is better with company</p><h1>Find someone at your level.<br/><span>Solve better, together.</span></h1><p className="lede">Match with verified LeetCode users for contests, problem sessions, and interview prep.</p></div><div className="live-panel"><div className="live-icon"><Bolt size={20}/></div><div><strong>Want to solve together now?</strong><span>Meet a coding partner, agree on a LeetCode problem, and compare approaches.</span></div><Link to="/session">Start a live session <ArrowUpRight size={16}/></Link></div></section>
    <section className="finder" aria-labelledby="finder-title"><div className="finder-heading"><div><p className="eyebrow">Community board</p><h2 id="finder-title">Find your next practice bro</h2></div><p><span className="online-dot"/> {lookingNow} looking now</p></div>
      {error&&<div className="notice error">{error}</div>}
      <div className="filters"><label className="search-field"><Search size={18}/><span className="sr-only">Search by username</span><input value={filters.query||''} onChange={e=>update('query',e.target.value)} placeholder="Search username…"/></label><label><span className="sr-only">Language</span><select value={filters.language||''} onChange={e=>update('language',e.target.value)}><option value="">All languages</option>{['C++','Python','Java','JavaScript','TypeScript','Go','Rust'].map(v=><option key={v}>{v}</option>)}</select></label><label><span className="sr-only">Availability</span><select value={filters.availability||''} onChange={e=>update('availability',e.target.value)}><option value="">Any availability</option><option value="LOOKING_NOW">Looking now</option><option value="TODAY">Today</option><option value="OCCASIONALLY">Occasionally</option></select></label><button className={`filter-button ${advanced?'selected':''}`} onClick={()=>setAdvanced(v=>!v)}><SlidersHorizontal size={17}/> More filters</button></div>
      {advanced&&<div className="advanced-filters"><label>Min rating<input inputMode="numeric" value={filters.minRating||''} onChange={e=>update('minRating',e.target.value)} placeholder="0"/></label><label>Max rating<input inputMode="numeric" value={filters.maxRating||''} onChange={e=>update('maxRating',e.target.value)} placeholder="3000"/></label><label>Activity<select value={filters.activity||''} onChange={e=>update('activity',e.target.value)}><option value="">Any activity</option><option value="RANDOM_PROBLEMS">Random problems</option><option value="CONTESTS">Contests</option><option value="DSA_PRACTICE">DSA practice</option><option value="INTERVIEW_PREP">Interview prep</option></select></label><label>Timezone<input value={filters.timezone||''} onChange={e=>update('timezone',e.target.value)} placeholder="e.g. Europe/Warsaw"/></label></div>}
      <div className="results-meta"><span>{total} matching profiles</span><span>Newest active profiles first</span></div><div className="card-grid">{profiles.map(p=><BroCard key={p.id} profile={p} onMessage={message}/>)}</div>{profiles.length===0&&<div className="empty-state"><Clock3/><h3>No bros match these filters yet.</h3><p>Try widening your search or start a shared session.</p></div>}
    </section>
  </main>
}
