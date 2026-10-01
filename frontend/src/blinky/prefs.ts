const KEY = 'trinetra.blinky'

export interface BlinkyPrefs {
  asleep: boolean
  sound: boolean
}

export function loadPrefs(): BlinkyPrefs {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<BlinkyPrefs>
    return { asleep: v.asleep === true, sound: v.sound === true }
  } catch {
    return { asleep: false, sound: false }
  }
}

export function savePrefs(p: BlinkyPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    // storage unavailable — fine for the session
  }
}
