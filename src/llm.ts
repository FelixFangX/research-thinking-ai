import type { ApiProvider } from './types'

function sanitizeInput(text: string): string {
  let out = ''
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    if ((c >= 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) && c !== 0x7f) {
      out += text[i]
    }
  }
  return out.trim()
}

export interface LLMConfig {
  provider: ApiProvider
  baseUrl: string
  apiKey: string
  model: string
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export function parseJSON<T>(text: string): T {
  if (text.length > 500_000) throw new Error('Response too large to parse')
  const cleaned = text.trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fenced) return JSON.parse(fenced[1].trim())
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1))
    throw new Error('Failed to parse LLM response as JSON')
  }
}

export interface StreamCallbacks {
  onToken: (token: string) => void
  onThinking?: (token: string) => void
}

export async function streamLLM(
  messages: ChatMessage[],
  config: LLMConfig,
  onToken: (token: string) => void,
  onThinking?: (token: string) => void,
): Promise<string> {
  if (!config.apiKey) throw new Error('API_KEY_MISSING')
  return config.provider === 'anthropic'
    ? streamAnthropic(messages, config, { onToken, onThinking })
    : streamOpenAI(messages, config, onToken)
}

export async function testConnection(config: LLMConfig): Promise<{ ok: boolean; message: string }> {
  if (!config.apiKey) return { ok: false, message: 'API_KEY_MISSING' }
  try {
    if (config.provider === 'anthropic') {
      const url = `${config.baseUrl.replace(/\/$/, '')}/v1/messages`
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: 8,
          messages: [{ role: 'user', content: 'ping' }],
        }),
      })
      if (res.ok) return { ok: true, message: `${res.status} OK` }
      const text = await res.text().catch(() => '')
      return { ok: false, message: `${res.status}: ${text.slice(0, 120)}` }
    } else {
      const url = `${config.baseUrl.replace(/\/$/, '')}/chat/completions`
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: 8,
          messages: [{ role: 'user', content: 'ping' }],
        }),
      })
      if (res.ok) return { ok: true, message: `${res.status} OK` }
      const text = await res.text().catch(() => '')
      return { ok: false, message: `${res.status}: ${text.slice(0, 120)}` }
    }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Unknown error' }
  }
}

async function streamOpenAI(
  messages: ChatMessage[],
  config: LLMConfig,
  onToken: (token: string) => void,
): Promise<string> {
  messages = messages.map((m) => ({ ...m, content: sanitizeInput(m.content) }))
  const url = `${config.baseUrl.replace(/\/$/, '')}/chat/completions`
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: 0.7,
        max_tokens: 8192,
        stream: true,
      }),
    })
  } catch {
    throw new Error('Network error — check API Base URL and CORS configuration')
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`API ${res.status}: ${text.slice(0, 200)}`)
  }

  if (!res.body) {
    const data = await res.json()
    const content = data.choices?.[0]?.message?.content ?? ''
    onToken(content)
    return content
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let fullText = ''
  let buffer = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data: ')) continue
      const payload = trimmed.slice(6)
      if (payload === '[DONE]') continue
      try {
        const parsed = JSON.parse(payload)
        const token = parsed.choices?.[0]?.delta?.content
        if (token) {
          fullText += token
          onToken(token)
        }
      } catch { /* skip malformed SSE chunk */ }
    }
  }
  return fullText
}

async function streamAnthropic(
  messages: ChatMessage[],
  config: LLMConfig,
  callbacks: StreamCallbacks,
): Promise<string> {
  const { onToken, onThinking } = callbacks
  messages = messages.map((m) => ({ ...m, content: sanitizeInput(m.content) }))
  const url = `${config.baseUrl.replace(/\/$/, '')}/v1/messages`
  const systemMsg = messages.find((m) => m.role === 'system')
  const rest = messages.filter((m) => m.role !== 'system')
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: 4096,
        stream: true,
        ...(systemMsg ? { system: systemMsg.content } : {}),
        messages: rest.map((m) => ({ role: m.role, content: m.content })),
      }),
    })
  } catch {
    throw new Error('Network error — check API Base URL and CORS configuration')
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`API ${res.status}: ${text.slice(0, 200)}`)
  }

  if (!res.body) {
    const data = await res.json()
    const block = data.content?.find(
      (b: { type: string }) => b.type === 'text',
    )
    const content = block?.text ?? ''
    onToken(content)
    return content
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let fullText = ''
  let buffer = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data: ')) continue
      const payload = trimmed.slice(6)
      try {
        const parsed = JSON.parse(payload)
        if (parsed.type === 'content_block_delta') {
          if (parsed.delta?.type === 'text_delta') {
            const token = parsed.delta.text
            if (token) {
              fullText += token
              onToken(token)
            }
          } else if (parsed.delta?.type === 'thinking_delta' && onThinking) {
            const thinking = parsed.delta.thinking
            if (thinking) onThinking(thinking)
          }
        }
      } catch { /* skip */ }
    }
  }
  return fullText
}
