import { lazy } from 'react'
import type { CenterMapProps } from './CenterMapTypes.ts'

export type { CenterMapProps, MapRoute } from './CenterMapTypes.ts'

// The center map. Pages load this module when the map is first shown (React.lazy), and it loads the renderer that
// draws it, in a chunk of its own, so a page whose map is hidden downloads neither.
const CenterMapLeaflet = lazy(() => import('./CenterMapLeaflet.tsx'))

export default function CenterMap(props: CenterMapProps) {
  return <CenterMapLeaflet {...props} />
}
