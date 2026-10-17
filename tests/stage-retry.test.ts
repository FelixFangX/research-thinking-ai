import { describe, expect, it, vi } from 'vitest'
import { createDefaultInput, runTopicAgentWithProgress } from '../src/engine'
import { QuotaError, type LLMConfig, type streamLLM } from '../src/llm'

const config: LLMConfig = { provider: 'free', baseUrl: '', apiKey: '', model: 'test' }
const stop = new Error('API 503')
function run(stream: typeof streamLLM, onStream = vi.fn(), provider = config) {
  return runTopicAgentWithProgress(createDefaultInput('en'), () => {}, onStream, 'en', provider,
    undefined, undefined, { pace: false, streamLLM: stream })
}

describe('stage JSON retry', () => {
  it.each(['not JSON', '{"evidence":[{}]}'])('retries parse/schema failure once: %s', async invalid => {
    const panel = vi.fn()
    const stream = vi.fn<typeof streamLLM>()
      .mockImplementationOnce(async (_messages, _config, token) => { token(invalid); return invalid })
      .mockImplementationOnce(async (_messages, _config, token) => { token('{"evidence":[{"id":"E1","title":"Paper"}]}'); return '{"evidence":[{"id":"E1","title":"Paper"}]}' })
      .mockRejectedValue(stop)
    await expect(run(stream, panel)).rejects.toBe(stop)
    expect(stream).toHaveBeenCalledTimes(3) // retrieve twice, then map
    expect(stream.mock.calls[1][0]).toEqual([...stream.mock.calls[0][0], {
      role: 'user', content: 'Your previous reply was not valid JSON. Reply again with ONLY the JSON object, no prose.',
    }])
    expect(panel.mock.calls.slice(0, 3)).toEqual([
      ['retrieve', invalid], ['retrieve', ''], ['retrieve', '{"evidence":[{"id":"E1","title":"Paper"}]}'],
    ])
  })
  it('stops after the second invalid reply', async () => {
    const stream = vi.fn<typeof streamLLM>().mockResolvedValue('{}')
    await expect(run(stream)).rejects.toThrow(/retrieve/)
    expect(stream).toHaveBeenCalledTimes(2)
  })
  it.each([new QuotaError('quota_exhausted'), stop])('does not retry transport error %s', async error => {
    const stream = vi.fn<typeof streamLLM>().mockRejectedValue(error)
    await expect(run(stream)).rejects.toBe(error)
    expect(stream).toHaveBeenCalledTimes(1)
  })
  it('does not retry BYO output', async () => {
    const stream = vi.fn<typeof streamLLM>().mockResolvedValue('{}')
    await expect(run(stream, vi.fn(), { ...config, provider: 'openai', apiKey: 'fake' })).rejects.toThrow()
    expect(stream).toHaveBeenCalledTimes(1)
  })
})
