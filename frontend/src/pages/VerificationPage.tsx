import { Check, Clipboard, ExternalLink, ShieldCheck } from 'lucide-react'
import { FormEvent, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { confirmVerification, getVerificationChallenge, saveSetupSessionToken, saveVerificationChallenge, startVerification } from '../api'
import type { Challenge } from '../types'

export default function VerificationPage() {
  const [username, setUsername] = useState('')
  const [challenge, setChallenge] = useState<Challenge | null>(() => getVerificationChallenge())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const finishVerification = async (challengeId: string) => {
    setBusy(true); setError('')
    try { const result = await confirmVerification(challengeId); saveSetupSessionToken(result.sessionToken); navigate('/profile/edit?verified=1', { replace: true }) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Token not found yet') }
    finally { setBusy(false) }
  }
  useEffect(() => { const resumeId = searchParams.get('resume'); if (resumeId) void finishVerification(resumeId) }, [])
  const start = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('')
    try { const next = await startVerification(username); saveVerificationChallenge(next); setChallenge(next) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not start verification') }
    finally { setBusy(false) }
  }
  const copy = async () => {
    if (!challenge) return
    await navigator.clipboard.writeText(challenge.token)
    setCopied(true); window.setTimeout(() => setCopied(false), 1800)
  }

  return <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:py-20">
    <header className="text-center"><p className="mb-4 font-mono text-xs text-secondary">// account verification</p><h1 className="text-4xl font-semibold tracking-[-.045em] sm:text-5xl">Prove it’s your LeetCode profile.</h1><p className="mx-auto mt-5 max-w-2xl leading-7 text-base-content/75">We only check your public About section. Your password, cookies, and session tokens stay private.</p></header>
    <ul className="steps my-10 w-full text-xs sm:text-sm"><li className="step step-primary">Username</li><li className={`step ${challenge ? 'step-primary' : ''}`}>Add code</li><li className="step">Set up profile</li></ul>

    {!challenge ? <form className="card card-border bg-base-200/85" onSubmit={start} aria-busy={busy}><div className="card-body gap-5 p-6 sm:p-8">
      <span className="grid size-12 place-items-center rounded-field bg-secondary/10 text-secondary"><ShieldCheck/></span><div><h2 className="card-title text-xl">Enter your LeetCode username</h2><p className="mt-2 text-sm leading-6 text-base-content/70">We’ll fetch your public stats and create a one-time verification code.</p></div>
      <fieldset className="fieldset"><legend className="fieldset-legend">LeetCode username</legend><input className="input w-full" name="username" autoComplete="username" autoFocus required minLength={1} maxLength={30} value={username} onChange={event => setUsername(event.target.value)} placeholder="your_username"/></fieldset>
      {error && <div role="alert" className="alert alert-error alert-soft"><span>{error}</span></div>}
      <button className="btn btn-primary btn-block" disabled={busy}>{busy && <span className="loading loading-spinner loading-sm"></span>}{busy ? 'Checking…' : 'Continue'}</button>
    </div></form> : <section className="card card-border bg-base-200/85"><div className="card-body gap-5 p-6 sm:p-8">
      <span className="grid size-12 place-items-center rounded-field bg-secondary/10 text-secondary"><Clipboard/></span><div><h2 className="card-title text-xl">Add this code to your About section</h2><p className="mt-2 text-sm text-base-content/70">This temporary code links the public profile to you.</p></div>
      <ol className="list-decimal space-y-2 pl-5 text-sm leading-6 text-base-content/70"><li>Open your LeetCode profile settings.</li><li>Paste the code anywhere in your public <strong>About Me</strong>.</li><li>Save, then come back and check it.</li></ol>
      <button type="button" className="btn h-auto min-h-12 justify-between border-dashed bg-base-100 px-4 py-3 font-mono text-xs text-secondary sm:text-sm" onClick={() => void copy()}><code className="break-all text-left">{challenge.token}</code><span className="ml-3 flex shrink-0 items-center gap-1 font-sans text-xs text-base-content/70">{copied ? <><Check size={15}/>Copied</> : <><Clipboard size={15}/>Copy</>}</span></button>
      <a className="btn btn-ghost btn-sm" href="https://leetcode.com/profile/" target="_blank" rel="noreferrer">Open LeetCode profile settings <ExternalLink size={15}/></a>
      {error && <div role="alert" className="alert alert-error alert-soft"><span>{error}</span></div>}
      <button className="btn btn-primary btn-block" onClick={() => void finishVerification(challenge.challengeId)} disabled={busy}>{busy && <span className="loading loading-spinner loading-sm"></span>}{busy ? 'Checking public profile…' : 'I added it — check now'}</button>
      <button className="btn btn-ghost btn-sm" onClick={() => setChallenge(null)}>Use a different username</button>
      <p className="text-center text-xs text-base-content/65">Code expires {new Date(challenge.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.</p>
    </div></section>}
  </main>
}
