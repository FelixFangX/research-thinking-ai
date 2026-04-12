import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    storage: window.localStorage,
  },
})

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          username: string | null
          display_name: string | null
          plan: string
          created_at: string
        }
        Insert: {
          id: string
          username?: string
          display_name?: string
          plan?: string
        }
        Update: {
          username?: string
          display_name?: string
          plan?: string
        }
      }
      sessions: {
        Row: {
          id: string
          user_id: string
          share_token: string | null
          share_enabled: boolean
          input_data: Record<string, unknown>
          result_data: Record<string, unknown> | null
          locale: string
          complexity_score: number | null
          architecture_mode: string | null
          selected_path_id: string | null
          confidence: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          share_token?: string
          share_enabled?: boolean
          input_data: Record<string, unknown>
          result_data?: Record<string, unknown>
          locale?: string
          complexity_score?: number
          architecture_mode?: string
          selected_path_id?: string
          confidence?: number
        }
        Update: {
          share_token?: string
          share_enabled?: boolean
          result_data?: Record<string, unknown>
          complexity_score?: number
          architecture_mode?: string
          selected_path_id?: number
          confidence?: number
        }
      }
      evidence_items: {
        Row: {
          id: string
          session_id: string
          external_id: string | null
          title: string
          source: string
          url: string | null
          year: number | null
          tier: 'T1' | 'T2' | 'T3'
          claim: string
          relevance: number | null
          credibility: number | null
          conflicts_with: string[] | null
          raw_data: Record<string, unknown> | null
          created_at: string
        }
        Insert: {
          session_id: string
          external_id?: string
          title: string
          source: string
          url?: string
          year?: number
          tier: 'T1' | 'T2' | 'T3'
          claim: string
          relevance?: number
          credibility?: number
          conflicts_with?: string[]
          raw_data?: Record<string, unknown>
        }
      }
      candidates: {
        Row: {
          id: string
          session_id: string
          external_id: string
          name: string
          hypothesis: string | null
          method: string | null
          novelty: number | null
          feasibility: number | null
          impact: number | null
          risk: number | null
          evidence_coverage: number | null
          score: number | null
          confidence: number | null
          first_experiment: string | null
          stop_condition: string | null
          evidence_ids: string[] | null
          created_at: string
        }
        Insert: {
          session_id: string
          external_id: string
          name: string
          hypothesis?: string
          method?: string
          novelty?: number
          feasibility?: number
          impact?: number
          risk?: number
          evidence_coverage?: number
          score?: number
          confidence?: number
          first_experiment?: string
          stop_condition?: string
          evidence_ids?: string[]
        }
      }
      iterations: {
        Row: {
          id: string
          user_id: string
          session_id: string
          path_id: string
          path_name: string | null
          status: 'active' | 'completed' | 'abandoned'
          days: unknown[]
          journal: unknown[]
          reminder_sent_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          session_id: string
          path_id: string
          path_name?: string
          status?: 'active' | 'completed' | 'abandoned'
          days?: unknown[]
          journal?: unknown[]
        }
        Update: {
          status?: 'active' | 'completed' | 'abandoned'
          days?: unknown[]
          journal?: unknown[]
        }
      }
      usage: {
        Row: {
          id: string
          user_id: string
          action: string
          created_at: string
        }
        Insert: {
          user_id: string
          action: string
        }
      }
    }
  }
}
