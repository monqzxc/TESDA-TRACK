import { NavLink } from 'react-router'
import { en } from '../copy/en.ts'
import { paths } from '../paths.ts'

/** The shared footer for application pages. Legal information stays with page content, not navigation. */
export function PageFooter() {
  return (
    <footer className="w-full max-w-[1520px] px-10 pb-8 max-[1101px]:px-6 max-md:px-4">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-border pt-5 text-14 text-muted">
        <p className="m-0">{en.footer.copyright}</p>
        <NavLink
          to={paths.privacy}
          className="inline-flex min-h-11 items-center rounded-10 px-3 py-2 font-semibold text-blue underline-offset-4 aria-[current=page]:text-navy aria-[current=page]:underline hovered:bg-soft hovered:text-blue"
        >
          {en.privacy.link}
        </NavLink>
      </div>
    </footer>
  )
}
