import type { IconName } from '../../components/icons.ts'

// PhilJobNet records arrive in capitals ("CALL CENTER AGENT", "CITY OF SAN FERNANDO (CAPITAL), PAMPANGA"). These
// helpers only change how they read on screen; the raw values stay the keys and the filter values.

const SMALL = new Set([
  'of',
  'and',
  'the',
  'de',
  'del',
  'la',
  'ng',
  'sa',
  'in',
  'at',
  'for',
  'to',
  'or',
])
const ACRONYMS = new Set([
  'IT',
  'HR',
  'BPO',
  'ICT',
  'CNC',
  'NC',
  'QA',
  'QC',
  'HVAC',
  'CCTV',
  'POS',
  'CSR',
  'VA',
  'II',
  'III',
  'IV',
  'NCR',
  'BARMM',
])

/** "CITY OF SAN FERNANDO (CAPITAL)" → "City of San Fernando (Capital)"; acronyms and vowel-less words stay capitals. */
export function readable(text: string): string {
  return text.replace(/[A-Za-z][A-Za-z'’.-]*/g, (word, index: number) => {
    const upper = word.toUpperCase()
    if (ACRONYMS.has(upper) || !/[AEIOU]/.test(upper)) return upper
    const lower = word.toLowerCase()
    if (index > 0 && SMALL.has(lower)) return lower
    return lower.replace(
      /(^|[-'’])([a-z])/g,
      (_, lead: string, letter: string) => lead + letter.toUpperCase(),
    )
  })
}

/** "ANGELES CITY, PAMPANGA" → { place: "Angeles City", province: "Pampanga" }. */
export function placeParts(locality: string): { place: string; province: string | null } {
  const cut = locality.lastIndexOf(', ')
  if (cut < 0) return { place: readable(locality), province: null }
  return { place: readable(locality.slice(0, cut)), province: readable(locality.slice(cut + 2)) }
}

// The first rule whose words appear in the title picks the tile's icon; anything else is a briefcase.
const SECTORS: ReadonlyArray<readonly [RegExp, IconName]> = [
  [/CALL CENTER|CSR|CUSTOMER SERVICE|TELEMARKET|RECEPTION/, 'phone'],
  [/COOK|CHEF|KITCHEN|BAKER|FOOD|WAITER|SERVER|BARISTA|CREW|DISHWASH/, 'cloche'],
  [/DRIVER|DELIVERY|RIDER|LOGISTIC|WAREHOUSE|FORKLIFT|HELPER|PORTER/, 'truck'],
  [/MECHANIC|TECHNICIAN|MACHINIST|MAINTENANCE|REPAIR|AIRCON|HVAC/, 'wrench'],
  [/ELECTRIC|WELD|LINEMAN/, 'bolt'],
  [/CONSTRUCTION|MASON|CARPENTER|LABORER|FOREMAN|ENGINEER|PLUMBER|PAINTER|STEEL/, 'helmet'],
  [/NURSE|CAREGIVER|MIDWIFE|MEDICAL|PHARMAC|THERAP|HEALTH|DENTAL/, 'heart'],
  [/PROGRAMMER|DEVELOPER|SOFTWARE|\bIT\b|COMPUTER|DATA|WEB|ENCODER/, 'monitor'],
  [/SALES|MERCHANDIS|CASHIER|PROMO|STORE|RETAIL|BAGGER/, 'shirt'],
  [/JANITOR|HOUSEKEEP|CLEAN|UTILITY|LAUNDRY|ROOM ATTENDANT/, 'home'],
  [/FARM|AGRI|FISH|GARDEN|PLANT/, 'sprout'],
  [/TEACHER|TUTOR|TRAINER|INSTRUCTOR/, 'book'],
  [/SEAMAN|SEAFARER|DECK|MARINE|SHIP/, 'anchor'],
  [/ACCOUNT|BOOKKEEP|CLERK|ADMIN|SECRETARY|OFFICE|ASSISTANT/, 'clipboard'],
]

export function jobIcon(title: string): IconName {
  const upper = title.toUpperCase()
  return SECTORS.find(([words]) => words.test(upper))?.[1] ?? 'briefcase'
}

export type Tier = 'high' | 'mid' | 'low'

/** How a job's posting records compare with the busiest job on screen: two thirds of it or more is high. */
export function tier(count: number, top: number): Tier {
  const share = top > 0 ? count / top : 0
  return share >= 2 / 3 ? 'high' : share >= 1 / 3 ? 'mid' : 'low'
}

const dayMonth = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric' })

/** "Oct 20", from the API's "2026-10-20", read as a calendar day (no time zone shift). */
export function shortDay(value: string | null | undefined): string | null {
  if (!value) return null
  const [year, month, day] = value.split('-').map(Number)
  return dayMonth.format(new Date(year!, month! - 1, day))
}
