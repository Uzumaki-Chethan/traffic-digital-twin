/**
 * Everything the home page says (Section 44). Every number here is
 * transcribed from the project's own measurements — README.md's
 * "Result against --baseline vac" table (seed 1 of each scenario, measured
 * 2026-09-13/14/18) and the model's test MAE — and the headline claims are
 * COMPUTED from those rows, so the page can never say more than the data.
 * (UI_CHANGE_RULES §2: no invented numbers.)
 */

export interface ResultRow {
  id: string
  /** Metrics won against vehicle-actuated control, out of 7. */
  wins: number
  /** % improvement vs VAC: average waiting time. */
  wait: number
  travel: number
  worstTravel: number
  avgQueue: number
  maxQueue: number
  speed: number
}

/** README.md, "Result against --baseline vac" (13/13 clean sweeps). */
export const RESULTS: ResultRow[] = [
  { id: 'light_seed1', wins: 7, wait: 7.1, travel: 0.3, worstTravel: 7.8, avgQueue: 0.7, maxQueue: 0.0, speed: 1.6 },
  { id: 'balanced_seed1', wins: 7, wait: 17.8, travel: 1.1, worstTravel: 2.1, avgQueue: 3.8, maxQueue: 0.0, speed: 1.6 },
  { id: 'normal_traffic_seed1', wins: 7, wait: 86.2, travel: 34.7, worstTravel: 70.3, avgQueue: 65.2, maxQueue: 61.4, speed: 46.9 },
  { id: 'heavy_seed1', wins: 7, wait: 66.5, travel: 20.5, worstTravel: 40.2, avgQueue: 46.0, maxQueue: 30.2, speed: 24.7 },
  { id: 'extreme_seed1', wins: 7, wait: 64.1, travel: 37.3, worstTravel: 57.4, avgQueue: 51.5, maxQueue: 50.0, speed: 45.5 },
  { id: 'rush_hour_seed1', wins: 7, wait: 58.4, travel: 10.8, worstTravel: 43.8, avgQueue: 25.9, maxQueue: 34.4, speed: 10.9 },
  { id: 'north_heavy_seed1', wins: 7, wait: 57.0, travel: 10.5, worstTravel: 43.9, avgQueue: 29.3, maxQueue: 11.4, speed: 9.1 },
  { id: 'south_heavy_seed1', wins: 7, wait: 61.5, travel: 8.8, worstTravel: 42.4, avgQueue: 26.4, maxQueue: 7.5, speed: 9.5 },
  { id: 'east_heavy_seed1', wins: 7, wait: 61.9, travel: 15.4, worstTravel: 41.3, avgQueue: 36.9, maxQueue: 3.2, speed: 18.6 },
  { id: 'west_heavy_seed1', wins: 7, wait: 63.8, travel: 14.8, worstTravel: 43.1, avgQueue: 37.6, maxQueue: 21.1, speed: 16.1 },
  { id: 'accident_seed1', wins: 7, wait: 83.8, travel: 34.0, worstTravel: 70.2, avgQueue: 62.5, maxQueue: 54.7, speed: 41.3 },
  { id: 'emergency_response_seed1', wins: 7, wait: 84.5, travel: 30.2, worstTravel: 70.2, avgQueue: 58.6, maxQueue: 45.9, speed: 39.1 },
  { id: 'rain_seed1', wins: 7, wait: 85.7, travel: 35.6, worstTravel: 66.2, avgQueue: 67.5, maxQueue: 64.5, speed: 46.4 },
]

/** The model's own test error (README: Test MAE ≈ 1.44 vehicles; "assume nothing changes" 2.72). */
const MODEL_MAE = 1.44
const PERSISTENCE_MAE = 2.72
export const PREDICTION = {
  modelMae: MODEL_MAE,
  persistenceMae: PERSISTENCE_MAE,
  betterThanGuessPct: Math.round(((PERSISTENCE_MAE - MODEL_MAE) / PERSISTENCE_MAE) * 100),
  horizonSeconds: 15,
  features: 125,
  targets: 24,
}

export const HEADLINES = {
  scenariosWon: RESULTS.filter((r) => r.wins === 7).length,
  metrics: 7,
  bestWaitCut: Math.max(...RESULTS.map((r) => r.wait)),
  bestQueueCut: Math.max(...RESULTS.map((r) => r.avgQueue)),
}

export interface ScenarioGroup {
  title: string
  line: string
  ids: string[]
}

export const SCENARIO_GROUPS: ScenarioGroup[] = [
  {
    title: 'Everyday',
    line: 'The traffic a junction sees on an ordinary day — from a quiet hour to a busy afternoon.',
    ids: ['light_seed1', 'balanced_seed1', 'normal_traffic_seed1'],
  },
  {
    title: 'Under pressure',
    line: 'Every approach loaded, then saturated, then a rush hour that builds, peaks and fades.',
    ids: ['heavy_seed1', 'extreme_seed1', 'rush_hour_seed1'],
  },
  {
    title: 'One side busy',
    line: 'One arm carries most of the traffic while the other three stay light — fixed timers hate this.',
    ids: ['north_heavy_seed1', 'south_heavy_seed1', 'east_heavy_seed1', 'west_heavy_seed1'],
  },
  {
    title: 'Incidents & weather',
    line: 'A truck blocking a lane, ambulances that must get through, and rain that slows everyone down.',
    ids: ['accident_seed1', 'emergency_response_seed1', 'rain_seed1'],
  },
]

export interface Step {
  key: string
  title: string
  short: string
  body: string
}

/** How it works: one decision, every second, from the road back to the road. */
export const PIPELINE: Step[] = [
  { key: 'sim', title: 'The junction', short: 'SUMO simulator', body: 'A real traffic simulator drives a four-way junction — cars, bikes, autos, buses and trucks, each with its own size and speed.' },
  { key: 'twin', title: 'Digital twin', short: 'Live copy', body: 'Every second Trinetra reads the whole junction and keeps a live copy of it: where every vehicle is, how fast, how long it has waited.' },
  { key: 'features', title: 'Understanding', short: `${PREDICTION.features} signals`, body: `It turns that picture into ${PREDICTION.features} measurements — queues, waiting times, arrivals, how long the light has held.` },
  { key: 'predict', title: 'Prediction', short: `${PREDICTION.horizonSeconds} s ahead`, body: `A Random Forest model forecasts every lane ${PREDICTION.horizonSeconds} seconds into the future, so the AI sees the queue before it forms.` },
  { key: 'decide', title: 'Decision', short: 'Decision engine', body: 'The engine scores every phase and picks who goes next — with rules for fairness, a minimum green, and absolute priority for emergencies.' },
  { key: 'signal', title: 'The light changes', short: '3 s amber', body: 'The signal changes safely — always through a 3-second amber — and the whole loop runs again, every second.' },
]

export interface Pillar {
  key: 'sees' | 'predicts' | 'decides'
  title: string
  body: string
}

export const PILLARS: Pillar[] = [
  { key: 'sees', title: 'Sees', body: 'A live digital twin of the junction — every vehicle, every lane, every second.' },
  { key: 'predicts', title: 'Predicts', body: `A machine-learning model forecasts each lane ${PREDICTION.horizonSeconds} seconds ahead — about ${PREDICTION.betterThanGuessPct}% more accurate than assuming nothing changes.` },
  { key: 'decides', title: 'Decides', body: 'A rule-based engine gives the green to whoever needs it most — fairly, safely, and explainably.' },
]

export interface Resilience {
  key: 'emergency' | 'accident' | 'rain' | 'rush' | 'fair' | 'safe'
  title: string
  body: string
}

export const RESILIENCE: Resilience[] = [
  { key: 'emergency', title: 'Emergency vehicles', body: 'An ambulance or fire engine is spotted on its lane and gets the green — then the junction returns to normal about 3 seconds after it clears.' },
  { key: 'accident', title: 'Accidents', body: 'A broken-down vehicle blocks a lane; Trinetra routes green time around the blockage instead of wasting it.' },
  { key: 'rain', title: 'Rain', body: 'Wet roads slow every driver; the same traffic takes longer to clear, and the signal adapts to it.' },
  { key: 'rush', title: 'Rush hour', body: 'Demand builds, peaks and fades. The prediction sees the wave coming before the queues do.' },
  { key: 'fair', title: 'Fairness', body: 'No approach is forgotten: the longer a lane waits, the louder it gets, until it is served.' },
  { key: 'safe', title: 'Safety first', body: 'Every change goes through amber, every green lasts long enough to be useful, and the AI never skips a safety step.' },
]

export interface ConsolePage {
  key: string
  name: string
  path: string
  line: string
  points: string[]
}

export const CONSOLE_PAGES: ConsolePage[] = [
  {
    key: 'overview',
    name: 'Overview',
    path: '/overview',
    line: 'The junction, live.',
    points: ['A true-scale digital twin — flat map or a 3D model you can orbit', 'What the AI decided, and why, every second', 'Every lane’s vehicles, waits and light; the next 15 seconds predicted'],
  },
  {
    key: 'performance',
    name: 'Performance',
    path: '/performance',
    line: 'Proof, side by side.',
    points: ['Trinetra and a vehicle-actuated controller run the same traffic at the same time', 'Seven metrics scored live, with a verdict for each', 'Any scenario, any speed'],
  },
  {
    key: 'analytics',
    name: 'Analytics',
    path: '/analytics',
    line: 'The run, in charts.',
    points: ['Which lanes are under pressure, and when', 'How waiting time and speed change over the run', 'How the AI spends its green time'],
  },
  {
    key: 'decisions',
    name: 'Decisions',
    path: '/decisions',
    line: 'Every decision, explained.',
    points: ['A full log of every second’s decision', 'The rule it followed and the scores of every option', 'Phase changes highlighted so they stand out'],
  },
  {
    key: 'settings',
    name: 'Simulation Settings',
    path: '/settings',
    line: 'Choose the traffic.',
    points: ['Thirteen scenarios, each with a live preview', 'Pick one for the demo or for the contest', 'Then Start, Pause, change speed — or send an ambulance or cause an accident mid-run'],
  },
]

export const STACK = ['SUMO', 'TraCI', 'Python', 'scikit-learn', 'FastAPI', 'SQLite', 'React', 'TypeScript', 'three.js', 'ESP32']
