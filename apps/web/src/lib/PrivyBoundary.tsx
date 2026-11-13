import { Component, type ReactNode } from 'react'

type Props = { children: ReactNode; fallback: ReactNode }
type State = { hasFailed: boolean }

/** If Privy cannot start (e.g. a misconfigured app ID), keep the app usable instead of a blank page. */
export class PrivyBoundary extends Component<Props, State> {
  state: State = { hasFailed: false }

  static getDerivedStateFromError(): State {
    return { hasFailed: true }
  }

  componentDidCatch(error: Error): void {
    console.error('Privy failed to initialise; continuing without email login', error.message)
  }

  render(): ReactNode {
    return this.state.hasFailed ? this.props.fallback : this.props.children
  }
}
