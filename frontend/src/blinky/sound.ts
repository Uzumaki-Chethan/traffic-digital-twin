export type Chirp = 'hi' | 'giggle' | 'boing' | 'yawn' | 'cheer' | 'tada' | 'pop' | 'chime'

/** [fromHz, toHz, seconds, wave] glides, played one after another. */
const SEQ: Record<Chirp, [number, number, number, OscillatorType][]> = {
  hi: [[880, 1320, 0.08, 'sine'], [1320, 990, 0.09, 'sine']],
  giggle: [[1200, 1500, 0.05, 'triangle'], [1250, 1550, 0.05, 'triangle'], [1300, 1650, 0.06, 'triangle']],
  boing: [[300, 900, 0.12, 'sine'], [900, 420, 0.16, 'sine']],
  yawn: [[700, 300, 0.45, 'sine']],
  cheer: [[660, 990, 0.07, 'square'], [990, 1320, 0.1, 'square']],
  tada: [[523, 523, 0.08, 'triangle'], [659, 659, 0.08, 'triangle'], [784, 1046, 0.18, 'triangle']],
  pop: [[500, 1400, 0.06, 'sine']],
  // a soft temple-bell chime: the orb drifting home
  chime: [[1568, 1560, 0.35, 'sine'], [2093, 2090, 0.5, 'sine']],
}

let ctx: AudioContext | null = null

/** A tiny synthesized chirp — only when the user has turned sound on. */
export function chirp(kind: Chirp, enabled: boolean): void {
  if (!enabled) return
  try {
    ctx ??= new AudioContext()
    // Made before any user gesture (Sound remembered across a reload) it
    // starts suspended; resume it — this succeeds once the page has a gesture.
    if (ctx.state === 'suspended') void ctx.resume()
    let t = ctx.currentTime
    for (const [f0, f1, d, type] of SEQ[kind]) {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = type
      o.frequency.setValueAtTime(f0, t)
      o.frequency.exponentialRampToValueAtTime(f1, t + d)
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.09, t + 0.01)
      g.gain.exponentialRampToValueAtTime(0.0001, t + d)
      o.connect(g).connect(ctx.destination)
      o.start(t)
      o.stop(t + d + 0.02)
      t += d * 0.9
    }
  } catch {
    // no audio — Blinky just mimes
  }
}
