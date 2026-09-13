import type { LampState } from '@/utils/signal'
import { lampLabel, lampLit } from '@/utils/signal'

/**
 * A signal state as a dark pill carrying its own lit lamp.
 *
 * This exists so the cards can be properly green. Coloured signal text
 * has to contrast against whatever surface it lands on, which capped the
 * card at a pale mint (#D0EBBE was the greenest that kept "Go" readable
 * at 4.5:1). A pill brings its own near-black ground, so the lamp shows
 * at full saturation — the real #4CBB17 / #EFB700 / #FF0505, at 6.85 /
 * 9.30 / 4.29:1 — and the card behind it is free to be any green.
 *
 * The lamp is a dot AND the state is spelled out, so this never depends
 * on hue alone.
 */
export function SignalChip({ lamp }: { lamp: LampState }) {
  const off = lamp === 'off'
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-chip px-2 py-0.5 text-[12px] font-semibold"
      style={{
        background: off ? 'var(--surface-inset)' : 'var(--lamp-housing)',
        color: off ? 'var(--ink-mute)' : 'var(--ink-on-dark)',
      }}
    >
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ background: off ? 'var(--lamp-unlit)' : lampLit(lamp) }}
      />
      {lampLabel(lamp)}
    </span>
  )
}
