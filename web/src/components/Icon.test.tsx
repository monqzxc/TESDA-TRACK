import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Icon } from './Icon.tsx'
import { iconNames, icons } from './icons.ts'

describe('Icon', () => {
  it('is decorative by default', () => {
    const { container } = render(<Icon name="route" />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).not.toHaveAttribute('role')
    expect(svg).toHaveAttribute('width', '1em')
  })

  it('has a name when given a label', () => {
    render(<Icon name="check" label="Done" />)
    const img = screen.getByRole('img', { name: 'Done' })
    expect(img).not.toHaveAttribute('aria-hidden')
  })

  it('takes a size', () => {
    const { container } = render(<Icon name="pin" size={24} />)
    expect(container.querySelector('svg')).toHaveAttribute('height', '24')
  })

  it('draws every icon in currentColor', () => {
    expect(iconNames).toHaveLength(61)
    for (const name of iconNames) {
      const { container, unmount } = render(<Icon name={name} />)
      const svg = container.querySelector('svg')!
      expect(svg).toHaveAttribute('stroke', 'currentColor')
      expect(svg.children).toHaveLength(icons[name].length)
      for (const shape of svg.querySelectorAll('[fill]')) {
        expect(shape.getAttribute('fill')).toMatch(/^(currentColor|none)$/)
      }
      unmount()
    }
  })
})
