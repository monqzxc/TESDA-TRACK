/** One number from a center's contact line: the text as listed, and the digits a `tel:` link dials. */
export interface PhoneNumber {
  text: string
  tel: string
}

const digitCount = (text: string) => text.replace(/\D/g, '').length
const dialable = (text: string) => text.replace(/[^+\d]/g, '')

/** Expand spreadsheet notation exactly, without floating-point rounding or inventing missing digits. */
function spreadsheetPhone(text: string): string | null {
  if (!/\d[eE]/.test(text)) return text
  const match = /^(\d+)(?:\.(\d+))?[eE]\+?(\d{1,2})$/.exec(text)
  if (!match) return null
  const fraction = match[2] ?? ''
  const digits = match[1] + fraction
  const shift = Number(match[3]) - fraction.length
  if (shift < 0 && !/^0*$/.test(digits.slice(shift))) return null
  let expanded = shift < 0 ? digits.slice(0, shift) : digits + '0'.repeat(shift)
  if (!/^[1-9]\d{6,14}$/.test(expanded)) return null
  // Philippine mobile numbers lose their domestic zero when stored as numeric spreadsheet cells.
  if (/^9\d{9}$/.test(expanded)) expanded = `0${expanded}`
  else if (/^639\d{9}$/.test(expanded)) expanded = `+${expanded}`
  return expanded
}

/** Only complete phone numbers become Call links; short extensions need their own base number. */
function validNumber(tel: string): boolean {
  return /^(?:\+[1-9]\d{7,14}|09\d{9}|0[2-8]\d{7,9}|[2-9]\d{5,7})$/.test(tel)
}

/**
 * Parses the imported contact line without merging separate phones, ranges, extensions or fax numbers.
 * For a range, only the explicitly written first number is dialled: suffixes are not invented as full numbers.
 * Extensions use the standard tel URI extension parameter, never concatenated digits or dialer pause commas.
 * Fax-only tails are excluded conservatively, including TeleFax and Fax Tel labels.
 */
export function splitPhones(value: string): PhoneNumber[] {
  const result: PhoneNumber[] = []
  let area = ''
  let extensionBase: PhoneNumber | null = null
  const source = value
    .split(/\b(?:telefax|fax)\b/i)[0]
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/-\s*[\r\n]+\s*(?=\d{1,4}(?:\D|$))/g, '-')
    .replace(/\bto\s*\d{1,8}/gi, '')
  const addNumber = (raw: string): PhoneNumber | null => {
    const text = spreadsheetPhone(raw.trim())
    if (text === null) return null
    let tel = dialable(text)
    // Numeric source cells may omit the domestic trunk zero or the international plus sign.
    if (/^9\d{9}$/.test(tel)) tel = `0${tel}`
    else if (/^63\d{9,10}$/.test(tel)) tel = `+${tel}`
    else if (/^[2-8]\d{8}$/.test(tel)) tel = `0${tel}`
    const explicitArea = /^\s*\(\s*(0[2-8]\d{0,2})\s*\)?/.exec(text)
    if (explicitArea) area = explicitArea[1]
    else if (area && /^[2-9]\d{5,7}$/.test(tel)) tel = area + tel
    if (!validNumber(tel)) return null
    const phone = { text, tel }
    result.push(phone)
    return phone
  }
  const addExtensions = (raw: string) => {
    if (!extensionBase) return
    for (const extension of raw
      .replace(/[()]/g, '')
      .trim()
      .split(/\s*(?:[,;/|]|\b(?:or|and)\b)\s*/i)) {
      if (!/^\d{1,6}$/.test(extension)) continue
      result.push({
        text: `${extensionBase.text} local ${extension}`,
        tel: `${extensionBase.tel};ext=${extension}`,
      })
    }
  }
  for (const part of source.split(/\s*(?:[,;/|\r\n]|\b(?:or|and)\b)\s*/i)) {
    const raw = part.trim()
    if (!raw) continue
    // A short item following an explicit local/extension label belongs to that base, not its area code.
    if (extensionBase && /^\d{1,6}\)?$/.test(raw)) {
      addExtensions(raw)
      continue
    }
    extensionBase = null
    const extension = /\(?\b(?:local|loc\.?|ext(?:ension)?\.?)\s*[:.#]?\s*/i.exec(raw)
    const main = extension ? raw.slice(0, extension.index) : raw
    let current = ''
    let last: PhoneNumber | null = null
    // Parenthesized area codes always start another number after a complete one, even without a separator.
    for (const token of main
      .replace(/(\(\s*\d{2,4}\s*\))/g, ' $1 ')
      .trim()
      .split(/\s+/)) {
      if (!token) continue
      if (
        current &&
        digitCount(current) >= 7 &&
        (/^\(\d{2,4}\)$/.test(token) || digitCount(token) >= 7)
      ) {
        last = addNumber(current)
        current = token
      } else current = current ? `${current} ${token}` : token
    }
    if (current) last = addNumber(current)
    if (extension && last) {
      extensionBase = last
      const before = result.length
      addExtensions(raw.slice(extension.index + extension[0].length))
      // Where extensions are known, use those links rather than duplicating a base-only Call action.
      if (result.length > before) result.splice(before - 1, 1)
    }
  }
  return result.filter(
    (phone, index) => result.findIndex((other) => other.tel === phone.tel) === index,
  )
}
