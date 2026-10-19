import styles from './PageHero.module.css'

// The soft illustrations on the pages' banners (classic/presentation.py PAGE_ART and LEAVES), 260 x 150 units.
// They're decoration: hidden from screen readers. The blob behind each one follows the theme; the rest keeps the
// colors it's drawn in.

export type PageArtName = 'books' | 'chart' | 'network'

function Leaves({ transform }: { transform: string }) {
  return (
    <g transform={transform}>
      <path d="M70 120C44 86 46 44 74 16c19 32 17 72-4 104Z" fill="#5bb8a6" />
      <path d="M78 124c4-42 30-72 70-80-5 38-30 68-70 80Z" fill="#8fd0b5" />
      <path d="M62 126C25 112 4 82 4 44c35 10 57 42 58 82Z" fill="#a8c8f6" />
      <path d="M70 120c0-30 3-62 4-104" stroke="#3f9887" strokeWidth="2" />
    </g>
  )
}

function Books() {
  return (
    <>
      <ellipse className={styles.blob} cx="150" cy="92" rx="112" ry="54" />
      <Leaves transform="translate(0 22) scale(.82)" />
      <rect x="62" y="104" width="172" height="28" rx="5" fill="#24418f" />
      <rect x="216" y="108" width="14" height="20" rx="2" fill="#f3f6fc" />
      <rect x="76" y="78" width="150" height="26" rx="5" fill="#f39b3a" />
      <rect x="208" y="82" width="14" height="18" rx="2" fill="#fff6ea" />
      <rect x="68" y="54" width="160" height="24" rx="5" fill="#3b7be6" />
      <rect x="210" y="58" width="14" height="16" rx="2" fill="#eef4ff" />
      <rect x="84" y="64" width="54" height="4" rx="2" fill="#a9c8fb" />
      <rect x="94" y="89" width="44" height="4" rx="2" fill="#fbd3a2" />
      <path d="M88 34 148 12l60 22-60 22Z" fill="#1f3f8f" />
      <path d="M114 44v12c0 10 68 10 68 0V44l-34 12Z" fill="#17327a" />
      <path d="M148 34h42v24" stroke="#f5b83d" strokeWidth="3" />
      <circle cx="190" cy="61" r="4.5" fill="#f5b83d" />
    </>
  )
}

function Chart() {
  return (
    <>
      <ellipse className={styles.blob} cx="150" cy="88" rx="112" ry="56" />
      <Leaves transform="translate(-6 24) scale(.8)" />
      <rect x="80" y="30" width="150" height="104" rx="14" fill="#d6e3fa" />
      <rect x="74" y="24" width="150" height="104" rx="14" fill="#fff" />
      <rect x="96" y="84" width="16" height="28" rx="3" fill="#bcd2fb" />
      <rect x="122" y="70" width="16" height="42" rx="3" fill="#8fb3f6" />
      <rect x="148" y="56" width="16" height="56" rx="3" fill="#5d8ff0" />
      <rect x="174" y="40" width="16" height="72" rx="3" fill="#2f6fe0" />
      <path d="M98 72 128 58l26-12 30-12" stroke="#0d9488" strokeWidth="3" />
      <path d="M174 32h11v11" stroke="#0d9488" strokeWidth="3" />
      <g transform="translate(226 112)">
        <path d="M-9 6-13 30l13-7 13 7-4-24Z" fill="#2f63d8" />
        <circle r="16" fill="#f5b83d" />
        <circle r="11" fill="#ffd36b" />
        <path d="m0-6 2 4 4.4.6-3.2 3.1.8 4.4L0 4-4 6.1l.8-4.4L-6.4-1.4l4.4-.6Z" fill="#e08f12" />
      </g>
    </>
  )
}

function Network() {
  return (
    <>
      <ellipse className={styles.blob} cx="140" cy="84" rx="116" ry="58" />
      <g stroke="#a9c3f3" strokeWidth="2.5" strokeDasharray="2 7">
        <path d="M138 76 66 40M138 76l74-44M138 76l80 40M138 76l-78 42M138 76V20" />
      </g>
      <circle cx="66" cy="40" r="15" fill="#7b61d6" />
      <circle cx="212" cy="32" r="17" fill="#0d9488" />
      <circle cx="218" cy="116" r="14" fill="#f5b83d" />
      <circle cx="60" cy="118" r="16" fill="#e0607a" />
      <circle cx="138" cy="20" r="11" fill="#5d8ff0" />
      <circle cx="138" cy="76" r="30" fill="#2f63d8" />
      <circle cx="138" cy="76" r="20" stroke="#fff" strokeWidth="3" />
      <path d="m147 67-5 13-13 5 5-13Z" fill="#fff" />
      <path
        d="m60 40 4 4 7-8M206 32l4 4 7-8M212 116l4 4 7-8M54 118l4 4 7-8"
        stroke="#fff"
        strokeWidth="2.6"
      />
    </>
  )
}

const ART = { books: Books, chart: Chart, network: Network }

export function PageArt({ name }: { name: PageArtName }) {
  const Art = ART[name]
  return (
    <svg
      viewBox="0 0 260 150"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <Art />
    </svg>
  )
}
