import { useCallback, useEffect, useState } from 'react'
import type { AppSettings, ApiProvider } from '../types'

const SETTINGS_KEY = 'copilot_settings'

export const API_DEFAULTS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com',
  minimax: 'https://minimax.a7m.com.cn/v1',
}

export const MODEL_DEFAULTS: Record<string, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4-20250514',
  minimax: 'MiniMax-M2.7-highspeed',
}

export const DEFAULT_SETTINGS: AppSettings = {
  colorScheme: 'crt-green',
  scanlines: true,
  crtGlow: true,
  defaultMode: 'high',
  defaultComplexity: 3,
  defaultTimelineWeeks: 8,
  apiProvider: 'openai',
  apiBaseUrl: API_DEFAULTS.openai,
  apiKey: '',
  apiModel: MODEL_DEFAULTS.openai,
}

function validateSettings(raw: Record<string, unknown>): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    colorScheme: (['crt-green', 'cyberpunk', 'amber', 'classic'].includes(raw.colorScheme as string)
      ? raw.colorScheme : DEFAULT_SETTINGS.colorScheme) as AppSettings['colorScheme'],
    scanlines: typeof raw.scanlines === 'boolean' ? raw.scanlines : DEFAULT_SETTINGS.scanlines,
    crtGlow: typeof raw.crtGlow === 'boolean' ? raw.crtGlow : DEFAULT_SETTINGS.crtGlow,
    defaultMode: (raw.defaultMode === 'high' || raw.defaultMode === 'low')
      ? raw.defaultMode : DEFAULT_SETTINGS.defaultMode,
    defaultComplexity: typeof raw.defaultComplexity === 'number' && raw.defaultComplexity >= 1 && raw.defaultComplexity <= 5
      ? raw.defaultComplexity : DEFAULT_SETTINGS.defaultComplexity,
    defaultTimelineWeeks: typeof raw.defaultTimelineWeeks === 'number' && raw.defaultTimelineWeeks >= 1 && raw.defaultTimelineWeeks <= 52
      ? raw.defaultTimelineWeeks : DEFAULT_SETTINGS.defaultTimelineWeeks,
    apiProvider: (['openai', 'anthropic', 'minimax'].includes(raw.apiProvider as string))
      ? raw.apiProvider as ApiProvider
      : DEFAULT_SETTINGS.apiProvider,
    apiBaseUrl: typeof raw.apiBaseUrl === 'string' ? raw.apiBaseUrl : DEFAULT_SETTINGS.apiBaseUrl,
    apiKey: '',
    apiModel: typeof raw.apiModel === 'string' ? raw.apiModel : DEFAULT_SETTINGS.apiModel,
  }
}

function applyToDocument(s: AppSettings) {
  const el = document.documentElement
  el.setAttribute('data-scheme', s.colorScheme)
  el.setAttribute('data-scanlines', String(s.scanlines))
  el.setAttribute('data-crt-glow', String(s.crtGlow))
}

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return DEFAULT_SETTINGS
    return validateSettings(JSON.parse(raw) as Record<string, unknown>)
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function initSettings() {
  applyToDocument(loadSettings())
}

export function useSettings() {
  const [settings, setState] = useState<AppSettings>(() => {
    const s = loadSettings()
    applyToDocument(s)
    return s
  })

  useEffect(() => {
    applyToDocument(settings)
    const { apiKey: _k, ...rest } = settings
    void _k
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(rest))
  }, [settings])

  const updateSettings = useCallback((partial: Partial<AppSettings>) => {
    setState((prev) => ({ ...prev, ...partial }))
  }, [])

  const resetSettings = useCallback(() => {
    setState(DEFAULT_SETTINGS)
  }, [])

  return { settings, updateSettings, resetSettings } as const
}
