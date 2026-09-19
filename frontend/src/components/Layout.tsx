import { Code2, Headphones, LogIn, LogOut, MessageCircle, Users, UserRoundPlus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { getProfileKey, logout, PROFILE_AUTH_EVENT } from '../api'
export default function Layout() {
  const [hasProfile, setHasProfile] = useState(() => Boolean(getProfileKey()))
  const navigate = useNavigate()
  useEffect(() => {
    const syncAuth = () => setHasProfile(Boolean(getProfileKey()))
    window.addEventListener(PROFILE_AUTH_EVENT, syncAuth)
    window.addEventListener('storage', syncAuth)
    return () => { window.removeEventListener(PROFILE_AUTH_EVENT, syncAuth); window.removeEventListener('storage', syncAuth) }
  }, [])
  const signOut = async () => { await logout().catch(() => {}); navigate('/login') }
  return <div className="app-shell">
  <header className="topbar"><Link className="brand" to="/"><span className="brand-mark"><Code2 size={19}/></span>LeetBroFinder<span className="beta">BETA</span></Link><nav aria-label="Main navigation"><NavLink to="/" end>Browse</NavLink><NavLink to="/session"><Headphones size={15}/> Live session</NavLink><NavLink to="/connections"><Users size={15}/> Connections</NavLink><NavLink to="/messages"><MessageCircle size={15}/> Messages</NavLink></nav><Link className="profile-button" to={hasProfile?'/profile/edit':'/login'}>{hasProfile?<UserRoundPlus size={17}/>:<LogIn size={17}/>} {hasProfile?'My profile':'Log in'}</Link></header>
  <Outlet/><footer><span>© {new Date().getFullYear()} rmkrv</span><p>Built for practice, not profit. Not affiliated with LeetCode.</p><div className="footer-actions">{hasProfile?<button type="button" onClick={signOut}><LogOut size={14}/> Log out</button>:<><Link to="/login">Log in</Link><Link to="/verify">Create profile</Link></>}</div></footer>
  </div> }
