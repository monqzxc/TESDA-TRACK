import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { onSignInRequired } from '../api/client.ts'
import { LoadBoundary } from '../components/LoadBoundary.tsx'
import { useCopy } from '../i18n/copy.ts'
import { FINDER_KEY } from '../features/finder/key.ts'
import { focusedElement, returnFocus } from '../lib/focus.ts'
import { navigationTarget } from '../lib/navigation.ts'
import { reloadPage } from '../lib/reload.ts'
import { readItem, removeItem, writeItem } from '../lib/storage.ts'
import { learnerAccounts } from './accounts.ts'
import { AccountNotice } from './AccountNotice.tsx'
import {
  accountQueryKeys,
  newSessionHint,
  requestAccountDeletion,
  requestRegistration,
  requestSignIn,
  requestSignOut,
  SESSION_HINT_KEY,
  sessionKey,
  sessionQuery,
  SignInAfterRegistrationError,
  type Learner,
  type Registration,
} from './session.ts'
import type { SignInRequest } from './SignInDialog.tsx'
import {
  AuthContext,
  loadSignInDialog,
  type Auth,
  type Notice,
  type OpenSignInOptions,
} from './useAuth.ts'

const SignInDialog = lazy(() =>
  loadSignInDialog().then((module) => ({ default: module.SignInDialog })),
)

/**
 * Clears the finder's work. Its store's code is only needed here once someone signs out, so it comes down then.
 * Its storage is cleared first and directly: if that code can't be downloaded, it wasn't on the page, so storage is
 * all there was.
 */
async function clearFinderWork() {
  try {
    window.sessionStorage.removeItem(FINDER_KEY)
  } catch {
    // Nothing saved to remove.
  }
  try {
    const { useFinderStore } = await import('../features/finder/store.ts')
    useFinderStore.getState().reset()
  } catch {
    // Offline: see above.
  }
}

/** Removes every query holding the account's data. Removing a query also cancels its request. */
function removeAccountData(queryClient: QueryClient) {
  for (const queryKey of accountQueryKeys) queryClient.removeQueries({ queryKey })
}

/** Sets who is signed in. A session check still in flight is cancelled first, so it can't overwrite this. */
async function setSession(queryClient: QueryClient, learner: Learner | null) {
  await queryClient.cancelQueries({ queryKey: sessionKey })
  queryClient.setQueryData(sessionKey, learner)
}

interface AfterClose {
  /** Closed by signing in: wait until the page shows the learner, which takes away the "Sign in" buttons. */
  signedIn: boolean
  returnFocus?: () => HTMLElement | null | undefined
  action?: () => void
}

/**
 * Who is signed in, and the account actions, for the whole app (useAuth). It also draws the sign-in dialog and the
 * account notices.
 *
 * - The session comes from GET /api/v1/me, asked only when this browser has signed in before (SESSION_HINT_KEY).
 *   A 401 there means signed out.
 * - Signing out (and deleting the account) clears the account's queries and the finder's work, as the Streamlit
 *   app does: personal results go before another learner uses the browser (US-02).
 * - A 401 from any other request while signed in means the session ended: the account's queries are cleared, the
 *   finder's work is kept (it belongs to this browser session), and the sign-in dialog opens to say so.
 * - Signing in or out in another tab changes the cookie this tab uses too: this tab follows (see below).
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const en = useCopy()
  const DIALOG_FAILED = useMemo<Notice>(
    () => ({
      tone: 'error',
      message: en.account.unavailable.signIn,
      action: { label: en.account.unavailable.retry, onPress: reloadPage },
    }),
    [en],
  )

  const queryClient = useQueryClient()
  // Read once: afterwards, signing in and out set the session directly.
  const [mayBeSignedIn] = useState(() => readItem(SESSION_HINT_KEY) !== null)
  const session = useQuery({ ...sessionQuery, enabled: mayBeSignedIn })
  const learner = session.data ?? null

  const [request, setRequest] = useState<SignInRequest | null>(null)
  // The dialog's code comes down the first time it opens, and it stays on the page from then on.
  const [dialogUsed, setDialogUsed] = useState(false)
  // Its code couldn't be downloaded: it can't open again until the app is reloaded.
  const dialogFailed = useRef(false)
  // Which opening of the dialog is on screen (SignInRequest.id), and how many there have been.
  const openRequest = useRef<number | null>(null)
  const requestCount = useRef(0)
  const afterClose = useRef<AfterClose | null>(null)
  const dialog = useRef<HTMLElement>(null)
  const [notice, setNotice] = useState<Notice | null>(null)

  const startSession = useCallback(
    async (signedIn: Learner) => {
      // Nothing from an earlier account carries over.
      removeAccountData(queryClient)
      await setSession(queryClient, signedIn)
      writeItem(SESSION_HINT_KEY, newSessionHint())
    },
    [queryClient],
  )

  const endSession = useCallback(
    async ({ keepFinder }: { keepFinder: boolean }) => {
      removeItem(SESSION_HINT_KEY)
      removeAccountData(queryClient)
      await setSession(queryClient, null)
      if (!keepFinder) await clearFinderWork()
    },
    [queryClient],
  )

  const openSignIn = useCallback(
    (options: OpenSignInOptions = {}) => {
      if (dialogFailed.current) {
        setNotice(DIALOG_FAILED)
        return
      }
      const opener = focusedElement()
      const id = ++requestCount.current
      openRequest.current = id
      // Anything still waiting on an earlier dialog was dropped when this one opened.
      afterClose.current = null
      setDialogUsed(true)
      setRequest({
        id,
        view: options.view ?? 'signIn',
        message: options.message,
        onSignedIn: options.onSignedIn,
        // Signing in can take the opener away (a "Sign in or create an account" button): then the page's heading.
        returnFocus:
          options.returnFocus ?? (() => (opener?.isConnected ? opener : navigationTarget())),
      })
    },
    [DIALOG_FAILED],
  )

  const closeSignIn = useCallback((closed: SignInRequest, { signedIn }: { signedIn: boolean }) => {
    // A sign-in can finish after its dialog was closed (or replaced): the learner is signed in, but whatever waited
    // on that dialog was dropped when it closed, and the dialog on screen now isn't this one.
    if (closed.id !== openRequest.current) return
    openRequest.current = null
    afterClose.current = {
      signedIn,
      returnFocus: closed.returnFocus,
      action: signedIn ? closed.onSignedIn : undefined,
    }
    setRequest(null)
  }, [])

  // The dialog's code couldn't be downloaded: say so, with a way to reload. What waited on it is dropped.
  const onDialogFailed = useCallback(() => {
    dialogFailed.current = true
    openRequest.current = null
    afterClose.current = null
    setRequest(null)
    setNotice(DIALOG_FAILED)
  }, [DIALOG_FAILED])

  // Once the dialog has closed, and after a sign-in once the page shows the learner (the query tells React a moment
  // after the dialog closes, and that swaps "Sign in" for the account menu): focus back where the learner was, then
  // the action that waited for the sign-in, so anything it opens returns focus there too.
  useEffect(() => {
    const pending = afterClose.current
    if (request || !pending || (pending.signedIn && !learner)) return
    afterClose.current = null
    returnFocus(pending.returnFocus?.(), dialog.current)
    pending.action?.()
  }, [request, learner])

  // A request refused for want of a sign-in, while the app thinks the learner is signed in: the session ended.
  useEffect(
    () =>
      onSignInRequired(() => {
        if (!queryClient.getQueryData<Learner | null>(sessionKey)) return
        void endSession({ keepFinder: true })
        openSignIn({ message: en.account.expired })
      }),
    [queryClient, endSession, openSignIn, en.account.expired],
  )

  // Another tab signed in or out (its hint changed), and the tabs share the cookie: whoever this tab showed may not
  // be signed in any more. Nothing of that account stays, and this tab asks the API who is signed in now, or knows
  // it's nobody when the hint went. The finder's work stays: it's this tab's, and a hint goes the same way when a
  // session expires as when someone signs out.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      // A null key: another tab cleared the whole of localStorage.
      if (event.key !== SESSION_HINT_KEY && event.key !== null) return
      removeAccountData(queryClient)
      if (readItem(SESSION_HINT_KEY) === null) {
        void setSession(queryClient, null)
        return
      }
      // Back to "checking" while it asks. The reset refetches if this tab already asks for the session; if it
      // didn't (it was never signed in), fetchQuery asks. Either way, one request.
      void queryClient.resetQueries({ queryKey: sessionKey })
      queryClient.fetchQuery(sessionQuery).catch(() => undefined)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [queryClient])

  const signIn = useCallback(
    async (email: string, password: string) => {
      const signedIn = await requestSignIn(email, password)
      await startSession(signedIn)
      return signedIn
    },
    [startSession],
  )

  const register = useCallback(
    async (details: Registration) => {
      await requestRegistration(details)
      try {
        return await signIn(details.email, details.password)
      } catch (error) {
        throw new SignInAfterRegistrationError(error)
      }
    },
    [signIn],
  )

  const signOut = useCallback(async () => {
    // Only once the API has cleared the cookie: otherwise the browser would still be signed in after a reload.
    await requestSignOut()
    setNotice(null)
    await endSession({ keepFinder: false })
  }, [endSession])

  const deleteAccount = useCallback(async () => {
    await requestAccountDeletion()
    // The cookie names an account that's gone. If clearing it fails, the API refuses it on the next request anyway.
    await requestSignOut().catch(() => undefined)
    await endSession({ keepFinder: false })
    setNotice({ tone: 'success', message: en.account.deleted })
  }, [endSession, en.account.deleted])

  const auth = useMemo<Auth>(() => {
    const held = learner?.permissions ?? []
    const can = (permission: string) => held.includes(permission)
    return {
      learner,
      isSignedIn: learner !== null,
      offersAccounts: learner !== null || learnerAccounts(),
      isAdmin: learner?.role === 'admin',
      can,
      canViewReports: can('reports:read'),
      // The sections of the admin workspace between them need one of these three.
      canOpenAdmin: ['users:manage', 'mcp:manage', 'reports:read'].some(can),
      isChecking: session.isLoading,
      signIn,
      register,
      signOut,
      deleteAccount,
      openSignIn,
      notify: setNotice,
    }
  }, [learner, session.isLoading, signIn, register, signOut, deleteAccount, openSignIn])

  return (
    <AuthContext.Provider value={auth}>
      {children}
      {dialogUsed && (
        // Outside the router, so no route's error boundary would catch a failed download: this one does.
        <LoadBoundary fallback={null} onError={onDialogFailed}>
          <Suspense fallback={null}>
            <SignInDialog
              dialogRef={dialog}
              request={request}
              onChange={setRequest}
              onClose={() => {
                if (request) closeSignIn(request, { signedIn: false })
              }}
              onSignedIn={(signedInFrom) => closeSignIn(signedInFrom, { signedIn: true })}
            />
          </Suspense>
        </LoadBoundary>
      )}
      <AccountNotice notice={notice} onDismiss={() => setNotice(null)} />
    </AuthContext.Provider>
  )
}
