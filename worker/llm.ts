import { HttpError } from './http'
export const models = [
  { id: '@cf/zai-org/glm-4.7-flash', label: 'GLM-4.7 Flash', default: true },
  { id: '@cf/google/gemma-4-26b-a4b-it', label: 'Gemma 4 26B', default: false },
]
export const prices = [[5500, 36400], [9091, 27273]] as const
export function estimateCost(model: string, inputChars: number, outputTokens: number) {
  const [input, output] = prices[models.findIndex(m => m.id === model)] ?? prices[0]
  return (Math.ceil(inputChars / 3) * input + outputTokens * output) / 1_000_000
}
export function validateLLM(body: Record<string, unknown>) {
  const model = body.model ?? models[0].id
  if (typeof model !== 'string' || !models.some(m => m.id === model)) throw new HttpError(400, 'invalid_model')
  if (!Array.isArray(body.messages) || !body.messages.length || body.messages.length > 12) throw new HttpError(400, 'invalid_messages')
  const messages = body.messages.map((m: unknown) => {
    if (!m || typeof m !== 'object' || !('role' in m) || !('content' in m) || typeof m.role !== 'string' || !['system', 'user', 'assistant'].includes(String(m.role)) || typeof m.content !== 'string' || m.content.length > 24000) throw new HttpError(400, 'invalid_messages')
    return { role: m.role as 'system' | 'user' | 'assistant', content: m.content }
  })
  const clamp = (v: unknown, fallback: number, min: number, max: number) => {
    if (v === undefined) return fallback
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new HttpError(400, 'invalid_request')
    return Math.max(min, Math.min(max, v))
  }
  return { model, messages, max_tokens: Math.floor(clamp(body.max_tokens, 3072, 64, 3072)), temperature: clamp(body.temperature, 0.6, 0, 1.2) }
}
/** Incremental SSE parser: only public content and final accounting leave the Worker. */
export function normalizeSSE(model: string, inputChars: number, settle: (actual: number) => Promise<void>) {
  const decoder = new TextDecoder(), encoder = new TextEncoder()
  let buffer = '', sum = 0, total = 0, hasUsage = false, outputChars = 0, ended = false
  const line = (s: string, controller: TransformStreamDefaultController<Uint8Array>) => {
    if (ended || !s.trim().startsWith('data:')) return
    const data = s.trim().slice(5).trim()
    if (data === '[DONE]') { ended = true; return }
    let chunk
    try { chunk = JSON.parse(data) } catch { return }
    const neurons = chunk.usage?.neurons
    if (typeof neurons === 'number' && Number.isFinite(neurons) && neurons >= 0) {
      hasUsage = true
      if ('response' in chunk) total = Math.max(total, neurons)
      else sum += neurons
    }
    const content = chunk.choices?.[0]?.delta?.content
    if (typeof content === 'string' && content) {
      outputChars += content.length
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`))
    }
  }
  return new TransformStream<Uint8Array, Uint8Array>({
    transform(value, controller) {
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n'); buffer = lines.pop() ?? ''
      for (const s of lines) line(s, controller)
    },
    async flush(controller) {
      buffer += decoder.decode(); if (buffer) line(buffer, controller)
      const actual = hasUsage ? Math.max(sum, total) : estimateCost(model, inputChars, Math.ceil(outputChars / 3))
      await settle(actual)
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ usage: { neurons: actual } })}\n\ndata: [DONE]\n\n`))
    },
  })
}
