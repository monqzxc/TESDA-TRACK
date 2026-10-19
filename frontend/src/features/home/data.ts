// What Home shows from TESDA's data: qualification, sector and job names, units of competency, regions and the
// catalog's figures. They're written into the page, as in classic/landing.html and landing.js, so Home makes no
// API calls and shows while the service is down. The page's own words are in en.home (copy/en.ts).

import type { IconName } from '../../components/Icon.tsx'
import type { en } from '../../copy/en.ts'

/** One V for each entry of a list in en.ts, so the two lists can't get out of step. */
export type OnePerEntry<T extends readonly unknown[], V> = { readonly [K in keyof T]: V }

interface ConsoleMatch {
  name: string
  detail: string
  jobs: readonly string[]
  score: number
  icon: IconName
  colors: readonly [from: string, to: string]
}

/** The hero console's top matches, one for each goal in en.home.console.examples, in the order it types them. */
export const CONSOLE_MATCHES = [
  {
    name: 'Manual Metal Arc Welding (MMAW) NC II',
    detail: 'Metals and Engineering · 17 units of competency',
    jobs: ['Welder', 'Fabricator', 'Structural Welder'],
    score: 92,
    icon: 'wrench',
    colors: ['#5b7aa3', '#33507a'],
  },
  {
    name: 'Computer Systems Servicing NC II',
    detail: 'Information and Communication Technology · 15 units',
    jobs: ['Computer Technician', 'IT Support Technician'],
    score: 89,
    icon: 'monitor',
    colors: ['#2f6fe0', '#1a4aa8'],
  },
  {
    name: 'Caregiving (Elderly) NC II',
    detail: 'Human Health/Health Care · 18 units of competency',
    jobs: ['Caregiver for Elderly'],
    score: 86,
    icon: 'heart',
    colors: ['#e0607a', '#ac3651'],
  },
  {
    name: 'Cookery NC II',
    detail: 'Tourism · 22 units of competency',
    jobs: ['Chef', 'Cook', 'Kitchen Assistant'],
    score: 94,
    icon: 'cloche',
    colors: ['#7b61d6', '#5038a3'],
  },
] as const satisfies OnePerEntry<typeof en.home.console.examples, ConsoleMatch>

/** Stop 2's example: the matches for "I want to work in a hotel". */
export const HOTEL_MATCHES = [
  {
    name: 'Housekeeping NC II',
    score: 88,
    detail: 'Tourism · Cleaner, Assistant Public Area Cleaner',
  },
  {
    name: 'Food and Beverage Services NC II',
    score: 81,
    detail: 'Tourism · Waiter, Food and Beverage Attendant',
  },
  { name: 'Front Office Services NC II', score: 77, detail: 'Tourism · Front Office Agent' },
] as const

/** Stop 3's readiness check: Barista NC II's core units, and the answers it starts with. */
export const BARISTA_UNITS = [
  { name: 'Prepare espresso', answer: 'yes' },
  { name: 'Texture milk', answer: 'yes' },
  { name: 'Prepare and serve coffee beverages', answer: 'some' },
  { name: 'Perform basic maintenance of machine and equipment', answer: 'some' },
  { name: 'Perform basic cashiering and general control procedures', answer: 'new' },
] as const

/** The catalog's figures. */
export const CATALOG = {
  qualifications: 319,
  // Each followed by its line in en.home.catalog.facts.
  facts: [27, 738, 4981] satisfies OnePerEntry<typeof en.home.catalog.facts, number>,
  // Qualifications at each NC level. The bars are drawn against the largest.
  levels: [
    { name: 'NC I', count: 26, color: '#5281b8' },
    { name: 'NC II', count: 179, color: 'var(--home-blue)' },
    { name: 'NC III', count: 90, color: 'var(--home-teal)' },
    { name: 'NC IV', count: 20, color: 'var(--home-violet)' },
  ],
} as const

/** The two rows of qualification names that drift across the catalog, each with its sector. */
export const DRIFTING_QUALIFICATIONS = [
  [
    ['Cookery NC II', 'Tourism'],
    ['Electrical Installation and Maintenance NC II', 'Construction'],
    ['Barista NC II', 'Tourism'],
    ['Computer Systems Servicing NC II', 'ICT'],
    ['Carpentry NC II', 'Construction'],
    ['Driving NC II', 'Automotive'],
    ['2D Animation NC III', 'ICT'],
    ['Housekeeping NC II', 'Tourism'],
    ['Able Seafarer Deck NC II (II-5)', 'Maritime'],
  ],
  [
    ['Manual Metal Arc Welding (MMAW) NC II', 'Metals and Engineering'],
    ['Caregiving (Elderly) NC II', 'Health Care'],
    ['Front Office Services NC II', 'Tourism'],
    ['5-Axis CNC Machine Operation NC III', 'Metals and Engineering'],
    ['Food and Beverage Services NC II', 'Tourism'],
    ['Carpentry NC III', 'Construction'],
    ['3D Game Art Development NC III', 'ICT'],
    ['Electrical Installation and Maintenance NC III', 'Electrical and Electronics'],
  ],
] as const

/** My progress's example plan. */
export const PLAN_QUALIFICATION = 'Electrical Installation and Maintenance NC II'

/** Each region's center, from backend/seed/regions.json: code, city, latitude and longitude. */
export const REGIONS = [
  ['NCR', 'Manila', 14.5995, 120.9842],
  ['CAR', 'Baguio', 16.4023, 120.596],
  ['I', 'San Fernando', 16.6159, 120.3166],
  ['II', 'Tuguegarao', 17.6132, 121.727],
  ['III', 'San Fernando', 15.0286, 120.6898],
  ['IV-A', 'Calamba', 14.2117, 121.1653],
  ['MIMAROPA', 'Calapan', 13.4115, 121.1803],
  ['V', 'Legazpi', 13.1391, 123.7438],
  ['VI', 'Iloilo City', 10.7202, 122.5621],
  ['NIR', 'Bacolod', 10.6765, 122.9509],
  ['VII', 'Cebu City', 10.3157, 123.8854],
  ['VIII', 'Tacloban', 11.2443, 125.0039],
  ['IX', 'Pagadian', 7.8257, 123.437],
  ['X', 'Cagayan de Oro', 8.4542, 124.6319],
  ['XI', 'Davao City', 7.1907, 125.4553],
  ['XII', 'Koronadal', 6.5031, 124.8469],
  ['XIII', 'Butuan', 8.9475, 125.5406],
  ['BARMM', 'Cotabato City', 7.2236, 124.2464],
] as const

/** The example learner on the map, linked to the regional centers near them. */
export const MAP_LEARNER_REGION = 'VII'

/** The other cities named on the map: most to the right of their dot, a few to the left. */
export const MAP_LABELS = {
  right: ['Davao City', 'Tuguegarao', 'Legazpi', 'Cagayan de Oro'],
  left: ['Manila', 'Baguio', 'Iloilo City'],
} as const
