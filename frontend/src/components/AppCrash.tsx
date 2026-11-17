import { Component, type ReactNode } from 'react'
import { en } from '../copy/en.ts'
import { getCopy } from '../i18n/copy.ts'
import { reloadPage } from '../lib/reload.ts'

type Props = { children: ReactNode }
type State = { failed: boolean }

/**
 * Around the whole app (main.tsx): an error outside the routes, in the providers or the router itself, which the
 * routes' error elements (RouteError) can't catch. Without it React empties the page. It shows the "We can't load
 * TESDA Track" state on its own, without the providers, styled by public/app-fallback.css (index.html loads it), as
 * the app's own styles may be what failed.
 */
export class AppCrash extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children
    let copy = en.unavailable
    try {
      copy = getCopy().unavailable
    } catch {
      // The learner's language can't be read: English.
    }
    return (
      <main className="app-fallback">
        <div className="app-fallback-card">
          <h1>{copy.heading}</h1>
          <p>{copy.body}</p>
          <button type="button" className="app-fallback-action" onClick={reloadPage}>
            {copy.retry}
          </button>
        </div>
      </main>
    )
  }
}
