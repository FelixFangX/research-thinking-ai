import { useCallback, useRef, useState } from 'react'

export type ToastType = 'success' | 'info' | 'warning' | 'error'

export interface ToastItem {
  id: string
  type: ToastType
  message: string
  duration: number
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback(
    (type: ToastType, message: string, duration = 3500) => {
      const id = crypto.randomUUID()
      const item: ToastItem = { id, type, message, duration }
      setToasts((prev) => [...prev.slice(-4), item])

      const timer = setTimeout(() => {
        dismiss(id)
      }, duration)
      timers.current.set(id, timer)

      return id
    },
    [dismiss],
  )

  return { toasts, toast, dismiss } as const
}
