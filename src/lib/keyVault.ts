const SESSION_KEY = 'copilot_api_key'
const PERSIST_KEY = 'copilot_api_key_enc'
const PERSIST_FLAG = 'copilot_api_key_persist'

async function deriveKey(userId: string): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const material = await crypto.subtle.importKey(
    'raw',
    enc.encode(userId),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode('copilot_v1'), iterations: 100000, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

async function encrypt(text: string, userId: string): Promise<string> {
  const key = await deriveKey(userId)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(text)
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded)
  const payload = new Uint8Array(iv.length + cipher.byteLength)
  payload.set(iv)
  payload.set(new Uint8Array(cipher), iv.length)
  return btoa(String.fromCharCode(...payload))
}

async function decrypt(b64: string, userId: string): Promise<string> {
  const key = await deriveKey(userId)
  const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  const iv = raw.slice(0, 12)
  const data = raw.slice(12)
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data)
  return new TextDecoder().decode(plain)
}

export function isPersistEnabled(): boolean {
  try {
    return localStorage.getItem(PERSIST_FLAG) === '1'
  } catch {
    return false
  }
}

export function setPersistEnabled(enabled: boolean): void {
  try {
    if (enabled) {
      localStorage.setItem(PERSIST_FLAG, '1')
    } else {
      localStorage.removeItem(PERSIST_FLAG)
      localStorage.removeItem(PERSIST_KEY)
    }
  } catch { /* noop */ }
}

export async function saveApiKey(key: string, userId: string): Promise<void> {
  sessionStorage.setItem(SESSION_KEY, key)
  if (isPersistEnabled() && key) {
    const enc = await encrypt(key, userId)
    localStorage.setItem(PERSIST_KEY, enc)
  } else {
    localStorage.removeItem(PERSIST_KEY)
  }
}

export async function loadApiKey(userId: string): Promise<string> {
  const session = sessionStorage.getItem(SESSION_KEY)
  if (session) return session

  if (isPersistEnabled()) {
    const enc = localStorage.getItem(PERSIST_KEY)
    if (enc) {
      try {
        const decrypted = await decrypt(enc, userId)
        sessionStorage.setItem(SESSION_KEY, decrypted)
        return decrypted
      } catch {
        localStorage.removeItem(PERSIST_KEY)
      }
    }
  }
  return ''
}

export function clearApiKey(): void {
  sessionStorage.removeItem(SESSION_KEY)
  localStorage.removeItem(PERSIST_KEY)
}
