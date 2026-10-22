import { Radio, RadioGroup } from 'react-aria-components'
import { useCopy } from '../i18n/copy.ts'
import { cx } from '../lib/style.ts'
import { useTheme, type ThemeChoice } from './ThemeProvider.tsx'

const CHOICES: readonly ThemeChoice[] = ['system', 'light', 'dark']

// A radio group: Tab reaches the selected choice, and the arrow keys move between choices and select them.
export function ThemeSwitch({ compact = false }: { compact?: boolean }) {
  const en = useCopy()

  const { choice, setChoice } = useTheme()
  return (
    <RadioGroup
      className={cx(
        'gap-0.5 rounded-full border border-border bg-surface p-[3px]',
        compact ? 'flex w-full' : 'inline-flex',
      )}
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
          className={cx(
            'inline-flex min-h-9 cursor-pointer items-center rounded-full text-14 font-semibold text-muted ' +
              'data-hovered:bg-chip data-hovered:text-navy data-selected:bg-fill data-selected:text-white ' +
              'data-focus-visible:outline-3 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus',
            compact
              ? 'min-w-0 flex-1 justify-center px-2 text-center wrap-anywhere'
              : 'px-[0.9rem]',
          )}
        >
          {en.theme[option]}
        </Radio>
      ))}
    </RadioGroup>
  )
}
