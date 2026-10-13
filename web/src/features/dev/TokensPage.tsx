import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon.tsx'
import { iconNames } from '../../components/icons.ts'
import { en } from '../../copy/en.ts'
import { lightAndDark } from '../../styles/tokenBlocks.ts'
import tokensCss from '../../styles/tokens.css?raw'
import { ThemeSwitch } from '../../theme/ThemeSwitch.tsx'
import styles from './TokensPage.module.css'

// A page for checking the tokens and icons by eye, at /dev/tokens. It isn't linked from anywhere.

const copy = en.dev.tokens
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
  return <span className={styles.swatch} style={sampleStyle(name)} />
}

function Preview({ heading, values }: { heading: string; values: Map<string, string> }) {
  return (
    <section
      className={styles.preview}
      style={themeVars(values)}
      aria-labelledby={`preview-${heading}`}
    >
      <h3 id={`preview-${heading}`}>{heading}</h3>
      <ul className={styles.swatches}>
        {names.map((name) => (
          <li key={name} title={`${name}: ${values.get(name)}`}>
            <Swatch name={name} />
          </li>
        ))}
      </ul>
      <ul className={`${styles.icons} ${styles.iconsCompact}`}>
        {iconNames.map((name) => (
          <li key={name}>
            <Icon name={name} size={22} />
          </li>
        ))}
      </ul>
    </section>
  )
}

export default function TokensPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>{copy.title}</h1>
        <ThemeSwitch />
      </header>
      <p>{copy.intro}</p>

      <section aria-labelledby="tokens-icons">
        <h2 id="tokens-icons">{copy.icons}</h2>
        <ul className={styles.icons}>
          {iconNames.map((name) => (
            <li key={name}>
              <Icon name={name} size={28} />
              <code>{name}</code>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="tokens-colors">
        <h2 id="tokens-colors">{copy.colors}</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
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
        <h2 id="tokens-both">
          {copy.light} / {copy.dark}
        </h2>
        <div className={styles.previews}>
          <Preview heading={copy.light} values={light} />
          <Preview heading={copy.dark} values={dark} />
        </div>
      </section>
    </main>
  )
}
