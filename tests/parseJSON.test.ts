import { describe, expect, it } from 'vitest'
import { parseJSON } from '../src/llm'

describe('parseJSON: turning raw LLM output into data', () => {
  it('accepts plain JSON', () => {
    expect(parseJSON('{"a":1}')).toEqual({ a: 1 })
  })
  it('accepts JSON wrapped in a ```json fence', () => {
    expect(parseJSON('Here you go:\n```json\n{"a":[1,2]}\n```\nthanks')).toEqual({ a: [1, 2] })
  })
  it('extracts the outermost object from surrounding prose', () => {
    expect(parseJSON('Sure! {"stage":"landscape","items":[{"x":1}]} Hope this helps.')).toEqual({
      stage: 'landscape',
      items: [{ x: 1 }],
    })
  })
  it('rejects text with no JSON in it', () => {
    expect(() => parseJSON('no json here')).toThrow(/Failed to parse/)
  })
  it('refuses oversized responses before parsing', () => {
    expect(() => parseJSON('x'.repeat(500_001))).toThrow(/too large/)
  })
})
