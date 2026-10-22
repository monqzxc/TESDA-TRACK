import { getCopy } from '../../i18n/copy.ts'
import type { FlightEstimate } from './api.ts'
import { friendlyDay, type Program, type Schedule } from './centers.ts'

// How Training & Assessment writes distances, money, times and a program's facts (classic/training_view.py).

/** "105.9 km". */
export function kilometres(distance: number): string {
  return `${distance.toLocaleString('en-PH', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`
}

/** "₱1,500.00". */
export function peso(amount: string | number): string {
  return `₱${Number(amount).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** Minutes as a learner reads them: "25 min", "1 hr", "2 hr 5 min" (directions.travel_time). */
export function travelTime(minutes: number): string {
  const total = Math.max(1, Math.round(minutes))
  const hours = Math.floor(total / 60)
  const rest = total % 60
  if (!hours) return `${rest} min`
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`
}

/** "Thu, Oct 15 · 9:00 AM", in Philippine time. */
export function localTime(timestamp: string): string {
  const when = new Date(timestamp)
  const zone = { timeZone: 'Asia/Manila' } as const
  const day = when.toLocaleDateString('en-US', {
    ...zone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
  const time = when.toLocaleTimeString('en-US', { ...zone, hour: 'numeric', minute: '2-digit' })
  return `${day} · ${time}`
}

/** A program's cost: "Free" for a recorded zero, "Not provided" when it isn't given (US-08). */
export function programCost(program: Pick<Program, 'cost'>): string {
  const en = getCopy()
  const copy = en.training

  if (program.cost === null || program.cost === undefined) return copy.programs.notProvided
  return Number(program.cost) === 0 ? copy.programs.free : peso(program.cost)
}

/** An assessment's fee: "No fee" for a recorded zero, "Not provided" when it isn't given (US-08). */
export function scheduleFee(schedule: Pick<Schedule, 'fee'>): string {
  const en = getCopy()
  const copy = en.training

  if (schedule.fee === null || schedule.fee === undefined) return copy.programs.notProvided
  return Number(schedule.fee) === 0 ? copy.schedules.noFee : copy.schedules.fee(peso(schedule.fee))
}

/** A program's facts in a line: how it's delivered, its hours, when it starts, and its cost. */
export function deliveryLabel(mode: Program['delivery_mode']): string {
  const en = getCopy()
  const copy = en.training

  return mode === 'unknown' ? 'Delivery mode not provided' : copy.delivery[mode]
}

export function programFacts(program: Program, today: string): string[] {
  const en = getCopy()
  const copy = en.training

  const facts: string[] = [deliveryLabel(program.delivery_mode)]
  if (program.duration_hours) facts.push(copy.programs.hours(program.duration_hours))
  const start = program.start_date
  facts.push(
    !start
      ? copy.programs.flexibleStart
      : start >= today
        ? copy.programs.starts(friendlyDay(start, today))
        : copy.programs.started(friendlyDay(start, today)),
  )
  facts.push(programCost(program))
  return facts
}

/** "Mactan-Cebu International Airport (CEB)": the name, not the town, as some airports sit outside it. */
export function airportLabel(airport: FlightEstimate['departure']): string {
  return `${airport.name} (${airport.iata})`
}

/** A route's label on the map and in the mode switch: "~1 hr 5 min · 312.4 km" (a flight is an estimate). */
export function routeLabel(route: {
  mode: string
  duration_min: number
  distance_km: number
}): string {
  return `${route.mode === 'plane' ? '~' : ''}${travelTime(route.duration_min)} · ${kilometres(route.distance_km)}`
}
