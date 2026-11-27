import { type CSSProperties, type ReactNode, useCallback, useEffect, useState } from 'react'
import { Button } from 'react-aria-components'
import { useQuery } from '@tanstack/react-query'
import { qualificationsQuery } from '../../api/queries.ts'
import { InfoPopover } from '../../components/InfoPopover.tsx'
import { useCopy } from '../../i18n/copy.ts'
import { cx } from '../../lib/style.ts'
import { roundKm } from './explore.ts'
import { type DemandRegionCard, type Pick, widenKm } from './guided.ts'
import type { NearbySuggestion } from './outlookApi.ts'
import { chosenSearch, type Explore, useExploreStore } from './useExplore.ts'
import { type GuidedModel, useGuided } from './useGuided.ts'
import { CARD_GAP_MS, type RevealId, useReveal } from './useReveal.ts'

// The guided step (docs/superpowers/specs/2026-11-27-explore-guided-cards-design.md): TRACK's pick, then three
// groups of cards that each say why, revealed in order once per search. Plain: flat cards, one thin border.

export interface GuidedViewProps {
  model: GuidedModel
  /** The learner's range in km; Infinity while relocating. */
  rangeKm: number
  signedIn: boolean
  /** This search's reveal already played: show everything at once. */
  played: boolean
  onRevealed: (key: string) => void
  onQualification: (code: string) => void
  onRegion: (card: DemandRegionCard) => void
  onConsider: (item: NearbySuggestion) => void
  onWiden: (km: number) => void
}

const card =
  'flex w-full min-w-0 flex-col items-start gap-1 rounded-12 border border-border bg-surface p-3 text-left'
const pressable = cx(
  card,
  'cursor-pointer transition-colors duration-150 data-hovered:border-navy',
  'data-focus-visible:outline-3 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus',
)
const line = 'm-0 text-13 leading-[1.45] text-ink'
const muted = 'm-0 text-13 leading-[1.45] text-muted'
const smallButton =
  'inline-flex min-h-9 cursor-pointer items-center rounded-full border border-border bg-surface px-3 text-13 font-semibold text-blue data-hovered:border-navy data-focus-visible:outline-3 data-focus-visible:outline-focus'

const entering = (animate: boolean, index: number) =>
  animate
    ? {
        className: 'motion-safe:animate-guided-in',
        style: { animationDelay: `${index * CARD_GAP_MS}ms` } as CSSProperties,
      }
    : { className: undefined, style: undefined }

export function GuidedView(props: GuidedViewProps) {
  const copy = useCopy().explore.guided
  const { model, onRevealed } = props
  const steps: RevealId[] = ['pick', ...model.order]
  const ready: Record<RevealId, boolean> = {
    pick: model.pickReady,
    near: true,
    demand: model.demand.status !== 'loading',
    consider: model.consider.status !== 'loading',
  }
  const { shown, animate, pending } = useReveal(steps, ready, model.key, props.played, onRevealed)
  const groups = model.order.filter((id) => shown.has(id) && hasContent(model, id))
  const settled = steps.every((step) => shown.has(step))

  return (
    <div className="flex flex-col gap-4">
      {shown.has('pick') && model.pick && <PickCard {...props} pick={model.pick} animate={animate} />}
      {pending === 'pick' && <Skeleton />}
      {model.order.map((id) =>
        shown.has(id) ? (
          <Group key={id} id={id} {...props} animate={animate} />
        ) : pending === id ? (
          <Skeleton key={id} />
        ) : null,
      )}
      <p role="status" className="sr-only">
        {settled ? copy.ready(groups.length) : ''}
      </p>
    </div>
  )
}

/** A loading row in the place of what comes next. */
function Skeleton() {
  return <div data-guided-skeleton aria-hidden="true" className="h-16 animate-pulse rounded-12 bg-soft" />
}

function hasContent(model: GuidedModel, id: RevealId): boolean {
  if (id === 'near') return !(model.near.kind === 'cards' && model.near.cards.length === 0)
  if (id === 'demand')
    return (
      model.demand.status === 'error' ||
      model.demand.group.cards.length > 0 ||
      model.demand.group.goodNews !== null
    )
  if (id === 'consider') return model.consider.status === 'ready' || model.consider.status === 'error'
  return true
}

function Check({ ok, best, children }: { ok: boolean; best: boolean; children: ReactNode }) {
  return (
    <li className={cx('flex items-start gap-2 text-13 leading-[1.45]', ok ? 'text-ink' : 'text-muted')}>
      <span
        aria-hidden="true"
        className={cx('w-4 flex-none font-bold', ok ? (best ? 'text-good-ink' : 'text-pick-ink') : 'text-muted')}
      >
        {ok ? '✓' : '○'}
      </span>
      <span className="min-w-0">{children}</span>
    </li>
  )
}

function PickCard({
  pick,
  model,
  rangeKm,
  signedIn,
  animate,
  onQualification,
  onWiden,
}: GuidedViewProps & { pick: Pick; animate: boolean }) {
  const copy = useCopy().explore.guided
  const { candidate, checks, tier } = pick
  const best = tier === 'best'
  const area = model.consider.area ?? ''
  const nearestKm = candidate.nearestKm === null ? null : Math.round(candidate.nearestKm)
  const relocating = !Number.isFinite(rangeKm)
  const enter = entering(animate, 0)
  return (
    <section
      aria-label={best ? copy.best : copy.pick}
      className={cx(
        'flex flex-col gap-2 rounded-12 p-3',
        // The best fit in the app's "strong match" green; TRACK's pick in the gold of its star on the map.
        best ? 'border-2 border-good-fill bg-surface' : 'border-2 border-pick bg-pick-bg',
        enter.className,
      )}
      style={enter.style}
    >
      <span
        className={cx(
          'self-start rounded-full px-2 py-0.5 text-11 leading-tight font-bold',
          best ? 'bg-good-fill text-white' : 'bg-pick text-pick-on',
        )}
      >
        {best ? copy.best : copy.pick}
      </span>
      <p className="m-0 text-15 font-bold text-navy">{candidate.match.qualification.name}</p>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        <Check ok={checks.near} best={best}>
          {checks.near
            ? relocating
              ? copy.near.yesRelocate(candidate.nearCount)
              : copy.near.yes(nearestKm ?? 0, candidate.nearestName ?? '')
            : relocating
              ? copy.near.noneRecorded
              : copy.near.no(rangeKm, nearestKm)}
          {!checks.near && nearestKm !== null && !relocating && (
            <Button className={cx(smallButton, 'ml-2')} onPress={() => onWiden(widenKm(candidate.nearestKm ?? 0))}>
              {copy.widen(widenKm(candidate.nearestKm ?? 0))}
            </Button>
          )}
        </Check>
        <Check ok={checks.demand} best={best}>
          {checks.demand && candidate.demand
            ? copy.demand.yes(area, candidate.demand.rank, candidate.demand.rankedOf, candidate.demand.sample)
            : candidate.demand
              ? copy.demand.no(area)
              : copy.demand.unknown}
        </Check>
        <Check ok={checks.fit} best={best}>
          {checks.fit ? (signedIn ? copy.fit.signedIn : copy.fit.guest) : copy.fit.no}
        </Check>
      </ul>
      <Button
        className={cx(smallButton, 'self-end')}
        onPress={() => onQualification(candidate.match.qualification.code)}
      >
        {copy.seeCenters}
      </Button>
    </section>
  )
}

function GroupFrame({
  title,
  sub,
  source,
  animate,
  children,
}: {
  title: string
  sub?: string
  source: string
  animate: boolean
  children: ReactNode
}) {
  const copy = useCopy().explore.guided
  const enter = entering(animate, 0)
  return (
    <section className={cx('flex flex-col gap-2', enter.className)} style={enter.style}>
      <div className="flex items-center gap-1">
        <h3 className="m-0 text-12 font-semibold text-muted">{title}</h3>
        <InfoPopover label={copy.sourcesLabel} paragraphs={[source]} className="-my-1.5" />
      </div>
      {sub && <p className={cx(muted, '-mt-1.5 text-12')}>{sub}</p>}
      {children}
    </section>
  )
}

function Group({
  id,
  model,
  rangeKm,
  animate,
  onQualification,
  onRegion,
  onConsider,
  onWiden,
}: GuidedViewProps & { id: RevealId; animate: boolean }) {
  const copy = useCopy().explore.guided
  if (!hasContent(model, id)) return null
  const range = Number.isFinite(rangeKm) ? rangeKm : null
  const query = model.demand.query

  if (id === 'near') {
    const { near } = model
    return (
      <GroupFrame title={copy.groups.near(query)} source={copy.sources.near} animate={animate}>
        {near.kind === 'no-place' && <p className={cx(card, line)}>{copy.noPlace}</p>}
        {near.kind === 'none-in-range' && (
          <div className={card}>
            <p className={line}>
              {copy.noneInRange(range ?? 0, Math.round(near.nearestKm), near.town)}
            </p>
            <Button className={smallButton} onPress={() => onWiden(near.widenTo)}>
              {copy.widen(near.widenTo)}
            </Button>
          </div>
        )}
        {near.kind === 'cards' &&
          near.cards.map((item, index) => {
            const enter = entering(animate, index + 1)
            return (
              <Button
                key={item.match.qualification.code}
                className={cx(pressable, enter.className)}
                style={enter.style}
                onPress={() => onQualification(item.match.qualification.code)}
              >
                <span className="text-14 font-semibold text-navy">{item.match.qualification.name}</span>
                <span className={muted}>
                  {copy.nearCount(
                    item.nearCount,
                    range,
                    item.nearestKm === null ? null : roundKm(item.nearestKm),
                    item.nearestMinutes,
                  )}
                </span>
              </Button>
            )
          })}
      </GroupFrame>
    )
  }

  if (id === 'demand') {
    const { status, group } = model.demand
    const sample = group.cards.some((item) => item.sample)
    return (
      <GroupFrame
        title={copy.groups.demand(query)}
        source={sample ? copy.sources.modelled : copy.sources.posts}
        animate={animate}
      >
        {status === 'error' && <p className={muted}>{copy.outlookFailed}</p>}
        {group.goodNews && (
          <p className={cx(line, 'font-semibold text-good-ink')}>
            {copy.goodNews(group.goodNews.home, group.goodNews.rankedOf, query)}
          </p>
        )}
        {group.cards.map((item, index) => {
          const enter = entering(animate, index + 1)
          return (
            <Button
              key={item.regionCode}
              className={cx(pressable, enter.className)}
              style={enter.style}
              onPress={() => onRegion(item)}
            >
              <span className="flex w-full flex-wrap items-baseline justify-between gap-x-2">
                <span className="text-14 font-semibold text-navy">{item.name}</span>
                {item.km !== null && <span className={cx(muted, 'text-12')}>{copy.about(item.km)}</span>}
              </span>
              <span className={line}>
                {item.sample ? copy.modelled(item.count) : copy.posts(item.count)}
              </span>
              <span className={muted}>{copy.sites(item.training, item.assessment)}</span>
              <span className={muted}>{copy.balance[item.balance]}</span>
            </Button>
          )
        })}
      </GroupFrame>
    )
  }

  const { status, items, area } = model.consider
  return (
    <GroupFrame
      title={copy.groups.consider(area ?? '')}
      sub={copy.groups.considerSub}
      source={copy.sources.posts}
      animate={animate}
    >
      {status === 'error' && <p className={muted}>{copy.considerFailed}</p>}
      {items.map((item, index) => {
        const enter = entering(animate, index + 1)
        return (
          <Button
            key={item.qualification.code}
            className={cx(pressable, enter.className)}
            style={enter.style}
            onPress={() => onConsider(item)}
          >
            <span className="text-14 font-semibold text-navy">{item.qualification.name}</span>
            {item.reasons.map((reason) => (
              <span key={reason} className={muted}>
                {reason}
              </span>
            ))}
          </Button>
        )
      })}
    </GroupFrame>
  )
}

/** The guided step for the page: its model, the store's played reveal, and what each tap opens. */
export function GuidedResults({
  explore,
  onWiden,
  onRegion,
}: {
  explore: Explore
  onWiden: (km: number) => void
  onRegion: (regionCode: string) => void
}) {
  const en = useCopy()
  const model = useGuided(explore)
  // Whether this search's reveal already played, decided when its cards first show: it is marked as played as soon
  // as it starts, so a remount (Back, a refresh, a distance change mid-reveal) shows the cards in place.
  const [seenKey, setSeenKey] = useState(model.key)
  const [played, setPlayed] = useState(
    () => model.key !== null && useExploreStore.getState().revealedFor === model.key,
  )
  if (seenKey !== model.key) {
    setSeenKey(model.key)
    setPlayed(model.key !== null && useExploreStore.getState().revealedFor === model.key)
  }
  useEffect(() => {
    if (model.key) useExploreStore.getState().markRevealed(model.key)
  }, [model.key])
  const catalog = useQuery(qualificationsQuery)
  const onRevealed = useCallback((key: string) => useExploreStore.getState().markRevealed(key), [])
  const firstCode = explore.matches[0]?.qualification.code ?? ''
  return (
    <GuidedView
      model={model}
      rangeKm={explore.rangeKm}
      signedIn={Boolean(explore.passport)}
      played={played}
      onRevealed={onRevealed}
      onQualification={(code) => useExploreStore.getState().openQualification(code)}
      onRegion={(item) => {
        useExploreStore.getState().openRegion(firstCode, item.regionCode)
        onRegion(item.regionCode)
      }}
      onConsider={(item) => {
        const found = catalog.data?.find((entry) => entry.code === item.qualification.code)
        useExploreStore.getState().openConsidered(
          chosenSearch(
            {
              code: item.qualification.code,
              name: found?.name ?? item.qualification.name,
              sector: found?.sector ?? item.qualification.sector ?? '',
              provenance: found?.provenance,
            },
            en.library.exploreGoal(found?.name ?? item.qualification.name),
            en.explore.results.chosen,
          ),
        )
      }}
      onWiden={onWiden}
    />
  )
}
