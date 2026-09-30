import type { ReactNode } from 'react'
import { NavRail } from './NavRail'
import { StatusBar } from './StatusBar'
import { FooterBar } from './FooterBar'
import { Backdrop } from './Backdrop'
import { TrafficCursor } from './TrafficCursor'
import frost from '@/assets/city-night-frost.jpg'

/**
 * Glass over the night city: the photo (Backdrop) fixed behind everything;
 * over it, 14 px in from the edges, the dark-glass rail and one large
 * frosted container that holds the top bar, the scrolling page and the
 * footer. The frame never moves — only the page inside scrolls.
 *
 * The frosted look is BAKED, not live: the container's own background is a
 * pre-blurred copy of the photo pinned to the viewport (background-attachment
 * fixed), under a white tint. A live backdrop-filter here re-blurred the
 * whole screen every frame a vehicle moved — the main cause of the lag at
 * higher speeds (Section 37.6).
 */
export function Shell({ children }: { children: ReactNode }) {
  return (
    <>
      <Backdrop />
      <div className="relative z-[1] flex h-screen w-screen gap-3.5 overflow-hidden p-3.5">
        <NavRail />
        <div
          className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[28px]"
          style={{
            backgroundImage: `linear-gradient(180deg, rgb(255 255 255 / 0.16), rgb(210 225 255 / 0.1) 30%, rgb(255 255 255 / 0.13)), url(${frost})`,
            backgroundSize: 'auto, cover',
            backgroundPosition: 'center, center',
            backgroundAttachment: 'scroll, fixed',
            border: '1.5px solid rgb(255 255 255 / 0.42)',
            boxShadow: 'inset 0 1px 0 rgb(255 255 255 / 0.4), inset 0 0 40px rgb(255 255 255 / 0.06), 0 30px 70px -30px rgb(0 0 0 / 0.7)',
          }}
        >
          <StatusBar />
          <main className="min-h-0 flex-1 overflow-y-auto px-[18px] pb-[18px] pt-0.5 [scrollbar-gutter:stable]">{children}</main>
          <FooterBar />
        </div>
      </div>
      <TrafficCursor />
    </>
  )
}
