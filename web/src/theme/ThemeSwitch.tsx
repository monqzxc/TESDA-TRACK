import { Radio, RadioGroup } from 'react-aria-components'
import { en } from '../copy/en.ts'
import { useTheme, type ThemeChoice } from './ThemeProvider.tsx'
import styles from './ThemeSwitch.module.css'

const CHOICES: readonly ThemeChoice[] = ['system', 'light', 'dark']

// A radio group: Tab reaches the selected choice, and the arrow keys move between choices and select them.
export function ThemeSwitch() {
  const { choice, setChoice } = useTheme()
  return (
    <RadioGroup
      className={styles.switch}
      aria-label={en.theme.label}
      orientation="horizontal"
      value={choice}
      onChange={(value) => {
        const next = CHOICES.find((option) => option === value)
        if (next) setChoice(next)
      }}
    >
      {CHOICES.map((option) => (
        <Radio key={option} value={option} className={styles.option}>
          {en.theme[option]}
        </Radio>
      ))}
    </RadioGroup>
  )
}
