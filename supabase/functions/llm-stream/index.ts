// Supabase Edge Function: llm-stream
// BFF layer for LLM calls — API Key never exposed to frontend
// Supports OpenAI-compatible SSE streaming (including MiniMax, OpenAI, Anthropic)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
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
      // OpenAI-compatible (MiniMax, OpenAI, etc.)
      const base = (baseUrl || Deno.env.get('LLM_DEFAULT_BASE_URL') || 'https://api.openai.com').replace(/\/$/, '')
      upstreamUrl = `${base}/chat/completions`
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

    // Proxy the streaming request to upstream LLM
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
        'X-Accel-Buffering': 'no',
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
