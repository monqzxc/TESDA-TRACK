/** One number from a center's contact line: the text as listed, and the digits a `tel:` link dials. */
export interface PhoneNumber {
  text: string
  tel: string
}

const digitCount = (text: string) => text.replace(/\D/g, '').length
const dialable = (text: string) => text.replace(/[^+\d]/g, '')

/**
 * Splits a center's contact line into the numbers it lists, as in "(032) 254-8324 254-8323" or
 * "412-5241, 256-0461", so each one gets its own `tel:` link. A dialer reads a comma as a pause, and merging
 * the digits makes one long number that isn't anyone's.
 *
 * Commas, semicolons, slashes and "or"/"and" always separate numbers. Within the rest, a group of 7 or more
 * digits after a number that is already whole starts the next one; shorter groups ("0917 123 4567") belong to it.
 * A bare local number after one with an area code in parentheses dials with that area code.
 */
export function splitPhones(value: string): PhoneNumber[] {
  const numbers: string[] = []
  for (const part of value.split(/\s*(?:[,;/|]|\b(?:or|and)\b)\s*/i)) {
    let current = ''
    for (const token of part.trim().split(/\s+/)) {
      if (!token) continue
      if (current && digitCount(current) >= 7 && digitCount(token) >= 7) {
        numbers.push(current)
        current = token
      } else current = current ? `${current} ${token}` : token
    }
    if (current) numbers.push(current)
  }

  let area = ''
  return numbers.flatMap((text) => {
    let tel = dialable(text)
    if (tel.replace(/\D/g, '').length < 3) return []
    const parenthesized = /^\s*\((\d{1,4})\)/.exec(text)
    if (parenthesized) area = parenthesized[1]
    else if (area && !tel.startsWith('+') && !tel.startsWith('0') && tel.length <= 8)
      tel = `${area}${tel}`
    return [{ text, tel }]
  })
}
