import { useEffect, useState } from 'react'
import { en } from '../../copy/en.ts'

// A temporary page that checks the API proxy works. Task 2 replaces the fetch with the
// generated client, and Task 4 replaces the page with the app shell.

interface QualificationSummary {
  code: string
  name: string
  sector: string
}

type State =
  | { status: 'loading' }
  | { status: 'ready'; qualifications: QualificationSummary[] }
  | { status: 'error' }

const PREVIEW_COUNT = 5

export function QualificationsDemo() {
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/v1/qualifications', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const qualifications = (await response.json()) as QualificationSummary[]
        setState({ status: 'ready', qualifications })
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: 'error' })
      })
    return () => controller.abort()
  }, [])

  return (
    <main>
      <h1>{en.app.name}</h1>
      <h2>{en.demo.heading}</h2>
      {state.status === 'loading' && <p>{en.demo.loading}</p>}
      {state.status === 'error' && <p role="alert">{en.service.unreachable}</p>}
      {state.status === 'ready' && (
        <>
          <p>{en.demo.count(state.qualifications.length)}</p>
          <ul>
            {state.qualifications.slice(0, PREVIEW_COUNT).map((q) => (
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
