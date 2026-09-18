import { getE2eeKeyBundles, registerE2eeKeys } from './api'
import type { E2eeKeyBundle, EncryptedMessageEnvelope, EncryptedMessagePayload, RecipientKeyEnvelope } from './types'

const DATABASE_NAME = 'leetbrofinder-e2ee'
const STORE_NAME = 'identities'
const CRYPTO_VERSION = 2 as const
const encoder = new TextEncoder()

type MessageContext = 'conversation' | 'coop-session'

interface StoredIdentity {
  profileId: string
  deviceId?: string
  encryptionPrivateKey: CryptoKey
  encryptionPublicKey: CryptoKey
  signingPrivateKey: CryptoKey
  signingPublicKey: CryptoKey
  encryptionPublicJwk: string
  signingPublicJwk: string
  fingerprint: string
  trustedFingerprints?: Record<string, string | string[]>
}

export type DecryptionState = 'encrypted' | 'legacy' | 'failed'
export type Decrypted<T> = T & { displayContent: string; decryptionState: DecryptionState }

const identityCache = new Map<string, StoredIdentity>()
const identityPromises = new Map<string, Promise<StoredIdentity>>()
const bundleCache = new Map<string, E2eeKeyBundle[]>()
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
      const identity = request.result as StoredIdentity | undefined
      if (identity) identityCache.set(profileId, identity)
      resolve(identity ?? null)
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

function normalizePublicJwk(jwk: JsonWebKey, usages: KeyUsage[]): string {
  if (!jwk.kty || !jwk.crv || !jwk.x || !jwk.y) throw new Error('The browser generated an unsupported encryption key')
  return JSON.stringify({ key_ops: usages, ext: true, kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y })
}

async function sha256Hex(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))
  return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('')
}

async function generateIdentity(profileId: string): Promise<StoredIdentity> {
  const encryptionKeys = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits'],
  )
  const signingKeys = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify'],
  )
  const encryptionPublicJwk = normalizePublicJwk(await crypto.subtle.exportKey('jwk', encryptionKeys.publicKey), [])
  const signingPublicJwk = normalizePublicJwk(await crypto.subtle.exportKey('jwk', signingKeys.publicKey), ['verify'])
  const fingerprint = await sha256Hex(`${encryptionPublicJwk}\n${signingPublicJwk}`)
  return {
    profileId, deviceId: crypto.randomUUID(),
    encryptionPrivateKey: encryptionKeys.privateKey,
    encryptionPublicKey: encryptionKeys.publicKey,
    signingPrivateKey: signingKeys.privateKey,
    signingPublicKey: signingKeys.publicKey,
    encryptionPublicJwk, signingPublicJwk, fingerprint,
  }
}

async function loadBundles(profileId: string, refresh = false): Promise<E2eeKeyBundle[]> {
  if (!refresh && bundleCache.has(profileId)) return bundleCache.get(profileId)!
  const bundles = await getE2eeKeyBundles(profileId)
  bundleCache.set(profileId, bundles)
  return bundles
}

async function initializeIdentity(profileId: string): Promise<StoredIdentity> {
  requireCrypto()
  let identity = await readIdentity(profileId)
  const registered = await loadBundles(profileId, true)
  if (!identity) {
    identity = await generateIdentity(profileId)
    await writeIdentity(identity)
  }

  const existing = registered.find(bundle => bundle.fingerprint === identity!.fingerprint)
  if (existing) {
    if (identity.deviceId !== existing.deviceId) {
      identity.deviceId = existing.deviceId
      await writeIdentity(identity)
    }
    return identity
  }

  identity.deviceId ??= crypto.randomUUID()
  const created = await registerE2eeKeys(identity.deviceId, identity.encryptionPublicJwk, identity.signingPublicJwk)
  if (created.fingerprint !== identity.fingerprint) throw new Error('The server registered an unexpected encryption key fingerprint.')
  identity.deviceId = created.deviceId
  await writeIdentity(identity)
  bundleCache.set(profileId, [...registered, created])
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

async function requireBundles(profileId: string, identity: StoredIdentity, refresh = false): Promise<E2eeKeyBundle[]> {
  const bundles = await loadBundles(profileId, refresh)
  if (!bundles.length) throw new Error('The other user has not enabled end-to-end encrypted messaging yet.')
  const current = bundles.map(bundle => bundle.fingerprint).sort()
  const stored = identity.trustedFingerprints?.[profileId]
  const trusted = typeof stored === 'string' ? [stored] : stored ?? []
  if (trusted.some(fingerprint => !current.includes(fingerprint))) {
    throw new Error('The other user’s encryption devices changed unexpectedly. Refresh and verify with them before continuing.')
  }
  if (trusted.length !== current.length) {
    identity.trustedFingerprints = { ...(identity.trustedFingerprints ?? {}), [profileId]: current }
    await writeIdentity(identity)
  }
  return bundles
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

async function deriveKey(identity: StoredIdentity, other: E2eeKeyBundle, salt: Uint8Array<ArrayBuffer>, info: string): Promise<CryptoKey> {
  const otherPublicKey = await importEncryptionKey(other)
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: otherPublicKey }, identity.encryptionPrivateKey, 256,
  )
  const material = await crypto.subtle.importKey('raw', sharedSecret, 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt, info: encoder.encode(info) },
    material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

function messageAad(context: MessageContext, contextId: string, senderId: string, recipientId: string,
    senderFingerprint: string): Uint8Array<ArrayBuffer> {
  return encoder.encode(JSON.stringify([CRYPTO_VERSION, context, contextId, senderId, recipientId, senderFingerprint])) as Uint8Array<ArrayBuffer>
}

function legacyAad(context: MessageContext, contextId: string, senderId: string, recipientId: string,
    senderFingerprint: string, recipientFingerprint: string): Uint8Array<ArrayBuffer> {
  return encoder.encode(JSON.stringify([1, context, contextId, senderId, recipientId, senderFingerprint, recipientFingerprint])) as Uint8Array<ArrayBuffer>
}

function wrapAad(context: MessageContext, contextId: string, senderFingerprint: string,
    recipientFingerprint: string): Uint8Array<ArrayBuffer> {
  return encoder.encode(JSON.stringify([CRYPTO_VERSION, context, contextId, senderFingerprint, recipientFingerprint])) as Uint8Array<ArrayBuffer>
}

function canonicalRecipients(recipients: RecipientKeyEnvelope[]): Uint8Array<ArrayBuffer> {
  const canonical = [...recipients].sort((a, b) => a.keyFingerprint.localeCompare(b.keyFingerprint))
  return encoder.encode(JSON.stringify(canonical)) as Uint8Array<ArrayBuffer>
}

function concatenate(...parts: Uint8Array<ArrayBuffer>[]): Uint8Array<ArrayBuffer> {
  const result = new Uint8Array(parts.reduce((length, part) => length + part.length, 0))
  let offset = 0
  for (const part of parts) { result.set(part, offset); offset += part.length }
  return result as Uint8Array<ArrayBuffer>
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
  const [senderBundles, recipientBundles] = await Promise.all([
    loadBundles(senderId, true), requireBundles(recipientId, identity, true),
  ])
  const recipients = [...new Map([...senderBundles, ...recipientBundles].map(bundle => [bundle.fingerprint, bundle])).values()]
    .sort((a, b) => a.fingerprint.localeCompare(b.fingerprint))
  const salt = crypto.getRandomValues(new Uint8Array(16)) as Uint8Array<ArrayBuffer>
  const iv = crypto.getRandomValues(new Uint8Array(12)) as Uint8Array<ArrayBuffer>
  const contentKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
  const rawContentKey = new Uint8Array(await crypto.subtle.exportKey('raw', contentKey)) as Uint8Array<ArrayBuffer>
  const recipientKeys = await Promise.all(recipients.map(async bundle => {
    const wrapIv = crypto.getRandomValues(new Uint8Array(12)) as Uint8Array<ArrayBuffer>
    const wrappingKey = await deriveKey(identity, bundle, salt,
      `leetbrofinder:e2ee:v2:wrap:${context}:${contextId}:${identity.fingerprint}:${bundle.fingerprint}`)
    const wrapped = new Uint8Array(await crypto.subtle.encrypt({
      name: 'AES-GCM', iv: wrapIv,
      additionalData: wrapAad(context, contextId, identity.fingerprint, bundle.fingerprint), tagLength: 128,
    }, wrappingKey, rawContentKey)) as Uint8Array<ArrayBuffer>
    return { keyFingerprint: bundle.fingerprint, wrappedKey: toBase64Url(wrapped), iv: toBase64Url(wrapIv) }
  }))
  const aad = messageAad(context, contextId, senderId, recipientId, identity.fingerprint)
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aad, tagLength: 128 }, contentKey, encoder.encode(plaintext),
  )) as Uint8Array<ArrayBuffer>
  const signature = new Uint8Array(await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, identity.signingPrivateKey,
    concatenate(aad, salt, iv, ciphertext, canonicalRecipients(recipientKeys)),
  )) as Uint8Array<ArrayBuffer>
  return {
    ciphertext: toBase64Url(ciphertext), iv: toBase64Url(iv), salt: toBase64Url(salt),
    signature: toBase64Url(signature), cryptoVersion: CRYPTO_VERSION,
    senderKeyFingerprint: identity.fingerprint, recipientKeys,
  }
}

async function decryptV2<T extends EncryptedMessageEnvelope & { senderId: string }>(context: MessageContext,
    contextId: string, myProfileId: string, partnerProfileId: string, message: T, identity: StoredIdentity): Promise<Decrypted<T>> {
  if (!message.ciphertext || !message.iv || !message.salt || !message.signature
      || !message.senderKeyFingerprint || !message.recipientKeys?.length) throw new Error('Incomplete encrypted message')
  const [ownBundles, partnerBundles] = await Promise.all([
    loadBundles(myProfileId), requireBundles(partnerProfileId, identity),
  ])
  const mine = message.senderId === myProfileId
  const senderId = mine ? myProfileId : partnerProfileId
  const recipientId = mine ? partnerProfileId : myProfileId
  const senderBundle = (mine ? ownBundles : partnerBundles)
    .find(bundle => bundle.fingerprint === message.senderKeyFingerprint)
  if (!senderBundle) throw new Error('Message signing device is unavailable')
  const envelope = message.recipientKeys.find(item => item.keyFingerprint === identity.fingerprint)
  if (!envelope) throw new Error('This message was sent before this device was added')

  const salt = fromBase64Url(message.salt)
  const iv = fromBase64Url(message.iv)
  const ciphertext = fromBase64Url(message.ciphertext)
  const aad = messageAad(context, contextId, senderId, recipientId, senderBundle.fingerprint)
  const signatureValid = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' }, await importSigningKey(senderBundle), fromBase64Url(message.signature),
    concatenate(aad, salt, iv, ciphertext, canonicalRecipients(message.recipientKeys)),
  )
  if (!signatureValid) throw new Error('Message signature is invalid')

  const wrappingKey = await deriveKey(identity, senderBundle, salt,
    `leetbrofinder:e2ee:v2:wrap:${context}:${contextId}:${senderBundle.fingerprint}:${identity.fingerprint}`)
  const rawContentKey = await crypto.subtle.decrypt({
    name: 'AES-GCM', iv: fromBase64Url(envelope.iv),
    additionalData: wrapAad(context, contextId, senderBundle.fingerprint, identity.fingerprint), tagLength: 128,
  }, wrappingKey, fromBase64Url(envelope.wrappedKey))
  const contentKey = await crypto.subtle.importKey('raw', rawContentKey, { name: 'AES-GCM' }, false, ['decrypt'])
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, additionalData: aad, tagLength: 128 }, contentKey, ciphertext,
  )
  return { ...message, displayContent: new TextDecoder().decode(plaintext), decryptionState: 'encrypted' }
}

async function decryptV1<T extends EncryptedMessageEnvelope & { senderId: string }>(context: MessageContext,
    contextId: string, myProfileId: string, partnerProfileId: string, message: T, identity: StoredIdentity): Promise<Decrypted<T>> {
  if (!message.ciphertext || !message.iv || !message.salt || !message.signature
      || !message.senderKeyFingerprint || !message.recipientKeyFingerprint) throw new Error('Incomplete encrypted message')
  const partnerBundles = await requireBundles(partnerProfileId, identity)
  const mine = message.senderId === myProfileId
  const partnerFingerprint = mine ? message.recipientKeyFingerprint : message.senderKeyFingerprint
  const partner = partnerBundles.find(bundle => bundle.fingerprint === partnerFingerprint)
  if (!partner) throw new Error('Legacy message device is unavailable')
  const expectedIdentity = mine ? message.senderKeyFingerprint : message.recipientKeyFingerprint
  if (identity.fingerprint !== expectedIdentity) throw new Error('Legacy message belongs to another device')
  const senderId = mine ? myProfileId : partnerProfileId
  const recipientId = mine ? partnerProfileId : myProfileId
  const aad = legacyAad(context, contextId, senderId, recipientId,
    message.senderKeyFingerprint, message.recipientKeyFingerprint)
  const salt = fromBase64Url(message.salt)
  const iv = fromBase64Url(message.iv)
  const ciphertext = fromBase64Url(message.ciphertext)
  const signingKey = mine ? identity.signingPublicKey : await importSigningKey(partner)
  const valid = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, signingKey,
    fromBase64Url(message.signature), concatenate(aad, salt, iv, ciphertext))
  if (!valid) throw new Error('Message signature is invalid')
  const key = await deriveKey(identity, partner, salt, `leetbrofinder:e2ee:v1:${context}:${contextId}`)
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, additionalData: aad, tagLength: 128 }, key, ciphertext,
  )
  return { ...message, displayContent: new TextDecoder().decode(plaintext), decryptionState: 'encrypted' }
}

export async function decryptMessage<T extends EncryptedMessageEnvelope & { senderId: string }>(
    context: MessageContext, contextId: string, myProfileId: string, partnerProfileId: string, message: T,
): Promise<Decrypted<T>> {
  if (!message.cryptoVersion) {
    return { ...message, displayContent: message.content ?? '[Legacy message unavailable]', decryptionState: 'legacy' }
  }
  const identity = await ensureE2eeIdentity(myProfileId)
  try {
    if (message.cryptoVersion === 2) return await decryptV2(context, contextId, myProfileId, partnerProfileId, message, identity)
    if (message.cryptoVersion === 1) return await decryptV1(context, contextId, myProfileId, partnerProfileId, message, identity)
    throw new Error('Unsupported message encryption version')
  } catch {
    return { ...message, displayContent: '[Unable to decrypt this message]', decryptionState: 'failed' }
  }
}

export async function getE2eeFingerprint(profileId: string): Promise<string | null> {
  const bundles = await loadBundles(profileId, true)
  return bundles.length ? sha256Hex(bundles.map(bundle => bundle.fingerprint).sort().join('\n')) : null
}

export function formatFingerprint(fingerprint: string): string {
  const groups = fingerprint.replace(/\s/g, '').toUpperCase().slice(0, 16).match(/.{1,4}/g)
  if (!groups?.length) return fingerprint
  return groups.length > 2 ? `${groups.slice(0, 2).join(' ')} · ${groups.slice(2).join(' ')}` : groups.join(' ')
}
