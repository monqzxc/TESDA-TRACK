import { describe, expect, it } from 'vitest'
import { splitPhones } from './phone.ts'

describe('splitPhones', () => {
  it('expands spreadsheet scientific notation for both the label and dial target', () => {
    expect(splitPhones('9.606888727E9')).toEqual([{ text: '09606888727', tel: '09606888727' }])
    expect(splitPhones('9.606888727e+09 / (02) 8123-4567')).toEqual([
      { text: '09606888727', tel: '09606888727' },
      { text: '(02) 8123-4567', tel: '0281234567' },
    ])
    expect(splitPhones('6.39606888727E11')).toEqual([
      { text: '+639606888727', tel: '+639606888727' },
    ])
    expect(splitPhones('9.6068887270E9')).toEqual([{ text: '09606888727', tel: '09606888727' }])
  })

  it('does not dial fractional, malformed or oversized spreadsheet values', () => {
    for (const value of ['9.606888727E-9', '9.606888727E8', '9.6E99', '9.6E', 'NaN']) {
      expect(splitPhones(value)).toEqual([])
    }
  })

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

  it('does not append range suffixes to the explicitly listed first number', () => {
    expect(splitPhones('(032) 256-1302 to 04; 255-2331').map((n) => n.tel)).toEqual([
      '0322561302',
      '0322552331',
    ])
    expect(splitPhones('8535-5885 to\n 86 loc. 106').map((n) => n.tel)).toEqual([
      '85355885;ext=106',
    ])
  })

  it('separates repeated area codes without punctuation or newlines', () => {
    for (const separator of [' ', '\n']) {
      expect(
        splitPhones(`(084) 822-4182${separator}(084) 628-6915${separator}09287447391`).map(
          (n) => n.tel,
        ),
      ).toEqual(['0848224182', '0846286915', '09287447391'])
    }
  })

  it('attaches multiple extensions to the same complete base using tel URI parameters', () => {
    expect(splitPhones('(032) 410-8822 local: 7145 / 7153').map((n) => n.tel)).toEqual([
      '0324108822;ext=7145',
      '0324108822;ext=7153',
    ])
    expect(splitPhones('221-0634 (Local 1401)').map((n) => n.tel)).toEqual(['2210634;ext=1401'])
    expect(splitPhones('8721-2000 Local: 763/\n 09173895787').map((n) => n.tel)).toEqual([
      '87212000;ext=763',
      '09173895787',
    ])
  })

  it('excludes fax tails and rejects incomplete or merged phone numbers', () => {
    for (const value of [
      'Fax: 2561669',
      'TeleFax No. (064) 421-4386',
      '0327153',
      '032256130204',
      '0848224182084',
    ])
      expect(splitPhones(value)).toEqual([])
    expect(splitPhones('(032) 2561672; 2532170 , Fax: 2561669').map((n) => n.tel)).toEqual([
      '0322561672',
      '0322532170',
    ])
    expect(splitPhones('(062)200-7866 Fax Tel (062)200-3272').map((n) => n.tel)).toEqual([
      '0622007866',
    ])
  })

  it('retains numeric source phones with omitted trunk prefixes and wrapped local digits', () => {
    expect(splitPhones('9436584850 / 639455898784 / 36-6202964').map((n) => n.tel)).toEqual([
      '09436584850',
      '+639455898784',
      '0366202964',
    ])
    expect(splitPhones('34-703-\n8917').map((n) => n.tel)).toEqual(['0347038917'])
  })
})
