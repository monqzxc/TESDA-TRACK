import { useQueries } from '@tanstack/react-query'
import {
  candidateFor,
  choosePick,
  considerGroup,
  demandGroup,
  type DemandGroup,
  demandSignal,
  fitsYou,
  type GroupId,
  groupOrder,
  nearGroup,
  type NearGroup,
  type Pick,
  PICK_CANDIDATES,
} from './guided.ts'
import { type NearbySuggestion, outlookQuery } from './outlookApi.ts'
import { type Explore, revealKey } from './useExplore.ts'

export interface GuidedModel {
  order: GroupId[]
  pick: Pick | null
  near: NearGroup
  demand: { status: 'loading' | 'error' | 'ready'; group: DemandGroup; query: string }
  consider: {
    status: 'loading' | 'error' | 'ready' | 'hidden'
    items: NearbySuggestion[]
    area: string | null
  }
  key: string | null
}

/** The guided step's cards, worked out from what the page already asks for plus each pick candidate's outlook. */
export function useGuided(explore: Explore): GuidedModel {
  const { matches, centers, rangeKm, relocate, reference, fits, nearby, search } = explore
  const candidates = matches.slice(0, PICK_CANDIDATES)
  // The same arguments as the page's own outlook (useExplore), so the first one is shared, not fetched twice.
  const outlooks = useQueries({
    queries: candidates.map((match) =>
      outlookQuery(match.qualification.code, explore.demandRegion, explore.homeRegion, relocate),
    ),
  })
  const signedIn = Boolean(explore.passport)
  const area = explore.homeRegion
    ? (explore.regions.find((region) => region.code === explore.homeRegion)?.name ?? null)
    : null

  const outlookData = outlooks.map((result) => result.data)
  const first = outlooks[0]
  const nearbyItems = nearby.data?.suggestions

  const pick = choosePick(
    candidates.map((match, index) =>
      candidateFor(
        match,
        centers,
        rangeKm,
        relocate,
        demandSignal(outlookData[index]),
        fitsYou(match, fits.get(match.qualification.code), signedIn),
      ),
    ),
  )
  const pickCode = pick?.candidate.match.qualification.code
  const shown = new Set(pickCode ? [pickCode] : [])
  const near = nearGroup(matches, centers, rangeKm, reference !== null, shown)
  if (near.kind === 'cards') near.cards.forEach((card) => shown.add(card.match.qualification.code))
  const items = considerGroup(nearbyItems ?? [], shown)
  const considerStatus = !explore.homeRegion
    ? 'hidden'
    : nearby.isError
      ? 'error'
      : nearbyItems === undefined
        ? 'loading'
        : items.length
          ? 'ready'
          : 'hidden'
  return {
    order: groupOrder(relocate),
    pick,
    near,
    demand: {
      status: first?.isError ? 'error' : first?.data ? 'ready' : 'loading',
      group: demandGroup(first?.data, reference),
      query: matches[0]?.qualification.name ?? '',
    },
    consider: { status: considerStatus, items, area },
    key: revealKey(search),
  }
}
