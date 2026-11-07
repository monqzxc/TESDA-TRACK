import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { useRegions, type Qualification } from '../../api/queries.ts'
import { useAuth } from '../../auth/useAuth.ts'
import { marketIndicators, saveCareerSelection } from '../labor-market/api.ts'
import { useCopy } from '../../i18n/copy.ts'
import { paths } from '../../paths.ts'
import { button } from '../../styles/buttons.ts'
import { trainingAddress } from '../training/address.ts'
import type { Match } from './api.ts'
import { coreSkills, finalOccupations } from './occupations.ts'
import { demandPreference } from './demandIntent.ts'
import { RelatedOccupations } from './RelatedOccupations.tsx'
import { useFinderStore } from './store.ts'
import { card, cardHeading, muted } from './styles.ts'

/** Catalog career relationships stay separate from fit scores and labor-market evidence. */
export function FinalCareerOptions({
  qualification,
  catalog,
  matches,
}: {
  qualification: Qualification
  catalog: readonly Qualification[]
  matches: readonly Match[]
}) {
  const en = useCopy()
  const navigate = useNavigate()
  const inTsp = useLocation().pathname.startsWith(paths.tspWebview)
  const choose = useFinderStore((state) => state.choose)
  const careerGoal = useFinderStore((state) => state.careerGoal)
  const setCareerGoal = useFinderStore((state) => state.setCareerGoal)
  const { learner } = useAuth()
  const queryClient = useQueryClient()
  const place = useFinderStore((state) => state.place)
  const query = useFinderStore((state) => state.journey?.query ?? '')
  const preference = demandPreference(query)
  const regions = useRegions()
  const requestedRegion =
    place.region ??
    (preference
      ? /\b(?:ncr|metro manila)\b/i.test(query)
        ? 'NCR'
        : regions.data?.find(
            (region) =>
              query.toLowerCase().includes(region.name.toLowerCase()) ||
              query.toLowerCase().includes(`region ${region.code.toLowerCase()}`),
          )?.code
      : undefined)
  const demand = useQuery({
    queryKey: ['labor-market', 'indicators', qualification.code, requestedRegion],
    queryFn: ({ signal }) => marketIndicators(qualification.code, requestedRegion ?? null, signal),
    staleTime: 30_000,
  })
  const accountGoal = useMutation({
    mutationFn: ({
      title,
      journeyKey,
    }: {
      key: string
      title: string
      journeyKey: string
      owner: string
    }) => saveCareerSelection(journeyKey, title, qualification.code),
    onSuccess: (_result, variables) => {
      if (
        variables.owner !== learner?.id ||
        useFinderStore.getState().careerGoalJourneyKey !== variables.journeyKey
      )
        return
      setCareerGoal({ key: variables.key, title: variables.title })
      void queryClient.invalidateQueries({ queryKey: ['me', 'goals'] })
    },
  })
  const selectGoal = (occupation: { key: string; title: string }) => {
    if (!learner || inTsp) {
      setCareerGoal(occupation)
      return
    }
    const state = useFinderStore.getState()
    const journeyKey = state.careerGoalJourneyKey ?? crypto.randomUUID()
    if (!state.careerGoalJourneyKey) state.setCareerGoalJourneyKey(journeyKey)
    accountGoal.mutate({ ...occupation, journeyKey, owner: learner.id })
  }
  const evidence = useMemo(
    () => [...(demand.data?.items ?? []), ...(preference ? [] : (demand.data?.postings ?? []))],
    [demand.data, preference],
  )
  const occupations = useMemo(
    () => finalOccupations(qualification, catalog, evidence, preference),
    [qualification, catalog, evidence, preference],
  )
  const centersFor = (code: string) =>
    trainingAddress({ qualifications: [code] }).replace(
      paths.training,
      inTsp ? paths.tspTraining : paths.training,
    )
  const onCheck = (code: string) => {
    choose(code)
    void navigate(inTsp ? paths.tspReadiness : paths.finderReadiness)
  }
  if (preference && demand.isPending)
    return (
      <p role="status" className={`${card} ${muted}`}>
        {en.finder.unified.demandLoading}
      </p>
    )
  // Keep qualification guidance available when no approved labor-market occupation is linked to it.
  if (occupations.length === 0)
    return (
      <section className={card} aria-labelledby="final-occupations-heading">
        <h3 id="final-occupations-heading" className={cardHeading}>
          {en.finder.occupations.heading}
        </h3>
        <p className={muted}>
          {preference ? en.finder.unified.noDemandJobs : en.finder.unified.noCatalogJobs}
        </p>
        <h4 className="text-17 font-bold text-navy">{qualification.name}</h4>
        <ul className="pl-5 text-14 text-ink">
          {coreSkills(qualification).map((skill) => (
            <li key={skill}>{skill}</li>
          ))}
        </ul>
        <Link to={centersFor(qualification.code)} className={button({ variant: 'primary' })}>
          {en.finder.matches.centers}
        </Link>
      </section>
    )
  return (
    <>
      {demand.isError && (
        <p role="status" className={`${card} ${muted}`}>
          Labor-market information is temporarily unavailable. Your career recommendations remain
          available.
        </p>
      )}
      <RelatedOccupations
        occupations={occupations}
        centersFor={centersFor}
        onCheck={onCheck}
        selectedCode={qualification.code}
        recommendedCodes={matches.map((match) => match.qualification.code)}
        demandEvidence={evidence.filter((item) => item.classification !== 'hard_to_fill')}
        goalSelection={{
          selected: careerGoal,
          onSelect: selectGoal,
          isSaving: accountGoal.isPending,
          error: accountGoal.error?.message,
          help:
            learner && !inTsp
              ? 'Saved to your account when selected. Switching goals keeps your matching and readiness results.'
              : en.finder.unified.careerGoalHelp,
        }}
      />
    </>
  )
}
