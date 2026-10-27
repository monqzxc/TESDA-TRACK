import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Qualification } from '../../api/queries.ts'
import { useAuth } from '../../auth/useAuth.ts'
import {
  addGoal,
  goalsQuery,
  pathwaysQuery,
  progressKeys,
  setGoalStatus,
  setPathwayStatus,
  type Enrollment,
  type Goal,
} from '../progress/api.ts'

type SavedRecord = { kind: 'goal'; record: Goal } | { kind: 'pathway'; record: Enrollment }

/** Saves any catalog qualification, including ones that do not have a curated pathway yet. */
export function useLibraryCollection() {
  const { isSignedIn } = useAuth()
  const queryClient = useQueryClient()
  const goals = useQuery({ ...goalsQuery, enabled: isSignedIn })
  const pathways = useQuery({ ...pathwaysQuery, enabled: isSignedIn })
  const saved = new Set<string>()
  for (const goal of goals.data ?? []) {
    if (goal.status !== 'archived' && goal.target_qualification)
      saved.add(goal.target_qualification.code)
  }
  for (const enrollment of pathways.data ?? []) {
    if (enrollment.status !== 'withdrawn') saved.add(enrollment.pathway.qualification.code)
  }

  const add = useMutation({
    mutationFn: async (qualification: Qualification): Promise<SavedRecord> => {
      const [currentGoals, currentPathways] = await Promise.all([
        queryClient.fetchQuery(goalsQuery),
        queryClient.fetchQuery(pathwaysQuery),
      ])
      const matchingGoals = currentGoals.filter(
        (goal) => goal.target_qualification?.code === qualification.code,
      )
      const matchingPathways = currentPathways.filter(
        (item) => item.pathway.qualification.code === qualification.code,
      )
      const existingGoal = matchingGoals.find((goal) => goal.status !== 'archived')
      if (existingGoal) return { kind: 'goal', record: existingGoal }
      const existingPathway = matchingPathways.find((item) => item.status !== 'withdrawn')
      if (existingPathway) return { kind: 'pathway', record: existingPathway }

      // A removed qualification resumes its saved steps instead of starting a second record.
      const removedPathway = matchingPathways.toSorted((a, b) =>
        b.updated_at.localeCompare(a.updated_at),
      )[0]
      if (removedPathway) {
        return { kind: 'pathway', record: await setPathwayStatus(removedPathway.id, 'active') }
      }
      const archivedGoal = matchingGoals.toSorted((a, b) =>
        b.updated_at.localeCompare(a.updated_at),
      )[0]
      if (archivedGoal)
        return { kind: 'goal', record: await setGoalStatus(archivedGoal.id, 'active') }
      return { kind: 'goal', record: await addGoal(qualification.name, qualification.code, null) }
    },
    onSuccess: (savedRecord) => {
      if (savedRecord.kind === 'goal') {
        queryClient.setQueryData<Goal[]>(progressKeys.goals, (current) => [
          ...(current ?? []).filter((goal) => goal.id !== savedRecord.record.id),
          savedRecord.record,
        ])
      } else {
        queryClient.setQueryData<Enrollment[]>(progressKeys.pathways, (current) => [
          ...(current ?? []).filter((item) => item.id !== savedRecord.record.id),
          savedRecord.record,
        ])
      }
    },
  })

  return {
    isSignedIn,
    saved,
    loading: isSignedIn && (goals.isPending || pathways.isPending),
    add,
  }
}
