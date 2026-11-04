import { NavLink } from 'react-router'
import { paths } from '../../paths.ts'

const sections = [
  { to: paths.tspWebview, label: 'Find my path', end: true },
  { to: paths.tspQualifications, label: 'Qualifications' },
  { to: paths.tspTraining, label: 'Centers' },
  { to: paths.tspSkills, label: 'Skills' },
] as const

/** The four learner tools inside TSP's compact WebView shell. */
export function TspNav() {
  return (
    <nav aria-label="TSP webview sections" className="tsp-tabs">
      <ul>
        {sections.map(({ to, label, ...options }) => (
          <li key={to}>
            <NavLink
              to={to}
              {...options}
              className={({ isActive }) => (isActive ? 'is-active' : '')}
            >
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
