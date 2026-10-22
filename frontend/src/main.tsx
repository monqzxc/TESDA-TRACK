import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { createQueryClient } from './api/queryClient.ts'
import { AuthProvider } from './auth/AuthProvider.tsx'
import { LanguageProvider } from './i18n/LanguageProvider.tsx'
import './styles/app.css'
import { ThemeProvider } from './theme/ThemeProvider.tsx'

const queryClient = createQueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <App />
          </AuthProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </LanguageProvider>
  </StrictMode>,
)
