import type { Region } from '../../api/queries.ts'
import type { components } from '../../api/schema.d.ts'
import { en } from '../../copy/en.ts'
import type { CenterKind, SortOrder } from './address.ts'

// Training and assessment centers: joins the API's sites with their listings, then filters, measures and sorts
// them. Plain functions, ported from frontend/centers.py with its tests, so the finder's rules are tested directly.
// Dates are ISO days ("2026-10-07") in Philippine time, which compare as strings.

export type Provider = components['schemas']['TrainingProviderPublic']
export type AssessmentSite = components['schemas']['AssessmentCenterPublic']
export type Program = components['schemas']['TrainingProgramPublic']
export type Schedule = components['schemas']['AssessmentSchedulePublic']
type Site = Provider | AssessmentSite | Program['provider']

export interface Center {
  /** "training-12" or "assessment-12": providers and assessment centers number their sites separately. */
  id: string
  kind: CenterKind
  name: string
  regionCode: string | null
  /** The region's name, or its code when the region list doesn't have it. */
  region: string
  province: string | null
  city: string | null
  address: string | null
  latitude: number | null
  longitude: number | null
  email: string | null
  phone: string | null
  website: string | null
  programs: Program[]
  schedules: Schedule[]
  /** Kilometres from the reference point, or null without one or without coordinates. */
  distanceKm: number | null
}

export interface Filters {
  /** Empty: both kinds. */
  kinds?: readonly CenterKind[]
  regionCode?: string
  province?: string
  /** Words to find in a center's name, place, address or what it offers. */
  text?: string
  qualificationCodes?: readonly string[]
  deliveryMode?: Program['delivery_mode']
  /** Only listings starting within this many days (a program without a start date counts). */
  withinDays?: number
  scholarship?: boolean
}

export interface Point {
  latitude: number
  longitude: number
}

const EARTH_RADIUS_KM = 6371.0088
const PHILIPPINE_OFFSET_MS = 8 * 60 * 60 * 1000

/** A coordinate the map can use, or null for one missing or out of range. */
function coordinate(value: unknown, limit: number): number | null {
  const number = typeof value === 'number' ? value : Number.NaN
  return Number.isFinite(number) && Math.abs(number) <= limit ? number : null
}

function centerFor(kind: CenterKind, site: Site, regions: ReadonlyMap<string, Region>): Center {
  let latitude = coordinate(site.latitude, 90)
  let longitude = coordinate(site.longitude, 180)
  if (latitude === null || longitude === null) latitude = longitude = null
  const regionCode = site.region_code ?? null
  const full = (key: 'province' | 'address' | 'contact_email' | 'contact_phone' | 'website') =>
    key in site ? ((site as Record<string, unknown>)[key] as string | null) : null
  return {
    id: `${kind}-${site.id}`,
    kind,
    name: site.name,
    regionCode,
    region: (regionCode && regions.get(regionCode)?.name) || regionCode || '',
    province: full('province'),
    city: site.city ?? null,
    address: full('address'),
    latitude,
    longitude,
    email: full('contact_email'),
    phone: full('contact_phone'),
    website: full('website'),
    programs: [],
    schedules: [],
    distanceKm: null,
  }
}

/** One center per site, each holding its own programs or assessment schedules. */
export function buildCenters(
  providers: readonly Provider[],
  assessmentSites: readonly AssessmentSite[],
  programs: readonly Program[],
  schedules: readonly Schedule[],
  regions: ReadonlyMap<string, Region>,
): Center[] {
  const centers = new Map<string, Center>()
  for (const site of providers)
    centers.set(`training-${site.id}`, centerFor('training', site, regions))
  for (const site of assessmentSites) {
    centers.set(`assessment-${site.id}`, centerFor('assessment', site, regions))
  }
  // Sites and listings are fetched separately, so a listing can name a site the list missed.
  const centerOf = (kind: CenterKind, site: Site) => {
    const id = `${kind}-${site.id}`
    let center = centers.get(id)
    if (!center) {
      center = centerFor(kind, site, regions)
      centers.set(id, center)
    }
    return center
  }
  for (const program of programs) centerOf('training', program.provider).programs.push(program)
  for (const schedule of schedules) centerOf('assessment', schedule.center).schedules.push(schedule)
  return [...centers.values()]
}

/** City, then province (or region when the province is unknown). */
export function placeLabel(center: Pick<Center, 'city' | 'province' | 'region'>): string {
  const { city } = center
  const broader = center.province || center.region
  if (city && broader) {
    const parts = city.split(',').map((part) => fold(part.trim()))
    if (!parts.includes(fold(broader))) return `${city}, ${broader}`
  }
  return city || broader || ''
}

/** Great-circle distance between two points. */
export function distanceKm(origin: Point, destination: Point): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180
  const [lat1, lon1, lat2, lon2] = [
    origin.latitude,
    origin.longitude,
    destination.latitude,
    destination.longitude,
  ].map(radians)
  const a =
    Math.sin((lat2 - lat1) / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a))
}

/** Each center with its distance from `reference`, or none without a reference or coordinates. */
export function withDistances(centers: readonly Center[], reference: Point | null): Center[] {
  return centers.map((center) => ({
    ...center,
    distanceKm:
      reference && center.latitude !== null && center.longitude !== null
        ? distanceKm(reference, { latitude: center.latitude, longitude: center.longitude })
        : null,
  }))
}

/** Text folded for matching: lower case, commas as spaces, single spaces. */
function key(text: string): string {
  return fold(text).replace(/,/g, ' ').split(/\s+/).filter(Boolean).join(' ')
}

function fold(text: string): string {
  return text.toLocaleLowerCase('en-US')
}

interface Place extends Point {
  /** Lower is more specific: city, province, region, the region's center city. */
  rank: number
  label: string
  names: Set<string>
}

/** Every place name the finder knows, with a point for it. */
function places(centers: readonly Center[], regions: ReadonlyMap<string, Region>): Place[] {
  const points = new Map<string, { rank: number; label: string; spots: Point[] }>()
  for (const center of centers) {
    if (center.latitude === null || center.longitude === null) continue
    for (const [rank, label] of [
      [0, center.city],
      [1, center.province],
    ] as const) {
      if (!label) continue
      const id = `${rank}|${label}`
      const entry = points.get(id) ?? { rank, label, spots: [] }
      entry.spots.push({ latitude: center.latitude, longitude: center.longitude })
      points.set(id, entry)
    }
  }
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length
  const found: Place[] = [...points.values()].map(({ rank, label, spots }) => ({
    rank,
    label,
    names: new Set([key(label)]),
    latitude: mean(spots.map((spot) => spot.latitude)),
    longitude: mean(spots.map((spot) => spot.longitude)),
  }))
  for (const region of regions.values()) {
    found.push({
      rank: 2,
      label: region.name,
      latitude: region.latitude,
      longitude: region.longitude,
      names: new Set([key(region.name), key(region.code), key(`Region ${region.code}`)]),
    })
    if (region.center_city) {
      found.push({
        rank: 3,
        label: region.center_city,
        names: new Set([key(region.center_city)]),
        latitude: region.latitude,
        longitude: region.longitude,
      })
    }
  }
  return found
}

export interface FoundPlace extends Point {
  label: string
}

/** A typed city, province or region resolved to a point, without any outside geocoding service. */
export function findPlace(
  text: string,
  centers: readonly Center[],
  regions: ReadonlyMap<string, Region>,
): FoundPlace | null {
  const wanted = key(text)
  if (!wanted) return null
  const known = places(centers, regions)
  const exact = known.filter((place) => place.names.has(wanted))
  let best: Place | undefined
  if (exact.length) {
    best = exact.reduce((a, b) => (b.rank < a.rank ? b : a))
  } else {
    if (wanted.length < 3) return null
    const partial = known.filter((place) => [...place.names].some((name) => name.includes(wanted)))
    const score = (place: Place) =>
      [
        [...place.names].some((name) => name.startsWith(wanted)) ? 0 : 1,
        place.label.length,
        place.rank,
      ] as const
    best = partial.reduce<Place | undefined>((a, b) => {
      if (!a) return b
      const [x, y] = [score(a), score(b)]
      for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return y[i] < x[i] ? b : a
      return a
    }, undefined)
  }
  return best ? { label: best.label, latitude: best.latitude, longitude: best.longitude } : null
}

/** The day in the Philippines (UTC+8) of a timestamp. */
export function philippineDay(timestamp: string | Date): string {
  const time = typeof timestamp === 'string' ? Date.parse(timestamp) : timestamp.getTime()
  return new Date(time + PHILIPPINE_OFFSET_MS).toISOString().slice(0, 10)
}

/** `days` after an ISO day. */
export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function programMatches(program: Program, filters: Filters, today: string, lastDay: string | null) {
  const start = program.start_date
  return (
    (!filters.qualificationCodes?.length ||
      filters.qualificationCodes.includes(program.qualification.code)) &&
    (!filters.deliveryMode || program.delivery_mode === filters.deliveryMode) &&
    (!filters.scholarship || program.scholarship_available) &&
    // A program without a start date takes learners any time.
    (lastDay === null || !start || (today <= start && start <= lastDay))
  )
}

function scheduleMatches(
  schedule: Schedule,
  filters: Filters,
  today: string,
  lastDay: string | null,
) {
  const day = philippineDay(schedule.scheduled_at)
  return (
    (!filters.qualificationCodes?.length ||
      filters.qualificationCodes.includes(schedule.qualification.code)) &&
    (lastDay === null || (today <= day && day <= lastDay))
  )
}

/** Centers that match, each narrowed to the listings that match. The input is left unchanged. */
export function filterCenters(
  centers: readonly Center[],
  filters: Filters,
  today: string,
): Center[] {
  const words = key(filters.text ?? '')
    .split(' ')
    .filter(Boolean)
  const lastDay = filters.withinDays ? addDays(today, filters.withinDays) : null
  const narrowsPrograms = Boolean(
    filters.qualificationCodes?.length || filters.deliveryMode || filters.scholarship || lastDay,
  )
  const narrowsSchedules = Boolean(filters.qualificationCodes?.length || lastDay)
  const kept: Center[] = []
  for (const center of centers) {
    if (
      (filters.kinds?.length && !filters.kinds.includes(center.kind)) ||
      (filters.regionCode && center.regionCode !== filters.regionCode) ||
      (filters.province && center.province !== filters.province)
    ) {
      continue
    }
    if (words.length) {
      // A center is found by where it is or by what it offers.
      const offered = [...center.programs, ...center.schedules].flatMap((listing) => [
        'title' in listing ? listing.title : null,
        listing.qualification.name,
      ])
      const haystack = key(
        [center.name, placeLabel(center), center.region, center.address, ...offered]
          .filter(Boolean)
          .join(' '),
      )
      if (!words.every((word) => haystack.includes(word))) continue
    }
    if (center.kind === 'training' && narrowsPrograms) {
      const programs = center.programs.filter((item) =>
        programMatches(item, filters, today, lastDay),
      )
      if (programs.length) kept.push({ ...center, programs })
    } else if (center.kind === 'assessment' && narrowsSchedules) {
      const schedules = center.schedules.filter((item) =>
        scheduleMatches(item, filters, today, lastDay),
      )
      if (schedules.length) kept.push({ ...center, schedules })
    } else {
      kept.push(center)
    }
  }
  return kept
}

/** The next programme start or assessment day, in Philippine time. */
export function nextDate(center: Center, today: string): string | null {
  const days = [
    ...center.programs
      .map((program) => program.start_date)
      .filter((start): start is string => !!start),
    ...center.schedules.map((schedule) => philippineDay(schedule.scheduled_at)),
  ].filter((day) => day >= today)
  return days.length ? days.reduce((a, b) => (b < a ? b : a)) : null
}

const byName = (a: Center, b: Center) => fold(a.name).localeCompare(fold(b.name))

export function sortCenters(centers: readonly Center[], order: SortOrder, today: string): Center[] {
  if (order === 'nearest') {
    return [...centers].sort(
      (a, b) =>
        Number(a.distanceKm === null) - Number(b.distanceKm === null) ||
        (a.distanceKm ?? 0) - (b.distanceKm ?? 0) ||
        byName(a, b),
    )
  }
  if (order === 'soonest') {
    const upcoming = new Map(centers.map((center) => [center.id, nextDate(center, today)]))
    return [...centers].sort((a, b) => {
      const [x, y] = [upcoming.get(a.id) ?? null, upcoming.get(b.id) ?? null]
      return (
        Number(x === null) - Number(y === null) || (x ?? '').localeCompare(y ?? '') || byName(a, b)
      )
    })
  }
  return [...centers].sort(byName)
}

/** "Oct 21", or "Jan 10, 2027" for a day in another year. */
export function friendlyDay(day: string, today: string): string {
  const date = new Date(`${day}T00:00:00Z`)
  const text = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  return day.slice(0, 4) === today.slice(0, 4) ? text : `${text}, ${day.slice(0, 4)}`
}

/** One line on what a center offers next, for result rows and map popups. */
export function summary(center: Center, today: string): string {
  const copy = en.training.summary
  const upcoming = nextDate(center, today)
  if (center.kind === 'training') {
    if (!center.programs.length) return copy.noPrograms
    const head = copy.programs(center.programs.length)
    if (upcoming) return `${head} · ${copy.nextBatch(friendlyDay(upcoming, today))}`
    return center.programs.some((program) => !program.start_date)
      ? `${head} · ${copy.flexible}`
      : head
  }
  if (!center.schedules.length) return copy.noAssessments
  const head = copy.assessments(center.schedules.length)
  return upcoming ? `${head} · ${copy.next(friendlyDay(upcoming, today))}` : head
}

/** Every province the centers are in (within a region, when one is given), once each, alphabetically. */
export function provinces(centers: readonly Center[], regionCode?: string): string[] {
  const found = new Set<string>()
  for (const center of centers) {
    if (center.province && (!regionCode || center.regionCode === regionCode))
      found.add(center.province)
  }
  return [...found].sort((a, b) => fold(a).localeCompare(fold(b)))
}
