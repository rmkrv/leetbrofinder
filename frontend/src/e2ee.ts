import { getE2eeKeyBundle, registerE2eeKeys } from './api'
import type { E2eeKeyBundle, EncryptedMessageEnvelope, EncryptedMessagePayload } from './types'

const DATABASE_NAME = 'leetbrofinder-e2ee'
const STORE_NAME = 'identities'
const CRYPTO_VERSION = 1 as const
const encoder = new TextEncoder()

type MessageContext = 'conversation' | 'coop-session'

interface StoredIdentity {
  profileId: string
  encryptionPrivateKey: CryptoKey
  encryptionPublicKey: CryptoKey
  signingPrivateKey: CryptoKey
  signingPublicKey: CryptoKey
  encryptionPublicJwk: string
  signingPublicJwk: string
  fingerprint: string
  trustedFingerprints?: Record<string, string>
}

export type DecryptionState = 'encrypted' | 'legacy' | 'failed'
export type Decrypted<T> = T & { displayContent: string; decryptionState: DecryptionState }

const identityCache = new Map<string, StoredIdentity>()
const identityPromises = new Map<string, Promise<StoredIdentity>>()
const bundleCache = new Map<string, E2eeKeyBundle | null>()
const importedEncryptionKeys = new Map<string, CryptoKey>()
const importedSigningKeys = new Map<string, CryptoKey>()
let databasePromise: Promise<IDBDatabase> | null = null

function requireCrypto() {
  if (!window.isSecureContext || !window.crypto?.subtle || !window.indexedDB) {
    throw new Error('End-to-end encryption requires HTTPS or localhost and a browser with Web Crypto support.')
  }
}

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: 'profileId' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Could not open the encrypted key store'))
  })
  return databasePromise
}

async function readIdentity(profileId: string): Promise<StoredIdentity | null> {
  const cached = identityCache.get(profileId)
  if (cached) return cached
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(profileId)
    request.onsuccess = () => {
      const identity = (request.result as StoredIdentity | undefined) ?? null
      if (identity) identityCache.set(profileId, identity)
      resolve(identity)
    }
    request.onerror = () => reject(request.error ?? new Error('Could not read the encrypted identity'))
  })
}

async function writeIdentity(identity: StoredIdentity): Promise<void> {
  const database = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(identity)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error ?? new Error('Could not save the encrypted identity'))
  })
  identityCache.set(identity.profileId, identity)
}

function normalizePublicJwk(jwk: JsonWebKey, keyOps: string[]): string {
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.x || !jwk.y) {
    throw new Error('The browser generated an unsupported encryption key')
  }
  return JSON.stringify({ kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y, ext: true, key_ops: keyOps })
}

async function sha256Hex(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))
  return [...digest].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

async function generateIdentity(profileId: string): Promise<StoredIdentity> {
  const encryptionKeys = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits'],
  ) as CryptoKeyPair
  const signingKeys = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify'],
  ) as CryptoKeyPair
  const encryptionPublicJwk = normalizePublicJwk(await crypto.subtle.exportKey('jwk', encryptionKeys.publicKey), [])
  const signingPublicJwk = normalizePublicJwk(await crypto.subtle.exportKey('jwk', signingKeys.publicKey), ['verify'])
  const fingerprint = await sha256Hex(`${encryptionPublicJwk}\n${signingPublicJwk}`)
  return {
    profileId,
    encryptionPrivateKey: encryptionKeys.privateKey,
    encryptionPublicKey: encryptionKeys.publicKey,
    signingPrivateKey: signingKeys.privateKey,
    signingPublicKey: signingKeys.publicKey,
    encryptionPublicJwk,
    signingPublicJwk,
    fingerprint,
  }
}

async function loadBundle(profileId: string, refresh = false): Promise<E2eeKeyBundle | null> {
  if (!refresh && bundleCache.has(profileId)) return bundleCache.get(profileId) ?? null
  const bundle = await getE2eeKeyBundle(profileId)
  bundleCache.set(profileId, bundle)
  return bundle
}

async function initializeIdentity(profileId: string): Promise<StoredIdentity> {
  requireCrypto()
  const [local, registered] = await Promise.all([readIdentity(profileId), loadBundle(profileId, true)])
  if (local) {
    if (registered && registered.fingerprint !== local.fingerprint) {
      throw new Error('This browser has a different encryption key than the one registered for your account.')
    }
    if (!registered) {
      const created = await registerE2eeKeys(local.encryptionPublicJwk, local.signingPublicJwk)
      bundleCache.set(profileId, created)
    }
    return local
  }
  if (registered) {
    throw new Error('This account’s encryption key is on another browser. Use that browser to read or send encrypted messages.')
  }

  const identity = await generateIdentity(profileId)
  await writeIdentity(identity)
  const created = await registerE2eeKeys(identity.encryptionPublicJwk, identity.signingPublicJwk)
  if (created.fingerprint !== identity.fingerprint) {
    throw new Error('The server registered an unexpected encryption key fingerprint.')
  }
  bundleCache.set(profileId, created)
  return identity
}

export function ensureE2eeIdentity(profileId: string): Promise<StoredIdentity> {
  const existing = identityPromises.get(profileId)
  if (existing) return existing
  const pending = initializeIdentity(profileId).catch(error => {
    identityPromises.delete(profileId)
    throw error
  })
  identityPromises.set(profileId, pending)
  return pending
}

async function requirePartnerBundle(profileId: string, identity: StoredIdentity): Promise<E2eeKeyBundle> {
  const bundle = await loadBundle(profileId)
  if (!bundle) throw new Error('The other user has not enabled end-to-end encrypted messaging yet.')
  if (bundle.version !== CRYPTO_VERSION) throw new Error('The other user uses an unsupported encryption version.')
  const trusted = identity.trustedFingerprints?.[profileId]
  if (trusted && trusted !== bundle.fingerprint) {
    throw new Error('The other user’s encryption key changed. Stop and verify their safety code before continuing.')
  }
  if (!trusted) {
    identity.trustedFingerprints = { ...(identity.trustedFingerprints ?? {}), [profileId]: bundle.fingerprint }
    await writeIdentity(identity)
  }
  return bundle
}

async function importEncryptionKey(bundle: E2eeKeyBundle): Promise<CryptoKey> {
  const cached = importedEncryptionKeys.get(bundle.fingerprint)
  if (cached) return cached
  const key = await crypto.subtle.importKey('jwk', JSON.parse(bundle.encryptionPublicKey),
    { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  importedEncryptionKeys.set(bundle.fingerprint, key)
  return key
}

async function importSigningKey(bundle: E2eeKeyBundle): Promise<CryptoKey> {
  const cached = importedSigningKeys.get(bundle.fingerprint)
  if (cached) return cached
  const key = await crypto.subtle.importKey('jwk', JSON.parse(bundle.signingPublicKey),
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
  importedSigningKeys.set(bundle.fingerprint, key)
  return key
}

async function deriveMessageKey(identity: StoredIdentity, partner: E2eeKeyBundle,
    salt: Uint8Array<ArrayBuffer>, context: MessageContext, contextId: string): Promise<CryptoKey> {
  const partnerPublicKey = await importEncryptionKey(partner)
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: partnerPublicKey }, identity.encryptionPrivateKey, 256,
  )
  const material = await crypto.subtle.importKey('raw', sharedSecret, 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey({
    name: 'HKDF', hash: 'SHA-256', salt,
    info: encoder.encode(`leetbrofinder:e2ee:v1:${context}:${contextId}`),
  }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

function associatedData(context: MessageContext, contextId: string, senderId: string, recipientId: string,
    senderFingerprint: string, recipientFingerprint: string): Uint8Array<ArrayBuffer> {
  return encoder.encode(JSON.stringify([
    CRYPTO_VERSION, context, contextId, senderId, recipientId, senderFingerprint, recipientFingerprint,
  ])) as Uint8Array<ArrayBuffer>
}

function concatenate(...parts: Uint8Array<ArrayBuffer>[]): Uint8Array<ArrayBuffer> {
  const result = new Uint8Array(parts.reduce((length, part) => length + part.length, 0))
  let offset = 0
  for (const part of parts) { result.set(part, offset); offset += part.length }
  return result
}

function toBase64Url(bytes: Uint8Array<ArrayBuffer>): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4))
  return Uint8Array.from(binary, character => character.charCodeAt(0)) as Uint8Array<ArrayBuffer>
}

export async function encryptMessage(context: MessageContext, contextId: string, senderId: string,
    recipientId: string, plaintext: string): Promise<EncryptedMessagePayload> {
  const identity = await ensureE2eeIdentity(senderId)
  const partner = await requirePartnerBundle(recipientId, identity)
  const salt = crypto.getRandomValues(new Uint8Array(16)) as Uint8Array<ArrayBuffer>
  const iv = crypto.getRandomValues(new Uint8Array(12)) as Uint8Array<ArrayBuffer>
  const aad = associatedData(context, contextId, senderId, recipientId, identity.fingerprint, partner.fingerprint)
  const key = await deriveMessageKey(identity, partner, salt, context, contextId)
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aad, tagLength: 128 }, key, encoder.encode(plaintext),
  )) as Uint8Array<ArrayBuffer>
  const signature = new Uint8Array(await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, identity.signingPrivateKey,
    concatenate(aad, salt, iv, ciphertext),
  )) as Uint8Array<ArrayBuffer>
  return {
    ciphertext: toBase64Url(ciphertext), iv: toBase64Url(iv), salt: toBase64Url(salt),
    signature: toBase64Url(signature), cryptoVersion: CRYPTO_VERSION,
    senderKeyFingerprint: identity.fingerprint, recipientKeyFingerprint: partner.fingerprint,
  }
}

export async function decryptMessage<T extends EncryptedMessageEnvelope & { senderId: string }>(
    context: MessageContext, contextId: string, myProfileId: string, partnerProfileId: string, message: T,
): Promise<Decrypted<T>> {
  if (!message.cryptoVersion) {
    return { ...message, displayContent: message.content ?? '[Legacy message unavailable]', decryptionState: 'legacy' }
  }
  const identity = await ensureE2eeIdentity(myProfileId)
  const partner = await requirePartnerBundle(partnerProfileId, identity)
  try {
    if (message.cryptoVersion !== CRYPTO_VERSION || !message.ciphertext || !message.iv || !message.salt
        || !message.signature || !message.senderKeyFingerprint || !message.recipientKeyFingerprint) {
      throw new Error('Incomplete encrypted message')
    }
    const mine = message.senderId === myProfileId
    const senderId = mine ? myProfileId : partnerProfileId
    const recipientId = mine ? partnerProfileId : myProfileId
    const senderFingerprint = mine ? identity.fingerprint : partner.fingerprint
    const recipientFingerprint = mine ? partner.fingerprint : identity.fingerprint
    if (message.senderKeyFingerprint !== senderFingerprint || message.recipientKeyFingerprint !== recipientFingerprint) {
      throw new Error('Message key fingerprint does not match')
    }

    const salt = fromBase64Url(message.salt)
    const iv = fromBase64Url(message.iv)
    const ciphertext = fromBase64Url(message.ciphertext)
    const signature = fromBase64Url(message.signature)
    const aad = associatedData(context, contextId, senderId, recipientId, senderFingerprint, recipientFingerprint)
    const signingKey = mine ? identity.signingPublicKey : await importSigningKey(partner)
    const valid = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, signingKey, signature,
      concatenate(aad, salt, iv, ciphertext))
    if (!valid) throw new Error('Message signature is invalid')

    const key = await deriveMessageKey(identity, partner, salt, context, contextId)
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: aad, tagLength: 128 }, key, ciphertext,
    )
    return { ...message, displayContent: new TextDecoder().decode(plaintext), decryptionState: 'encrypted' }
  } catch {
    return { ...message, displayContent: '[Unable to decrypt this message]', decryptionState: 'failed' }
  }
}

export async function getE2eeFingerprint(profileId: string): Promise<string | null> {
  return (await loadBundle(profileId, true))?.fingerprint ?? null
}

export function formatFingerprint(fingerprint: string): string {
  const groups = fingerprint.replace(/\s/g, '').toUpperCase().slice(0, 16).match(/.{1,4}/g)
  if (!groups?.length) return fingerprint
  return groups.length > 2
    ? `${groups.slice(0, 2).join(' ')} · ${groups.slice(2).join(' ')}`
    : groups.join(' ')
}
