import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { initAnalytics } from './analytics'
import { ErrorBoundary } from './components/ErrorBoundary'
import { I18nProvider } from './i18n'
import { initSettings } from './hooks/useSettings'
import '@fontsource/fira-code/latin-400.css'
import '@fontsource/fira-code/latin-500.css'
import './index.css'
import App from './App.tsx'

const queryClient = new QueryClient({
  defaultOptions: { mutations: { retry: 1 } },
})

initAnalytics()
initSettings()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <I18nProvider>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </I18nProvider>
    </ErrorBoundary>
  </StrictMode>,
)
