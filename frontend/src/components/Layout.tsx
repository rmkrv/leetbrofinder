import { Code2, Headphones, LogIn, LogOut, MessageCircle, Search, Users, UserRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { getProfileKey, getUnreadCount, logout, markPresent, subscribePresence, PROFILE_AUTH_EVENT, UNREAD_CHANGED_EVENT } from '../api'

const navItems = [
  { to: '/', label: 'Browse', icon: Search, end: true },
  { to: '/session', label: 'Live session', icon: Headphones },
  { to: '/connections', label: 'Connections', icon: Users },
  { to: '/messages', label: 'Messages', icon: MessageCircle },
]

export default function Layout() {
  const [hasProfile, setHasProfile] = useState(() => Boolean(getProfileKey()))
  const [unreadCount, setUnreadCount] = useState(0)
  const navigate = useNavigate()

  useEffect(() => subscribePresence(), [])
  useEffect(() => {
    const syncAuth = () => setHasProfile(Boolean(getProfileKey()))
    window.addEventListener(PROFILE_AUTH_EVENT, syncAuth)
    window.addEventListener('storage', syncAuth)
    return () => { window.removeEventListener(PROFILE_AUTH_EVENT, syncAuth); window.removeEventListener('storage', syncAuth) }
  }, [])
  useEffect(() => {
    if (!hasProfile) { setUnreadCount(0); return }
    let stopped = false
    const load = () => getUnreadCount().then(result => { if (!stopped) setUnreadCount(result.unreadCount) }).catch(() => {})
    void load()
    const poll = window.setInterval(load, 8000)
    window.addEventListener(UNREAD_CHANGED_EVENT, load)
    return () => { stopped = true; window.clearInterval(poll); window.removeEventListener(UNREAD_CHANGED_EVENT, load) }
  }, [hasProfile])
  useEffect(() => {
    if (!hasProfile) return
    const heartbeat = () => { void markPresent(document.visibilityState === 'visible').catch(() => {}) }
    const leave = () => { void markPresent(false).catch(() => {}) }
    heartbeat()
    const poll = window.setInterval(() => { if (document.visibilityState === 'visible') heartbeat() }, 10_000)
    document.addEventListener('visibilitychange', heartbeat)
    window.addEventListener('pagehide', leave)
    window.addEventListener('pageshow', heartbeat)
    window.addEventListener('online', heartbeat)
    return () => { window.clearInterval(poll); document.removeEventListener('visibilitychange', heartbeat); window.removeEventListener('pagehide', leave); window.removeEventListener('pageshow', heartbeat); window.removeEventListener('online', heartbeat) }
  }, [hasProfile])

  const signOut = async () => { await logout().catch(() => {}); navigate('/login') }

  return <div className="min-h-screen text-base-content">
    <header className="navbar sticky top-0 z-40 border-b border-base-300/80 bg-base-100/90 px-4 backdrop-blur-xl sm:px-6 lg:px-10">
      <div className="navbar-start min-w-0 flex-1">
        <Link className="group flex items-center gap-3 font-mono text-sm font-semibold tracking-tight sm:text-base" to="/" aria-label="LeetBroFinder home">
          <span className="grid size-9 place-items-center rounded-field border border-secondary/35 bg-secondary/10 text-secondary transition-transform group-hover:-rotate-3"><Code2 size={19}/></span>
          <span>LeetBro<span className="text-base-content/65">Finder</span></span>
        </Link>
      </div>
      <nav className="navbar-center hidden lg:flex" aria-label="Main navigation">
        <ul className="menu menu-horizontal gap-1 rounded-field bg-base-200/70 p-1">
          {navItems.map(({ to, label, icon: Icon, end }) => <li key={to}><NavLink to={to} end={end} className={({isActive}) => isActive ? 'menu-active font-medium' : ''}><Icon size={16}/>{label}{to === '/messages' && unreadCount > 0 && <span className="badge badge-secondary badge-sm" aria-label={`${unreadCount} unread messages`}>{unreadCount > 99 ? '99+' : unreadCount}</span>}</NavLink></li>)}
        </ul>
      </nav>
      <div className="navbar-end w-auto flex-none gap-2">
        <Link className="btn btn-sm sm:btn-md" to={hasProfile ? '/profile/edit' : '/login'}>{hasProfile ? <UserRound size={17}/> : <LogIn size={17}/>}<span className="hidden sm:inline">{hasProfile ? 'My profile' : 'Log in'}</span></Link>
      </div>
    </header>

    <Outlet/>

    <footer className="mx-auto mb-20 flex max-w-7xl flex-col gap-3 border-t border-base-300 px-5 py-8 text-sm text-base-content/70 sm:flex-row sm:items-center sm:px-8 lg:mb-0 lg:px-10">
      <span className="font-mono text-xs text-base-content/75">© {new Date().getFullYear()} rmkrv</span>
      <p>Not affiliated with LeetCode.</p>
      <div className="flex gap-4 sm:ml-auto">
        {hasProfile ? <button type="button" className="btn btn-ghost btn-xs text-error" onClick={signOut}><LogOut size={14}/> Log out</button> : <><Link className="link link-hover" to="/login">Log in</Link><Link className="link link-hover" to="/verify">Create profile</Link></>}
      </div>
    </footer>

    <nav className="dock dock-sm right-0 left-0 z-50 w-full border-t border-base-300 bg-base-200/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden" aria-label="Mobile navigation">
      {navItems.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end} className={({isActive}) => isActive ? 'dock-active' : ''}><span className="indicator">{to === '/messages' && unreadCount > 0 && <span className="badge badge-secondary badge-xs indicator-item" aria-label={`${unreadCount} unread messages`}>{unreadCount > 9 ? '9+' : unreadCount}</span>}<Icon size={19}/></span><span className="dock-label">{label === 'Live session' ? 'Session' : label}</span></NavLink>)}
    </nav>
  </div>
}
