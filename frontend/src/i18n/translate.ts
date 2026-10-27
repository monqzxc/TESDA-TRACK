export type Dictionary = Readonly<Record<string, string>>

const escapePattern = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function mapStrings(value: unknown, transform: (text: string) => string): unknown {
  if (typeof value === 'string') return transform(value)
  if (Array.isArray(value)) return value.map((item: unknown) => mapStrings(item, transform))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, mapStrings(item, transform)]),
    )
  }
  return value
}

/** Translate fixed UI copy only. API records and learner input never pass through this function. */
export function createTranslator(dictionary: Dictionary) {
  const patterns = Object.entries(dictionary)
    .filter(([source]) => /\{\d+\}/.test(source))
    // Specific sentences must win over broad endings such as "{0} skills".
    .sort(([a], [b]) => b.replace(/\{\d+\}/g, '').length - a.replace(/\{\d+\}/g, '').length)
    .map(([source, translated]) => {
      const slots: string[] = []
      const escaped = source
        .split(/(\{\d+\})/)
        .map((part) => {
          if (/^\{\d+\}$/.test(part)) {
            slots.push(part)
            return '([\\s\\S]+?)'
          }
          return escapePattern(part)
        })
        .join('')
      return { expression: new RegExp(`^${escaped}$`), translated, slots }
    })

  function text(source: string, dynamic: boolean): string {
    if (Object.hasOwn(dictionary, source)) return dictionary[source]
    if (dynamic) {
      for (const { expression, translated, slots } of patterns) {
        const match = expression.exec(source)
        if (!match) continue
        // Replace in one pass: a learner's literal "{1}" must never become another substitution.
        return translated.replace(/\{\d+\}/g, (slot) => {
          const index = slots.indexOf(slot)
          return index === -1 ? slot : match[index + 1]
        })
      }
    }
    return source
  }

  function localize<T>(value: T, dynamic = false): T {
    if (typeof value === 'string') return text(value, dynamic) as T
    if (typeof value === 'function') {
      return ((...args: unknown[]) => {
        const result: unknown = Reflect.apply(value, undefined, args)
        const fragments = new Set<string>()
        mapStrings(args, (argument) => {
          if (argument) fragments.add(argument)
          return argument
        })
        if (!fragments.size) return localize(result, true)
        // Hide inserted names/data before matching a template. A qualification called "Digital skills"
        // must not accidentally match the generic "{0} skills" template inside "For Digital skills".
        const originals = [...fragments].sort((a, b) => b.length - a.length)
        let prefix = '\uE000'
        const serialized = JSON.stringify([args, result])
        while (serialized.includes(prefix)) prefix += '\uE000'
        const inserted = new RegExp(originals.map(escapePattern).join('|'), 'g')
        const protectedResult = mapStrings(result, (source) =>
          source.replace(inserted, (argument) => `${prefix}${originals.indexOf(argument)}\uE001`),
        )
        const translated = localize(protectedResult, true)
        const marker = new RegExp(`${prefix}(\\d+)\uE001`, 'g')
        return mapStrings(translated, (source) =>
          source.replace(marker, (_match, index: string) => originals[Number(index)]),
        )
      }) as T
    }
    if (Array.isArray(value)) return value.map((item: unknown) => localize(item, dynamic)) as T
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]: [string, unknown]) => {
          // These are submitted to the API or used as identifiers, rather than interface labels.
          const payload =
            (key === 'goal' &&
              Object.keys(value).length === 2 &&
              ('label' in value || 'language' in value)) ||
            ['id', 'href', 'quote', 'exportFileName', 'exploreGoal'].includes(key)
          return [key, payload ? item : localize(item, dynamic)]
        }),
      ) as T
    }
    return value
  }

  return localize
}
