import { Radio, RadioGroup } from 'react-aria-components'
import { useCopy } from '../i18n/copy.ts'
import { useTheme, type ThemeChoice } from './ThemeProvider.tsx'

const CHOICES: readonly ThemeChoice[] = ['system', 'light', 'dark']

// A radio group: Tab reaches the selected choice, and the arrow keys move between choices and select them.
export function ThemeSwitch() {
  const en = useCopy()

  const { choice, setChoice } = useTheme()
  return (
    <RadioGroup
      className="inline-flex gap-0.5 rounded-full border border-border bg-surface p-[3px]"
      aria-label={en.theme.label}
      orientation="horizontal"
      value={choice}
      onChange={(value) => {
        const next = CHOICES.find((option) => option === value)
        if (next) setChoice(next)
      }}
    >
      {CHOICES.map((option) => (
        <Radio
          key={option}
          value={option}
          className={
            'inline-flex min-h-9 cursor-pointer items-center rounded-full px-[0.9rem] text-14 font-semibold text-muted ' +
            'data-hovered:bg-chip data-hovered:text-navy data-selected:bg-fill data-selected:text-white ' +
            'data-focus-visible:outline-3 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus'
          }
        >
          {en.theme[option]}
        </Radio>
      ))}
    </RadioGroup>
  )
}
