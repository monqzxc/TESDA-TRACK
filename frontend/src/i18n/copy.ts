import { useSyncExternalStore } from 'react'
import { en } from '../copy/en.ts'
import { readItem, writeItem } from '../lib/storage.ts'
import { isLanguage, LANGUAGE_KEY, type Language } from './languages.ts'
import { bcl } from './locales/bcl.ts'
import { ceb } from './locales/ceb.ts'
import { hil } from './locales/hil.ts'
import { ilo } from './locales/ilo.ts'
import { pag } from './locales/pag.ts'
import { pam } from './locales/pam.ts'
import { tl } from './locales/tl.ts'
import { war } from './locales/war.ts'
import { createTranslator, type Dictionary } from './translate.ts'

const dictionaries: Record<Exclude<Language, 'en'>, Dictionary> = {
  tl,
  pam,
  ceb,
  ilo,
  hil,
  bcl,
  war,
  pag,
}
const catalogs = new Map<Language, typeof en>([['en', en]])
const listeners = new Set<() => void>()
let current: Language | undefined

export function getLanguage(): Language {
  if (!current) {
    const saved = readItem(LANGUAGE_KEY)
    current = isLanguage(saved) ? saved : 'en'
  }
  return current
}

export function setLanguage(language: Language): void {
  if (!isLanguage(language)) return
  current = language
  writeItem(LANGUAGE_KEY, language)
  listeners.forEach((listener) => listener())
}

function onStorage(event: StorageEvent) {
  if (event.key !== LANGUAGE_KEY && event.key !== null) return
  current = isLanguage(event.newValue) ? event.newValue : 'en'
  listeners.forEach((notify) => notify())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  // A single shared listener, removed once the last subscriber leaves.
  if (listeners.size === 1) window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) window.removeEventListener('storage', onStorage)
  }
}

export function useLanguage(): Language {
  return useSyncExternalStore(subscribe, getLanguage, () => 'en')
}

/** Read the current catalog in event handlers and non-React helpers. */
export function getCopy(language: Language = getLanguage()): typeof en {
  const cached = catalogs.get(language)
  if (cached) return cached
  const copy = createTranslator(dictionaries[language as Exclude<Language, 'en'>])(en)
  catalogs.set(language, copy)
  return copy
}

/** Every component subscribes to language changes without remounting forms or losing state. */
export function useCopy(): typeof en {
  return getCopy(useLanguage())
}
