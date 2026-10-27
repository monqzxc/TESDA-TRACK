import { screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { renderWithAuth } from '../../test/account.tsx'
import type { RecommendationSession } from './api.ts'
import { RecommendationHistory } from './Records.tsx'

function session(id: string, query: string, createdAt: string): RecommendationSession {
  return {
    id,
    query,
    goal_id: null,
    analysis_source: 'rules',
    profile: { intent: 'unknown' },
    matches: [],
    selected_qualification: null,
    pathway: null,
    created_at: createdAt,
    updated_at: createdAt,
  }
}

function renderHistory(sessions: RecommendationSession[]) {
  return renderWithAuth(
    <MemoryRouter>
      <RecommendationHistory sessions={sessions} catalog={new Set()} />
    </MemoryRouter>,
  )
}

beforeEach(() => window.localStorage.clear())

describe('Recommendation history', () => {
  it('stays hidden until the learner has submitted an input', () => {
    renderHistory([])
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
  })

  it('stays hidden when saved records contain only empty inputs', () => {
    renderHistory([
      session('empty', '', '2026-10-01T00:00:00Z'),
      session('spaces', ' \n\t ', '2026-10-02T00:00:00Z'),
    ])
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
  })

  it('shows only submitted inputs, newest first, without changing the source records', () => {
    const sessions = [
      session('earlier', 'I want to become a welder.', '2026-10-01T00:00:00Z'),
      session('empty', '   ', '2026-10-03T00:00:00Z'),
      session('latest', 'I want to study cookery.', '2026-10-02T00:00:00Z'),
    ]
    renderHistory(sessions)
    const history = screen.getByRole('region', { name: 'Recommendation history' })
    const items = within(history).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(within(items[0]).getByText('I want to study cookery.')).toBeVisible()
    expect(within(items[1]).getByText('I want to become a welder.')).toBeVisible()
    expect(sessions.map((record) => record.id)).toEqual(['earlier', 'empty', 'latest'])
  })
})
