import type { Qualification } from '../../api/queries.ts'

// A Skills Bridge standard's closest record in TESDA Track's own catalog (classic/skills_bridge_view.py
// _local_qualification). The two use different identifiers in some graphs, so an exact code match comes first and a
// conservative title match second. The page labels it as a local match for discovery, not an equivalency.

const LEVEL_WORDS = new Set(['nc', 'i', 'ii', 'iii', 'iv', 'v', 'vi', 'programming'])

/** Lower-case words, with anything that isn't a letter or digit as a space. */
function words(text: string | null | undefined): string[] {
  return (text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
}

export function localQualification(
  item: { code?: string | null; title?: string | null },
  catalog: readonly Qualification[],
): Qualification | null {
  const code = (item.code ?? '').trim().toLowerCase()
  if (code) {
    const exact = catalog.find((qualification) => qualification.code.trim().toLowerCase() === code)
    if (exact) return exact
  }
  const wanted = new Set(words(item.title).filter((word) => !LEVEL_WORDS.has(word)))
  if (!wanted.size) return null
  let best: { share: number; overlap: number; qualification: Qualification } | null = null
  for (const qualification of catalog) {
    const local = new Set(words(qualification.name))
    const overlap = [...wanted].filter((word) => local.has(word)).length
    if (!overlap) continue
    const share = overlap / wanted.size
    if (!best || share > best.share || (share === best.share && overlap > best.overlap)) {
      best = { share, overlap, qualification }
    }
  }
  return best && (best.overlap >= 2 || best.share >= 0.75) ? best.qualification : null
}
