let client: typeof import('posthog-js').default | undefined
let initializing = false

export function initAnalytics(): void {
  const key = import.meta.env.VITE_POSTHOG_KEY ?? import.meta.env.VITE_PUBLIC_POSTHOG_KEY
  if (!key || initializing || client) return
  try {
    if (localStorage.getItem('analytics_opt_in') !== '1') return
  } catch { return }
  initializing = true
  void import('posthog-js').then(({ default: posthog }) => {
    posthog.init(key, {
      api_host: import.meta.env.VITE_POSTHOG_HOST ?? import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
      capture_pageview: true,
      capture_pageleave: true,
      autocapture: true,
      person_profiles: 'identified_only',
    })
    client = posthog
  }).catch(() => { initializing = false })
}

export function track(event: string, properties?: Record<string, number | string | boolean | null>): void {
  client?.capture(event, properties)
}
