/** Screen point, CSS pixels. */
export interface Vec {
  x: number
  y: number
}

export interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

/** A standable stretch along a card's top edge (world.ts). */
export interface Platform {
  id: string
  kind: 'card'
  x1: number
  x2: number
  y: number
}

export type Mood = 'happy' | 'curious' | 'sad' | 'sleepy' | 'disco'

export type Prop = 'propeller' | 'siren' | 'umbrella' | 'sign-stop' | 'sign-go' | 'fan' | 'shades' | null

export type Anim =
  | 'idle' | 'walk' | 'air' | 'wave' | 'cheer' | 'dizzy' | 'backflip' | 'yawn' | 'shrug' | 'salute'
  | 'dance' | 'fan' | 'confused' | 'blush' | 'stretch' | 'look' | 'held' | 'sleep' | 'present'
  | 'point' | 'hang' | 'peek' | 'lift' | 'ride' | 'worried'

export type Gait = 'walk' | 'hop' | 'fly' | 'teleport' | 'fall' | 'slide'

export type PrankId = 'peekaboo' | 'tug' | 'note' | 'cop' | 'lever' | 'slide' | 'lift' | 'hide'

export interface RunFacts {
  running: boolean
  paused: boolean
  /** Set speed; null = max. */
  speed: number | null
  kind: 'demo' | 'evaluation' | null
}

/** Everything the brain may look at, built fresh every frame by BlinkyRoot. */
export interface WorldSnapshot {
  /** Seconds (performance.now() / 1000). */
  now: number
  self: Vec
  platforms: Platform[]
  pointer: Vec | null
  idleSeconds: number
  route: string
  run: RunFacts
  scenario: string
  /** A decision tick with decision.switched arrived since the previous snapshot. */
  switched: boolean
  emergency: boolean
  /** Vehicles stopped at red right now (metrics.stopped). */
  queued: number
  docked: boolean
  reducedMotion: boolean
  twinPerch: Platform | null
  rideable: boolean
}

export type Intent =
  | { kind: 'move'; gait: Gait; to: Vec; platformId: string | null }
  | { kind: 'say'; text: string; mood: Mood; ms: number }
  | { kind: 'emote'; anim: Anim; mood: Mood; ms: number; prop: Prop }
  | { kind: 'prank'; id: PrankId }
  | { kind: 'ride' }
  | { kind: 'sleep' }
  | { kind: 'wake' }
  | { kind: 'dock' }
