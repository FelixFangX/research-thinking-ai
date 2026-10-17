export type InstrumentState = 'idle' | 'armed' | 'processing' | 'done' | 'error'

export function updateTabLed(state: InstrumentState, title: string, prefix: string) {
  const color = getComputedStyle(document.documentElement).getPropertyValue(
    state === 'error' ? '--red' : state === 'processing' || state === 'armed' ? '--amber' : state === 'idle' ? '--faint' : '--acc',
  ).trim()
  const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (icon) icon.href = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="12" fill="none" stroke="${color}" stroke-width="4" stroke-dasharray="1.57 1.57"/></svg>`)}`
  document.title = state === 'idle' ? title : `${prefix}${title}`
}
