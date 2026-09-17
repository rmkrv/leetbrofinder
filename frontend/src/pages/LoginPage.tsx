import { LogIn } from 'lucide-react'
import { FormEvent, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { login, saveSessionToken } from '../api'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const result = await login(username, password, rememberMe)
      saveSessionToken(result.sessionToken, rememberMe)
      navigate('/')
      window.location.reload()
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not log in')
    } finally {
      setBusy(false)
    }
  }

  return <main className="narrow-page">
    <div className="page-heading"><p className="eyebrow">Welcome back</p><h1>Log in to LeetBroFinder.</h1><p>Your username is your LeetCode username. LeetBroFinder never asks for your LeetCode password.</p></div>
    <form className="surface form-card" onSubmit={submit}>
      <div className="form-icon"><LogIn/></div>
      <h2>Account login</h2>
      {searchParams.get('passwordCreated') && <p className="form-success">Password created. Log in to continue.</p>}
      {searchParams.get('expired') && <p className="form-error">Your saved session is no longer valid. Log in again or create a new profile.</p>}
      <label>LeetCode username<input name="username" autoFocus required maxLength={30} autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} placeholder="your_username"/></label>
      <label>Password<input name="password" type="password" required maxLength={72} autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} placeholder="Your LeetBroFinder password"/></label>
      <label className="remember-choice"><input type="checkbox" checked={rememberMe} onChange={event => setRememberMe(event.target.checked)}/><span><strong>Stay signed in for 30 days</strong><small>Only use this on a device you trust.</small></span></label>
      {error && <p className="form-error">{error}</p>}
      <button className="primary wide" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
      <p className="auth-switch">New here? <Link to="/verify">Verify your LeetCode account</Link></p>
    </form>
  </main>
}
