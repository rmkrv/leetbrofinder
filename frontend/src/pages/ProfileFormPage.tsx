import { CheckCircle2, LogOut } from 'lucide-react'
import { FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { clearProfileKey, clearVerificationChallenge, getMe, getProfileKey, logout, updateMe } from '../api'
import type { ActivityType, Availability } from '../types'

const activities: { value: ActivityType; label: string; description: string }[] = [
  { value: 'RANDOM_PROBLEMS', label: 'Random problems', description: 'Pick something and solve together' },
  { value: 'CONTESTS', label: 'Contests', description: 'Weekly, biweekly, or virtual' },
  { value: 'DSA_PRACTICE', label: 'DSA practice', description: 'Build topic-by-topic consistency' },
  { value: 'INTERVIEW_PREP', label: 'Interview prep', description: 'Timed questions and mock rounds' },
]

export default function ProfileFormPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    preferredLanguage: '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    contactType: '',
    contactUsername: '',
    activities: [] as ActivityType[],
    availability: 'OCCASIONALLY' as Availability,
    password: '',
    confirmPassword: '',
  })
  const [username, setUsername] = useState('')
  const [hasPassword, setHasPassword] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!getProfileKey()) return
    getMe().then(profile => {
      setUsername(profile.leetcodeUsername)
      setHasPassword(profile.hasPassword)
      setForm(current => ({
        ...current,
        preferredLanguage: profile.preferredLanguage || '',
        timezone: profile.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
        contactType: profile.contactType || '',
        contactUsername: profile.contactUsername || '',
        activities: profile.activities || [],
        availability: profile.availability || 'OCCASIONALLY',
      }))
    }).catch(error => setError(error.message))
  }, [])

  if (!getProfileKey()) return <main className="narrow-page"><div className="surface blocked"><h2>Log in to edit your profile</h2><p>Use your LeetCode username and LeetBroFinder password.</p><Link className="primary" to="/login">Log in</Link></div></main>
  if (hasPassword === null && error) return <main className="narrow-page"><div className="surface blocked"><h2>Could not load your profile</h2><p className="form-error">{error}</p><button className="primary" onClick={() => window.location.reload()}>Try again</button></div></main>
  if (hasPassword === null) return <main className="narrow-page"><div className="surface blocked"><h2>Loading your profile…</h2><p>Checking your account setup.</p></div></main>

  const needsPassword = !hasPassword

  const toggle = (value: ActivityType) => setForm(current => ({
    ...current,
    activities: current.activities.includes(value) ? current.activities.filter(item => item !== value) : [...current.activities, value],
  }))

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setSaved(false)
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match')
      return
    }
    if ((needsPassword || form.password) && form.password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    setBusy(true)
    try {
      const creatingPassword = needsPassword
      await updateMe({
        preferredLanguage: form.preferredLanguage,
        timezone: form.timezone,
        contactType: form.contactType,
        contactUsername: form.contactUsername,
        activities: form.activities,
        availability: form.availability,
        password: form.password || undefined,
      })
      if (creatingPassword) {
        clearVerificationChallenge()
        clearProfileKey()
        navigate('/login?passwordCreated=1', { replace: true })
        return
      }
      setHasPassword(true)
      setForm(current => ({ ...current, password: '', confirmPassword: '' }))
      setSaved(true)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save profile')
    } finally {
      setBusy(false)
    }
  }

  const signOut = async () => {
    await logout()
    navigate('/login')
    window.location.reload()
  }

  return <main className="form-page">
    <div className="page-heading"><p className="eyebrow">{searchParams.get('verified') ? 'Account verified' : 'Your profile'}</p><h1>{searchParams.get('verified') ? 'Nice. Now finish your account.' : 'Edit your practice profile.'}</h1><p>Your profile stays private until setup—including your password—is complete.</p></div>
    <form className="surface profile-form" onSubmit={submit} autoComplete="on">
      {username && <div className="verified-strip"><CheckCircle2 size={18}/><span><strong>{username}</strong> is verified</span></div>}
      <div className="form-grid">
        <label>LeetCode username<input name="username" autoComplete="username" value={username} readOnly/></label>
        <label>Preferred language<input name="preferredLanguage" autoComplete="off" required maxLength={40} value={form.preferredLanguage} onChange={event => setForm({ ...form, preferredLanguage: event.target.value })} placeholder="e.g. C++, Python, Java"/></label>
        <label>Timezone<input name="profileTimezone" autoComplete="off" required maxLength={64} value={form.timezone} onChange={event => setForm({ ...form, timezone: event.target.value })} placeholder="e.g. Europe/Warsaw"/></label>
        <label>Contact method <small>Optional</small><select name="contactType" autoComplete="off" value={form.contactType} onChange={event => setForm({ ...form, contactType: event.target.value, contactUsername: event.target.value ? form.contactUsername : '' })}><option value="">No external contact</option><option>Discord</option><option>Telegram</option><option>LinkedIn</option><option>Other</option></select></label>
        <label>Contact username <small>Optional</small><input name="contactUsername" autoComplete="off" required={Boolean(form.contactType)} disabled={!form.contactType} maxLength={100} value={form.contactUsername} onChange={event => setForm({ ...form, contactUsername: event.target.value })} placeholder={form.contactType ? `Your ${form.contactType} username` : 'Choose a method first'}/></label>
      </div>
      <fieldset><legend>What do you want to do?</legend><div className="choice-grid">{activities.map(activity => <label className={form.activities.includes(activity.value) ? 'choice selected' : 'choice'} key={activity.value}><input type="checkbox" checked={form.activities.includes(activity.value)} onChange={() => toggle(activity.value)}/><span><strong>{activity.label}</strong><small>{activity.description}</small></span><i>✓</i></label>)}</div></fieldset>
      <fieldset><legend>Availability</legend><div className="segmented">{([['LOOKING_NOW', 'Looking now'], ['TODAY', 'Today'], ['OCCASIONALLY', 'Occasionally']] as [Availability, string][]).map(([value, label]) => <label key={value}><input type="radio" name="availability" checked={form.availability === value} onChange={() => setForm({ ...form, availability: value })}/><span>{label}</span></label>)}</div></fieldset>
      <fieldset className="password-section"><legend>{needsPassword ? 'Create your login password (required)' : 'Change password (optional)'}</legend><p>Use at least 8 characters. Browser-generated strong passwords are supported. Do not use your LeetCode password.</p><div className="form-grid"><label>New password<input name="password" type="password" required={needsPassword} minLength={8} maxLength={72} autoComplete="new-password" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })}/></label><label>Confirm new password<input name="passwordConfirmation" type="password" required={needsPassword || Boolean(form.password)} minLength={8} maxLength={72} autoComplete="new-password" value={form.confirmPassword} onChange={event => setForm({ ...form, confirmPassword: event.target.value })}/></label></div></fieldset>
      {error && <p className="form-error">{error}</p>}
      {saved && <p className="form-success">Profile saved.</p>}
      <div className="form-actions"><button type="button" className="text-button logout-button" onClick={signOut}><LogOut size={15}/> Log out</button><Link to="/">Cancel</Link><button className="primary" disabled={busy || form.activities.length === 0 || (needsPassword && (form.password.length < 8 || form.password !== form.confirmPassword))}>{busy ? 'Saving…' : needsPassword ? 'Create account' : 'Save profile'}</button></div>
    </form>
  </main>
}
