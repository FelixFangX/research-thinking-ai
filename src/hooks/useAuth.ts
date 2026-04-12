import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { User } from '../types'
import type { Session, AuthChangeEvent } from '@supabase/supabase-js'

type AuthErrorCode = 'notFound' | 'wrongPw' | 'nameTooShort' | 'pwTooShort' | 'exists'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser({
          id: session.user.id,
          username: session.user.email?.split('@')[0] ?? session.user.id,
          displayName: session.user.user_metadata?.display_name
            ?? session.user.user_metadata?.username
            ?? session.user.email?.split('@')[0]
            ?? 'User',
          createdAt: session.user.created_at,
        })
      }
      setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser({
          id: session.user.id,
          username: session.user.email?.split('@')[0] ?? session.user.id,
          displayName: session.user.user_metadata?.display_name
            ?? session.user.user_metadata?.username
            ?? session.user.email?.split('@')[0]
            ?? 'User',
          createdAt: session.user.created_at,
        })
      } else {
        setUser(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const login = useCallback(async (email: string, password: string): Promise<'invalid' | 'notFound' | null> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return 'invalid'
    return null
  }, [])

  const register = useCallback(async (
    email: string,
    password: string,
    displayName: string,
  ): Promise<'exists' | 'weakPw' | 'error' | null> => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName },
      },
    })
    if (error) {
      if (error.message.includes('already')) return 'exists'
      return 'error'
    }
    return null
  }, [])

  const logout = useCallback(async () => {
    await supabase.auth.signOut()
    setUser(null)
  }, [])

  return {
    user,
    isAuthenticated: user !== null,
    isLoading: loading,
    login,
    register,
    logout,
    supabase,
  } as const
}
