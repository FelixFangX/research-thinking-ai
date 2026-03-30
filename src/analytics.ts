import posthog from 'posthog-js'

let initialized = false

export function initAnalytics(): void {
  if (initialized) {
    return
  }

  const key = import.meta.env.VITE_POSTHOG_KEY ?? import.meta.env.VITE_PUBLIC_POSTHOG_KEY
  const host =
    import.meta.env.VITE_POSTHOG_HOST ??
    import.meta.env.VITE_PUBLIC_POSTHOG_HOST ??
    'https://app.posthog.com'

  if (!key) {
    return
  }

  posthog.init(key, {
    api_host: host,
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: true,
    person_profiles: 'identified_only',
  })
  initialized = true
}

export function track(
  event: string,
  properties?: Record<string, number | string | boolean | null>,
): void {
  if (!initialized) {
    return
  }
  posthog.capture(event, properties)
}

