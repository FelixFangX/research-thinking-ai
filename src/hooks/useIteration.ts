import { useCallback, useEffect, useRef, useState } from 'react'
import { getByIndex, putAll, STORES } from '../lib/db'
import type {
  AgentRunResult,
  IterationPlan,
  IterationStatus,
  JournalEntry,
  TopicInput,
} from '../types'

const LEGACY_KEY = 'copilot_iterations'
const MAX_PLANS = 20

async function migrateFromLocalStorage(userId: string): Promise<IterationPlan[]> {
  try {
    const raw = localStorage.getItem(LEGACY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.length === 0) return []
    const tagged = parsed.map((p: IterationPlan) => ({ ...p, userId: p.userId || userId }))
    await putAll(STORES.ITERATIONS, tagged)
    localStorage.removeItem(LEGACY_KEY)
    return tagged.filter((p: IterationPlan) => p.userId === userId)
  } catch {
    return []
  }
}

export function useIteration(userId: string) {
  const [plans, setPlans] = useState<IterationPlan[]>([])
  const loadedFor = useRef('')

  useEffect(() => {
    if (!userId || loadedFor.current === userId) return
    loadedFor.current = userId
    void (async () => {
      let items = await getByIndex<IterationPlan>(STORES.ITERATIONS, 'userId', userId)
      if (items.length === 0) {
        items = await migrateFromLocalStorage(userId)
      }
      items.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      setPlans(items)
    })()
  }, [userId])

  const persist = useCallback(async (next: IterationPlan[]) => {
    setPlans(next)
    await putAll(STORES.ITERATIONS, next)
  }, [])

  const reload = useCallback(async () => {
    if (!userId) return []
    const items = await getByIndex<IterationPlan>(STORES.ITERATIONS, 'userId', userId)
    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return items
  }, [userId])

  const activePlan = plans.find((p) => p.status === 'active') ?? null

  const create = useCallback(
    async (input: TopicInput, result: AgentRunResult, previousRunId?: string) => {
      const pathId = result.recommendation.selectedPathId
      const path = result.candidates.find((c) => c.id === pathId)
      const plan: IterationPlan = {
        id: crypto.randomUUID(),
        userId,
        createdAt: new Date().toISOString(),
        interest: input.researchInterest,
        pathId,
        pathName: path?.name ?? pathId,
        status: 'active',
        days: result.recommendation.nextSevenDays.map((label, i) => ({
          id: `d${i + 1}`,
          label,
          checked: false,
        })),
        journal: [],
        previousRunId,
      }
      const all = await reload()
      const updated = all.map((p) =>
        p.status === 'active' ? { ...p, status: 'completed' as const } : p,
      )
      await persist([plan, ...updated].slice(0, MAX_PLANS))
      return plan
    },
    [persist, reload, userId],
  )

  const toggleDay = useCallback(
    async (planId: string, dayId: string) => {
      const all = await reload()
      await persist(
        all.map((p) =>
          p.id === planId
            ? {
                ...p,
                days: p.days.map((d) =>
                  d.id === dayId
                    ? {
                        ...d,
                        checked: !d.checked,
                        completedAt: !d.checked ? new Date().toISOString() : undefined,
                      }
                    : d,
                ),
              }
            : p,
        ),
      )
    },
    [persist, reload],
  )

  const addJournal = useCallback(
    async (planId: string, note: string) => {
      const entry: JournalEntry = {
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
        note,
      }
      const all = await reload()
      await persist(
        all.map((p) =>
          p.id === planId ? { ...p, journal: [entry, ...p.journal] } : p,
        ),
      )
    },
    [persist, reload],
  )

  const setStatus = useCallback(
    async (planId: string, status: IterationStatus) => {
      const all = await reload()
      await persist(
        all.map((p) => (p.id === planId ? { ...p, status } : p)),
      )
    },
    [persist, reload],
  )

  const allPlans = plans

  return { activePlan, allPlans, create, toggleDay, addJournal, setStatus }
}
