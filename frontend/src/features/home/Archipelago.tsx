import { useCopy } from '../../i18n/copy.ts'
import { Reveal } from './Reveal.tsx'

// With the app's base, so the picture loads wherever the app is served (at / on its own, or under /beta/).
const MAP_SRC = `${import.meta.env.BASE_URL}img/near-you-map.svg`

/**
 * The map in "Near you": a small, self-contained SVG illustration (public/img/near-you-map.svg), described by its
 * label. Its ping animation respects reduced motion. On narrow screens it goes under the text.
 */
export function Archipelago() {
  const en = useCopy()
  const copy = en.home.near

  return (
    <Reveal
      from="zoom"
      className="relative w-full max-w-[500px] justify-self-center max-lg:order-2 max-lg:max-w-[420px]"
    >
      <img
        src={MAP_SRC}
        width="600"
        height="640"
        loading="lazy"
        decoding="async"
        alt={copy.mapLabel}
        className="block h-auto w-full"
      />
      <p className="mt-3 text-center text-home-xs text-home-band-body">{copy.mapCaption}</p>
    </Reveal>
  )
}
