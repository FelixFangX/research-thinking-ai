import type { SessionRecord } from '../types'
import { toLedringTrace, traceFilename } from '../ledringTrace'

export function downloadTrace(record: SessionRecord): boolean {
  try {
    const trace = toLedringTrace(record)
    const url = URL.createObjectURL(new Blob([JSON.stringify(trace, null, 2)], { type: 'application/json' }))
    try {
      const a = document.createElement('a')
      a.href = url
      a.download = traceFilename(trace.id)
      a.click()
    } finally {
      URL.revokeObjectURL(url)
    }
    return true
  } catch {
    return false
  }
}
