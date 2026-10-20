import { afterEach, expect, it, vi } from 'vitest'
import { downloadTrace } from '../src/lib/downloadTrace'
import type { SessionRecord } from '../src/types'
import fixture from '../src/fixtures/trace-demo.json'

afterEach(() => vi.unstubAllGlobals())

it('handles old records that fail export validation without throwing', () => {
  expect(downloadTrace({ id: 'old-run' } as SessionRecord)).toBe(false)
})

it('handles browser download failures and releases the object URL', () => {
  const revokeObjectURL = vi.fn()
  vi.stubGlobal('URL', { createObjectURL: () => 'blob:trace', revokeObjectURL })
  vi.stubGlobal('document', { createElement: () => ({ click: () => { throw new Error('download failed') } }) })
  expect(downloadTrace(fixture as SessionRecord)).toBe(false)
  expect(revokeObjectURL).toHaveBeenCalledWith('blob:trace')
})

it('downloads a valid trace and reports success', () => {
  const click = vi.fn()
  const anchor = { href: '', download: '', click }
  vi.stubGlobal('URL', { createObjectURL: () => 'blob:trace', revokeObjectURL: vi.fn() })
  vi.stubGlobal('document', { createElement: () => anchor })
  expect(downloadTrace(fixture as SessionRecord)).toBe(true)
  expect(click).toHaveBeenCalledOnce()
  expect(anchor.download).toBe('research-trace-demo-research-workflows.ledring.json')
})
