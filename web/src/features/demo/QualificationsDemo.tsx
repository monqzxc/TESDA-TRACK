import { useQualifications } from '../../api/queries.ts'
import { en } from '../../copy/en.ts'

// A temporary page that checks the API proxy works. Task 4 replaces it with the app shell.

const PREVIEW_COUNT = 5

export function QualificationsDemo() {
  const qualifications = useQualifications()

  return (
    // The padding is temporary: Task 4 replaces this page with the app shell.
    <main style={{ padding: '2rem 16px' }}>
      <h1>{en.app.name}</h1>
      <h2>{en.demo.heading}</h2>
      {qualifications.isPending && <p>{en.demo.loading}</p>}
      {qualifications.isError && <p role="alert">{qualifications.error.message}</p>}
      {qualifications.isSuccess && (
        <>
          <p>{en.demo.count(qualifications.data.length)}</p>
          <ul>
            {qualifications.data.slice(0, PREVIEW_COUNT).map((q) => (
              <li key={q.code}>
                {q.name} ({q.sector})
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  )
}
