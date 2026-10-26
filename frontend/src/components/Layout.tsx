import { Code2, Headphones, LogIn, LogOut, MessageCircle, Users, UserRoundPlus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { getProfileKey, getUnreadCount, logout, PROFILE_AUTH_EVENT, UNREAD_CHANGED_EVENT } from '../api'
export default function Layout() {
  const [hasProfile, setHasProfile] = useState(() => Boolean(getProfileKey()))
  const [unreadCount, setUnreadCount] = useState(0)
  const navigate = useNavigate()
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
  const signOut = async () => { await logout().catch(() => {}); navigate('/login') }
  return <div className="app-shell">
  <header className="topbar"><Link className="brand" to="/"><span className="brand-mark"><Code2 size={19}/></span>LeetBroFinder</Link><nav aria-label="Main navigation"><NavLink to="/" end>Browse</NavLink><NavLink to="/session"><Headphones size={15}/> Live session</NavLink><NavLink to="/connections"><Users size={15}/> Connections</NavLink><NavLink className="messages-nav-link" to="/messages"><MessageCircle size={15}/> Messages{unreadCount > 0 && <span className="unread-badge" aria-label={`${unreadCount} unread messages`}>{unreadCount > 99 ? '99+' : unreadCount}</span>}</NavLink></nav><Link className="profile-button" to={hasProfile?'/profile/edit':'/login'}>{hasProfile?<UserRoundPlus size={17}/>:<LogIn size={17}/>} {hasProfile?'My profile':'Log in'}</Link></header>
  <Outlet/><footer><span>© {new Date().getFullYear()} rmkrv</span><p>Not affiliated with LeetCode.</p><div className="footer-actions">{hasProfile?<button type="button" onClick={signOut}><LogOut size={14}/> Log out</button>:<><Link to="/login">Log in</Link><Link to="/verify">Create profile</Link></>}</div></footer>
  </div> }
