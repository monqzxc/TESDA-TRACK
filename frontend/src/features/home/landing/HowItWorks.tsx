import { useCopy } from '../../../i18n/copy.ts'
import { cx } from '../../../lib/style.ts'
import { GetStartedButton } from './GetStartedButton.tsx'
import { wrap, section, kicker, sectionTitle } from './styles.ts'

export function HowItWorks() {
  const copy = useCopy().landingPage.howItWorks
  return (
    <section id="how" aria-labelledby="how-title" className={cx(section, 'bg-(--l-surface)')}>
      <div className={cx(wrap, 'flex flex-col gap-12')}>
        <p className={kicker}>{copy.kicker}</p>
        <div className="grid grid-cols-2 items-end gap-16 max-md:grid-cols-1 max-md:gap-6">
          <h2 id="how-title" className={cx(sectionTitle, 'max-w-[570px]')}>
            {copy.title}
          </h2>
          <p className="text-18 leading-[1.6] text-(--l-body)">{copy.lead}</p>
        </div>
        <ol className="grid list-none grid-cols-4 gap-8 p-0 max-lg:grid-cols-2 max-sm:grid-cols-1">
          {copy.steps.map((step, i) => (
            <li key={step.title} className="border-0 border-t-2 border-solid border-[#205fc1] pt-6">
              <span className="grid size-10 place-items-center rounded-full bg-[#e6eefb] text-14 font-medium text-[#123e80]">
                {i + 1}
              </span>
              <h3 className="mt-5 text-20 leading-[1.35] font-medium text-(--l-ink)">
                {step.title}
              </h3>
              <p className="mt-4 text-16 leading-[1.6] text-(--l-body)">{step.line}</p>
            </li>
          ))}
        </ol>
        <GetStartedButton className="self-start" />
      </div>
    </section>
  )
}
