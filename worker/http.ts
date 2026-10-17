export class HttpError extends Error {
  constructor(public status: number, public code: string) { super(code) }
}
export const securityHeaders = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin', 'cache-control': 'no-store' }
export function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...securityHeaders, 'content-type': 'application/json', ...headers } })
}
export async function readBody(request: Request, max: number): Promise<Record<string, unknown>> {
  if (request.method !== 'POST') throw new HttpError(405, 'method_not_allowed')
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new HttpError(415, 'unsupported_media_type')
  if (Number(request.headers.get('content-length')) > max) throw new HttpError(413, 'body_too_large')
  const reader = request.body?.getReader()
  let size = 0
  let text = ''
  const decoder = new TextDecoder()
  if (reader) for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > max) { await reader.cancel(); throw new HttpError(413, 'body_too_large') }
    text += decoder.decode(value, { stream: true })
  }
  text += decoder.decode()
  try {
    const body: unknown = JSON.parse(text)
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error()
    return body as Record<string, unknown>
  } catch { throw new HttpError(400, 'invalid_request') }
}
