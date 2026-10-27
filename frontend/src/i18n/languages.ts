export const LANGUAGE_KEY = 'tesda-track.language'

// Use each language's own name so the selector remains recognizable after switching.
export const languages = [
  { code: 'en', name: 'English' },
  { code: 'tl', name: 'Tagalog / Filipino' },
  { code: 'pam', name: 'Kapampangan' },
  { code: 'ceb', name: 'Cebuano / Binisaya' },
  { code: 'ilo', name: 'Ilokano' },
  { code: 'hil', name: 'Hiligaynon / Ilonggo' },
  { code: 'bcl', name: 'Bikol' },
  { code: 'war', name: 'Waray' },
  { code: 'pag', name: 'Pangasinan' },
] as const

export type Language = (typeof languages)[number]['code']

export function isLanguage(value: unknown): value is Language {
  return languages.some(({ code }) => code === value)
}
