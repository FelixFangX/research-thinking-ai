import type { PipelineStageProgress } from '../types'
import './Ring.css'

export function Ring({ large = false }: { large?: boolean }) {
  return <span className={`ring ${large ? 'ring-l' : 'ring-s'}`} aria-hidden="true" />
}

export function PipelineRing({ stages }: { stages: PipelineStageProgress[] }) {
  return <div className="pipeline-ring ring-l" data-testid="pipeline-ring" aria-hidden="true">
    {stages.map((stage, index) => <span key={stage.id} className={`ring-segment quadrant-${index}`} data-testid={`ring-seg-${stage.id}`} data-stage-state={stage.status === 'idle' ? 'pending' : stage.status} />)}
  </div>
}
