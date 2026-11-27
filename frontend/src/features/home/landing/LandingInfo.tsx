import { Button, Dialog, DialogTrigger, Heading, Popover } from 'react-aria-components'
import { useCopy } from '../../../i18n/copy.ts'
import { Icon } from '../../../components/Icon.tsx'

/**
 * The landing page's "i": the detail behind a one-line fact. Grey like everything on the page that isn't an action,
 * so it never competes with the navy buttons.
 */
export function LandingInfo({ topic, text }: { topic: string; text: string }) {
  const copy = useCopy()
  return (
    <DialogTrigger>
      <Button
        aria-label={copy.landingPage.more(topic)}
        className="pressed:bg-(--l-line) grid size-8 flex-none cursor-pointer place-items-center rounded-full border-0 bg-transparent text-(--l-muted) transition-colors duration-150 hovered:bg-(--l-panel) hovered:text-(--l-ink)"
      >
        <svg
          viewBox="0 0 24 24"
          width="1.05rem"
          height="1.05rem"
          aria-hidden="true"
          focusable="false"
        >
          <circle cx="12" cy="12" r="9.25" fill="none" stroke="currentColor" strokeWidth={1.6} />
          <path
            d="M12 11v5.2M12 7.7v.3"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
          />
        </svg>
      </Button>
      <Popover
        placement="bottom"
        offset={6}
        className="landing w-[min(19rem,calc(100vw-2rem))] rounded-14 border border-(--l-line) bg-(--l-surface) shadow-[0_18px_40px_-12px_rgb(15_20_30/0.28)]"
      >
        <Dialog className="relative flex flex-col gap-1.5 py-3.5 pr-11 pl-4 outline-none">
          {({ close }) => (
            <>
              <Heading slot="title" className="m-0 text-14 leading-[1.35] font-bold text-(--l-ink)">
                {topic}
              </Heading>
              <p className="m-0 text-13 leading-[1.55] text-(--l-body)">{text}</p>
              <Button
                onPress={close}
                aria-label={copy.account.close}
                className="absolute top-2 right-2 grid size-8 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-(--l-muted) hovered:bg-(--l-panel)"
              >
                <Icon name="close" size="1rem" />
              </Button>
            </>
          )}
        </Dialog>
      </Popover>
    </DialogTrigger>
  )
}
