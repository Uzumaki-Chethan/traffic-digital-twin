/**
 * Mirrors the actual .sumocfg files present under sumo/config/scenarios/
 * and sumo/config/demo/. Kept as a static list rather than fetched from
 * the backend because there is deliberately no "list scenarios" API -
 * see ScenarioControlPage's note on why control is CLI-driven.
 */

export interface ScenarioEntry {
  name: string
  category: string
  seeds: number[]
}

export const EVALUATOR_SCENARIOS: ScenarioEntry[] = [
  { name: 'light', category: 'Baseline load', seeds: [1, 2, 3] },
  { name: 'balanced', category: 'Baseline load', seeds: [1, 2, 3] },
  { name: 'heavy', category: 'Baseline load', seeds: [1, 2, 3] },
  { name: 'extreme', category: 'Baseline load', seeds: [1, 2] },
  { name: 'normal_traffic', category: 'Named scenario', seeds: [1, 2, 3] },
  { name: 'rush_hour', category: 'Named scenario', seeds: [1, 2, 3] },
  { name: 'rain', category: 'Named scenario', seeds: [1, 2, 3] },
  { name: 'accident', category: 'Named scenario', seeds: [1, 2, 3] },
  { name: 'emergency_response', category: 'Named scenario', seeds: [1, 2, 3] },
  { name: 'north_heavy', category: 'Directional imbalance', seeds: [1, 2, 3] },
  { name: 'south_heavy', category: 'Directional imbalance', seeds: [1, 2, 3] },
  { name: 'east_heavy', category: 'Directional imbalance', seeds: [1, 2, 3] },
  { name: 'west_heavy', category: 'Directional imbalance', seeds: [1, 2, 3] },
]

export const DEMO_SCENARIOS = [
  'normal_traffic', 'rush_hour', 'rain', 'accident', 'emergency_response',
] as const
