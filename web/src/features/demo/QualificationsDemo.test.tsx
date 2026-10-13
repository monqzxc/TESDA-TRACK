import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { bookkeeping, electrical } from '../../test/fixtures.ts'
import { renderWithQuery } from '../../test/query.tsx'
import { server } from '../../test/server.ts'
import { QualificationsDemo } from './QualificationsDemo.tsx'

describe('QualificationsDemo', () => {
  it('shows the qualifications from the API', async () => {
    server.use(
      http.get('*/api/v1/qualifications', () => HttpResponse.json([bookkeeping, electrical])),
    )

    renderWithQuery(<QualificationsDemo />)

    expect(await screen.findByText('2 qualifications in the catalog.')).toBeInTheDocument()
    expect(screen.getByText('Bookkeeping NC III (Business and management)')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows the service message when the API cannot be reached', async () => {
    server.use(http.get('*/api/v1/qualifications', () => HttpResponse.error()))

    renderWithQuery(<QualificationsDemo />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "We can't reach the TESDA-TRACK service right now. Please try again shortly.",
    )
  })
})
