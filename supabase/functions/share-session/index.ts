// Supabase Edge Function: share-session
// Generates a shareable public link for a session
// No auth required for reading (via share_token)
// Auth required for creating/updating share settings

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function generateShareToken(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const array = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(array, b => chars[b % chars.length]).join('')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Use service role key for admin operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { session_id, action = 'create' } = await req.json()

    if (!session_id) {
      return new Response(JSON.stringify({ error: 'session_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Verify the session belongs to the authenticated user
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '')
      const { data: { user }, error: authError } = await supabase.auth.getUser(token)

      if (authError || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data: session, error: sessionError } = await supabase
        .from('sessions')
        .select('id, user_id')
        .eq('id', session_id)
        .single()

      if (sessionError || !session) {
        return new Response(JSON.stringify({ error: 'Session not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (session.user_id !== user.id) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (action === 'create') {
        // Generate share token
        const shareToken = generateShareToken()
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days

        // Update session
        await supabase
          .from('sessions')
          .update({ share_token: shareToken, share_enabled: true })
          .eq('id', session_id)

        // Store in share_tokens table
        await supabase
          .from('share_tokens')
          .upsert({ token: shareToken, session_id, expires_at: expiresAt })

        return new Response(JSON.stringify({
          share_token: shareToken,
          share_url: `https://research-thinking-ai.vercel.app/share/${shareToken}`,
          expires_at: expiresAt,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })

      } else if (action === 'revoke') {
        // Get current token
        const { data: session } = await supabase
          .from('sessions')
          .select('share_token')
          .eq('id', session_id)
          .single()

        if (session?.share_token) {
          await supabase
            .from('share_tokens')
            .delete()
            .eq('token', session.share_token)
        }

        await supabase
          .from('sessions')
          .update({ share_token: null, share_enabled: false })
          .eq('id', session_id)

        return new Response(JSON.stringify({ revoked: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // Public: read shared session by token (no auth needed)
    if (action === 'get') {
      const { data: session, error } = await supabase
        .from('sessions')
        .select('*')
        .eq('share_token', session_id)
        .eq('share_enabled', true)
        .single()

      if (error || !session) {
        return new Response(JSON.stringify({ error: 'Shared session not found or expired' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Check expiry
      const { data: token } = await supabase
        .from('share_tokens')
        .select('expires_at')
        .eq('token', session_id)
        .single()

      if (token && new Date(token.expires_at) < new Date()) {
        return new Response(JSON.stringify({ error: 'Share link has expired' }), {
          status: 410,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      return new Response(JSON.stringify({ session }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('share-session error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
