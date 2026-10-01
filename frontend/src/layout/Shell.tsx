import type { ReactNode } from 'react'
import { NavRail } from './NavRail'
import { StatusBar } from './StatusBar'
import { FooterBar } from './FooterBar'
import { Backdrop } from './Backdrop'
import { TrafficCursor } from './TrafficCursor'
import { useLocation } from 'react-router-dom'
import { ErrorBoundary } from '@/ui/ErrorBoundary'

/**
 * Glass over the night city: the photo (Backdrop) fixed behind everything;
 * over it, 14 px in from the edges, the dark-glass rail and one large
 * frosted container that holds the top bar, the scrolling page and the
 * footer. The frame never moves — only the page inside scrolls.
 *
 * The frosted look is BAKED, not live: a pre-blurred copy of the photo is
 * drawn once by Backdrop, cut to this container's shape (data-frost), with
 * only a white tint painted here. A live backdrop-filter re-blurred the
 * whole screen every frame (Section 37.6); a fixed background repainted
 * the container on every panel update (Section 37.12).
 */
export function Shell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  return (
    <>
      <Backdrop />
      <div className="relative z-[1] flex h-screen w-screen gap-3.5 overflow-hidden p-3.5">
        <NavRail />
        <div
          data-frost
          className="relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-[28px]"
          style={{
            // The frost itself is a static layer in Backdrop, cut to this
            // box; only the light tint is painted here (Section 37.12).
            backgroundImage: 'linear-gradient(180deg, rgb(255 255 255 / 0.16), rgb(210 225 255 / 0.1) 30%, rgb(255 255 255 / 0.13))',
            border: '1.5px solid rgb(255 255 255 / 0.42)',
            boxShadow: 'inset 0 1px 0 rgb(255 255 255 / 0.4), inset 0 0 40px rgb(255 255 255 / 0.06), 0 30px 70px -30px rgb(0 0 0 / 0.7)',
          }}
        >
          <StatusBar />
          <main className="min-h-0 flex-1 overflow-y-auto px-[18px] pb-[18px] pt-2 [scrollbar-gutter:stable]">
            {/* No error on a page can blank the whole console any more: it
                is shown here, the frame and the top bar keep working, and
                moving to another page clears it. */}
            <ErrorBoundary
              resetKey={pathname}
              renderFallback={(error, reset) => (
                <div className="glass-card mx-auto mt-10 max-w-[560px] px-6 py-5 text-[13.5px] text-ink">
                  <div className="text-[15px] font-semibold text-ink-strong">This page hit a problem.</div>
                  <div className="num mt-2 break-words text-[12px] text-ink-mute">{error.message}</div>
                  <div className="mt-3 text-[12.5px]">The simulation keeps running. Try again, or pick another page.</div>
                  <button type="button" onClick={reset} className="run-go mt-4 rounded-full px-5 py-2 text-[13.5px] font-medium">
                    Try again
                  </button>
                </div>
              )}
            >
              {children}
            </ErrorBoundary>
          </main>
          <FooterBar />
        </div>
      </div>
      <TrafficCursor />
    </>
  )
}
