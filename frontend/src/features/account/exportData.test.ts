import { afterEach, describe, expect, it, vi } from 'vitest'
import { saveJson } from './exportData.ts'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('saveJson', () => {
  it("keeps the file's address long after the download starts, so the browser can finish reading it", () => {
    vi.useFakeTimers()
    // jsdom has no object URLs, and doesn't download.
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:export'),
    })
    const revoke = vi.fn()
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoke })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    saveJson({ account: 'Maria Santos' }, 'tesda-track-my-data.json')

    expect(click).toHaveBeenCalledOnce()
    vi.advanceTimersByTime(30_000)
    expect(revoke).not.toHaveBeenCalled()
    vi.advanceTimersByTime(10_000)
    expect(revoke).toHaveBeenCalledWith('blob:export')
  })
})
