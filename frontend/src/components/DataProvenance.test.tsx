import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DataProvenance, sourceLink } from './DataProvenance.tsx'

describe('record provenance', () => {
  it('shows a named source link and distinguishes source, review and record dates', () => {
    render(
      <DataProvenance
        value={{
          status: 'verified',
          source_name: 'TESDA Training Regulations',
          source_reference: 'Download 2519',
          source_url: 'https://tesda.gov.ph/Download/Training_Regulations',
          source_updated_on: '2026-10-01',
          reviewed_at: '2026-10-15T03:00:00Z',
          record_updated_at: '2026-10-21T01:00:00Z',
        }}
      />,
    )
    expect(screen.getByText('Verified data')).toBeVisible()
    expect(screen.getByRole('link', { name: 'TESDA Training Regulations' })).toHaveAttribute(
      'href',
      'https://tesda.gov.ph/Download/Training_Regulations',
    )
    expect(screen.getByText('Source updated:').parentElement).toBeTruthy()
    expect(screen.getByText('2026-10-01')).toHaveAttribute('datetime', '2026-10-01')
    expect(screen.getByText('2026-10-15')).toHaveAttribute('datetime', '2026-10-15T03:00:00Z')
    expect(screen.getByText('2026-10-21')).toHaveAttribute('datetime', '2026-10-21T01:00:00Z')
  })

  it('makes missing evidence explicit without inventing a date or a source link', () => {
    render(<DataProvenance />)
    expect(screen.getByText('Incomplete data')).toBeVisible()
    expect(screen.getByText(/public source link not recorded/)).toBeVisible()
    expect(screen.getAllByText(/Not recorded/)).toHaveLength(3)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('labels examples in compact listing cards and explains them in details', () => {
    const view = render(<DataProvenance value={{ status: 'example' }} compact />)
    expect(screen.getByText('Example data')).toBeVisible()
    expect(screen.queryByText(/For demonstration/)).not.toBeInTheDocument()
    view.rerender(<DataProvenance value={{ status: 'example' }} />)
    expect(screen.getByText(/For demonstration/)).toBeVisible()
  })

  it('keeps non-web source references and credentialed URLs out of links', () => {
    for (const value of [
      'javascript:alert(1)',
      'file:///registry.xlsx',
      'sheet 1 row 5',
      'https://user:secret@example.com',
    ]) {
      expect(sourceLink(value)).toBeUndefined()
    }
    expect(sourceLink('https://tesda.gov.ph/')).toBe('https://tesda.gov.ph/')
  })
})
