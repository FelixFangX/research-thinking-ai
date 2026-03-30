import { useCallback, useState } from 'react'
import type { User } from '../types'

const USERS_KEY = 'copilot_users'
const SESSION_KEY = 'copilot_session'

interface StoredUser {
  id: string
  username: string
  displayName: string
  passwordHash: string
  createdAt: string
}

async function hashPw(pw: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(pw + 'copilot_salt_v1')
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function loadUsers(): Record<string, StoredUser> {
  try {
    const raw = localStorage.getItem(USERS_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function loadSession(): User | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(() => loadSession())

  const login = useCallback(async (username: string, password: string): Promise<'notFound' | 'wrongPw' | null> => {
    const users = loadUsers()
    const stored = users[username.toLowerCase()]
    if (!stored) return 'notFound'
    const hash = await hashPw(password)
    if (stored.passwordHash !== hash) return 'wrongPw'
    const u: User = {
      id: stored.id,
      username: stored.username,
      displayName: stored.displayName,
      createdAt: stored.createdAt,
    }
    localStorage.setItem(SESSION_KEY, JSON.stringify(u))
    setUser(u)
    return null
  }, [])

  const register = useCallback(
    async (
      username: string,
      password: string,
      displayName: string,
    ): Promise<'nameTooShort' | 'pwTooShort' | 'exists' | null> => {
      if (username.length < 2) return 'nameTooShort'
      if (password.length < 4) return 'pwTooShort'
      const users = loadUsers()
      const key = username.toLowerCase()
      if (users[key]) return 'exists'
      const newUser: StoredUser = {
        id: crypto.randomUUID(),
        username: key,
        displayName: displayName || username,
        passwordHash: await hashPw(password),
        createdAt: new Date().toISOString(),
      }
      users[key] = newUser
      localStorage.setItem(USERS_KEY, JSON.stringify(users))
      const u: User = {
        id: newUser.id,
        username: newUser.username,
        displayName: newUser.displayName,
        createdAt: newUser.createdAt,
      }
      localStorage.setItem(SESSION_KEY, JSON.stringify(u))
      setUser(u)
      return null
    },
    [],
  )

  const logout = useCallback(() => {
    localStorage.removeItem(SESSION_KEY)
    setUser(null)
  }, [])

  return { user, isAuthenticated: user !== null, login, register, logout } as const
}
