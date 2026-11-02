import { Check, CheckCircle2, LogOut, UserRound } from 'lucide-react'
import { FormEvent, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { clearProfileKey, clearVerificationChallenge, getMe, getProfileKey, logout, updateMe } from '../api'
import type { ActivityType } from '../types'

const activities: { value: ActivityType; label: string; description: string }[] = [
  { value: 'RANDOM_PROBLEMS', label: 'Random problems', description: 'Pick something and solve together' },
  { value: 'CONTESTS', label: 'Contests', description: 'Weekly, biweekly, or virtual' },
  { value: 'DSA_PRACTICE', label: 'DSA practice', description: 'Build topic-by-topic consistency' },
  { value: 'INTERVIEW_PREP', label: 'Interview prep', description: 'Timed questions and mock rounds' },
]

export default function ProfileFormPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const formRef = useRef<HTMLFormElement>(null)
  const [form, setForm] = useState({ preferredLanguage: '', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, bio: '', contactType: '', contactUsername: '', activities: [] as ActivityType[], password: '', confirmPassword: '' })
  const [username, setUsername] = useState('')
  const [hasPassword, setHasPassword] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const needsPassword = hasPassword === false
  const canSubmit = !busy && form.activities.length > 0 && (!needsPassword || (form.password.length >= 8 && form.password === form.confirmPassword))

  useEffect(() => {
    if (!getProfileKey()) return
    getMe().then(profile => {
      setUsername(profile.leetcodeUsername); setHasPassword(profile.hasPassword)
      setForm(current => ({ ...current, preferredLanguage: profile.preferredLanguage || '', timezone: profile.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone, bio: profile.bio || '', contactType: profile.contactType || '', contactUsername: profile.contactUsername || '', activities: profile.activities || [] }))
    }).catch(cause => setError(cause.message))
  }, [])
  useEffect(() => {
    const saveWithKeyboard = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's') return
      event.preventDefault(); if (canSubmit) formRef.current?.requestSubmit(); else formRef.current?.reportValidity()
    }
    window.addEventListener('keydown', saveWithKeyboard); return () => window.removeEventListener('keydown', saveWithKeyboard)
  }, [canSubmit])

  if (!getProfileKey()) return <main className="mx-auto max-w-xl px-4 py-16"><div className="card card-border bg-base-200"><div className="card-body items-center text-center"><UserRound className="text-secondary"/><h1 className="card-title">Log in to edit your profile</h1><Link className="btn btn-primary mt-3" to="/login">Log in</Link></div></div></main>
  if (hasPassword === null && error) return <main className="mx-auto max-w-xl px-4 py-16"><div className="card card-border bg-base-200"><div className="card-body items-center text-center"><h1 className="card-title">Could not load your profile</h1><div role="alert" className="alert alert-error alert-soft"><span>{error}</span></div><button className="btn btn-primary" onClick={() => window.location.reload()}>Try again</button></div></div></main>
  if (hasPassword === null) return <main className="mx-auto max-w-4xl px-4 py-16"><div className="skeleton h-96 w-full" aria-label="Loading your profile"></div></main>

  const toggle = (value: ActivityType) => setForm(current => ({ ...current, activities: current.activities.includes(value) ? current.activities.filter(item => item !== value) : [...current.activities, value] }))
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setSaved(false)
    if (form.password !== form.confirmPassword) { setError('Passwords do not match'); return }
    if ((needsPassword || form.password) && form.password.length < 8) { setError('Password must be at least 8 characters'); return }
    setBusy(true)
    try {
      const creatingPassword = needsPassword
      await updateMe({ preferredLanguage: form.preferredLanguage, timezone: form.timezone, bio: form.bio, contactType: form.contactType, contactUsername: form.contactUsername, activities: form.activities, password: form.password || undefined })
      if (creatingPassword) { clearVerificationChallenge(); clearProfileKey(); navigate('/login?passwordCreated=1', { replace: true }); return }
      setHasPassword(true); setForm(current => ({ ...current, password: '', confirmPassword: '' })); setSaved(true)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save profile') }
    finally { setBusy(false) }
  }
  const signOut = async () => { await logout(); navigate('/login'); window.location.reload() }

  return <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:py-16">
    <header className="mb-8"><p className="mb-3 font-mono text-xs text-secondary">// {searchParams.get('verified') ? 'account verified' : 'your profile'}</p><h1 className="text-4xl font-semibold tracking-[-.045em] sm:text-5xl">{searchParams.get('verified') ? 'Nice. Now finish your account.' : 'Tune your matching profile.'}</h1><p className="mt-4 max-w-2xl text-base-content/70">Keep your goals current so LeetBroFinder can surface better practice partners.</p></header>
    <form ref={formRef} className="card card-border bg-base-200/85" onSubmit={submit} autoComplete="on" aria-busy={busy}><div className="card-body gap-8 p-5 sm:p-8">
      {username && <div className="alert alert-success alert-soft"><CheckCircle2 size={18}/><span><strong>{username}</strong> is verified</span></div>}
      <fieldset className="fieldset grid gap-4 sm:grid-cols-2"><legend className="fieldset-legend text-base">Profile basics</legend>
        <label className="fieldset"><span className="label">LeetCode username</span><input className="input w-full" name="username" autoComplete="username" value={username} readOnly/></label>
        <label className="fieldset"><span className="label">Preferred language</span><input className="input w-full" name="preferredLanguage" autoComplete="off" required maxLength={40} value={form.preferredLanguage} onChange={event => setForm({ ...form, preferredLanguage: event.target.value })} placeholder="e.g. C++, Python, Java"/></label>
        <label className="fieldset"><span className="label">Timezone</span><input className="input w-full" name="profileTimezone" autoComplete="off" required maxLength={64} value={form.timezone} onChange={event => setForm({ ...form, timezone: event.target.value })} placeholder="e.g. Europe/Warsaw"/></label>
        <label className="fieldset"><span className="label">Bio <small className="ml-auto text-base-content/60">Optional · {form.bio.length}/70</small></span><textarea className="textarea min-h-20 w-full" name="bio" autoComplete="off" maxLength={70} value={form.bio} onChange={event => setForm({ ...form, bio: event.target.value })} placeholder="A little about your practice goals"/></label>
        <label className="fieldset"><span className="label">Contact method <small className="ml-auto text-base-content/60">Optional</small></span><select className="select w-full" name="contactType" autoComplete="off" value={form.contactType} onChange={event => setForm({ ...form, contactType: event.target.value, contactUsername: event.target.value ? form.contactUsername : '' })}><option value="">No external contact</option><option>Discord</option><option>Telegram</option><option>LinkedIn</option><option>Other</option></select></label>
        <label className="fieldset"><span className="label">Contact username <small className="ml-auto text-base-content/60">Optional</small></span><input className="input w-full" name="contactUsername" autoComplete="off" required={Boolean(form.contactType)} disabled={!form.contactType} maxLength={100} value={form.contactUsername} onChange={event => setForm({ ...form, contactUsername: event.target.value })} placeholder={form.contactType ? `Your ${form.contactType} username` : 'Choose a method first'}/></label>
      </fieldset>

      <fieldset className="fieldset"><legend className="fieldset-legend text-base">What do you want to do?</legend><p className="label mb-2">Choose at least one practice mode.</p><div className="grid gap-3 sm:grid-cols-2">{activities.map(activity => {
        const selected = form.activities.includes(activity.value)
        return <label className={`flex cursor-pointer items-center gap-4 rounded-field border p-4 transition-colors ${selected ? 'border-secondary/45 bg-base-200' : 'border-base-300 hover:bg-base-300/30'}`} key={activity.value}><input className="checkbox" type="checkbox" checked={selected} onChange={() => toggle(activity.value)}/><span className="min-w-0 flex-1"><strong className="block text-sm">{activity.label}</strong><small className="mt-1 block text-base-content/65">{activity.description}</small></span>{selected && <Check className="text-secondary" size={17}/>}</label>
      })}</div></fieldset>

      <fieldset className="fieldset rounded-box border border-base-300 bg-base-100/45 p-5"><legend className="fieldset-legend px-2 text-base">{needsPassword ? 'Create your login password (required)' : 'Change password (optional)'}</legend><p className="label mb-3 max-w-2xl">Use at least 8 characters. Browser-generated strong passwords are supported. Do not use your LeetCode password.</p><div className="grid gap-4 sm:grid-cols-2"><label className="fieldset"><span className="label">New password</span><input className="input w-full" name="password" type="password" required={needsPassword} minLength={8} maxLength={72} autoComplete="new-password" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })}/></label><label className="fieldset"><span className="label">Confirm new password</span><input className="input w-full" name="passwordConfirmation" type="password" required={needsPassword || Boolean(form.password)} minLength={8} maxLength={72} autoComplete="new-password" value={form.confirmPassword} onChange={event => setForm({ ...form, confirmPassword: event.target.value })}/></label></div></fieldset>

      {error && <div role="alert" className="alert alert-error alert-soft"><span>{error}</span></div>}
      {saved && <div role="status" className="alert alert-success alert-soft"><CheckCircle2 size={18}/><span>Profile saved.</span></div>}
      <div className="flex flex-col-reverse gap-3 border-t border-base-300 pt-5 sm:flex-row sm:items-center"><button type="button" className="btn btn-ghost text-error sm:mr-auto" onClick={() => void signOut()}><LogOut size={15}/>Log out</button><Link className="btn btn-ghost" to="/">Cancel</Link><button className="btn btn-primary" disabled={!canSubmit}>{busy && <span className="loading loading-spinner loading-sm"></span>}{busy ? 'Saving…' : needsPassword ? 'Create account' : 'Save profile'}</button></div>
    </div></form>
  </main>
}
