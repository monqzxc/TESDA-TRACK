import { useExploreStore } from '../features/explore/useExplore.ts'

/**
 * Past the guided cards to the center list, as tapping the first match's card does, without narrowing to it. For
 * tests about the list, the chips or a center: they start where the learner lands after choosing a card.
 */
export function openCenterList() {
  const code = useExploreStore.getState().search?.result.matches[0]?.qualification.code
  if (code) useExploreStore.setState({ guidedFocus: { kind: 'qualification', code } })
}
