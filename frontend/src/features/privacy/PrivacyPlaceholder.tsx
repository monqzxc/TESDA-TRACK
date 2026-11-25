import { Icon } from '../../components/Icon.tsx'
import { useCopy } from '../../i18n/copy.ts'

/** The popup and policy share the same visible draft status until legal approval. */
export function PrivacyPlaceholder() {
  const copy = useCopy().privacy
  return (
    <p className="m-0 flex items-start gap-2 rounded-10 border border-banner-border bg-soft px-3 py-2 text-13 leading-[1.5] font-semibold text-ink">
      <Icon name="info" className="mt-0.5 flex-none text-blue" />
      {copy.placeholder}
    </p>
  )
}
