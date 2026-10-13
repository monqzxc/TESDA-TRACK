import { render, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '../../test/server.ts'
import { QualificationsDemo } from './QualificationsDemo.tsx'

describe('QualificationsDemo', () => {
  it('shows the qualifications from the API', async () => {
    server.use(
      http.get('*/api/v1/qualifications', () =>
        HttpResponse.json([
          { code: 'BKP-NCIII', name: 'Bookkeeping NC III', sector: 'Business and management' },
          {
            code: 'EIM-NCII',
            name: 'Electrical Installation and Maintenance NC II',
            sector: 'Construction',
          },
        ]),
      ),
    )

    render(<QualificationsDemo />)

    expect(await screen.findByText('2 qualifications in the catalog.')).toBeInTheDocument()
    expect(screen.getByText('Bookkeeping NC III (Business and management)')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows the service message when the API cannot be reached', async () => {
    server.use(http.get('*/api/v1/qualifications', () => HttpResponse.error()))

    render(<QualificationsDemo />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "We can't reach the TESDA-TRACK service right now. Please try again shortly.",
    )
  })
})
