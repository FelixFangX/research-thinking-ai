// Supabase Edge Function: llm-stream
// BFF layer for LLM calls — API Key never exposed to frontend
// Supports OpenAI and Anthropic SSE streaming

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const encoder = new TextEncoder()

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // LLM API Key is stored in Edge Function environment variables
    // (set via: supabase secrets set LLM_API_KEY=sk-...)
    const llmApiKey = Deno.env.get('LLM_API_KEY')
    if (!llmApiKey) {
      return new Response(JSON.stringify({ error: 'LLM_API_KEY not configured in Edge Function' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { provider = 'openai', model, baseUrl, messages } = await req.json()

    if (!model || !messages) {
      return new Response(JSON.stringify({ error: 'model and messages are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let upstreamUrl: string
    let upstreamHeaders: Record<string, string>
    let upstreamBody: Record<string, unknown>

    if (provider === 'anthropic') {
      const base = (baseUrl || 'https://api.anthropic.com').replace(/\/$/, '')
      upstreamUrl = `${base}/v1/messages`
      const systemMsg = messages.find((m: { role: string }) => m.role === 'system')
      const rest = messages.filter((m: { role: string }) => m.role !== 'system')
      upstreamHeaders = {
        'Content-Type': 'application/json',
        'x-api-key': llmApiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      }
      upstreamBody = {
        model,
        max_tokens: 4096,
        stream: true,
        ...(systemMsg ? { system: systemMsg.content } : {}),
        messages: rest.map((m: { role: string; content: string }) => ({ role: m.role, content: m.content })),
      }
    } else {
      const base = (baseUrl || 'https://api.openai.com').replace(/\/$/, '')
      upstreamUrl = `${base}/v1/chat/completions`
      upstreamHeaders = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${llmApiKey}`,
      }
      upstreamBody = {
        model,
        messages: messages.map((m: { role: string; content: string }) => ({ role: m.role, content: m.content })),
        temperature: 0.7,
        max_tokens: 8192,
        stream: true,
      }
    }

    // Proxy the streaming request
    const upstream = await fetch(upstreamUrl, {
      method: 'POST',
      headers: upstreamHeaders,
      body: JSON.stringify(upstreamBody),
      redirect: 'error',
    })

    if (!upstream.ok) {
      const errText = await upstream.text()
      return new Response(JSON.stringify({ error: `Upstream LLM error ${upstream.status}: ${errText.slice(0, 200)}` }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Stream SSE response back to client
    const body = upstream.body!
    const stream = new ReadableStream({
      async start(controller) {
        const reader = body.getReader()
        const decoder = new TextDecoder()

        try {
          for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            controller.enqueue(value)
          }
        } finally {
          reader.releaseLock()
        }
        controller.close()
      },
    })

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',  // Disable Nginx buffering for SSE
      },
    })

  } catch (error) {
    console.error('llm-stream error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
