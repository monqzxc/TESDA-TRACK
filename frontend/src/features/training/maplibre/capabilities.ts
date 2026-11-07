// What this browser and device can draw, checked once per page load without loading MapLibre: CenterMap.tsx decides
// from it whether to load MapLibre at all. MapLibre 6 draws with WebGL 2 only; without it the map stays on Leaflet.

export interface MapSupport {
  /** WebGL 2 works here, so MapLibre can draw. */
  webgl2: boolean
  /**
   * The device is likely to draw slowly: software rendering, little memory, few cores, or the browser asked to save
   * data. It gets a dependable 2D map: no 3D buildings, no hillshade, fewer pixels.
   */
  lowEnd: boolean
  /** The browser asked to use less data (Save-Data): no hillshade tiles. */
  saveData: boolean
}

interface DeviceHints {
  deviceMemory?: number
  hardwareConcurrency?: number
  connection?: { saveData?: boolean }
}

/** Whether a WebGL 2 context can be made, and whether only by software rendering (a major performance caveat). */
export function probeWebGL2(): { available: boolean; software: boolean } {
  if (typeof document === 'undefined') return { available: false, software: false }
  const attempt = (failIfMajorPerformanceCaveat: boolean) => {
    try {
      const canvas = document.createElement('canvas')
      const gl = canvas.getContext('webgl2', { failIfMajorPerformanceCaveat })
      // Hand the context back at once: browsers allow only a few at a time.
      gl?.getExtension('WEBGL_lose_context')?.loseContext()
      return gl !== null
    } catch {
      return false
    }
  }
  if (attempt(true)) return { available: true, software: false }
  const available = attempt(false)
  return { available, software: available }
}

/** The device's hints, read once: from navigator, where the browser shares them. */
export function deviceSupport(
  webgl: { available: boolean; software: boolean },
  hints: DeviceHints = typeof navigator === 'undefined' ? {} : (navigator as DeviceHints),
): MapSupport {
  const saveData = hints.connection?.saveData === true
  const lowMemory = typeof hints.deviceMemory === 'number' && hints.deviceMemory <= 2
  const fewCores = typeof hints.hardwareConcurrency === 'number' && hints.hardwareConcurrency <= 2
  return {
    webgl2: webgl.available,
    lowEnd: webgl.software || lowMemory || fewCores || saveData,
    saveData,
  }
}

let checked: MapSupport | null = null

/** This page's map support, probed the first time it's asked for. */
export function mapSupport(): MapSupport {
  checked ??= deviceSupport(probeWebGL2())
  return checked
}
