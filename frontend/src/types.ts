export type ActivityType = 'RANDOM_PROBLEMS' | 'CONTESTS' | 'DSA_PRACTICE' | 'INTERVIEW_PREP'
export type Availability = 'LOOKING_NOW' | 'TODAY' | 'OCCASIONALLY'
export interface LeetCodeActivity { title: string; titleSlug: string; status: string; language: string; submittedAt: string | null }
export interface LanguageStat { language: string; problemsSolved: number }
export interface Profile { id: string; leetcodeUsername: string; preferredLanguage: string | null; timezone: string | null; contactType: string | null; contactUsername: string | null; activities: ActivityType[]; availability: Availability; verified: boolean; hasPassword: boolean; avatarUrl: string | null; totalSolved: number; easySolved: number; mediumSolved: number; hardSolved: number; contestRating: number | null; contestRanking: number | null; contestsAttended: number; recentActivity: LeetCodeActivity[]; languages: LanguageStat[]; updatedAt: string }
export interface PageResponse<T> { content: T[]; totalElements: number; totalPages: number; number: number }
export interface Challenge { challengeId: string; username: string; token: string; expiresAt: string }
export interface AuthResult { profile: Profile; sessionToken: string; expiresAt: string }
export interface Message { id: string; senderId: string; senderUsername: string; content: string; createdAt: string }
export interface Conversation { id: string; otherProfile: Profile; lastMessage: Message | null; createdAt: string }
export interface LiveSearch { id: string; status: 'SEARCHING' | 'MATCHED' | 'CANCELLED' | 'EXPIRED'; expiresAt: string; match: Profile | null }
export type CoopSessionState = 'SEARCHING' | 'NEGOTIATING' | 'ACTIVE' | 'CLOSED' | 'CANCELLED'
export interface SessionPlayer { id: string; leetcodeUsername: string; avatarUrl: string | null; contestRating: number | null }
export interface SessionProblem { title: string; titleSlug: string; difficulty: 'Easy' | 'Medium' | 'Hard'; url: string }
export interface VoicePresence { joined: boolean; muted: boolean }
export interface CoopSession { id: string; state: CoopSessionState; playerOne: SessionPlayer; playerTwo: SessionPlayer | null; partner: SessionPlayer | null; problem: SessionProblem | null; proposedById: string | null; myAccepted: boolean; partnerAccepted: boolean; rerollRequestedById: string | null; queueExpiresAt: string; startedAt: string | null; closedAt: string | null; closedById: string | null; voiceInitiator: boolean; myVoice: VoicePresence; partnerVoice: VoicePresence }
export interface CoopMessage { id: string; senderId: string; senderUsername: string; content: string; createdAt: string }
export interface VoiceSignal { id: number; fromProfileId: string; type: 'OFFER' | 'ANSWER' | 'ICE'; payload: string }
export interface Connection { id: string; status: 'PENDING' | 'ACCEPTED' | 'DECLINED'; direction: 'INCOMING' | 'OUTGOING'; otherProfile: Profile; createdAt: string; respondedAt: string | null }
export interface SessionInvite { id: string; status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED'; direction: 'INCOMING' | 'OUTGOING'; otherPlayer: SessionPlayer; sessionId: string | null; createdAt: string; expiresAt: string; respondedAt: string | null }
