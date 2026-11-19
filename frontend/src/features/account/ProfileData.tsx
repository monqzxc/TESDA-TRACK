import { useQueryClient } from '@tanstack/react-query'
import { Button } from 'react-aria-components'
import { useAuth } from '../../auth/useAuth.ts'
import { useCopy } from '../../i18n/copy.ts'
import { button } from '../../styles/buttons.ts'
import { downloadMyData } from './exportData.ts'

/** "Your data & privacy", at the bottom of the profile: download everything stored about the learner. */
export function ProfileData() {
  const copy = useCopy().account.menu
  const { notify } = useAuth()
  const queryClient = useQueryClient()

  return (
    <section
      aria-labelledby="profile-data"
      className="mt-6 rounded-18 border border-border bg-surface p-6 max-sm:p-5"
    >
      <h2 id="profile-data" className="mb-2 text-20 text-navy">
        {copy.data.heading}
      </h2>
      <p className="mb-4 text-15 text-muted">{copy.data.body}</p>
      <div className="flex flex-wrap gap-3">
        <Button
          className={button({ variant: 'tertiary', text: 14, height: 44 })}
          onPress={() => void downloadMyData(queryClient, notify)}
        >
          {copy.download}
        </Button>
      </div>
    </section>
  )
}
