import type { Region } from '../../api/queries.ts'
import { findPlace, type Center, type FoundPlace } from './centers.ts'
import file from './data/places.json'

// Every city and municipality in the Philippines, at its town center, and each province at its capital
// (data/places.json, built by scripts/prepare_places.py from the PSGC and GeoNames). Bundled with the page, so a place
// a learner types is never sent to an outside geocoding service.

export interface Town {
  name: string
  /** Null for Metro Manila's cities and the few independent cities outside any province. */
  province: string | null
  latitude: number
  longitude: number
  city: boolean
}

export interface PlaceOption extends FoundPlace {
  id: string
  kind: 'town' | 'province'
  /** For a province: the capital its distances are measured from. */
  capital?: string
}

interface Entry {
  option: PlaceOption
  /** Folded names this place answers to, the shortest first. */
  names: string[]
  /** Lower comes first among equally good matches: a province, a capital, a city, a municipality. */
  weight: number
}

export interface Gazetteer {
  entries: Entry[]
}

interface PlacesFile {
  towns: [string, string | null, number, number, number][]
  provinces: [string, number][]
}

/** Text folded for matching: lower case, no accents (Parañaque, Paranaque), no punctuation, single spaces. */
export function foldPlace(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('en-US')
    .replace(/\bsto\.?(?=\s)/g, 'santo')
    .replace(/\bsta\.?(?=\s)/g, 'santa')
    .replace(/\bgen\.?(?=\s)/g, 'general')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const METRO_MANILA = 'Metro Manila'

export function buildGazetteer(file: PlacesFile): Gazetteer {
  const towns: Town[] = file.towns.map(([name, province, latitude, longitude, city]) => ({
    name,
    province,
    latitude,
    longitude,
    city: city === 1,
  }))
  const capitals = new Set(file.provinces.map(([, index]) => index))
  const entries: Entry[] = file.provinces.map(([province, index]) => {
    const capital = towns[index]
    return {
      option: {
        id: `province:${province}`,
        kind: 'province',
        label: province,
        capital: capital.name,
        latitude: capital.latitude,
        longitude: capital.longitude,
      },
      names: names(province, []),
      weight: 0,
    }
  })
  towns.forEach((town, index) => {
    const area = town.province ?? (isMetroManila(town) ? METRO_MANILA : null)
    const base = town.name.replace(/\s+City$/, '')
    const own = [town.name, base, ...(town.name === base ? [] : [`City of ${base}`])]
    entries.push({
      option: {
        id: `town:${index}`,
        kind: 'town',
        label: area ? `${town.name}, ${area}` : town.name,
        latitude: town.latitude,
        longitude: town.longitude,
      },
      names: names(own[0], [
        ...own.slice(1),
        ...(area ? own.map((name) => `${name} ${area}`) : []),
      ]),
      weight: capitals.has(index) ? 1 : town.city ? 2 : 3,
    })
  })
  return { entries }
}

function names(main: string, others: string[]): string[] {
  return [...new Set([main, ...others].map(foldPlace))].sort((a, b) => a.length - b.length)
}

// Metro Manila's cities and Pateros have no province; the few other independent cities lie far from it.
function isMetroManila(town: Town) {
  return (
    town.province === null &&
    Math.abs(town.latitude - 14.6) < 0.35 &&
    Math.abs(town.longitude - 121.03) < 0.35
  )
}

/** How well a place answers to the text: 0 exact, 1 a name starts with it, 2 a word does, 3 it's inside; else null. */
function closeness(entry: Entry, wanted: string): number | null {
  let best: number | null = null
  for (const name of entry.names) {
    const score =
      name === wanted
        ? 0
        : name.startsWith(wanted)
          ? 1
          : name.includes(` ${wanted}`)
            ? 2
            : name.includes(wanted)
              ? 3
              : null
    if (score !== null && (best === null || score < best)) best = score
  }
  return best
}

/** The places to suggest while the learner types, best first. Nothing for fewer than two letters. */
export function suggestPlaces(text: string, gazetteer: Gazetteer, limit = 8): PlaceOption[] {
  const wanted = foldPlace(text)
  if (wanted.length < 2) return []
  return gazetteer.entries
    .map((entry) => ({ entry, score: closeness(entry, wanted) }))
    .filter((item): item is { entry: Entry; score: number } => item.score !== null)
    .sort(
      (a, b) =>
        a.score - b.score ||
        a.entry.weight - b.entry.weight ||
        a.entry.option.label.length - b.entry.option.label.length ||
        a.entry.option.label.localeCompare(b.entry.option.label),
    )
    .slice(0, limit)
    .map(({ entry }) => entry.option)
}

/**
 * The place a learner typed without picking a suggestion, when its name is exactly a province or a town: a province
 * is measured from its capital ("Pampanga" from San Fernando City). Of two towns with one name, a capital first.
 */
export function exactPlace(text: string, gazetteer: Gazetteer): PlaceOption | null {
  const wanted = foldPlace(text)
  if (!wanted) return null
  const found = suggestPlaces(text, gazetteer, 1)[0]
  const entry = found && gazetteer.entries.find((item) => item.option.id === found.id)
  return entry && entry.names.includes(wanted) ? found : null
}

/** The best place for text the learner typed: an exact name, else the first suggestion (three letters or more). */
export function bestPlace(text: string, gazetteer: Gazetteer): PlaceOption | null {
  if (foldPlace(text).length < 3) return exactPlace(text, gazetteer)
  return suggestPlaces(text, gazetteer, 1)[0] ?? null
}

/**
 * Where distances start for text the learner typed without picking a suggestion: a province or town of exactly that
 * name, else a region, else the best suggestion, else a city or province the centers list that the place list lacks.
 */
export function resolvePlace(
  text: string,
  places: Gazetteer,
  centers: readonly Center[] | null,
  regions: ReadonlyMap<string, Region>,
): FoundPlace | null {
  if (!text.trim()) return null
  return (
    exactPlace(text, places) ??
    findPlace(text, [], regions) ??
    bestPlace(text, places) ??
    (centers ? findPlace(text, centers, regions) : null)
  )
}

let built: Gazetteer | undefined

/** The place list, built once on first use. */
export function gazetteer(): Gazetteer {
  built ??= buildGazetteer(file as PlacesFile)
  return built
}
