import { Link } from 'react-router-dom'
import clsx from 'clsx'
import eye from '@/assets/trinetra-eye.png'
import wordmark from '@/assets/trinetra-wordmark.png'

/**
 * The owner's logo (the eye with a signal for an iris) and the TRINETRA
 * wordmark, both cut from the one master image and shown as two separate
 * pieces: the mark alone when the rail is collapsed, the mark with the
 * name beneath it when it's open. Black was converted to transparency
 * (brightness → alpha), so the glow falls off over the glass rather than
 * sitting in a black box.
 */
export function Brand({ collapsed }: { collapsed: boolean }) {
  return (
    <Link
      to="/"
      aria-label="Trinetra — Overview"
      className={clsx('flex shrink-0 flex-col items-center justify-center', collapsed ? 'h-[84px] px-2' : 'gap-1 px-4 pb-2 pt-4')}
    >
      <img
        src={eye}
        alt=""
        draggable={false}
        className={clsx('block h-auto select-none', collapsed ? 'w-[64px]' : 'w-[208px]')}
        style={{ filter: 'drop-shadow(0 0 10px rgb(255 150 60 / 0.25))' }}
      />
      {!collapsed && (
        <img src={wordmark} alt="Trinetra" draggable={false} className="block h-auto w-[176px] select-none" />
      )}
    </Link>
  )
}
