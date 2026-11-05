import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/index.css'
import { applyTheme, watchSystemMode } from './styles/theme'
import App from './app/App.jsx'
import ErrorBoundary from './app/ErrorBoundary.jsx'
import { LanguageProvider } from './i18n/LanguageContext.jsx'

// The design system and light/dark mode are stamped on <html> before the
// first render, so there is no flash of the wrong theme.
applyTheme()
watchSystemMode()

// Outside LanguageProvider on purpose: if the provider is what threw, a
// boundary inside it goes down with it and the user is back to a white page.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </ErrorBoundary>
  </StrictMode>,
)

