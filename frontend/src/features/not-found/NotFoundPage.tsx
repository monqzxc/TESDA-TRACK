import { Link } from 'react-router'
import { PageHeading } from '../../components/PageHeading.tsx'
import { useCopy } from '../../i18n/copy.ts'
import { paths } from '../../paths.ts'

// Any address the app doesn't have.
export default function NotFoundPage() {
  const en = useCopy()
  const copy = en.pages.notFound

  return (
    <>
      <PageHeading>{copy.heading}</PageHeading>
      <p>{copy.lead}</p>
      <p>
        <Link to={paths.home}>{copy.home}</Link>
      </p>
    </>
  )
}
