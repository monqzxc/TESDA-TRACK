import { useId } from 'react'
import { cx } from '../lib/style.ts'
import { setLanguage, useLanguage } from './copy.ts'
import { isLanguage, languages } from './languages.ts'

export function LanguageSelector({ header = false }: { header?: boolean }) {
  const language = useLanguage()
  const id = useId()
  return (
    <div className={cx('min-w-0', header ? 'w-40 max-[431px]:w-32' : 'w-full')}>
      <label
        htmlFor={id}
        className={header ? 'sr-only' : 'mb-1 block text-14 font-semibold text-navy'}
      >
        Language / Wika
      </label>
      <select
        id={id}
        value={language}
        onChange={(event) => {
          const next = event.target.value
          if (isLanguage(next)) setLanguage(next)
        }}
        className={cx(
          'min-h-11 w-full cursor-pointer rounded-8 border px-2 py-2 text-14 font-semibold focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus',
          header
            ? 'border-white/35 bg-(--band) text-white'
            : 'border-hover-border bg-surface text-navy hovered:border-blue',
        )}
      >
        {languages.map(({ code, name }) => (
          <option key={code} value={code} lang={code}>
            {header ? name.split(' / ')[0] : name}
          </option>
        ))}
      </select>
      {!header && language !== 'en' && (
        <p className="mt-1 mb-2 text-13 leading-relaxed text-muted" lang="en">
          Translations are being expanded. Some text appears in English.
        </p>
      )}
    </div>
  )
}
