import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { Qualification } from '../../api/queries.ts'
import { matchesQuery, type MatchResult } from './api.ts'
import { answeredProfile } from './rules.ts'
import { useFinderStore, type Journey } from './store.ts'

/**
 * What steps 2 to 4 share (frontend/app.py finder_context): the goal's profile with the follow-up answers, the
 * matches for it, the catalog with the matches first, and the qualification the learner is working on: the one they
 * chose, or else the top match. A goal with no match has none until the learner picks one (US-03).
 */
export function useJourney(journey: Journey, catalog: readonly Qualification[]) {
  const experience = useFinderStore((state) => state.experience)
  const certification = useFinderStore((state) => state.certification)
  const selected = useFinderStore((state) => state.selected)
  const profile = useMemo(
    () => answeredProfile(journey.profile, experience, certification),
    [journey.profile, experience, certification],
  )
  // New answers ask again; the last matches stay on screen meanwhile.
  const matches = useQuery({
    ...matchesQuery(journey.query, profile),
    placeholderData: keepPreviousData,
  })

  const ranked = useMemo(
    () => matches.data?.matches.map((match) => match.qualification.code) ?? [],
    [matches.data],
  )
  const options = useMemo(() => {
    const rank = (code: string) => {
      const index = ranked.indexOf(code)
      return index === -1 ? ranked.length : index
    }
    return [...catalog].sort((a, b) => rank(a.code) - rank(b.code))
  }, [catalog, ranked])

  const code = selected ?? ranked[0] ?? null
  const chosen = code === null ? null : qualificationFor(code, catalog, matches.data)

  return {
    profile,
    matches,
    /** The API's reading of the goal with the answers (its intent can change with them). */
    matchedProfile: matches.data?.profile,
    options,
    /** The qualification the learner is working on, or null until there is one. */
    chosen,
    /** Waiting for the matches to know the top match, as nothing was chosen. */
    choosing: selected === null && matches.data === undefined,
    /** Chosen from the full list, not one of the matches. */
    isOwnChoice: selected !== null && !ranked.includes(selected),
  }
}

export type JourneyContext = ReturnType<typeof useJourney>

/** A qualification from the catalog, or from the matches when the catalog doesn't have it (yet). */
function qualificationFor(
  code: string,
  catalog: readonly Qualification[],
  matches: MatchResult | undefined,
): Qualification | null {
  const found = catalog.find((qualification) => qualification.code === code)
  if (found) return found
  const summary = matches?.matches.find((match) => match.qualification.code === code)?.qualification
  return summary ? { ...summary, possible_jobs: [], competencies: [] } : null
}
