import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/errors.ts'
import { ServiceUnavailable } from './ServiceUnavailable.tsx'

const UNREACHABLE = "We can't reach the TESDA-TRACK service right now. Please try again shortly."

describe('ServiceUnavailable', () => {
  it("says the app can't load, with the request's message, and Try again retries", async () => {
    const onRetry = vi.fn()
    render(
      <ServiceUnavailable
        error={new ApiError({ message: UNREACHABLE, unavailable: true })}
        onRetry={onRetry}
      />,
    )

    expect(
      screen.getByRole('heading', { level: 2, name: "We can't load TESDA Track right now" }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Your saved progress is safe. Try again in a moment.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(UNREACHABLE)

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(onRetry).toHaveBeenCalledOnce()
  })

  it("never shows another error's text", () => {
    render(
      <ServiceUnavailable
        error={new Error('Cannot read properties of undefined (reading "goal")')}
        onRetry={() => {}}
      />,
    )

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText(/goal/)).not.toBeInTheDocument()
  })

  it('can stand in for a page, with an h1 that takes focus', () => {
    render(<ServiceUnavailable headingLevel={1} onRetry={() => {}} />)

    expect(screen.getByRole('heading', { level: 1 })).toHaveAttribute('tabindex', '-1')
  })
})
