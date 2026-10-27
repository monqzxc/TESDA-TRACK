import type { Config, Driver } from 'driver.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { startTour } from './startTour.ts'

const { createDriver, destroy } = vi.hoisted(() => ({
  createDriver: vi.fn(),
  destroy: vi.fn(),
}))

vi.mock('driver.js', () => ({ driver: createDriver }))
vi.mock('./tours.ts', () => ({ buildTourSteps: () => [{ popover: { title: 'Guide' } }] }))

beforeEach(() => {
  vi.clearAllMocks()
  createDriver.mockReturnValue({ drive: vi.fn(), destroy })
})

describe('tour shutdown', () => {
  it('finalizes an early close even when Driver omits its post-animation onDestroyed hook', () => {
    const finished = vi.fn()
    startTour('progress', finished)
    const config: Config = createDriver.mock.calls[0][0]
    const driver = createDriver.mock.results[0].value as Driver

    config.onDestroyStarted?.(undefined, {}, { config, state: {}, driver, index: 0 })

    expect(destroy).toHaveBeenCalledTimes(1)
    expect(finished).toHaveBeenCalledTimes(1)
    // A later library callback must not restore focus twice.
    config.onDestroyed?.(undefined, {}, { config, state: {}, driver, index: 0 })
    expect(finished).toHaveBeenCalledTimes(1)
  })

  it('finalizes explicit destruction before an animation has committed its first step', () => {
    const finished = vi.fn()
    const tour = startTour('progress', finished)
    tour.destroy()
    tour.destroy()

    expect(finished).toHaveBeenCalledTimes(1)
  })
})
