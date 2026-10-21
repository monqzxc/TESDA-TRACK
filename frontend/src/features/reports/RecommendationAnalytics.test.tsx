import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import {
  emptyRecommendationAnalytics,
  exampleRecommendationAnalytics,
} from '../../test/recommendationAnalytics.ts'
import { renderWithQuery } from '../../test/query.tsx'
import { server } from '../../test/server.ts'
import { RecommendationAnalytics, reviewPlanCsv } from './RecommendationAnalytics.tsx'

const period = { from: null, to: null }
const sample = exampleRecommendationAnalytics
const groupsCaption = 'Positive feedback and learner choices by qualification'
const reviewCaption = 'Recommendation improvement priorities by qualification, model and intent'

function serveSample() {
  server.use(
    http.get('*/api/v1/admin/reports/recommendation-analytics', () => HttpResponse.json(sample)),
  )
}

describe('recommendation analytics', () => {
  it('separates satisfaction responses from distinct learner choices and shows gated projections', async () => {
    serveSample()
    renderWithQuery(<RecommendationAnalytics period={period} />)
    const groups = await screen.findByRole('table', { name: groupsCaption })
    const cookery = within(groups).getByRole('row', { name: /Cookery NC II/ })
    expect([...cookery.querySelectorAll('td')].map((cell) => cell.textContent)).toEqual([
      '6',
      '12',
      '50%',
      '15',
    ])
    expect(screen.getByText(/not confirmed agreements or enrollments/)).toBeVisible()
    expect(screen.getByText(/not job-market demand/)).toBeVisible()
    const demand = screen.getByRole('table', { name: /^Learner interest and projection/ })
    expect(within(demand).getByRole('row', { name: /Cookery NC II/ })).toHaveTextContent(
      '1015+50%20',
    )
    expect(within(demand).getByText('Needs more learners')).toBeVisible()
    expect(within(demand).getByText('No prior baseline')).toBeVisible()
    expect(screen.getByText(/contain no learner goals/)).toBeVisible()
    expect(screen.getByText('12 responses · 50% positive')).toBeVisible()
  })

  it('gives collection guidance for empty data without a numeric forecast', async () => {
    renderWithQuery(<RecommendationAnalytics period={period} />)
    await screen.findByText('No qualification choices or feedback in the selected period.')
    expect(screen.getByText('No recent qualification choices to project yet.')).toBeVisible()
    expect(screen.getByText(/No feedback groups to review yet/)).toBeVisible()
    expect(screen.getByText('No answers yet')).toBeVisible()
    expect(screen.queryByRole('button', { name: /Export review plan/ })).not.toBeInTheDocument()
  })

  it('names insufficient history separately from insufficient learner volume', async () => {
    server.use(
      http.get('*/api/v1/admin/reports/recommendation-analytics', () =>
        HttpResponse.json({
          ...sample,
          demand: {
            ...sample.demand,
            qualifications: [
              {
                ...sample.demand.qualifications[0],
                status: 'insufficient_history',
                projected_learners: null,
              },
            ],
          },
        }),
      ),
    )
    renderWithQuery(<RecommendationAnalytics period={period} />)
    await screen.findByText('Needs more history')
    expect(screen.queryByText('Needs more learners')).not.toBeInTheDocument()
  })

  it('filters review groups by priority without hiding the qualification summary', async () => {
    serveSample()
    renderWithQuery(<RecommendationAnalytics period={period} />)
    await screen.findByRole('table', { name: reviewCaption })
    await userEvent.setup().selectOptions(screen.getByLabelText('Review priority'), 'high')
    const reviews = screen.getByRole('table', { name: reviewCaption })
    expect(within(reviews).getByText('Cookery NC II')).toBeVisible()
    expect(within(reviews).queryByText(/Shielded Metal/)).not.toBeInTheDocument()
    expect(
      within(screen.getByRole('table', { name: groupsCaption })).getByText(/Shielded Metal/),
    ).toBeVisible()
    await userEvent.setup().selectOptions(screen.getByLabelText('Review priority'), 'medium')
    expect(screen.getByText('No groups have this review priority.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Export review plan (CSV)' })).toBeDisabled()
  })

  it('passes inclusive report dates and refreshes when the period changes', async () => {
    const searches: string[] = []
    server.use(
      http.get('*/api/v1/admin/reports/recommendation-analytics', ({ request }) => {
        searches.push(new URL(request.url).search)
        return HttpResponse.json(emptyRecommendationAnalytics)
      }),
    )
    const { rerender } = renderWithQuery(
      <RecommendationAnalytics period={{ from: '2026-09-01', to: '2026-09-30' }} />,
    )
    await screen.findByText('No qualification choices or feedback in the selected period.')
    expect(searches).toEqual(['?date_from=2026-09-01&date_to=2026-09-30'])
    rerender(<RecommendationAnalytics period={{ from: '2026-10-01', to: null }} />)
    await waitFor(() =>
      expect(searches).toEqual([
        '?date_from=2026-09-01&date_to=2026-09-30',
        '?date_from=2026-10-01',
      ]),
    )
  })

  it('provides retry when the analytics request fails', async () => {
    server.use(
      http.get('*/api/v1/admin/reports/recommendation-analytics', () =>
        HttpResponse.json({}, { status: 503 }),
      ),
    )
    renderWithQuery(<RecommendationAnalytics period={period} />)
    const retry = await screen.findByRole('button', { name: 'Try again' })
    serveSample()
    await userEvent.setup().click(retry)
    expect(await screen.findByRole('table', { name: groupsCaption })).toBeVisible()
  })

  it('disables export while old aggregates are retained for a new period', async () => {
    serveSample()
    const { rerender } = renderWithQuery(<RecommendationAnalytics period={period} />)
    const exportButton = await screen.findByRole('button', { name: 'Export review plan (CSV)' })
    expect(exportButton).toBeEnabled()
    server.use(
      http.get('*/api/v1/admin/reports/recommendation-analytics', async () => {
        await delay(250)
        return HttpResponse.json(sample)
      }),
    )
    rerender(<RecommendationAnalytics period={{ from: '2026-10-01', to: '2026-10-21' }} />)
    expect(
      await screen.findByText('Updating recommendation analytics for the selected period…'),
    ).toBeVisible()
    expect(exportButton).toBeDisabled()
    await waitFor(() => expect(exportButton).toBeEnabled())
  })

  it('distinguishes a healthy review queue from having no feedback', async () => {
    server.use(
      http.get('*/api/v1/admin/reports/recommendation-analytics', () =>
        HttpResponse.json({
          ...sample,
          improvement_priorities: [],
        }),
      ),
    )
    renderWithQuery(<RecommendationAnalytics period={period} />)
    expect(await screen.findByText(/No groups currently need review/)).toBeVisible()
    expect(screen.queryByText(/No feedback groups to review yet/)).not.toBeInTheDocument()
  })

  it('exports aggregate review evidence with escaped CSV and spreadsheet formulas', () => {
    const csv = reviewPlanCsv(
      [
        {
          ...sample.improvement_priorities[0],
          model: '=SUM(1,2)',
          recommendation: 'Review "Cookery", then label examples.\nAsk for consent.',
        },
      ],
      { from: '2026-10-01', to: '2026-10-21' },
    )
    expect(csv).toContain('"2026-10-01","2026-10-21","CKY-NCII"')
    expect(csv).toContain('"\'=SUM(1,2)"')
    expect(csv).toContain('"Review ""Cookery"", then label examples.\nAsk for consent."')
    expect(csv).toContain('"Ranking signals","Priority","Recommended review action"')
    expect(csv).not.toContain('learner_id')
    expect(csv).not.toContain('query_hash')
  })
})
