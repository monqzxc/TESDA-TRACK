import { NavLink } from 'react-router'
import { paths } from '../../paths.ts'

const sections = [
  { to: paths.tspWebview, label: 'Pathways', end: true },
  { to: paths.tspQualifications, label: 'Qualification Library' },
  { to: paths.tspTraining, label: 'Training & Assessment' },
  { to: paths.tspSkills, label: 'Skill Explorer' },
] as const

/** The four learner tools inside TSP's compact WebView shell. */
export function TspNav() {
  return (
    <nav
      aria-label="TSP webview sections"
      className="[scrollbar-width:none] overflow-x-auto border-b border-border bg-surface [&::-webkit-scrollbar]:hidden"
    >
      <ul className="mx-auto flex w-full max-w-2xl list-none gap-5 px-4 py-0">
        {sections.map(({ to, label, ...options }) => (
          <li key={to} className="shrink-0">
            <NavLink
              to={to}
              {...options}
              className={({ isActive }) =>
                `inline-flex min-h-11 items-center border-b-2 px-1 py-2 text-14 font-semibold whitespace-nowrap no-underline ${
                  isActive
                    ? 'border-fill text-navy'
                    : 'border-transparent text-muted hovered:border-hover-border hovered:text-navy'
                }`
              }
            >
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
