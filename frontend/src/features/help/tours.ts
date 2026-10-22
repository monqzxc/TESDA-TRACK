import type { DriveStep } from 'driver.js'
import { getCopy } from '../../i18n/copy.ts'
import type { PageKey } from '../../lib/navigation.ts'

type StepCopy = { readonly title: string; readonly description: string }
type Target = { selector: string; copy: StepCopy }

const target = (name: string, copy: StepCopy): Target => ({
  selector: `[data-tour="${name}"]`,
  copy,
})

function pageTargets(): Record<PageKey, readonly Target[]> {
  const copy = getCopy().help.steps
  return {
    home: [
      {
        selector: 'header a[href$="/find"], [data-home-hero] a[href$="/find"]',
        copy: copy.homeStart,
      },
      // Sections stay laid out before their scroll-reveal children become opaque.
      { selector: '#how', copy: copy.homeHow },
      { selector: '#near', copy: copy.homeNear },
      { selector: '#catalog', copy: copy.homeCatalog },
      { selector: '#start', copy: copy.homeGoal },
    ],
    finderGoal: [
      target('finder-steps', copy.finderSteps),
      target('goal-examples', copy.goalExamples),
      target('goal-input', copy.goalInput),
      target('goal-submit', copy.goalSubmit),
    ],
    finderMatches: [
      target('finder-steps', copy.finderSteps),
      target('starting-point', copy.startingPoint),
      target('matches', copy.matches),
    ],
    finderReadiness: [
      target('finder-steps', copy.finderSteps),
      target('readiness-progress', copy.readinessProgress),
      target('readiness-question', copy.readinessQuestion),
      target('readiness-actions', copy.readinessActions),
    ],
    finderPathway: [
      target('pathway-result', copy.pathwayResult),
      target('pathway-centers', copy.pathwayCenters),
      target('pathway-skills', copy.pathwaySkills),
      target('curated-pathway', copy.curatedPathway),
    ],
    qualifications: [
      target('library-filters', copy.libraryFilters),
      target('qualification-card', copy.qualificationCard),
      target('qualification-explore', copy.qualificationExplore),
    ],
    training: [
      target('training-search', copy.trainingSearch),
      target('training-location', copy.trainingLocation),
      target('training-filters', copy.trainingFilters),
      target('training-map-toggle', copy.trainingMapToggle),
      target('training-results', copy.trainingResults),
    ],
    progress: [
      target('progress-next', copy.progressNext),
      target('progress-summary', copy.progressSummary),
      target('progress-readiness', copy.progressReadiness),
      target('progress-history', copy.progressHistory),
      target('progress-goals', copy.progressGoals),
    ],
    skills: [
      target('skills-input', copy.skillsInput),
      target('skills-search', copy.skillsSearch),
      target('skills-occupations', copy.skillsOccupations),
      target('skills-qualifications', copy.skillsQualifications),
    ],
    reports: [
      { selector: '#main fieldset', copy: copy.reportPeriod },
      { selector: '#main table', copy: copy.reportTable },
    ],
    admin: [{ selector: '#main nav[aria-label="Admin sections"]', copy: copy.adminSections }],
    profile: [
      { selector: '#main section[aria-labelledby="profile-details"]', copy: copy.profileDetails },
      { selector: '#main section[aria-labelledby="profile-journey"]', copy: copy.profileJourney },
    ],
    signIn: [{ selector: '#main form', copy: copy.signInForm }],
    privacy: [
      { selector: '#main section[aria-labelledby="privacy-summary"]', copy: copy.privacySummary },
      { selector: '#main nav[aria-labelledby="privacy-contents"]', copy: copy.privacyContents },
    ],
    notFound: [],
  }
}

/** Off-screen targets remain eligible: Driver.js scrolls them into view when their step starts. */
function visibleElement(selector: string): Element | undefined {
  if (typeof document === 'undefined') return undefined
  return Array.from(document.querySelectorAll(selector)).find((element) => {
    if (!element.isConnected || element.closest('[hidden], [inert], [aria-hidden="true"]')) {
      return false
    }
    for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) {
      const style = window.getComputedStyle(ancestor)
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        style.visibility === 'collapse' ||
        style.opacity === '0'
      ) {
        return false
      }
    }
    const bounds = element.getBoundingClientRect()
    return element.getClientRects().length > 0 && bounds.width > 0 && bounds.height > 0
  })
}

function stepFor({ selector, copy: popover }: Target): DriveStep {
  return {
    // Driver.js accepts a missing result and skips it; its published callback type omits undefined.
    element: () => visibleElement(selector) as Element,
    skipMissingElement: true,
    popover: { ...popover, side: 'bottom', align: 'start' },
  }
}

/** Build a fresh tour from fixed copy and the page's currently available, visible controls. */
export function buildTourSteps(page: PageKey | undefined): DriveStep[] {
  const helpCopy = getCopy().help
  const steps: DriveStep[] = [
    {
      popover: {
        title: helpCopy.intro,
        description: `${page ? helpCopy.pages[page] : helpCopy.fallback} ${helpCopy.instructions}`,
      },
    },
  ]

  const navigation = target('navigation', helpCopy.shared.navigation)
  const mobileMenu = target('mobile-menu', helpCopy.shared.mobileMenu)
  const availableNavigation = visibleElement(navigation.selector)
    ? navigation
    : visibleElement(mobileMenu.selector)
      ? mobileMenu
      : undefined
  if (availableNavigation) steps.push(stepFor(availableNavigation))

  const targets = [
    target('account-gate', helpCopy.shared.accountGate),
    ...(page ? pageTargets()[page] : []),
  ]
  for (const entry of targets) {
    if (visibleElement(entry.selector)) steps.push(stepFor(entry))
  }

  const help = target('help', helpCopy.shared.help)
  // Keep the final guidance even if the trigger disappears during a responsive layout change.
  steps.push({
    ...(visibleElement(help.selector) ? stepFor(help) : { popover: { ...help.copy } }),
    skipMissingElement: false,
  })
  return steps
}
