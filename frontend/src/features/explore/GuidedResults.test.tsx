import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockMediaQueries } from '../../test/matchMedia.ts'
import type { Match } from '../finder/api.ts'
import { GuidedView, type GuidedViewProps } from './GuidedResults.tsx'
import type { DemandRegionCard, Pick } from './guided.ts'
import type { NearbySuggestion } from './outlookApi.ts'
import type { GuidedModel } from './useGuided.ts'

const match = (code: string, name: string, score = 80): Match =>
  ({ qualification: { code, name, sector: '' }, score, reason: '' }) as Match

const DRIVING = match('DRIVING-NC-II', 'Driving NC II')
const ARTICULATED = match('DRIVING-NC-III', 'Driving (Articulated Vehicle) NC III')

const pick = (near: boolean, sample = true): Pick => ({
  tier: near ? 'best' : 'pick',
  checks: { near, demand: true, fit: true },
  candidate: {
    match: DRIVING,
    nearCount: near ? 1 : 0,
    nearestKm: 27.3,
    nearestName: 'Malolos Skills and Driving Academy',
    demand: { level: 'high', limited: false, count: 45, sample, rank: 1, rankedOf: 18 },
    fit: true,
  },
})

const region = (over: Partial<DemandRegionCard> = {}): DemandRegionCard => ({
  regionCode: 'III',
  name: 'Region III (Central Luzon)',
  count: 45,
  sample: true,
  training: 1,
  assessment: 1,
  km: 35,
  titles: ['Truck Driver'],
  balance: 'more_supply',
  ...over,
})

const suggestion = {
  qualification: { code: 'CUSTOMER-SERVICES-NC-II', name: 'Customer Services NC II', sector: '' },
  posting_count: 107,
  level: 'high',
  limited: false,
  fit: 0,
  reasons: ['107 posting records in National Capital Region: high demand here.'],
} as unknown as NearbySuggestion

const model = (over: Partial<GuidedModel> = {}): GuidedModel => ({
  order: ['near', 'demand', 'consider'],
  pick: pick(false),
  near: { kind: 'none-in-range', nearestKm: 27.3, town: 'Malolos', widenTo: 30 },
  demand: {
    status: 'ready',
    group: { goodNews: { home: 'National Capital Region', rankedOf: 18 }, cards: [region()] },
    query: 'Driving NC II',
  },
  consider: { status: 'ready', items: [suggestion], area: 'National Capital Region' },
  key: 'drive|DRIVING-NC-II',
  pickReady: true,
  ...over,
})

const props = (over: Partial<GuidedViewProps> = {}): GuidedViewProps => ({
  model: model(),
  rangeKm: 10,
  signedIn: true,
  played: false,
  onRevealed: vi.fn(),
  onQualification: vi.fn(),
  onRegion: vi.fn(),
  onConsider: vi.fn(),
  onWiden: vi.fn(),
  ...over,
})

const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })

beforeEach(() => {
  mockMediaQueries({})
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('GuidedView', () => {
  it('shows the 2-of-3 pick with the missing check', () => {
    render(<GuidedView {...props({ played: true })} />)
    expect(screen.getByText("TRACK's pick")).toBeInTheDocument()
    expect(screen.getByText('Nothing within 10 km · nearest 27 km')).toBeInTheDocument()
    expect(
      screen.getByText('In demand · National Capital Region ranks #1 of 18 (modelled)'),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Look up to 30 km' }).length).toBeGreaterThan(0)
  })

  it('the pick has its own gold, like its star on the map; the best fit stays green', () => {
    const { rerender } = render(<GuidedView {...props({ played: true })} />)
    expect(screen.getByRole('region', { name: "TRACK's pick" }).className).toContain('border-pick')
    rerender(<GuidedView {...props({ played: true, model: model({ pick: pick(true) }) })} />)
    expect(screen.getByRole('region', { name: '★ Best fit for you' }).className).toContain(
      'border-good-fill',
    )
  })

  it('pick becomes best without replaying', () => {
    const { rerender, container } = render(<GuidedView {...props({ played: true })} />)
    rerender(
      <GuidedView
        {...props({ played: true, rangeKm: 30, model: model({ pick: pick(true) }) })}
      />,
    )
    expect(screen.getByText('★ Best fit for you')).toBeInTheDocument()
    expect(screen.getByText('Near you · Malolos Skills and Driving Academy, 27 km')).toBeInTheDocument()
    expect(container.querySelector('[style*="animation-delay"]')).toBeNull()
  })

  it('widen calls back with the km', async () => {
    const onWiden = vi.fn()
    render(<GuidedView {...props({ played: true, onWiden })} />)
    await userEvent.click(screen.getAllByRole('button', { name: 'Look up to 30 km' })[0]!)
    expect(onWiden).toHaveBeenCalledWith(30)
  })

  it('groups appear in order', async () => {
    vi.useFakeTimers()
    // As useGuided reports while the outlook is on its way.
    const loading = model({
      demand: { ...model().demand, status: 'loading' },
      pickReady: false,
    })
    const { rerender } = render(<GuidedView {...props({ model: loading })} />)
    await advance(0)
    // The pick waits for the outlook, so nothing yet.
    expect(screen.queryByText("TRACK's pick")).toBeNull()
    rerender(<GuidedView {...props()} />)
    await advance(0)
    expect(screen.getByText("TRACK's pick")).toBeInTheDocument()
    expect(screen.queryByText('Driving NC II near you')).toBeNull()
    await advance(500)
    expect(screen.getByText('Driving NC II near you')).toBeInTheDocument()
    expect(screen.queryByText('Where Driving NC II is in demand')).toBeNull()
    await advance(500)
    expect(screen.getByText('Where Driving NC II is in demand')).toBeInTheDocument()
    expect(screen.queryByText('In demand in National Capital Region')).toBeNull()
    await advance(500)
    expect(screen.getByText('In demand in National Capital Region')).toBeInTheDocument()
  })

  it('tells when the reveal is done', async () => {
    vi.useFakeTimers()
    const onRevealed = vi.fn()
    render(<GuidedView {...props({ onRevealed })} />)
    // React renders between ticks, as it does between frames in a browser.
    for (let tick = 0; tick < 5; tick++) await advance(500)
    expect(onRevealed).toHaveBeenCalledWith('drive|DRIVING-NC-II')
    expect(screen.getByRole('status')).toHaveTextContent('Results: 3 groups')
  })

  it('restarts the reveal for a new search', async () => {
    vi.useFakeTimers()
    const { rerender } = render(<GuidedView {...props()} />)
    await advance(200)
    rerender(
      <GuidedView
        {...props({
          model: model({ key: 'weld|SMAW', demand: { ...model().demand, query: 'Welding' } }),
        })}
      />,
    )
    await advance(400)
    // 600 ms after the first search but only 400 ms into the new one: its first group isn't due yet.
    expect(screen.queryByText('Driving NC II near you')).toBeNull()
    await advance(100)
    expect(screen.getByText('Welding near you')).toBeInTheDocument()
  })

  it('does not replay on back', () => {
    vi.useFakeTimers()
    render(<GuidedView {...props({ played: true })} />)
    expect(screen.getByText('In demand in National Capital Region')).toBeInTheDocument()
  })

  it('reduced motion shows all at once', () => {
    mockMediaQueries({ '(prefers-reduced-motion: reduce)': true })
    vi.useFakeTimers()
    const { container } = render(<GuidedView {...props()} />)
    expect(screen.getByText('In demand in National Capital Region')).toBeInTheDocument()
    expect(container.querySelector('[style*="animation-delay"]')).toBeNull()
  })

  it('modelled wording', () => {
    render(<GuidedView {...props({ played: true })} />)
    expect(screen.getByText('45 demand records (modelled)')).toBeInTheDocument()
    expect(screen.queryByText(/job posts/)).toBeNull()
  })

  it('posting wording without the modelled flag', () => {
    const real = model({
      pick: pick(false, false),
      demand: { ...model().demand, group: { goodNews: null, cards: [region({ sample: false })] } },
    })
    render(<GuidedView {...props({ played: true, model: real })} />)
    expect(screen.getByText('45 job posts')).toBeInTheDocument()
    expect(screen.queryByText(/modelled/)).toBeNull()
  })

  it('good news line', () => {
    render(<GuidedView {...props({ played: true })} />)
    expect(
      screen.getByText('Good news: National Capital Region ranks #1 of 18 for Driving NC II'),
    ).toBeInTheDocument()
  })

  it('outlook error shows a line, not a card', () => {
    const failed = model({
      demand: { status: 'error', group: { goodNews: null, cards: [] }, query: 'Driving NC II' },
    })
    render(<GuidedView {...props({ played: true, model: failed })} />)
    expect(screen.getByText("Couldn't load where this is in demand.")).toBeInTheDocument()
  })

  it('renders without a place', () => {
    const nowhere = model({
      pick: null,
      near: { kind: 'no-place' },
      demand: {
        status: 'ready',
        group: { goodNews: null, cards: [region({ km: null })] },
        query: 'Driving NC II',
      },
      consider: { status: 'hidden', items: [], area: null },
    })
    render(<GuidedView {...props({ played: true, model: nowhere })} />)
    expect(
      screen.getByText('Share your location or type a place to see centers near you'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/In demand in/)).toBeNull()
    expect(screen.queryByText(/about \d+ km/)).toBeNull()
  })

  it('near cards say how many centers and how near', async () => {
    const onQualification = vi.fn()
    const near = model({
      pick: null,
      near: {
        kind: 'cards',
        cards: [{ match: ARTICULATED, nearCount: 2, nearestKm: 4.2, nearestMinutes: 12 }],
      },
    })
    render(<GuidedView {...props({ played: true, model: near, onQualification })} />)
    expect(screen.getByText('2 centers within 10 km · nearest 4.2 km (12 min)')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Driving \(Articulated Vehicle\) NC III/ }))
    expect(onQualification).toHaveBeenCalledWith('DRIVING-NC-III')
  })

  it('taps reach their callbacks', async () => {
    const onQualification = vi.fn()
    const onRegion = vi.fn()
    const onConsider = vi.fn()
    render(<GuidedView {...props({ played: true, onQualification, onRegion, onConsider })} />)
    await userEvent.click(screen.getByRole('button', { name: /See centers/ }))
    expect(onQualification).toHaveBeenCalledWith('DRIVING-NC-II')
    await userEvent.click(screen.getByRole('button', { name: /Region III \(Central Luzon\)/ }))
    expect(onRegion).toHaveBeenCalledWith(region())
    await userEvent.click(screen.getByRole('button', { name: /Customer Services NC II/ }))
    expect(onConsider).toHaveBeenCalledWith(suggestion)
  })

  it('a skeleton holds the place while the pick waits', () => {
    const { container } = render(
      <GuidedView {...props({ model: model({ pickReady: false }) })} />,
    )
    expect(screen.queryByText("TRACK's pick")).toBeNull()
    expect(container.querySelector('[data-guided-skeleton]')).not.toBeNull()
  })

  it('the pick waits for every candidate, so it never changes after it shows', async () => {
    vi.useFakeTimers()
    const { rerender } = render(<GuidedView {...props({ model: model({ pickReady: false }) })} />)
    await advance(600)
    expect(screen.queryByText("TRACK's pick")).toBeNull()
    rerender(<GuidedView {...props()} />)
    await advance(0)
    expect(screen.getByText("TRACK's pick")).toBeInTheDocument()
  })

  it('relocating with no center recorded says so, not "Infinity km"', () => {
    const none = model({
      pick: { ...pick(false), candidate: { ...pick(false).candidate, nearestKm: null } },
    })
    render(<GuidedView {...props({ played: true, rangeKm: Infinity, model: none })} />)
    expect(screen.getByText('No center recorded for it yet')).toBeInTheDocument()
    expect(screen.queryByText(/Infinity/)).toBeNull()
  })

  it('relocate order puts demand first', () => {
    render(
      <GuidedView
        {...props({ played: true, model: model({ order: ['demand', 'near', 'consider'] }) })}
      />,
    )
    const labels = screen.getAllByRole('heading', { level: 3 }).map((node) => node.textContent)
    expect(labels.indexOf('Where Driving NC II is in demand')).toBeLessThan(
      labels.indexOf('Driving NC II near you'),
    )
  })
})
