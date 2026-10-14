import { Component, type ReactNode } from 'react'

interface LoadBoundaryProps {
  /** Shown in place of the children once they've failed. */
  fallback: ReactNode
  /** Told of the failure, once. */
  onError?: (error: unknown) => void
  children: ReactNode
}

/**
 * Around a part of the app that downloads when it's needed (React.lazy), outside any route's error boundary: if its
 * code can't be downloaded (offline, or a new release replaced the old files), `fallback` takes its place and the
 * rest of the page keeps working. A failure as it shows lands here too. It stays failed: getting the code needs a
 * fresh start (reloadPage).
 */
export class LoadBoundary extends Component<LoadBoundaryProps, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    this.props.onError?.(error)
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
