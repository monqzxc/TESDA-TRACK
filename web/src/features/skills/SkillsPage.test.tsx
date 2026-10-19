import { screen, waitFor, within } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderApp } from '../../test/app.tsx'
import { server } from '../../test/server.ts'
import { serveTrainingApi } from '../../test/training.ts'
import { useTrainingStore } from '../training/state.ts'
import type { Exploration, OccupationDetails } from './api.ts'

// Leaflet needs a real browser (tests/e2e/skills.spec.ts covers the delivery map). Here the map stands in as a list
// of its pins.
vi.mock('../training/CenterMap.tsx', () => ({
  default: ({ centers }: { centers: { id: string; name: string }[] }) => (
    <ul data-testid="map">
      {centers.map((center) => (
        <li key={center.id}>{center.name}</li>
      ))}
    </ul>
  ),
}))

const CATALOG = [
  {
    code: 'SMAW-NCII',
    name: 'Shielded Metal Arc Welding (SMAW) NC II',
    sector: 'Metals and Engineering',
    possible_jobs: ['Welder'],
    competencies: [],
  },
  {
    code: 'CKY-NCII',
    name: 'Cookery NC II',
    sector: 'Tourism',
    possible_jobs: ['Cook'],
    competencies: [],
  },
]

const EXPLORATION: Exploration = {
  source: 'Skills Bridge',
  source_url: 'https://skills-bridge.ph',
  retrieved_at: '2026-10-15T02:30:00Z',
  searched: true,
  reason: null,
  terms: ['welder', 'teamwork', 'blockchain'],
  occupation_terms: ['welder'],
  skill_terms: ['teamwork', 'blockchain'],
  unmatched: ['blockchain'],
  resolution: [
    { term: 'welder', strength: 'strong', matched_occupations: 3, matched_skills: null },
    { term: 'teamwork', strength: 'moderate', matched_skills: 12, matched_occupations: null },
  ],
  occupations: [
    {
      occupation_id: 101,
      title: 'Welder',
      sector: 'Manufacturing',
      score: 0.92,
      terms_matched: ['welder'],
      open_posts: null,
      match_kind: 'occupation',
    },
    {
      occupation_id: 102,
      title: 'Fabricator',
      sector: null,
      score: 0.41,
      terms_matched: ['teamwork'],
      open_posts: 3,
      match_kind: 'skill',
    },
  ],
  qualifications: [
    {
      code: 'SMAW-NCII',
      title: 'Shielded Metal Arc Welding (SMAW) NC II',
      level_label: 'NC II',
      status: 'promulgated',
      review_due_at: '2027-03-01',
      terms_matched: ['teamwork'],
      skill_share: 0.18,
      evidence: [{ term: 'teamwork', skills: ['Work in a team environment'] }],
    },
    {
      code: 'XYZ-1',
      title: 'Underwater Basket Weaving',
      level_label: null,
      status: null,
      review_due_at: null,
      terms_matched: [],
      skill_share: null,
      evidence: [],
    },
  ],
}

const WELDER: OccupationDetails = {
  source: 'Skills Bridge',
  source_url: 'https://skills-bridge.ph',
  retrieved_at: '2026-10-15T02:31:00Z',
  data: {
    profile: {
      occupation: { occupation_id: 101, title: 'Welder', sector: 'Manufacturing' },
      standards: [
        {
          code: 'SMAW-NCII',
          title: 'Shielded Metal Arc Welding (SMAW) NC II',
          level_label: 'NC II',
          status: 'promulgated',
        },
      ],
    },
    skills: [
      { skill_id: 1, name: 'Read welding symbols', type: 'technical_skill' },
      { skill_id: 2, name: 'Teamwork', type: 'soft_skill' },
      { skill_id: 3, name: 'Grind weld joints', type: null },
    ],
    benchmarks: [
      {
        title: 'Welder (ISCO 7212)',
        status: 'confirmed',
        source: 'ISCO-08',
        standard: '7212',
        sample_skills: ['Welding', 'Cutting'],
      },
    ],
    warnings: ['The skills preview is limited to 50 skills.'],
  },
}

interface Requests {
  explore: unknown[]
  occupations: string[]
}

function serveSkillsBridge({
  exploration = EXPLORATION,
  status = 200,
}: { exploration?: Exploration; status?: 200 | 503 } = {}) {
  const requests: Requests = { explore: [], occupations: [] }
  serveTrainingApi()
  server.use(
    http.get('*/api/v1/qualifications', () => HttpResponse.json(CATALOG)),
    http.post('*/api/v1/skills-bridge/explore', async ({ request }) => {
      requests.explore.push(await request.json())
      if (status === 503) {
        return HttpResponse.json(
          { detail: 'Skills Bridge is busy right now. Please try again in a minute.' },
          { status: 503 },
        )
      }
      return HttpResponse.json(exploration)
    }),
    http.get('*/api/v1/skills-bridge/occupations/:id', ({ params }) => {
      requests.occupations.push(String(params.id))
      return HttpResponse.json(WELDER)
    }),
  )
  return requests
}

async function openExplorer() {
  const view = renderApp('/skills')
  await screen.findByRole('heading', { level: 1, name: 'Skills Explorer' })
  const box = await screen.findByRole('textbox', {
    name: 'What skills or roles are you exploring?',
  })
  return { ...view, box }
}

async function search(user: UserEvent, box: HTMLElement, text: string) {
  await user.type(box, text)
  await user.click(screen.getByRole('button', { name: /Find career matches/ }))
}

beforeEach(() => {
  window.sessionStorage.clear()
  useTrainingStore.setState({ saved: [], useLocation: false, location: null })
})

describe('Skills Explorer', () => {
  it('says when this server doesn’t connect to Skills Bridge', async () => {
    renderApp('/skills')

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Skills Explorer is turned off' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('asks for words before looking anything up', async () => {
    const requests = serveSkillsBridge()
    const user = userEvent.setup()
    const { box } = await openExplorer()

    expect(
      screen.getByRole('heading', { level: 2, name: 'Start with what you know' }),
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: /Find career matches/ }))

    expect(box).toHaveAccessibleDescription(/Use up to 25 short terms/)
    expect(box).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Describe your skills or a role you’re exploring.')).toBeVisible()
    expect(box).toHaveFocus()
    expect(requests.explore).toHaveLength(0)
  })

  it('sends the sentence in the request body only, and says when it held no usable terms', async () => {
    const requests = serveSkillsBridge({
      exploration: {
        ...EXPLORATION,
        searched: false,
        reason: 'no_terms',
        terms: [],
        occupation_terms: [],
        skill_terms: [],
        unmatched: [],
        resolution: [],
        occupations: [],
        qualifications: [],
      },
    })
    const user = userEvent.setup()
    const { box } = await openExplorer()

    await search(user, box, 'and the')

    await waitFor(() => expect(box).toHaveAttribute('aria-invalid', 'true'))
    expect(requests.explore).toEqual([{ text: 'and the' }])
    expect(screen.getByText(/We couldn’t find usable skill or role terms/)).toBeVisible()
    expect(box).toHaveFocus()
    expect(
      screen.getByRole('heading', { level: 2, name: 'Start with what you know' }),
    ).toBeVisible()
  })

  it('shows what Skills Bridge understood, the occupations, and the linked qualifications', async () => {
    serveSkillsBridge()
    const user = userEvent.setup()
    const { box } = await openExplorer()

    await search(user, box, 'I want to be a welder with teamwork and blockchain')

    expect(
      await screen.findByText('Searching Skills Bridge for: welder, teamwork, blockchain'),
    ).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent(
      '2 occupations and 2 linked qualifications found.',
    )
    expect(
      screen.getByText('Source: Skills Bridge · Retrieved Oct 15, 2026, 10:30 AM'),
    ).toBeVisible()
    expect(
      screen.getByText(
        'We treated welder as target occupations and teamwork, blockchain as capabilities.',
      ),
    ).toBeVisible()
    expect(screen.getByText(/did not resolve some terms: blockchain/)).toBeVisible()
    expect(screen.getByText('welder — 3 occupation titles; strong match')).toBeInTheDocument()
    expect(screen.getByText('teamwork — 12 related skills; moderate match')).toBeInTheDocument()

    const occupations = screen.getByRole('region', { name: 'Occupations to explore' })
    const welder = within(occupations).getByRole('article', { name: 'Welder' })
    expect(within(welder).getByText('Manufacturing')).toBeVisible()
    expect(within(welder).getByRole('img', { name: 'Occupation title match: 92%' })).toBeVisible()
    // A title match carries no count of job posts.
    expect(within(welder).queryByText(/open post/)).not.toBeInTheDocument()
    const fabricator = within(occupations).getByRole('article', { name: 'Fabricator' })
    expect(within(fabricator).getByText('Career option')).toBeVisible()
    expect(within(fabricator).getByRole('img', { name: 'Input skill match: 41%' })).toBeVisible()
    expect(within(fabricator).getByText('3 open posts recorded in Skills Bridge')).toBeVisible()

    const linked = screen.getByRole('region', { name: 'Qualifications linked to your skills' })
    const smaw = within(linked).getByRole('article', {
      name: 'Shielded Metal Arc Welding (SMAW) NC II',
    })
    expect(within(smaw).getByText('SMAW-NCII · Promulgated')).toBeVisible()
    expect(within(smaw).getByText('Linked input skills: teamwork')).toBeVisible()
    expect(within(smaw).getByText(/account for 18% of this qualification/)).toBeVisible()
    expect(within(smaw).getByText('Review due: 2027-03-01')).toBeVisible()
    expect(within(smaw).getByText('Work in a team environment')).toBeInTheDocument()
    const other = within(linked).getByRole('article', { name: 'Underwater Basket Weaving' })
    expect(within(other).getByText('XYZ-1 · Status unavailable')).toBeVisible()
    expect(screen.getByRole('link', { name: /About Skills Bridge/ })).toHaveAttribute(
      'href',
      'https://skills-bridge.ph',
    )
  })

  it('opens an occupation’s details, and ticking known skills leaves the rest to explore', async () => {
    const requests = serveSkillsBridge()
    const user = userEvent.setup()
    const { box } = await openExplorer()
    await search(user, box, 'welder, teamwork')
    await screen.findByRole('article', { name: 'Welder' })

    await user.click(
      screen.getByRole('button', { name: 'Explore skills & qualifications: Welder' }),
    )

    const heading = await screen.findByRole('heading', { level: 2, name: 'Welder' })
    await waitFor(() => expect(heading).toHaveFocus())
    expect(requests.occupations).toEqual(['101'])
    expect(
      screen.getByRole('button', { name: 'Explore skills & qualifications: Welder' }),
    ).toHaveAttribute('aria-pressed', 'true')
    // The occupation's own qualifications take the place of the linked ones.
    expect(
      screen.queryByRole('region', { name: 'Qualifications linked to your skills' }),
    ).not.toBeInTheDocument()
    const details = screen.getByRole('region', { name: 'Welder' })
    expect(within(details).getByText('The skills preview is limited to 50 skills.')).toBeVisible()
    const standards = within(details).getByRole('region', {
      name: 'Qualifications for this occupation',
    })
    expect(
      within(standards).getByRole('article', { name: 'Shielded Metal Arc Welding (SMAW) NC II' }),
    ).toBeVisible()

    const table = within(details).getByRole('table', { name: 'Skills to explore' })
    expect(
      within(table)
        .getAllByRole('row')
        .slice(1)
        .map((row) => row.textContent),
    ).toEqual([
      'Read welding symbolsTechnical skill',
      'TeamworkSoft skill',
      'Grind weld jointsGeneral',
    ])

    const known = within(details).getByRole('group', { name: 'Skills I already have' })
    await user.click(within(known).getByRole('checkbox', { name: 'Teamwork' }))

    expect(
      within(details).getByText('1 self-reported strength · 2 skills remaining in this preview'),
    ).toBeVisible()
    expect(within(table).queryByText('Teamwork')).not.toBeInTheDocument()

    await user.click(within(known).getByRole('checkbox', { name: 'Read welding symbols' }))
    await user.click(within(known).getByRole('checkbox', { name: 'Grind weld joints' }))
    expect(within(details).getByText(/marked every skill in this preview as known/)).toBeVisible()
    expect(within(details).queryByRole('table')).not.toBeInTheDocument()

    const mappings = within(details).getByRole('region', { name: 'International mappings' })
    expect(within(mappings).getByText('Welder (ISCO 7212)')).toBeVisible()
    expect(within(mappings).getByText('Confirmed')).toBeVisible()
    expect(within(mappings).getByText('ISCO-08 · 7212')).toBeVisible()
    expect(within(mappings).getByText('Sample linked skills: Welding, Cutting')).toBeVisible()
  })

  it('finds training and assessment for a qualification it can map to the catalog', async () => {
    serveSkillsBridge()
    const user = userEvent.setup()
    const { box, router } = await openExplorer()
    await search(user, box, 'teamwork')
    const linked = await screen.findByRole('region', {
      name: 'Qualifications linked to your skills',
    })

    // No safe catalog match: no sites, and a way to search by title instead.
    const other = within(linked).getByRole('article', { name: 'Underwater Basket Weaving' })
    await user.click(within(other).getByText('Find TESDA training & assessment options'))
    expect(within(other).getByText(/not mapped to a local TESDA catalog code yet/)).toBeVisible()
    expect(within(other).queryByRole('button', { name: /Show available sites/ })).toBeNull()

    const smaw = within(linked).getByRole('article', {
      name: 'Shielded Metal Arc Welding (SMAW) NC II',
    })
    await user.click(within(smaw).getByText('Find TESDA training & assessment options'))
    expect(
      within(smaw).getByText(
        /Local catalog match: Shielded Metal Arc Welding \(SMAW\) NC II · SMAW-NCII/,
      ),
    ).toBeVisible()
    await user.click(within(smaw).getByRole('button', { name: /Show available sites/ }))

    expect(await within(smaw).findByText('2 sites with listings')).toBeVisible()
    const map = await within(smaw).findByTestId('map')
    expect(
      within(map)
        .getAllByRole('listitem')
        .map((pin) => pin.textContent),
    ).toEqual(['Manila Assessment Center', 'Manila Welding Institute'])

    await user.click(within(smaw).getByRole('button', { name: /Open in Training & Assessment/ }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/training'))
    expect(router.state.location.search).toBe('?qualification=SMAW-NCII')
  })

  it('keeps the rest of TESDA Track in view when Skills Bridge can’t answer', async () => {
    serveSkillsBridge({ status: 503 })
    const user = userEvent.setup()
    const { box } = await openExplorer()

    await search(user, box, 'welder')

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(
      'Skills Bridge is busy right now. Please try again in a minute.',
    )
    expect(alert).toHaveTextContent(
      'Your TESDA Track pathways and qualification library remain available.',
    )
    expect(box).not.toHaveAttribute('aria-invalid', 'true')
    expect(
      screen.getByRole('heading', { level: 2, name: 'Start with what you know' }),
    ).toBeVisible()
  })
})
