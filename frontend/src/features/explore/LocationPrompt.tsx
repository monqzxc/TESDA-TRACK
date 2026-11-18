import { useEffect, useState } from 'react'
import { Button } from 'react-aria-components'
import { ModalDialog } from '../../components/ModalDialog.tsx'
import { useCopy } from '../../i18n/copy.ts'
import { cx } from '../../lib/style.ts'
import { button } from '../../styles/buttons.ts'
import { useTrainingStore } from '../training/state.ts'

const ASKED_KEY = 'track.explore.locationAsked'

function lastAnswer(): string | null {
  try {
    return localStorage.getItem(ASKED_KEY)
  } catch {
    return null
  }
}

function remember(answer: 'yes' | 'no') {
  try {
    localStorage.setItem(ASKED_KEY, answer)
  } catch {
    // Private mode: the question may come back next visit, which is harmless.
  }
}

/** The browser's standing answer for this site, or null where it can't say (older Safari). */
async function permissionState(): Promise<PermissionState | null> {
  try {
    const status = await navigator.permissions?.query({ name: 'geolocation' })
    return status?.state ?? null
  } catch {
    return null
  }
}

/**
 * On every visit to /explore, the location switch starts on when the browser already allows it: the location is
 * looked up straight away, with no question. When it isn't allowed yet, asks "Open Location?"; Yes turns the switch
 * on (and the browser asks for permission), No leaves it off for this visit. A browser that has blocked the site
 * isn't asked: the switch explains that when pressed.
 *
 * `waiting`: a signed-in learner's TSP profile is still loading, so nothing happens until it's known. `skip`: the
 * profile gives a home area, which is used as the search location instead (US-0004): no question and no device
 * lookup; nothing is remembered, so a guest on the same browser is still asked.
 */
export function LocationPrompt({
  waiting = false,
  skip = false,
}: {
  waiting?: boolean
  skip?: boolean
}) {
  const copy = useCopy().explore.locationPrompt
  const [isOpen, setOpen] = useState(false)

  useEffect(() => {
    if (waiting || skip) return
    let cancelled = false
    const { useLocation, location } = useTrainingStore.getState()
    if (useLocation || location || !('geolocation' in navigator)) return
    void permissionState().then((state) => {
      if (cancelled || useTrainingStore.getState().useLocation) return
      // Granted, or a browser that can't report it but was told yes last time: turn it on without asking.
      if (state === 'granted' || (state === null && lastAnswer() === 'yes')) {
        useTrainingStore.getState().locate({ quietly: true })
      } else if (state !== 'denied') {
        setOpen(true)
      }
    })
    return () => {
      cancelled = true
    }
  }, [waiting, skip])

  const answer = (yes: boolean) => {
    remember(yes ? 'yes' : 'no')
    setOpen(false)
    if (yes) useTrainingStore.getState().setUseLocation(true)
  }
  return (
    <ModalDialog
      isOpen={isOpen && !waiting && !skip}
      onOpenChange={(open) => {
        if (!open) answer(false)
      }}
      title={copy.title}
      closeLabel={copy.close}
    >
      <p className="mt-0 mb-[1.4rem] leading-[1.55] text-ink">{copy.body}</p>
      <div className="flex flex-wrap justify-end gap-[0.6rem] max-xs:flex-col-reverse">
        <Button className={cx(button())} onPress={() => answer(false)}>
          {copy.no}
        </Button>
        <Button className={cx(button({ variant: 'primary' }))} onPress={() => answer(true)}>
          {copy.yes}
        </Button>
      </div>
    </ModalDialog>
  )
}
