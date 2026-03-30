import { useCallback, useEffect, useRef, useState } from 'react'
import { getByIndex, put, putAll, STORES } from '../lib/db'
import type { SessionRecord } from '../types'

const LEGACY_KEY = 'topic_agent_session_history_v2'
const MAX_RECORDS = 8

async function migrateFromLocalStorage(userId: string): Promise<SessionRecord[]> {
  try {
    const raw = localStorage.getItem(LEGACY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as SessionRecord[]
    if (!Array.isArray(parsed) || parsed.length === 0) return []
    const tagged = parsed.map((r) => ({ ...r, userId: r.userId || userId }))
    await putAll(STORES.SESSIONS, tagged)
    localStorage.removeItem(LEGACY_KEY)
    return tagged.filter((r) => r.userId === userId)
  } catch {
    return []
  }
}

export function useHistory(userId: string) {
  const [records, setRecords] = useState<SessionRecord[]>([])
  const loadedFor = useRef('')

  useEffect(() => {
    if (!userId || loadedFor.current === userId) return
    loadedFor.current = userId
    void (async () => {
      let items = await getByIndex<SessionRecord>(STORES.SESSIONS, 'userId', userId)
      if (items.length === 0) {
        items = await migrateFromLocalStorage(userId)
      }
      items.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      setRecords(items.slice(0, MAX_RECORDS))
    })()
  }, [userId])

  const addRecord = useCallback(async (record: SessionRecord) => {
    await put(STORES.SESSIONS, record)
    setRecords((prev) => [record, ...prev].slice(0, MAX_RECORDS))
  }, [])

  return { records, addRecord } as const
}
