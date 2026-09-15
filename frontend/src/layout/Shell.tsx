import type { ReactNode } from 'react'
import { NavRail } from './NavRail'
import { StatusBar } from './StatusBar'
import { FooterBar } from './FooterBar'

/**
 * Stitch's viewport-locked shell: fixed rail (224px) on the left, fixed
 * status bar (56px) across the top of the content, page below, a thin
 * footer strip. Page content scrolls inside its own region so the frame
 * never moves.
 *
 * `ground-grid` lays the drafting grid under the scrolling page (see
 * index.css). It goes on the scroll region rather than on <body> so the
 * grid stays put behind moving content, the way graph paper would.
 */
export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-page">
      <NavRail />
      <div className="flex min-w-0 flex-1 flex-col">
        <StatusBar />
        <main className="ground-grid min-h-0 flex-1 overflow-y-auto px-3 py-3">{children}</main>
        <FooterBar />
      </div>
    </div>
  )
}
