import { describe, expect, it } from 'vitest'
import { en } from '../copy/en.ts'
import { bcl } from './locales/bcl.ts'
import { ceb } from './locales/ceb.ts'
import { hil } from './locales/hil.ts'
import { ilo } from './locales/ilo.ts'
import { pag } from './locales/pag.ts'
import { pam } from './locales/pam.ts'
import { tl } from './locales/tl.ts'
import { war } from './locales/war.ts'

// QA-2026-11-19-EXP1: the Career Map stayed in English in every other language, because its sentences were never
// added to the dictionaries. Every learner-facing Career Map and suggestion-feedback sentence needs an entry, or this
// test names the ones that are missing. Functions are read as their templates ("Near {0}").

/** Not words: numbers with units, separators, and names that stay as they are in every language. */
const NOT_TRANSLATED = new Set([
  '{0}, {1}',
  '{0} km',
  'NaN km',
  '{0}–{1} of {2}',
  'OpenStreetMap',
  'Google Maps',
  '3D',
])

function sentences(value: unknown, out: Set<string>) {
  if (typeof value === 'string') {
    if (
      value.trim() &&
      !NOT_TRANSLATED.has(value) &&
      !value.startsWith('Boundaries:') &&
      !value.startsWith('Source:')
    )
      out.add(value)
  } else if (typeof value === 'function') {
    const args = Array.from({ length: Math.max(value.length, 1) }, (_, i) => `{${i}}`)
    sentences(Reflect.apply(value, undefined, args), out)
  } else if (Array.isArray(value)) {
    value.forEach((item) => sentences(item, out))
  } else if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => sentences(item, out))
  }
}

const careerMap = new Set<string>()
sentences(en.explore, careerMap)
sentences(en.suggestionFeedback, careerMap)
sentences(en.training.map, careerMap)

describe('Career Map translations', () => {
  it.each(Object.entries({ tl, pam, ceb, ilo, hil, bcl, war, pag }))(
    '%s has every Career Map sentence',
    (_language, dictionary) => {
      expect([...careerMap].filter((text) => !Object.hasOwn(dictionary, text))).toEqual([])
    },
  )
})
