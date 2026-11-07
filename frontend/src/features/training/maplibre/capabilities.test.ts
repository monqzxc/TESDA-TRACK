import { afterEach, describe, expect, it, vi } from 'vitest'
import { deviceSupport, probeWebGL2 } from './capabilities.ts'

const HARDWARE = { available: true, software: false }

describe('what the device can draw', () => {
  it('is a full map with WebGL 2 on capable hardware', () => {
    expect(deviceSupport(HARDWARE, { deviceMemory: 8, hardwareConcurrency: 8 })).toEqual({
      webgl2: true,
      lowEnd: false,
      saveData: false,
    })
  })

  it('is a dependable 2D map where drawing would be slow', () => {
    // Software rendering, little memory, or few cores.
    expect(deviceSupport({ available: true, software: true }, {}).lowEnd).toBe(true)
    expect(deviceSupport(HARDWARE, { deviceMemory: 2 }).lowEnd).toBe(true)
    expect(deviceSupport(HARDWARE, { deviceMemory: 4 }).lowEnd).toBe(false)
    expect(deviceSupport(HARDWARE, { hardwareConcurrency: 2 }).lowEnd).toBe(true)
  })

  it('downloads less where the browser asks to save data', () => {
    expect(deviceSupport(HARDWARE, { connection: { saveData: true } })).toEqual({
      webgl2: true,
      lowEnd: true,
      saveData: true,
    })
  })

  it('has no MapLibre map without WebGL 2', () => {
    expect(deviceSupport({ available: false, software: false }, {}).webgl2).toBe(false)
  })
})

describe('checking for WebGL 2', () => {
  afterEach(() => vi.restoreAllMocks())

  const contexts = (answer: (attributes: WebGLContextAttributes) => boolean) => {
    const lose = vi.fn()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((
      type: string,
      attributes?: WebGLContextAttributes,
    ) =>
      type === 'webgl2' && answer(attributes ?? {})
        ? ({ getExtension: () => ({ loseContext: lose }) } as unknown as WebGL2RenderingContext)
        : null) as typeof HTMLCanvasElement.prototype.getContext)
    return lose
  }

  it('finds hardware drawing, and hands the context back at once', () => {
    const lose = contexts(() => true)
    expect(probeWebGL2()).toEqual({ available: true, software: false })
    expect(lose).toHaveBeenCalled()
  })

  it('tells software drawing apart: a context only without failIfMajorPerformanceCaveat', () => {
    contexts((attributes) => !attributes.failIfMajorPerformanceCaveat)
    expect(probeWebGL2()).toEqual({ available: true, software: true })
  })

  it('finds none where the browser refuses a WebGL 2 context', () => {
    contexts(() => false)
    expect(probeWebGL2()).toEqual({ available: false, software: false })
  })
})
