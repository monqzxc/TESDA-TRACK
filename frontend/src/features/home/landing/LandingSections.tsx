import { Button } from 'react-aria-components'
import { Link } from 'react-router'
import { useAuth } from '../../../auth/useAuth.ts'
import { Icon } from '../../../components/Icon.tsx'
import type { IconName } from '../../../components/icons.ts'
import { useCopy } from '../../../i18n/copy.ts'
import { paths } from '../../../paths.ts'
import { cx } from '../../../lib/style.ts'
import { wrap, section, kicker, sectionTitle } from './styles.ts'

const ABOUT_ICONS: IconName[] = ['learn', 'award', 'briefcase']
const CARD_ICONS = [
  'guest-unlock',
  'language-globe',
  'goal-chat',
  'center-pin',
  'readiness-check',
  'qualifications-search',
]
const CARD_COLORS = [
  'bg-[#112f61] text-white',
  'bg-[#205fc1] text-white',
  'bg-[#e6eefb] text-[#163f75] dark:bg-[#1d3453] dark:text-[#c7ddff]',
  'bg-[#e3f3f0] text-[#135e55] dark:bg-[#163e36] dark:text-[#b4e8d9]',
  'bg-[#fcf1e8] text-[#79450e] dark:bg-[#3e2e20] dark:text-[#f2d0a4]',
  'border border-(--l-line) bg-(--l-surface) text-(--l-ink)',
]

export function About() {
  const pageCopy = useCopy().landingPage
  const copy = pageCopy.about
  const split = copy.title.indexOf(' We’ll')
  return (
    <section id="about" aria-labelledby="about-title" className={cx(section, 'bg-(--l-panel)')}>
      <div className={cx(wrap, 'flex flex-col gap-12')}>
        <p className={kicker}>{copy.kicker}</p>
        <h2 id="about-title" className={sectionTitle}>
          {split < 0 ? (
            copy.title
          ) : (
            <>
              <span className="text-[#5a6270] dark:text-[#a2abb8]">
                {copy.title.slice(0, split)}
              </span>
              {copy.title.slice(split)}
            </>
          )}
        </h2>
        <p className="max-w-[840px] text-18 leading-[1.6] text-(--l-body)">{copy.lead}</p>
        <ul className="m-0 list-none p-0">
          {copy.items.map((item, i) => (
            <li
              key={item.title}
              className="grid min-h-24 grid-cols-[minmax(200px,0.5fr)_minmax(0,1fr)] items-start gap-8 border-0 border-t border-solid border-(--l-line) py-7 max-sm:grid-cols-1 max-sm:gap-3"
            >
              <p className="flex items-center gap-3 text-18 font-medium text-(--l-ink)">
                <span
                  className={`grid size-10 place-items-center rounded-8 ${i === 0 ? 'bg-[#e6eefb] text-[#123e80]' : i === 1 ? 'bg-[#e3f3f0] text-[#0d7d73]' : 'bg-[#fcf1e8] text-[#a44b0e]'}`}
                >
                  <Icon name={ABOUT_ICONS[i]} size="1.25rem" />
                </span>
                {item.title}
              </p>
              <p className="text-16 leading-[1.6] text-(--l-body)">{item.line}</p>
            </li>
          ))}
        </ul>
        <Link
          to={{ pathname: paths.home, hash: '#how' }}
          className="inline-flex min-h-11 items-center gap-2 self-start text-14 font-medium text-[#123e80] no-underline hover:underline dark:text-[#a9caff]"
        >
          {copy.action}
          <Icon name="arrowRight" className="rotate-90" size="1rem" />
        </Link>
      </div>
    </section>
  )
}

export { HowItWorks } from './HowItWorks.tsx'

export function Perks() {
  const copy = useCopy().landingPage.perks
  return (
    <section
      id="benefits"
      aria-labelledby="benefits-title"
      className={cx(section, 'bg-(--l-panel)')}
    >
      <div className={cx(wrap, 'flex flex-col gap-12')}>
        <p className={kicker}>{copy.kicker}</p>
        <div className="grid grid-cols-2 items-end gap-16 max-md:grid-cols-1 max-md:gap-6">
          <h2 id="benefits-title" className={cx(sectionTitle, 'max-w-[470px]')}>
            {copy.title}
          </h2>
          <p className="text-18 leading-[1.6] text-(--l-body)">{copy.lead}</p>
        </div>
        <ul className="grid list-none grid-cols-3 gap-x-5 gap-y-12 p-0 max-lg:grid-cols-2 max-sm:grid-cols-1">
          {copy.items.map((item, i) => {
            const content = (
              <>
                <span className="mb-10 grid size-12 place-items-center rounded-12 bg-white">
                  <img
                    src={`/img/landing/${CARD_ICONS[i]}.png`}
                    alt=""
                    width={24}
                    height={24}
                    loading="lazy"
                    className="size-6 object-contain"
                  />
                </span>
                <h3 className="text-20 leading-[1.3] font-semibold text-inherit">{item.title}</h3>
                <p className="mt-4 text-16 leading-[1.6] opacity-85">{item.line}</p>
              </>
            )
            const isQualifications = i === CARD_ICONS.length - 1
            return (
              <li
                key={item.title}
                className={cx(
                  'min-h-[272px] rounded-[24px]',
                  !isQualifications && 'p-8',
                  CARD_COLORS[i],
                )}
              >
                {isQualifications ? (
                  <Link
                    to={paths.qualifications}
                    className="hover:shadow-lg block h-full rounded-[24px] p-8 text-inherit no-underline transition-shadow focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-focus"
                  >
                    {content}
                  </Link>
                ) : (
                  content
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}

export function Closing() {
  const copy = useCopy().landingPage
  const { learner, openSignIn } = useAuth()
  return (
    <section aria-labelledby="closing-title" className={cx(section, 'bg-(--l-surface)')}>
      <div className={wrap}>
        <div className="flex min-h-[221px] flex-wrap items-center justify-between gap-8 rounded-[32px] bg-[#205fc1] px-16 py-12 text-white max-sm:px-7">
          <div>
            <h2
              id="closing-title"
              className="text-[clamp(1.7rem,3.056vw,2.75rem)] leading-[1.14] font-medium tracking-[-0.025em] text-white"
            >
              {copy.closing.title}
            </h2>
            <p className="mt-4 text-18 leading-[1.6] text-white/85">{copy.closing.lead}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              to={paths.explore}
              state={{ focusSearch: true }}
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 py-3 text-14 text-[#123e80] no-underline"
            >
              {copy.hero.submit}
              <Icon name="arrowRight" size="1rem" />
            </Link>
            {!learner && (
              <Button
                onPress={() => openSignIn({ tsp: true })}
                className="min-h-11 cursor-pointer rounded-full border border-white/50 bg-transparent px-5 py-3 text-14 text-white hovered:bg-white/10"
              >
                {copy.tsp.title}
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
