import { Link } from 'react-router'
import { PageHeading } from '../../components/PageHeading.tsx'
import { en } from '../../copy/en.ts'
import { paths } from '../../paths.ts'

const copy = en.pages.notFound

// Any address the app doesn't have.
export default function NotFoundPage() {
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
