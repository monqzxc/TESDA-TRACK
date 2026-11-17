import { useState } from 'react'
import { Button } from 'react-aria-components'
import { ModalDialog } from '../../components/ModalDialog.tsx'
import { useCopy } from '../../i18n/copy.ts'
import { cx } from '../../lib/style.ts'
import { button } from '../../styles/buttons.ts'
import { useTrainingStore } from '../training/state.ts'

const ASKED_KEY = 'track.explore.locationAsked'

function wasAsked(): boolean {
  try {
    return localStorage.getItem(ASKED_KEY) !== null
  } catch {
    return false
  }
}

function markAsked(answer: 'yes' | 'no') {
  try {
    localStorage.setItem(ASKED_KEY, answer)
  } catch {
    // Private mode: the question may come back next visit, which is harmless.
  }
}

/**
 * `waiting`: a signed-in learner's TSP profile is still loading, so it isn't known yet whether to ask. `skip`: the
 * profile gives a home area, which is used as the search location without asking (US-0004); nothing is remembered,
 * so a guest on the same browser is still asked.
 *
 * On a first visit to /explore with no location set, asks "Open Location?" once. Yes turns the location switch on;
 * No leaves it off. Either way the answer is remembered, so the learner isn't asked again and never has to flip the
 * switch just to use the search box.
 */
export function LocationPrompt({
  waiting = false,
  skip = false,
}: {
  waiting?: boolean
  skip?: boolean
}) {
  const copy = useCopy().explore.locationPrompt
  const [isOpen, setOpen] = useState(() => {
    const { useLocation, location } = useTrainingStore.getState()
    return !wasAsked() && !useLocation && !location
  })
  const answer = (yes: boolean) => {
    markAsked(yes ? 'yes' : 'no')
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
