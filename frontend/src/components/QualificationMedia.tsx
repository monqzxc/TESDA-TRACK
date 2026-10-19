import { cssVars, cx } from '../lib/style.ts'
import { Icon, type IconName } from './Icon.tsx'
import electricalCard from './img/electrical-card.jpg'
import electricalThumb from './img/electrical-thumb.jpg'
import weldingCard from './img/welding-card.jpg'
import weldingThumb from './img/welding-thumb.jpg'

// A qualification's picture (classic/presentation.py qualification_media): its trade's photo when there is one,
// otherwise a tile in its sector's colors with the sector's icon. Pictures are decoration: the card's text names
// the qualification and its sector.

/** Trades with a photo: (a word in the qualification's name, the photo for cards, the one for thumbnails). */
const TRADE_PHOTOS: readonly (readonly [string, string, string])[] = [
  ['weld', weldingCard, weldingThumb],
  ['electric', electricalCard, electricalThumb],
]

/** A sector's tile: its icon and the two ends of its gradient. */
export interface SectorArt {
  icon: IconName
  start: string
  end: string
}

/**
 * Sector tiles by the words in a sector's name. The first family that matches wins, so "Automotive and Land
 * Transportation" is a car before "transport" makes it a truck.
 */
const SECTOR_ART: readonly (SectorArt & { words: readonly string[] })[] = [
  { words: ['construction'], icon: 'helmet', start: '#e3912f', end: '#b4621a' },
  { words: ['agri', 'fish'], icon: 'sprout', start: '#4caf6e', end: '#2b7a48' },
  { words: ['metal'], icon: 'wrench', start: '#5b7aa3', end: '#33507a' },
  { words: ['health', 'social'], icon: 'heart', start: '#e0607a', end: '#ac3651' },
  { words: ['touris'], icon: 'cloche', start: '#7b61d6', end: '#5038a3' },
  { words: ['information', 'communication'], icon: 'monitor', start: '#2f6fe0', end: '#1a4aa8' },
  { words: ['automotive'], icon: 'car', start: '#4f6fa0', end: '#2c4772' },
  { words: ['electric'], icon: 'bolt', start: '#e0a12f', end: '#b0701a' },
  { words: ['utilit'], icon: 'drop', start: '#17a2a0', end: '#0c6f6c' },
  { words: ['maritime'], icon: 'anchor', start: '#2f7fd0', end: '#1a5296' },
  { words: ['heating', 'refrigeration'], icon: 'fan', start: '#22a3b5', end: '#13707e' },
  { words: ['food', 'beverage'], icon: 'cup', start: '#d9822f', end: '#a85a18' },
  {
    words: ['creative', 'visual', 'media', 'decorative'],
    icon: 'palette',
    start: '#9a5fd0',
    end: '#6a3aa0',
  },
  { words: ['garment', 'furniture'], icon: 'shirt', start: '#d0607f', end: '#9e3a58' },
  { words: ['logistic', 'transport', 'trading'], icon: 'truck', start: '#3c79c9', end: '#24528f' },
]
const DEFAULT_SECTOR_ART: SectorArt = { icon: 'learn', start: '#2f6fe0', end: '#1a4aa8' }

export function sectorArt(sector: string): SectorArt {
  const name = sector.toLocaleLowerCase('en-US')
  return (
    SECTOR_ART.find(({ words }) => words.some((word) => name.includes(word))) ?? DEFAULT_SECTOR_ART
  )
}

/** The trade's photo for a qualification, or undefined when its trade has none. */
export function tradePhoto(name: string, size: 'card' | 'thumb'): string | undefined {
  const folded = name.toLocaleLowerCase('en-US')
  const found = TRADE_PHOTOS.find(([word]) => folded.includes(word))
  return found && (size === 'card' ? found[1] : found[2])
}

interface QualificationMediaProps {
  name: string
  sector: string
  /** A thumbnail beside a library card's sector, or the wide picture on a match card. */
  size: 'card' | 'thumb'
  className?: string
}

// After classic/styles.css's .qual-photo and .qual-tile. The picture fills the box its card gives it.
export function QualificationMedia({ name, sector, size, className }: QualificationMediaProps) {
  const photo = tradePhoto(name, size)
  if (photo) {
    return (
      <img
        className={cx('block size-full object-cover', className)}
        src={photo}
        alt=""
        loading="lazy"
        decoding="async"
      />
    )
  }
  const art = sectorArt(sector)
  // The sector's icon in white over two soft circles and the sector's gradient.
  return (
    <span
      className={cx(
        'grid size-full place-items-center text-white',
        'bg-[image:radial-gradient(circle_at_92%_0%,#ffffff24_0_34%,transparent_35%),radial-gradient(circle_at_0%_105%,#ffffff17_0_30%,transparent_31%),linear-gradient(135deg,var(--tile-start),var(--tile-end))]',
        className,
      )}
      style={cssVars({ '--tile-start': art.start, '--tile-end': art.end })}
      aria-hidden="true"
    >
      <Icon
        name={art.icon}
        className={cx('h-auto', size === 'thumb' ? 'w-1/2' : 'w-[min(30%,60px)]')}
      />
    </span>
  )
}
