import { useId } from 'react'
import { Label, Radio, RadioGroup } from 'react-aria-components'
import { en } from '../../copy/en.ts'
import { BARISTA_UNITS } from './data.ts'
import { ANSWERS, isAnswer, readinessLevel, readinessScore, type Answer } from './readiness.ts'
import { cssVars, cx } from './style.ts'
import shared from './shared.module.css'
import styles from './ReadinessDemo.module.css'

const copy = en.home.how.readiness

/** Where each label under the meter sits, in percent. */
const SCALE = [0, 50, 80, 100] as const

interface ReadinessDemoProps {
  answers: readonly Answer[]
  onChange: (unit: number, answer: Answer) => void
}

/**
 * Stop 3's card: a small readiness check to try, one choice per unit of competency (a radio group each, so Tab
 * moves between units and the arrow keys between answers). The score is announced as it changes.
 */
export function ReadinessDemo({ answers, onChange }: ReadinessDemoProps) {
  const labelId = useId()
  const scoreId = useId()
  const score = readinessScore(answers)
  const level = readinessLevel(score)
  return (
    <div className={shared.card} role="group" aria-labelledby={labelId} aria-describedby={scoreId}>
      <div className={shared.cardLabel}>
        <span id={labelId}>{copy.card}</span>
        <span>{copy.tryIt}</span>
      </div>
      <div className={styles.units}>
        {BARISTA_UNITS.map((unit, i) => (
          <RadioGroup
            key={unit.name}
            className={styles.unit}
            orientation="horizontal"
            value={answers[i]}
            onChange={(value) => {
              if (isAnswer(value)) onChange(i, value)
            }}
          >
            <Label className={styles.unitName}>{unit.name}</Label>
            <div className={styles.choices}>
              {ANSWERS.map((answer) => (
                <Radio key={answer} value={answer} className={cx(styles.choice, styles[answer])}>
                  {copy.answers[answer]}
                </Radio>
              ))}
            </div>
          </RadioGroup>
        ))}
      </div>
      <div className={styles.meter}>
        <output id={scoreId} className={styles.result} aria-live="polite">
          <strong>{Math.round(score)}%</strong> <span>{copy.levels[level]}</span>
        </output>
        <div className={styles.bar} style={cssVars({ '--score': score })}>
          <i />
          <b style={{ left: '50%' }} />
          <b style={{ left: '80%' }} />
        </div>
        <div className={styles.scale} aria-hidden="true">
          {copy.scale.map((label, i) => (
            <span key={label} style={{ left: `${SCALE[i]}%` }}>
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
