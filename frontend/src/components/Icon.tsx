import { icons, type IconName, type IconShape } from './icons.ts'

export type { IconName } from './icons.ts'

type IconProps = {
  name: IconName
  /** Gives the icon role="img" and this accessible name. Without it the icon is decorative and hidden. */
  label?: string
  /** A CSS length or a number of pixels. Defaults to 1em, so the icon follows the text around it. */
  size?: number | string
  className?: string
}

// Icons draw in currentColor, so they take the color of the text around them in either theme.
export function Icon({ name, label, size = '1em', className }: IconProps) {
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true }
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      className={className}
      {...a11y}
    >
      {icons[name].map((shape: IconShape, i) => (
        <Shape key={i} shape={shape} />
      ))}
    </svg>
  )
}

function Shape({ shape }: { shape: IconShape }) {
  switch (shape.tag) {
    case 'path':
      return <path d={shape.d} fill={shape.filled ? 'currentColor' : undefined} />
    case 'circle':
      return <circle cx={shape.cx} cy={shape.cy} r={shape.r} />
    case 'rect':
      return (
        <rect x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx={shape.rx} />
      )
  }
}
