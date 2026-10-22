import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon.tsx'
import { iconNames } from '../../components/icons.ts'
import { useCopy } from '../../i18n/copy.ts'
import { cx } from '../../lib/style.ts'
import { lightAndDark } from '../../styles/tokenBlocks.ts'
import tokensCss from '../../styles/tokens.css?raw'
import { ThemeSwitch } from '../../theme/ThemeSwitch.tsx'

// A page for checking the tokens and icons by eye, at /dev/tokens. It isn't linked from anywhere.

const table = cx(
  'w-full border-collapse bg-surface',
  '[&_:is(th,td)]:border-b [&_:is(th,td)]:border-rule [&_:is(th,td)]:px-[0.6rem] [&_:is(th,td)]:py-[0.35rem] [&_:is(th,td)]:text-left [&_:is(th,td)]:align-middle',
  '[&_thead_th]:text-13 [&_thead_th]:text-muted',
)
const { light, dark } = lightAndDark(tokensCss)
const names = [...light.keys()]

// A token's sample: most are colors, --track-shadow-rgb is an "r g b" triple, and --track-map-tiles is a filter.
function sampleStyle(name: string): CSSProperties {
  if (name.endsWith('-rgb')) return { background: `rgb(var(${name}))` }
  if (name === '--track-map-tiles')
    return { background: 'var(--track-map-water)', filter: `var(${name})` }
  return { background: `var(${name})` }
}

// Sets every token to one theme's values, whatever the page's theme, so both can be seen side by side.
function themeVars(values: Map<string, string>): CSSProperties {
  return Object.fromEntries(values) as CSSProperties
}

function Swatch({ name }: { name: string }) {
  return (
    <span className="block h-6 w-10 rounded-6 border border-border" style={sampleStyle(name)} />
  )
}

function Preview({ heading, values }: { heading: string; values: Map<string, string> }) {
  return (
    <section
      className="rounded-16 border border-border bg-page p-4 text-navy"
      style={themeVars(values)}
      aria-labelledby={`preview-${heading}`}
    >
      <h3 id={`preview-${heading}`}>{heading}</h3>
      <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(2.5rem,1fr))] gap-[0.35rem] p-0">
        {names.map((name) => (
          <li key={name} title={`${name}: ${values.get(name)}`}>
            <Swatch name={name} />
          </li>
        ))}
      </ul>
      <ul className="mt-4 mb-0 grid list-none grid-cols-[repeat(auto-fill,minmax(36px,1fr))] gap-1 p-0 text-blue">
        {iconNames.map((name) => (
          <li
            key={name}
            className="flex flex-col items-center gap-[0.4rem] rounded-8 border border-border bg-tint p-[0.4rem]"
          >
            <Icon name={name} size={22} />
          </li>
        ))}
      </ul>
    </section>
  )
}

export default function TokensPage() {
  const en = useCopy()
  const copy = en.dev.tokens

  return (
    <main className="mx-auto max-w-[1100px] px-4 pt-8 pb-16 [&_code]:text-13 [&_code]:wrap-anywhere">
      <header className="mb-2 flex flex-wrap items-center justify-between gap-4">
        <h1>{copy.title}</h1>
        <ThemeSwitch />
      </header>
      <p>{copy.intro}</p>

      <section aria-labelledby="tokens-icons">
        <h2 id="tokens-icons" className="mt-8">
          {copy.icons}
        </h2>
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-3 p-0 text-blue [&_code]:text-ink">
          {iconNames.map((name) => (
            <li
              key={name}
              className="flex flex-col items-center gap-[0.4rem] rounded-12 border border-border bg-surface px-1 py-3"
            >
              <Icon name={name} size={28} />
              <code>{name}</code>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="tokens-colors">
        <h2 id="tokens-colors" className="mt-8">
          {copy.colors}
        </h2>
        <div className="overflow-x-auto">
          <table className={table}>
            <thead>
              <tr>
                <th scope="col">{copy.token}</th>
                <th scope="col">{copy.current}</th>
                <th scope="col">{copy.light}</th>
                <th scope="col">{copy.dark}</th>
              </tr>
            </thead>
            <tbody>
              {names.map((name) => (
                <tr key={name}>
                  <th scope="row">
                    <code>{name}</code>
                  </th>
                  <td>
                    <Swatch name={name} />
                  </td>
                  <td>
                    <code>{light.get(name)}</code>
                  </td>
                  <td>
                    <code>{dark.get(name)}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="tokens-both">
        <h2 id="tokens-both" className="mt-8">
          {copy.light} / {copy.dark}
        </h2>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
          <Preview heading={copy.light} values={light} />
          <Preview heading={copy.dark} values={dark} />
        </div>
      </section>
    </main>
  )
}
