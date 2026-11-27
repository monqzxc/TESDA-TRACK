import { Button } from 'react-aria-components'
import { Link } from 'react-router'
import { useAuth } from '../../../auth/useAuth.ts'
import { Icon } from '../../../components/Icon.tsx'
import type { IconName } from '../../../components/icons.ts'
import { useCopy } from '../../../i18n/copy.ts'
import { cx } from '../../../lib/style.ts'
import { paths } from '../../../paths.ts'
import { LandingInfo } from './LandingInfo.tsx'
import { kicker, landingButton, section, sectionTitle, wrap } from './styles.ts'

const ABOUT_ICONS: IconName[] = ['learn', 'award', 'briefcase']
const PERK_ICONS: IconName[] = ['sparkle', 'globe', 'chat', 'pin', 'growth', 'document']

/** What the map holds: three kinds of places, one line each, the detail behind each "i". */
export function About() {
  const copy = useCopy().landingPage.about
  return (
    <section id="about" aria-labelledby="about-title" className={cx(section, 'bg-(--l-surface)')}>
      <div className={wrap}>
        <p className={kicker}>{copy.kicker}</p>
        <h2 id="about-title" className={sectionTitle}>
          {copy.title}
        </h2>
        <ul className="mt-12 grid list-none grid-cols-3 gap-4 p-0 max-md:grid-cols-1">
          {copy.items.map((item, i) => (
            <li
              key={item.title}
              className="relative flex flex-col gap-10 rounded-[22px] border border-(--l-line) bg-(--l-page) p-6 transition-[translate,border-color] duration-200 hover:-translate-y-1 hover:border-(--l-faint) motion-reduce:transition-none motion-reduce:hover:translate-y-0 max-md:gap-5"
            >
              <div className="flex items-start justify-between">
                <span className="grid size-12 place-items-center rounded-14 bg-(--l-surface) text-(--l-ink) shadow-[0_1px_0_var(--l-line)]">
                  <Icon name={ABOUT_ICONS[i]} size="1.4rem" />
                </span>
                <LandingInfo topic={item.title} text={item.info} />
              </div>
              <div>
                <h3 className="text-[1.35rem] leading-[1.15] font-bold tracking-[-0.02em]">
                  {item.title}
                </h3>
                <p className="mt-1.5 text-15 text-(--l-muted)">{item.line}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

/** Four stops on one route: the steps sit on a dashed line, like stops on a map. */
export function HowItWorks() {
  const copy = useCopy().landingPage.howItWorks
  return (
    <section id="how" aria-labelledby="how-title" className={section}>
      <div className={wrap}>
        <p className={kicker}>{copy.kicker}</p>
        <h2 id="how-title" className={sectionTitle}>
          {copy.title}
        </h2>
        <ol className="relative mt-14 grid list-none grid-cols-4 gap-6 p-0 max-lg:grid-cols-2 max-sm:grid-cols-1">
          {/* The route through the stops, on wide screens. */}
          <span
            aria-hidden="true"
            className="absolute top-6 right-[12%] left-[12%] h-0 border-t-2 border-dashed border-(--l-faint) max-lg:hidden"
          />
          {copy.steps.map((step, i) => (
            <li
              key={step.title}
              className="relative flex flex-col items-start gap-5 max-sm:flex-row max-sm:items-center"
            >
              <span
                className={cx(
                  'relative grid size-12 flex-none place-items-center rounded-full border-2 font-display text-18 font-extrabold tabular-nums',
                  i === copy.steps.length - 1
                    ? 'border-(--l-navy) bg-(--l-navy) text-white dark:text-[#0b1630]'
                    : 'border-(--l-faint) bg-(--l-page) text-(--l-ink)',
                )}
              >
                {i + 1}
              </span>
              <div>
                <h3 className="text-[1.2rem] leading-[1.2] font-bold tracking-[-0.015em]">
                  {step.title}
                </h3>
                <p className="mt-1 text-15 text-(--l-muted)">{step.line}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

/** Six reasons, two lines each. */
export function Perks() {
  const copy = useCopy().landingPage.perks
  return (
    <section
      id="benefits"
      aria-labelledby="benefits-title"
      className={cx(section, 'bg-(--l-surface)')}
    >
      <div
        className={cx(
          wrap,
          'grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-[clamp(2rem,6vw,5rem)] max-lg:grid-cols-1',
        )}
      >
        <div>
          <p className={kicker}>{copy.kicker}</p>
          <h2 id="benefits-title" className={sectionTitle}>
            {copy.title}
          </h2>
        </div>
        <ul className="grid list-none grid-cols-2 gap-x-8 gap-y-9 p-0 max-sm:grid-cols-1">
          {copy.items.map((item, i) => (
            <li key={item.title} className="flex items-start gap-4 border-t border-(--l-line) pt-5">
              <Icon
                name={PERK_ICONS[i]}
                size="1.35rem"
                className="mt-0.5 flex-none text-(--l-ink)"
              />
              <div>
                <h3 className="text-17 leading-[1.25] font-bold">{item.title}</h3>
                <p className="mt-1 text-15 text-(--l-muted)">{item.line}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

/** The way out: Find my path opens the Career Map; Sign in with TSP opens TSP's sign-in. */
export function Closing() {
  const copy = useCopy().landingPage
  const { learner, openSignIn } = useAuth()
  return (
    <section aria-labelledby="closing-title" className="pb-[clamp(4rem,9vw,7.5rem)]">
      <div className={wrap}>
        <div className="relative overflow-hidden rounded-[32px] border border-(--l-line) bg-(--l-panel) px-[clamp(1.5rem,5vw,4rem)] py-[clamp(2.5rem,6vw,4.5rem)]">
          {/* The route motif once more, faint, behind the words. */}
          <svg
            aria-hidden="true"
            viewBox="0 0 400 200"
            className="absolute -right-10 -bottom-10 w-[28rem] max-w-[70%] text-(--l-faint) opacity-60"
          >
            <path
              d="M10 180 C 120 170, 140 60, 250 70 S 360 20, 390 10"
              fill="none"
              stroke="currentColor"
              strokeWidth={3}
              strokeLinecap="round"
              className="landing-route"
            />
            <circle cx={390} cy={10} r={8} fill="currentColor" />
          </svg>
          <div className="relative flex flex-wrap items-end justify-between gap-8">
            <div>
              <h2
                id="closing-title"
                className="text-[clamp(1.9rem,1.3rem+2.2vw,3rem)] leading-[1.05] font-extrabold tracking-[-0.035em]"
              >
                {copy.closing.title}
              </h2>
              <p className="mt-3 text-[1.1rem] text-(--l-body)">{copy.closing.lead}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                to={paths.explore}
                state={{ focusSearch: true }}
                className={landingButton('solid')}
              >
                {copy.hero.submit}
                <Icon
                  name="arrowRight"
                  size="1.1rem"
                  className="transition-[translate] duration-200 group-hovered:translate-x-0.5"
                />
              </Link>
              {!learner && (
                <Button
                  onPress={() => openSignIn({ tsp: true })}
                  className={landingButton('quiet')}
                >
                  {copy.tsp.title}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
