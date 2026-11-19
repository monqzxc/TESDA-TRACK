import {
  queryOptions,
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router'
import { api } from '../../api/client.ts'
import type { ApiError } from '../../api/errors.ts'
import { unwrap } from '../../api/errors.ts'
import type { components } from '../../api/schema.d.ts'
import { learnerAccounts } from '../../auth/accounts.ts'
import { useAuth, useRequireAccount } from '../../auth/useAuth.ts'
import { useCopy } from '../../i18n/copy.ts'
import { paths } from '../../paths.ts'

// Centers the learner bookmarks from a map, a popup or a center's card. They're kept with the account (under
// ['me', ...], so signing out clears them from this browser) and listed in My Progress. Saving needs an account: a
// guest's press opens sign-in, and the center is saved once they're in.

export type SavedCenter = components['schemas']['SavedCenterPublic']

export const savedCentersKey = ['me', 'saved-centers'] as const

export const savedCentersQuery = queryOptions<SavedCenter[], ApiError>({
  queryKey: savedCentersKey,
  queryFn: ({ signal }) => unwrap(api.GET('/api/v1/me/saved-centers', { signal })),
})

interface Change {
  centerId: string
  save: boolean
  /** The qualification the learner was looking at, kept with the center. */
  qualificationCode: string | null
}

const CHANGE_KEY = ['saved-center'] as const

function change({ centerId, save, qualificationCode }: Change): Promise<unknown> {
  const params = { path: { center_id: centerId } }
  if (!save) return unwrap(api.DELETE('/api/v1/me/saved-centers/{center_id}', { params }))
  // Without a qualification in view, an earlier one is kept rather than cleared.
  const body = qualificationCode ? { qualification_code: qualificationCode } : {}
  return unwrap(api.PUT('/api/v1/me/saved-centers/{center_id}', { params, body }))
}

/** Removes a saved center, e.g. from My Progress. */
export function useRemoveSavedCenter() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: CHANGE_KEY,
    mutationFn: (centerId: string) => change({ centerId, save: false, qualificationCode: null }),
    onSuccess: (_, centerId) =>
      queryClient.setQueryData<SavedCenter[]>(savedCentersKey, (current) =>
        current?.filter((saved) => saved.center_id !== centerId),
      ),
  })
}

/**
 * The centers the learner saved, and a toggle for a center's bookmark. Saved ids show the change at once, while it's
 * on its way, wherever the bookmark is drawn. `qualificationCode` is the qualification in view on the page, which the
 * saved center remembers.
 */
export function useSavedCenters(qualificationCode: string | null = null) {
  const en = useCopy()
  const copy = en.training.center
  const { isSignedIn, notify } = useAuth()
  const requireAccount = useRequireAccount()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const list = useQuery({ ...savedCentersQuery, enabled: isSignedIn })

  const mutation = useMutation({
    mutationKey: CHANGE_KEY,
    mutationFn: change,
    onSuccess: (_, { save }) => {
      if (!save) return
      notify({
        tone: 'success',
        message: copy.savedNotice,
        action: {
          label: copy.viewSaved,
          onPress: () => {
            notify(null)
            void navigate(`${paths.progress}?section=centers`)
          },
        },
      })
    },
    onError: (_, { save }) =>
      notify({ tone: 'error', message: save ? copy.saveFailed : copy.unsaveFailed }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: savedCentersKey }),
  })

  // Changes still on their way, from any bookmark on the page: the last one for a center wins.
  const pending = useMutationState({
    filters: { mutationKey: CHANGE_KEY, status: 'pending' },
    select: (entry) => entry.state.variables as Change | string,
  })

  const saved = useMemo(() => {
    const ids = new Set(isSignedIn ? (list.data ?? []).map((center) => center.center_id) : [])
    for (const item of pending) {
      // A removal from My Progress carries only the id.
      if (typeof item === 'string') ids.delete(item)
      else if (item.save) ids.add(item.centerId)
      else ids.delete(item.centerId)
    }
    return [...ids]
  }, [isSignedIn, list.data, pending])

  const { mutate } = mutation
  const toggleSaved = useCallback(
    (centerId: string) => {
      // Signed out, the press is always a save: the guest saw nothing saved. Signed in, it flips what they see.
      const save = !isSignedIn || !saved.includes(centerId)
      requireAccount(() => mutate({ centerId, save, qualificationCode }), {
        tsp: !learnerAccounts(),
      })
    },
    [isSignedIn, saved, requireAccount, mutate, qualificationCode],
  )

  return { saved, toggleSaved }
}
