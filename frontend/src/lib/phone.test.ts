import { describe, expect, it } from 'vitest'
import { splitPhones } from './phone.ts'

describe('splitPhones', () => {
  it('keeps a single number whole, spaces and all', () => {
    expect(splitPhones('(032) 254-8324')).toEqual([{ text: '(032) 254-8324', tel: '0322548324' }])
    expect(splitPhones('0917 123 4567')).toEqual([{ text: '0917 123 4567', tel: '09171234567' }])
    expect(splitPhones('+63 32 254 8324')).toEqual([
      { text: '+63 32 254 8324', tel: '+63322548324' },
    ])
  })

  it('splits numbers listed with only a space between them, carrying the area code over', () => {
    expect(splitPhones('(032) 254-8324 254-8323')).toEqual([
      { text: '(032) 254-8324', tel: '0322548324' },
      { text: '254-8323', tel: '0322548323' },
    ])
  })

  it('splits on commas, slashes, semicolons and "or"', () => {
    expect(splitPhones('412-5241, 256-0461')).toEqual([
      { text: '412-5241', tel: '4125241' },
      { text: '256-0461', tel: '2560461' },
    ])
    expect(
      splitPhones('0917-123-4567 / (02) 8123-4567; 8765-4321 or 0998 765 4321').map((n) => n.tel),
    ).toEqual(['09171234567', '0281234567', '0287654321', '09987654321'])
  })

  it('drops pieces with no number in them', () => {
    expect(splitPhones('')).toEqual([])
    expect(splitPhones('n/a')).toEqual([])
  })
})
