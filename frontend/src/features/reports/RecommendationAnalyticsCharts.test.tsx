import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  emptyRecommendationAnalytics,
  exampleRecommendationAnalytics,
} from '../../test/recommendationAnalytics.ts'
import type { RecommendationAnalytics } from './api.ts'
import { DemandChart, FeedbackCharts } from './RecommendationAnalyticsCharts.tsx'

const sample = exampleRecommendationAnalytics

describe('recommendation analytics charts', () => {
  it('names the feedback distribution with the exact response counts', () => {
    render(<FeedbackCharts data={sample} />)

    const distribution = screen.getByRole('figure', { name: 'Feedback distribution' })
    expect(
      within(distribution).getByRole('img', {
        name: '9 positive and 7 negative responses out of 16 feedback answers.',
      }),
    ).toBeVisible()
    expect(distribution).toHaveTextContent('56%')

    const qualifications = screen.getByRole('figure', { name: 'Feedback by qualification' })
    expect(within(qualifications).getByText('Cookery NC II')).toBeVisible()
    expect(
      within(qualifications).getByText('Shielded Metal Arc Welding (SMAW) NC II'),
    ).toBeVisible()
  })

  it.each([
    { accepted: 16, rejected: 0, acceptance_rate: 1 },
    { accepted: 0, rejected: 16, acceptance_rate: 0 },
  ])('handles a distribution with $accepted positive and $rejected negative answers', (counts) => {
    render(<FeedbackCharts data={{ ...sample, ...counts }} />)

    const distribution = screen.getByRole('figure', { name: 'Feedback distribution' })
    expect(
      within(distribution).getByRole('img', {
        name: `${counts.accepted} positive and ${counts.rejected} negative responses out of 16 feedback answers.`,
      }),
    ).toBeVisible()
    expect(distribution).toHaveTextContent(`${counts.acceptance_rate * 100}%`)
  })

  it('explains empty charts without inventing a rate or forecast', () => {
    render(
      <>
        <FeedbackCharts data={emptyRecommendationAnalytics} />
        <DemandChart demand={emptyRecommendationAnalytics.demand} />
      </>,
    )

    const distribution = screen.getByRole('figure', { name: 'Feedback distribution' })
    expect(distribution).toHaveTextContent(
      'No feedback to visualize yet. Collect Yes or No responses to see the distribution.',
    )
    expect(within(distribution).queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByRole('figure', { name: 'Feedback by qualification' })).toHaveTextContent(
      'No qualification feedback to chart in the selected period.',
    )
    expect(screen.getByRole('figure', { name: 'Learner interest comparison' })).toHaveTextContent(
      'No learner choices to compare in the selected period.',
    )
  })

  it('omits qualifications with choices but no feedback from the feedback chart', () => {
    render(
      <FeedbackCharts
        data={{
          ...emptyRecommendationAnalytics,
          qualification_groups: [
            {
              ...sample.qualification_groups[0],
              accepted: 0,
              rejected: 0,
              feedback_answers: 0,
              acceptance_rate: null,
            },
          ],
        }}
      />,
    )

    const qualifications = screen.getByRole('figure', { name: 'Feedback by qualification' })
    expect(qualifications).toHaveTextContent(
      'No qualification feedback to chart in the selected period.',
    )
    expect(within(qualifications).queryByText('Cookery NC II')).not.toBeInTheDocument()
  })

  it('charts only the six qualifications with the most feedback answers', () => {
    const qualification_groups = Array.from({ length: 8 }, (_, index) => ({
      ...sample.qualification_groups[0],
      qualification: { code: `Q${index}`, name: `Qualification ${index}`, sector: 'Tourism' },
      feedback_answers: index + 1,
      accepted: 0,
      rejected: index + 1,
      acceptance_rate: 0,
    }))
    render(<FeedbackCharts data={{ ...sample, qualification_groups }} />)

    const qualifications = screen.getByRole('figure', { name: 'Feedback by qualification' })
    expect(
      within(qualifications)
        .getAllByText(/^Qualification \d$/)
        .map((row) => row.textContent),
    ).toEqual([
      'Qualification 7',
      'Qualification 6',
      'Qualification 5',
      'Qualification 4',
      'Qualification 3',
      'Qualification 2',
    ])
    expect(within(qualifications).queryByText('Qualification 0')).not.toBeInTheDocument()
    expect(within(qualifications).queryByText('Qualification 1')).not.toBeInTheDocument()
  })

  it('shows a valid zero estimate and explains each unavailable estimate', () => {
    const demand: RecommendationAnalytics['demand'] = {
      ...sample.demand,
      qualifications: [
        {
          ...sample.demand.qualifications[0],
          previous_learners: 40,
          recent_learners: 10,
          change_rate: -0.75,
          projected_learners: 0,
        },
        { ...sample.demand.qualifications[1], previous_learners: 3 },
        {
          ...sample.demand.qualifications[0],
          qualification: { code: 'NEW', name: 'New qualification', sector: 'Tourism' },
          status: 'insufficient_history',
          projected_learners: null,
        },
      ],
    }
    render(<DemandChart demand={demand} />)

    const comparison = screen.getByRole('figure', { name: 'Learner interest comparison' })
    const cookery = within(comparison)
      .getAllByRole('listitem')
      .find((row) => within(row).queryByText('Cookery NC II'))!
    expect(within(cookery).getByText('0', { exact: true })).toBeVisible()
    expect(within(comparison).getByText('Estimate unavailable: more learners needed')).toBeVisible()
    expect(within(comparison).getByText('Estimate unavailable: more history needed')).toBeVisible()
  })

  it('compares only the six qualifications with the most recent learners', () => {
    const qualifications = Array.from({ length: 8 }, (_, index) => ({
      ...sample.demand.qualifications[0],
      qualification: { code: `Q${index}`, name: `Qualification ${index}`, sector: 'Tourism' },
      recent_learners: index + 1,
    }))
    render(<DemandChart demand={{ ...sample.demand, qualifications }} />)

    const comparison = screen.getByRole('figure', { name: 'Learner interest comparison' })
    expect(
      within(comparison)
        .getAllByText(/^Qualification \d$/)
        .map((row) => row.textContent),
    ).toEqual([
      'Qualification 7',
      'Qualification 6',
      'Qualification 5',
      'Qualification 4',
      'Qualification 3',
      'Qualification 2',
    ])
  })
})
