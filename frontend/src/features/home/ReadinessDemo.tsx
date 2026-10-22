import { useId } from 'react'
import { Label, Radio, RadioGroup } from 'react-aria-components'
import { useCopy } from '../../i18n/copy.ts'
import { cssVars, cx } from '../../lib/style.ts'
import { BARISTA_UNITS } from './data.ts'
import { ANSWERS, isAnswer, readinessLevel, readinessScore, type Answer } from './readiness.ts'
import { ui } from './styles.ts'

/** Where each label under the meter sits, in percent. */
const SCALE = [0, 50, 80, 100] as const

/** A chosen answer's fill: blue for yes, violet for some, grey for new. */
const CHOSEN: Record<Answer, string> = {
  yes: 'data-selected:bg-home-fill-blue',
  some: 'data-selected:bg-home-fill-violet',
  new: 'data-selected:bg-home-fill-muted',
}

interface ReadinessDemoProps {
  answers: readonly Answer[]
  onChange: (unit: number, answer: Answer) => void
}

/**
 * Stop 3's card (after classic/landing.css): a small readiness check to try, one choice per unit of competency (a
 * radio group each, so Tab moves between units and the arrow keys between answers). The score is announced as it
 * changes.
 */
export function ReadinessDemo({ answers, onChange }: ReadinessDemoProps) {
  const en = useCopy()
  const copy = en.home.how.readiness

  const labelId = useId()
  const scoreId = useId()
  const score = readinessScore(answers)
  const level = readinessLevel(score)
  return (
    <div
      className={ui.card}
      role="group"
      aria-labelledby={labelId}
      aria-describedby={scoreId}
      data-ui=""
    >
      <div className={ui.cardLabel}>
        <span id={labelId}>{copy.card}</span>
        <span>{copy.tryIt}</span>
      </div>
      <div className="mt-4 grid gap-[0.55rem]">
        {BARISTA_UNITS.map((unit, i) => (
          <RadioGroup
            key={unit.name}
            className="grid min-w-0 grid-cols-1 gap-[0.45rem] rounded-14 bg-home-panel px-[0.8rem] py-[0.7rem]"
            orientation="horizontal"
            value={answers[i]}
            onChange={(value) => {
              if (isAnswer(value)) onChange(i, value)
            }}
          >
            <Label className="text-15 leading-[1.3] font-semibold text-home-ink">{unit.name}</Label>
            {/* Three answers side by side, like a segmented control. */}
            <div className="grid grid-cols-3 gap-[3px] rounded-10 bg-home-border p-[3px]">
              {ANSWERS.map((answer) => (
                <Radio
                  key={answer}
                  value={answer}
                  className={cx(
                    'grid min-h-[34px] cursor-pointer place-items-center rounded-8 bg-home-surface px-[0.4rem] py-[0.3rem] text-center text-13 leading-[1.15] font-semibold text-home-muted [transition:background_0.2s,color_0.2s] data-selected:text-white',
                    'data-focus-visible:outline-3 data-focus-visible:outline-offset-1 data-focus-visible:outline-home-signal',
                    CHOSEN[answer],
                  )}
                >
                  {copy.answers[answer]}
                </Radio>
              ))}
            </div>
          </RadioGroup>
        ))}
      </div>
      <div className="mt-[1.4rem]">
        <output
          id={scoreId}
          className="flex items-baseline justify-between gap-4"
          aria-live="polite"
        >
          <strong className="font-display text-[1.7rem] leading-none font-extrabold text-home-ink tabular-nums">
            {Math.round(score)}%
          </strong>{' '}
          <span className="text-14 font-bold text-home-ink">{copy.levels[level]}</span>
        </output>
        {/* The meter: one flat fill to the score, with marks at the moderate and high thresholds. */}
        <div
          className="relative mt-[0.7rem] h-3 rounded-full bg-home-border"
          style={cssVars({ '--score': score })}
        >
          <i className="absolute inset-y-0 left-0 w-[calc(var(--score,0)*1%)] rounded-[inherit] bg-home-blue transition-[width] duration-500 ease-home" />
          <b
            className="absolute top-[-3px] bottom-[-3px] w-0.5 bg-home-muted opacity-45"
            style={{ left: '50%' }}
          />
          <b
            className="absolute top-[-3px] bottom-[-3px] w-0.5 bg-home-muted opacity-45"
            style={{ left: '80%' }}
          />
        </div>
        <div
          className="relative mt-[0.4rem] h-[1.1rem] text-12 text-home-muted tabular-nums"
          aria-hidden="true"
        >
          {copy.scale.map((label, i) => (
            <span
              key={label}
              className={cx(
                'absolute whitespace-nowrap',
                i === 0
                  ? ''
                  : i === copy.scale.length - 1
                    ? '-translate-x-full'
                    : '-translate-x-1/2',
              )}
              style={{ left: `${SCALE[i]}%` }}
            >
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
