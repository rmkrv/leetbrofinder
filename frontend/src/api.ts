import type { ActivityType, AuthResult, Availability, Challenge, Connection, Conversation, CoopMessage, CoopSession, E2eeKeyBundle, EncryptedMessagePayload, LiveSearch, Message, PageResponse, Profile, SessionInvite, VoiceSignal } from './types'
const KEY_NAME = 'leetbrofinder.profile-key'
const CHALLENGE_NAME = 'leetbrofinder.verification-challenge'
const API_BASE_URL = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')
export const PROFILE_AUTH_EVENT = 'leetbrofinder-auth-changed'
export const getProfileKey = () => localStorage.getItem(KEY_NAME) || sessionStorage.getItem(KEY_NAME)
export const saveSessionToken = (token: string, rememberMe = false) => {
  sessionStorage.removeItem(KEY_NAME)
  localStorage.removeItem(KEY_NAME)
  ;(rememberMe ? localStorage : sessionStorage).setItem(KEY_NAME, token)
  window.dispatchEvent(new Event(PROFILE_AUTH_EVENT))
}
export const saveSetupSessionToken = (token: string) => saveSessionToken(token, true)
export const clearProfileKey = () => {
  sessionStorage.removeItem(KEY_NAME)
  localStorage.removeItem(KEY_NAME)
  window.dispatchEvent(new Event(PROFILE_AUTH_EVENT))
}
export const saveVerificationChallenge = (challenge: Challenge) => localStorage.setItem(CHALLENGE_NAME, JSON.stringify(challenge))
export const clearVerificationChallenge = () => localStorage.removeItem(CHALLENGE_NAME)
export const getVerificationChallenge = (): Challenge | null => {
  try {
    const stored = localStorage.getItem(CHALLENGE_NAME)
    if (!stored) return null
    const challenge = JSON.parse(stored) as Challenge
    if (!challenge.challengeId || new Date(challenge.expiresAt).getTime() <= Date.now()) {
      clearVerificationChallenge()
      return null
    }
    return challenge
  } catch {
    clearVerificationChallenge()
    return null
  }
}
async function request<T>(path: string, options: RequestInit = {}, authenticated = true): Promise<T> {
  const headers = new Headers(options.headers)
  if (options.body) headers.set('Content-Type', 'application/json')
  const key = authenticated ? getProfileKey() : null
  if (key) headers.set('X-Profile-Key', key)
  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    if (response.status === 401 && authenticated) {
      clearProfileKey()
      if (window.location.pathname !== '/login') window.location.replace('/login?expired=1')
    }
    throw new Error(body.message || `Request failed (${response.status})`)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}
export type ProfileFilters = { query?: string; language?: string; availability?: Availability | ''; activity?: ActivityType | ''; timezone?: string; minRating?: string; maxRating?: string }
export async function searchProfiles(filters: ProfileFilters): Promise<PageResponse<Profile>> { const params = new URLSearchParams(); Object.entries(filters).forEach(([key, value]) => { if (value !== undefined && value !== '') params.set(key, String(value)) }); return request(`/api/profiles?${params.toString()}`) }
export const getProfile = (id: string) => request<Profile>(`/api/profiles/${id}`)
export const getMe = () => request<Profile>('/api/profiles/me')
export const updateMe = (body: { preferredLanguage: string; timezone: string; contactType: string; contactUsername: string; activities: ActivityType[]; availability: Availability; password?: string }) => request<Profile>('/api/profiles/me', { method: 'PATCH', body: JSON.stringify(body) })
export const startVerification = (username: string) => request<Challenge>('/api/verification/start', { method: 'POST', body: JSON.stringify({ username }) }, false)
export const confirmVerification = (id: string) => request<AuthResult>(`/api/verification/${id}/confirm`, { method: 'POST' }, false)
export const login = (username: string, password: string, rememberMe: boolean) => request<AuthResult>('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password, rememberMe }) }, false)
export async function logout() {
  try { await request<void>('/api/auth/logout', { method: 'POST' }) } finally { clearProfileKey() }
}
export const listConversations = () => request<Conversation[]>('/api/conversations')
export const startConversation = (targetProfileId: string) => request<Conversation>('/api/conversations', { method: 'POST', body: JSON.stringify({ targetProfileId }) })
export const getMessages = (id: string) => request<Message[]>(`/api/conversations/${id}/messages`)
export const sendMessage = (id: string, payload: EncryptedMessagePayload) => request<Message>(`/api/conversations/${id}/messages`, { method: 'POST', body: JSON.stringify(payload) })
export const getE2eeKeyBundle = async (profileId: string) => (await request<E2eeKeyBundle | undefined>(`/api/e2ee/keys/${profileId}`)) ?? null
export const registerE2eeKeys = (encryptionPublicKey: string, signingPublicKey: string) => request<E2eeKeyBundle>('/api/e2ee/keys/me', { method: 'PUT', body: JSON.stringify({ encryptionPublicKey, signingPublicKey }) })
export const joinLiveSearch = () => request<LiveSearch>('/api/live-search', { method: 'POST' })
export const getLiveSearch = (id: string) => request<LiveSearch>(`/api/live-search/${id}`)
export const cancelLiveSearch = (id: string) => request<void>(`/api/live-search/${id}`, { method: 'DELETE' })
export const joinCoopSession = () => request<CoopSession>('/api/coop-sessions/queue', { method: 'POST' })
export const getCurrentCoopSession = async () => (await request<CoopSession | undefined>('/api/coop-sessions/current')) ?? null
export const getCoopSession = (id: string) => request<CoopSession>(`/api/coop-sessions/${id}`)
export const acceptCoopProblem = (id: string) => request<CoopSession>(`/api/coop-sessions/${id}/accept`, { method: 'POST' })
export const rerollCoopProblem = (id: string) => request<CoopSession>(`/api/coop-sessions/${id}/reroll`, { method: 'POST' })
export const suggestCoopProblem = (id: string, problem: string) => request<CoopSession>(`/api/coop-sessions/${id}/suggest`, { method: 'POST', body: JSON.stringify({ problem }) })
export const leaveCoopSession = (id: string) => request<CoopSession>(`/api/coop-sessions/${id}/leave`, { method: 'POST' })
export const getCoopMessages = (id: string) => request<CoopMessage[]>(`/api/coop-sessions/${id}/messages`)
export const sendCoopMessage = (id: string, payload: EncryptedMessagePayload) => request<CoopMessage>(`/api/coop-sessions/${id}/messages`, { method: 'POST', body: JSON.stringify(payload) })
export const joinSessionVoice = (id: string) => request<void>(`/api/coop-sessions/${id}/voice/join`, { method: 'POST' })
export const leaveSessionVoice = (id: string) => request<void>(`/api/coop-sessions/${id}/voice/leave`, { method: 'POST' })
export const muteSessionVoice = (id: string, muted: boolean) => request<void>(`/api/coop-sessions/${id}/voice/mute`, { method: 'POST', body: JSON.stringify({ muted }) })
export const getVoiceSignals = (id: string, after: number) => request<VoiceSignal[]>(`/api/coop-sessions/${id}/voice/signals?after=${after}`)
export const sendVoiceSignal = (id: string, type: VoiceSignal['type'], payload: string) => request<void>(`/api/coop-sessions/${id}/voice/signals`, { method: 'POST', body: JSON.stringify({ type, payload }) })
export const listConnections = () => request<Connection[]>('/api/connections')
export const sendConnectionRequest = (targetProfileId: string, sessionId: string) => request<Connection>('/api/connections', { method: 'POST', body: JSON.stringify({ targetProfileId, sessionId }) })
export const acceptConnectionRequest = (id: string) => request<Connection>(`/api/connections/${id}/accept`, { method: 'POST' })
export const listSessionInvites = () => request<SessionInvite[]>('/api/session-invites')
export const createSessionInvite = (targetProfileId: string) => request<SessionInvite>('/api/session-invites', { method: 'POST', body: JSON.stringify({ targetProfileId }) })
export const acceptSessionInvite = (id: string) => request<SessionInvite>(`/api/session-invites/${id}/accept`, { method: 'POST' })
export const declineSessionInvite = (id: string) => request<SessionInvite>(`/api/session-invites/${id}/decline`, { method: 'POST' })
