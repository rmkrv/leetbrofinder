import { LockKeyhole, LogIn } from 'lucide-react'
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
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not log in')
    } finally { setBusy(false) }
  }

  return <main className="mx-auto grid max-w-5xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[.85fr_1.15fr] lg:items-center lg:py-20">
    <section>
      <p className="mb-4 font-mono text-xs text-secondary">// welcome back</p>
      <h1 className="text-4xl font-semibold tracking-[-.045em] sm:text-5xl">Log in to LeetBroFinder.</h1>
      <p className="mt-5 max-w-lg leading-7 text-base-content/75">Your username is your LeetCode username. LeetBroFinder never asks for your LeetCode password.</p>
      <div className="mt-8 flex items-center gap-3 text-sm text-base-content/68"><LockKeyhole size={17} className="text-success"/>Private messages stay end-to-end encrypted.</div>
    </section>
    <form className="card card-border bg-base-200/85" onSubmit={submit} aria-busy={busy}>
      <div className="card-body gap-5 p-6 sm:p-8">
        <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-field bg-secondary/10 text-secondary"><LogIn/></span><div><h2 className="card-title">Account login</h2><p className="text-sm text-base-content/68">Continue where you left off.</p></div></div>
        {searchParams.get('passwordCreated') && <div role="status" className="alert alert-success alert-soft"><span>Password created. Log in to continue.</span></div>}
        {searchParams.get('expired') && <div role="alert" className="alert alert-warning alert-soft"><span>Your saved session is no longer valid. Log in again or create a new profile.</span></div>}
        <fieldset className="fieldset"><legend className="fieldset-legend">LeetCode username</legend><input className="input w-full" name="username" autoFocus required maxLength={30} autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} placeholder="your_username"/></fieldset>
        <fieldset className="fieldset"><legend className="fieldset-legend">Password</legend><input className="input w-full" name="password" type="password" required maxLength={72} autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} placeholder="Your LeetBroFinder password"/></fieldset>
        <label className="flex cursor-pointer items-start gap-3 rounded-field border border-base-300 p-4 hover:bg-base-300/30"><input className="checkbox-sm mt-0.5" type="checkbox" checked={rememberMe} onChange={event => setRememberMe(event.target.checked)}/><span><strong className="block text-sm">Stay signed in for 30 days</strong><small className="mt-1 block text-base-content/68">Only use this on a device you trust.</small></span></label>
        {error && <div role="alert" className="alert alert-error alert-soft"><span>{error}</span></div>}
        <button className="btn btn-primary btn-block" disabled={busy}>{busy && <span className="loading loading-spinner loading-sm"></span>}{busy ? 'Logging in…' : 'Log in'}</button>
        <p className="text-center text-sm text-base-content/70">New here? <Link className="link link-hover text-secondary" to="/verify">Verify your LeetCode account</Link></p>
      </div>
    </form>
  </main>
}
