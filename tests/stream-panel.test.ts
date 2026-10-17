import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { StreamPanel } from '../src/components/StreamPanel'
import { createDefaultInput } from '../src/engine'
import { runResearch } from '../src/headless'
import type { PipelineStageProgress } from '../src/types'

vi.mock('../src/i18n', async (importOriginal) => ({
  ...await importOriginal<typeof import('../src/i18n')>(),
  useI18n: () => ({ t: (key: string) => key }),
}))

describe('completed thinking panels', () => {
  it('shows the final recommendation and comparison without expanding, even with empty streams', async () => {
    const result = await runResearch(createDefaultInput('en'))
    for (const id of ['converge', 'compare'] as const) {
      const pipeline: PipelineStageProgress[] = [{ id, name: id, status: 'done', detail: '', progress: 100 }]
      const html = renderToStaticMarkup(createElement(StreamPanel, { pipeline, streamTexts: {}, result }))
      expect(html).toContain(id === 'converge' ? 'sp-rec-card' : 'sp-candidate-card')
      expect(html).not.toContain('stream-collapsed')
      expect(html).toContain('sp.expand')
    }
  })

  it('renders a completed JSON stream without the legacy data delimiter', () => {
    const pipeline: PipelineStageProgress[] = [{ id: 'converge', name: 'Convergence', status: 'done', detail: '', progress: 100 }]
    const html = renderToStaticMarkup(createElement(StreamPanel, {
      pipeline,
      streamTexts: { converge: JSON.stringify({ recommendation: { selectedPathId: 'P2', why: ['Final reason'] } }) },
    }))
    expect(html).toContain('Final reason')
    expect(html).toContain('sp-rec-card')
    expect(html).not.toContain('stream-collapsed')
  })
})
