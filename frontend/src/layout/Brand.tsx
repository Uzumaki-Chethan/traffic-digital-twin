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
      // Both pieces stay mounted and animate with the rail's width: the eye
      // eases between its two sizes, the wordmark folds away (height and
      // opacity) instead of vanishing — nothing pops.
      className="flex shrink-0 flex-col items-center px-2 pb-2 pt-4 [@media(max-height:760px)]:pt-2"
    >
      <img
        src={eye}
        alt=""
        draggable={false}
        className={clsx('brand-eye block h-auto select-none', collapsed && 'brand-eye-small')}
        style={{ filter: 'drop-shadow(0 0 10px rgb(255 150 60 / 0.25))' }}
      />
      <span className={clsx('brand-word', collapsed && 'brand-word-hidden')}>
        <span className="overflow-hidden">
          <img src={wordmark} alt="Trinetra" draggable={false} className="mx-auto mt-1 block h-auto w-[176px] max-w-none select-none [@media(max-height:760px)]:w-[150px]" />
        </span>
      </span>
    </Link>
  )
}
