import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import { getCopy } from '../../i18n/copy.ts'
import type { PageKey } from '../../lib/navigation.ts'
import { buildTourSteps } from './tours.ts'
import './tour.css'

/** Start only on request: a tour explains controls without submitting forms or changing learner data. */
export function startTour(page: PageKey | undefined, onDestroyed: () => void) {
  const en = getCopy()

  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  let finished = false
  const finish = () => {
    if (finished) return
    finished = true
    onDestroyed()
  }
  const tour = driver({
    steps: buildTourSteps(page),
    animate: !reducedMotion,
    duration: 200,
    smoothScroll: false,
    allowClose: true,
    allowKeyboardControl: true,
    disableActiveInteraction: true,
    skipMissingElement: true,
    overlayClickBehavior: 'close',
    overlayColor: '#071740',
    overlayOpacity: 0.6,
    stagePadding: 6,
    stageRadius: 12,
    popoverOffset: 12,
    popoverClass: 'track-tour',
    showProgress: true,
    progressText: en.help.progress,
    nextBtnText: en.help.next,
    prevBtnText: en.help.previous,
    doneBtnText: en.help.done,
    closeBtnLabel: en.help.close,
    onPopoverRender: ({ wrapper }) => {
      wrapper.setAttribute('aria-modal', 'true')
    },
    // Driver can omit onDestroyed when closed before its first animation finishes.
    // Finalize after every exit, including rapid Escape and explicit route cleanup.
    onDestroyStarted: (_element, _step, { driver: activeTour }) => {
      activeTour.destroy()
      finish()
    },
    onDestroyed: finish,
  })
  try {
    tour.drive()
  } catch (error) {
    tour.destroy()
    finish()
    throw error
  }
  return {
    ...tour,
    destroy: () => {
      tour.destroy()
      finish()
    },
  }
}
