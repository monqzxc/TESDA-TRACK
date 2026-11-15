import type { Center } from '../training/centers.ts'
import { SuggestionFeedback } from './SuggestionFeedback.tsx'

export function CenterSuggestionFeedback({
  center,
  qualificationCode,
  goal,
  scope,
}: {
  center: Pick<Center, 'id' | 'kind' | 'name'>
  qualificationCode?: string
  goal?: string | null
  scope?: string
}) {
  return (
    <SuggestionFeedback
      kind={center.kind}
      resultKey={center.id.slice(center.kind.length + 1)}
      resultName={center.name}
      qualificationCode={qualificationCode}
      goal={goal}
      scope={scope}
    />
  )
}
