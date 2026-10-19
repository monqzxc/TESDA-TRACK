import { useId } from 'react'

// The finder's pictures (frontend/presentation.py JOURNEY_SCENE, PERSON and LEAVES). They're decoration: hidden
// from screen readers. Each keeps the colors it's drawn in, in both themes, as in the Streamlit app.

/**
 * A learner in a hoodie, on an 80-unit grid. Its clip path's id is unique, as every SVG on a page shares ids, and
 * holds only letters, digits, - and _, so url(#...) needs no escaping.
 */
export function Person() {
  const clip = `face${useId().replace(/[^\w-]/g, '')}`
  return (
    <>
      <clipPath id={clip}>
        <circle cx="40" cy="40" r="40" />
      </clipPath>
      <circle cx="40" cy="40" r="40" fill="#dce8fd" />
      <g clipPath={`url(#${clip})`}>
        <path d="M12 84c1-17 13-26 28-26s27 9 28 26Z" fill="#3a6ad4" />
        <path d="M30 60c3 6 17 6 20 0" stroke="#2a52ad" strokeWidth="3" />
        <rect x="34" y="47" width="12" height="12" rx="5" fill="#eebd98" />
        <ellipse cx="40" cy="37" rx="12.5" ry="14" fill="#f6cfae" />
        <path
          d="M27 36c-2-12 5-19 14-19 10 0 15 7 13 18-2-4-6-8-11-8-4 3-10 5-16 9Z"
          fill="#1f2b55"
        />
        <circle cx="35.5" cy="39" r="1.5" fill="#1f2b55" />
        <circle cx="44.5" cy="39" r="1.5" fill="#1f2b55" />
        <path
          d="M36.5 45c2 1.6 5 1.6 7 0"
          stroke="#c0604f"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </g>
    </>
  )
}

/** The learner on their own, for the goal summary. */
export function Avatar({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 80" className={className} aria-hidden="true" focusable="false">
      <Person />
    </svg>
  )
}

function Leaves() {
  return (
    <>
      <path d="M70 120C44 86 46 44 74 16c19 32 17 72-4 104Z" fill="#5bb8a6" />
      <path d="M78 124c4-42 30-72 70-80-5 38-30 68-70 80Z" fill="#8fd0b5" />
      <path d="M62 126C25 112 4 82 4 44c35 10 57 42 58 82Z" fill="#a8c8f6" />
      <path d="M70 120c0-30 3-62 4-104" stroke="#3f9887" strokeWidth="2" />
    </>
  )
}

/** The banner's scene: a city, a graduation cap, a route card, a chart and a learner ticking off steps. */
export function JourneyScene({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1000 300"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      preserveAspectRatio="xMaxYMin slice"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <ellipse cx="860" cy="150" rx="210" ry="190" fill="#dbe7ff" opacity=".7" />
      <circle cx="470" cy="80" r="100" fill="#e6efff" opacity=".9" />
      <g fill="#d2e0f8">
        <rect x="600" y="168" width="46" height="132" rx="4" />
        <rect x="652" y="128" width="38" height="172" rx="4" />
        <rect x="696" y="186" width="54" height="114" rx="4" />
        <rect x="760" y="150" width="34" height="150" rx="4" />
        <rect x="946" y="160" width="40" height="140" rx="4" />
      </g>
      <g fill="#e6eefb">
        <rect x="566" y="206" width="40" height="94" rx="4" />
        <rect x="904" y="196" width="44" height="104" rx="4" />
      </g>
      <g fill="#fff" opacity=".7">
        <rect x="662" y="142" width="7" height="9" rx="1.5" />
        <rect x="675" y="142" width="7" height="9" rx="1.5" />
        <rect x="662" y="160" width="7" height="9" rx="1.5" />
        <rect x="675" y="160" width="7" height="9" rx="1.5" />
        <rect x="770" y="164" width="6" height="8" rx="1.5" />
        <rect x="780" y="164" width="6" height="8" rx="1.5" />
      </g>
      <g transform="translate(170 18)">
        <Leaves />
      </g>
      {/* The graduation cap. */}
      <g transform="translate(372 30)">
        <path d="M0 40 66 14l66 26-66 26Z" fill="#2f63d8" />
        <path d="M26 51v22c0 13 80 13 80 0V51L66 66Z" fill="#1d47a8" />
        <path d="M66 40h46v32" stroke="#f5b83d" strokeWidth="3.5" />
        <circle cx="112" cy="76" r="5.5" fill="#f5b83d" />
      </g>
      {/* A route card with its pin. */}
      <g transform="rotate(-6 614 82)">
        <rect
          x="548"
          y="30"
          width="132"
          height="104"
          rx="16"
          fill="#cfe0fc"
          stroke="#fff"
          strokeWidth="3"
        />
        <path
          d="M572 112c16-4 20-28 38-28s20 20 42-8"
          stroke="#2f63d8"
          strokeWidth="3.5"
          strokeDasharray="1 8"
        />
        <circle cx="572" cy="112" r="6" fill="#2f63d8" />
      </g>
      <path d="M658 86c-14-14-22-26-22-38a22 22 0 0 1 44 0c0 12-8 24-22 38Z" fill="#ef5b5b" />
      <circle cx="658" cy="48" r="8" fill="#fff" />
      {/* A progress chart card. */}
      <g transform="rotate(7 760 66)">
        <rect
          x="712"
          y="24"
          width="100"
          height="84"
          rx="14"
          fill="#dbe7fd"
          stroke="#fff"
          strokeWidth="3"
        />
        <rect x="728" y="74" width="13" height="20" rx="3" fill="#a9c5f7" />
        <rect x="746" y="60" width="13" height="34" rx="3" fill="#7fa7f2" />
        <rect x="764" y="50" width="13" height="44" rx="3" fill="#5a8cec" />
        <rect x="782" y="38" width="13" height="56" rx="3" fill="#2f63d8" />
      </g>
      {/* A learner's profile card, ticking off steps. */}
      <g transform="rotate(-4 906 158)">
        <rect x="826" y="66" width="160" height="182" rx="18" fill="#fff" />
        <g transform="translate(842 84) scale(.675)">
          <Person />
        </g>
        <rect x="906" y="96" width="62" height="10" rx="5" fill="#c7d7f4" />
        <rect x="906" y="114" width="40" height="8" rx="4" fill="#e1e9f8" />
        <circle cx="852" cy="166" r="9" fill="#2fb37f" />
        <path d="m847.5 166 3 3 5.5-6" stroke="#fff" strokeWidth="2.2" />
        <rect x="870" y="161" width="96" height="9" rx="4.5" fill="#e6edf9" />
        <circle cx="852" cy="194" r="9" fill="#2fb37f" />
        <path d="m847.5 194 3 3 5.5-6" stroke="#fff" strokeWidth="2.2" />
        <rect x="870" y="189" width="78" height="9" rx="4.5" fill="#e6edf9" />
        <circle cx="852" cy="222" r="8" stroke="#c7d7f4" strokeWidth="2.4" />
        <rect x="870" y="217" width="88" height="9" rx="4.5" fill="#eef2f9" />
      </g>
      {/* A medal. */}
      <g transform="translate(822 226)">
        <path d="M-12 8-18 42l18-9 18 9-6-34Z" fill="#2f63d8" />
        <circle r="22" fill="#f5b83d" />
        <circle r="15" fill="#ffd36b" />
        <path
          d="m0-8 2.6 5.3 5.8.8-4.2 4.1 1 5.8L0 5.2-5.2 8l1-5.8-4.2-4.1 5.8-.8Z"
          fill="#e08f12"
        />
      </g>
      <path d="M1004 304c-42-8-66-44-62-92 36 14 58 48 62 92Z" fill="#5bb8a6" />
      <path d="M998 304c-8-40 4-76 34-100" stroke="#3f9887" strokeWidth="2" />
    </svg>
  )
}
