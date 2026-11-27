import { useState } from 'react'
import { Button } from 'react-aria-components'
import { useNavigate } from 'react-router'
import { useAuth } from '../../../auth/useAuth.ts'
import { ModalDialog } from '../../../components/ModalDialog.tsx'
import { Icon } from '../../../components/Icon.tsx'
import { useCopy } from '../../../i18n/copy.ts'
import { paths } from '../../../paths.ts'
import { cx } from '../../../lib/style.ts'

export function GetStartedButton({
  className,
  arrow = true,
  tone = 'blue',
}: {
  className?: string
  arrow?: boolean
  tone?: 'blue' | 'white'
}) {
  const copy = useCopy()
  const [open, setOpen] = useState(false)
  const { learner, openSignIn } = useAuth()
  const navigate = useNavigate()
  const guest = () => {
    setOpen(false)
    void navigate(paths.explore, { state: { focusSearch: true } })
  }
  return (
    <>
      <Button
        onPress={() => (learner ? guest() : setOpen(true))}
        className={cx(
          'inline-flex min-h-11 flex-none cursor-pointer items-center justify-center gap-2 rounded-full border-0 px-5 py-2 text-center font-text text-14 leading-5 font-medium whitespace-nowrap no-underline hovered:brightness-95',
          tone === 'white' ? 'bg-white text-[#123e80]' : 'bg-[#205fc1] text-white',
          className,
        )}
      >
        <span className="block leading-5">
          {learner ? copy.landingPage.openMap : copy.landingPage.getStarted}
        </span>
        {arrow && <Icon name="arrowRight" size="1rem" />}
      </Button>
      <ModalDialog
        isOpen={open}
        onOpenChange={setOpen}
        title={copy.landingPage.getStarted}
        closeLabel={copy.account.close}
        landing
      >
        <div className="flex flex-col gap-3">
          <Button
            onPress={() => {
              setOpen(false)
              openSignIn({ tsp: true })
            }}
            className="flex cursor-pointer items-start gap-3 rounded-[20px] border-0 bg-[#e6eefb] p-4 text-left text-[#202429] hovered:bg-[#d9e6f9]"
          >
            <span className="grid size-11 flex-none place-items-center rounded-12 bg-[#205fc1] text-white">
              <Icon name="document" />
            </span>
            <span>
              <span className="block text-18 font-semibold">{copy.landingPage.tsp.title}</span>
              <span className="mt-1 block text-16 leading-[1.4] text-[#626d7b]">
                {copy.landingPage.tsp.note}
              </span>
            </span>
          </Button>
          <Button
            onPress={guest}
            className="flex cursor-pointer items-start gap-3 rounded-[20px] border-0 bg-[#e3f3f0] p-4 text-left text-[#202429] hovered:bg-[#d3ebe6]"
          >
            <span className="grid size-11 flex-none place-items-center rounded-12 bg-[#0d7d73] text-white">
              <Icon name="person" />
            </span>
            <span>
              <span className="block text-18 font-semibold">{copy.landingPage.guest.title}</span>
              <span className="mt-1 block text-16 leading-[1.4] text-[#626d7b]">
                {copy.landingPage.guest.note}
              </span>
            </span>
          </Button>
        </div>
      </ModalDialog>
    </>
  )
}
