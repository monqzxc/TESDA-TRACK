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

  it('shows a readable registry label for the imported assessment workbook', () => {
    const source = {
      source_name: 'Accredited Compentency Assessment Center based on Oct 7, 2026 Database.xlsx',
      source_reference: 'Assessment centers · row 25',
      source_updated_on: '2026-10-07',
    }
    const view = render(<DataProvenance value={source} />)
    const label = 'Accredited Competency Assessment Center registry (Oct 7, 2026)'
    expect(screen.getByText(`Source: ${label} (public source link not recorded)`)).toBeVisible()
    expect(screen.getByText('Reference: Assessment centers · row 25')).toBeVisible()
    expect(screen.getByText('2026-10-07')).toHaveAttribute('datetime', '2026-10-07')

    const sourceUrl = 'https://example.invalid/assessment-registry'
    view.rerender(<DataProvenance value={{ ...source, source_url: sourceUrl }} />)
    expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', sourceUrl)
  })

  it('shows example records as unverified, with no demo label', () => {
    const view = render(<DataProvenance value={{ status: 'example' }} compact />)
    expect(screen.getByText('Incomplete data')).toBeVisible()
    expect(screen.queryByText(/Example data|demonstration/i)).not.toBeInTheDocument()
    view.rerender(<DataProvenance value={{ status: 'example' }} />)
    expect(screen.getByText(/Confirm details before relying on them/)).toBeVisible()
    expect(screen.queryByText(/Example data|demonstration/i)).not.toBeInTheDocument()
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
