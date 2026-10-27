import { useLayoutEffect, type ReactNode } from 'react'
import { useLanguage } from './copy.ts'

export function LanguageProvider({ children }: { children: ReactNode }) {
  const language = useLanguage()
  useLayoutEffect(() => {
    document.documentElement.lang = language
  }, [language])
  return children
}
