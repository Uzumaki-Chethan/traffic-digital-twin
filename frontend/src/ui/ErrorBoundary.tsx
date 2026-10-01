import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * Catches a render/effect error below it so it can't take the whole app
 * down (an uncaught error unmounts the entire React tree — the "dark-blue
 * blank screen" the owner hit on pressing 3D; Section 37.18). Shows
 * `renderFallback(error, reset)` instead; `reset` re-mounts the children.
 * The error is logged to the console with its component stack so it can be
 * reported.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode; renderFallback: (error: Error, reset: () => void) => ReactNode; resetKey?: unknown },
  { error: Error | null; key: unknown }
> {
  state: { error: Error | null; key: unknown } = { error: null, key: this.props.resetKey }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  // Navigating elsewhere (a new resetKey) clears a caught error.
  static getDerivedStateFromProps(props: { resetKey?: unknown }, state: { error: Error | null; key: unknown }) {
    if (props.resetKey !== state.key) return { error: null, key: props.resetKey }
    return null
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Trinetra] caught by ErrorBoundary:', error, info.componentStack)
  }

  reset = () => this.setState({ error: null })

  render() {
    if (this.state.error) return this.props.renderFallback(this.state.error, this.reset)
    return this.props.children
  }
}
