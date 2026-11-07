export type DemandPreference = 'in_demand' | 'hard_to_fill' | 'either'

/** Explicit demand requests only; a normal career/skill query keeps catalog discovery. */
export function demandPreference(query: string): DemandPreference | null {
  const positive = query.replaceAll('’', "'").replace(
    /\b(?:i (?:do not|don't|dont) (?:want|like)|i(?:'m| am) not interested in|not interested in|i hate|i dislike|ayoko(?:ng)?|ayaw ko|hindi ko gusto|di ko gusto|hindi ako interesado)\b.*?(?=[,;.!?]|\bbut\b|\bpero\b|$)/giu,
    ' ',
  )
  const demand = /\b(?:in[\s-]?demand|mataas\s+na\s+demand)\b/iu.test(positive)
  const shortage = /\bhard[\s-]+to[\s-]+fill\b/iu.test(positive)
  return demand && shortage ? 'either' : demand ? 'in_demand' : shortage ? 'hard_to_fill' : null
}
