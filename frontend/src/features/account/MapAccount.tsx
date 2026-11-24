import { useRef } from 'react'
import { Button } from 'react-aria-components'
import { learnerAccounts } from '../../auth/accounts.ts'
import { loadSignInDialog, useAuth } from '../../auth/useAuth.ts'
import { useCopy } from '../../i18n/copy.ts'
import { cx } from '../../lib/style.ts'
import { prefetch } from '../../lib/prefetch.ts'
import { AccountControl, MapTip } from './AccountMenu.tsx'
import { AccountGlyph } from './AccountGlyph.tsx'
import { accountButton } from './styles.ts'

// Over the map: the size of its Locate and Zoom buttons, in their column, with the search card's shadow. In the
// phone's search bar: the size of the burger, and no shadow of its own (the bar has one).
const placed = {
  map: 'size-10.5 shadow-[0_8px_28px_-6px_rgb(var(--track-shadow-rgb)/0.22)]',
  bar: 'size-11',
}

/**
 * The Career Map's account control, where other pages have the top bar's: the learner's round icon, opening the
 * same account menu (Profile, Sign out), or for a guest a round Sign in icon that starts the same sign-in as the top
 * bar's (Sign in with TSP where that is offered, AccountControl's own Sign in otherwise).
 */
export function MapAccount({
  placement,
  className,
}: {
  placement: 'map' | 'bar'
  className?: string
}) {
  const en = useCopy()
  const { learner, openSignIn } = useAuth()
  const wrapper = useRef<HTMLDivElement>(null)
  // As the top bar decides (AppLayout): signed out and guest-only, Sign in with TSP.
  const offersTsp = !learner && !learnerAccounts()

  return (
    <div ref={wrapper} className={cx('flex', className)}>
      {offersTsp ? (
        <MapTip label={en.account.tsp.signIn}>
          <Button
            aria-label={en.account.tsp.signIn}
            className={cx(accountButton.map, placed[placement])}
            onHoverStart={() => prefetch(loadSignInDialog)}
            onFocus={() => prefetch(loadSignInDialog)}
            onPress={() =>
              openSignIn({
                tsp: true,
                // Signed in, the learner's icon has taken this button's place: focus goes to it.
                returnFocus: () => wrapper.current?.querySelector<HTMLElement>('button') ?? null,
              })
            }
          >
            <AccountGlyph variant="map" />
          </Button>
        </MapTip>
      ) : (
        <AccountControl
          variant="map"
          buttonClassName={placed[placement]}
          labels={{ menu: en.account.menu.topLabel, signIn: en.account.signIn }}
        />
      )}
    </div>
  )
}
