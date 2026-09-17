/**
 * The scenario library, in words a viewer can read.
 *
 * Ids are the backend's (`sumo/config/scenarios/<id>.sumocfg`, plus
 * "default" for the production route) and travel only in the start
 * request — nothing on screen ever shows one. Names and blurbs are
 * written from the scenario manifest's own descriptions
 * (backend/ml/training/scenario_manifest.py) and the route files.
 * Seed 1 throughout: the seed every number in README.md was measured on.
 */

export type Demand = 'light' | 'moderate' | 'heavy' | 'ramping'

export interface ScenarioInfo {
  id: string
  name: string
  blurb: string
  demand: Demand
}

/**
 * The production route, `python app.py`'s run and the backend's own
 * "default". Not offered as a card — at 480 vehicles an hour per approach
 * it is Balanced traffic's volume with a through/turn split — but a run
 * started without a scenario still reports it, so it keeps a name.
 */
const PRODUCTION_ROUTE: ScenarioInfo = {
  id: 'default',
  name: 'Everyday junction traffic',
  blurb: '480 vehicles an hour from every direction — cars, bikes, autos, buses and trucks — for ten minutes',
  demand: 'moderate',
}

const DIRECTIONAL = 'One arm carries most of the traffic; the other three stay light'

export const EVAL_SCENARIOS: ScenarioInfo[] = [
  { id: 'light_seed1', name: 'Light traffic', blurb: 'A quiet junction — a car every few seconds, most lanes empty', demand: 'light' },
  { id: 'balanced_seed1', name: 'Balanced traffic', blurb: 'Steady, even demand on all four approaches', demand: 'moderate' },
  { id: 'normal_traffic_seed1', name: 'Normal day', blurb: 'A typical weekday flow with the full vehicle mix', demand: 'moderate' },
  { id: 'heavy_seed1', name: 'Heavy traffic', blurb: 'Every approach loaded; queues build at every red', demand: 'heavy' },
  { id: 'extreme_seed1', name: 'Extreme traffic', blurb: 'Saturated on all four arms — the hardest uniform case', demand: 'heavy' },
  { id: 'rush_hour_seed1', name: 'Rush hour', blurb: 'Demand ramps up, peaks, then eases — the only changing-demand scenario', demand: 'ramping' },
  { id: 'north_heavy_seed1', name: 'North approach heavy', blurb: DIRECTIONAL, demand: 'heavy' },
  { id: 'south_heavy_seed1', name: 'South approach heavy', blurb: DIRECTIONAL, demand: 'heavy' },
  { id: 'east_heavy_seed1', name: 'East approach heavy', blurb: DIRECTIONAL, demand: 'heavy' },
  { id: 'west_heavy_seed1', name: 'West approach heavy', blurb: DIRECTIONAL, demand: 'heavy' },
  { id: 'accident_seed1', name: 'Stalled truck on East', blurb: 'A truck blocks the East straight lane for nine minutes; the rest of the junction must absorb it', demand: 'heavy' },
  { id: 'emergency_response_seed1', name: 'Emergency vehicles', blurb: 'Ambulances and fire engines arrive mid-run and must get through', demand: 'moderate' },
  { id: 'rain_seed1', name: 'Rain', blurb: 'Slower, more cautious driving; the same demand takes longer to clear', demand: 'moderate' },
]

/** What the Overview demo can run: the same library, one card each. */
export const DEMO_SCENARIOS: ScenarioInfo[] = EVAL_SCENARIOS

/** Where a page starts before anyone has chosen: steady, even, moderate. */
export const DEFAULT_DEMO_SCENARIO = 'balanced_seed1'
export const DEFAULT_EVAL_SCENARIO = 'extreme_seed1'

const BY_ID = new Map<string, ScenarioInfo>([PRODUCTION_ROUTE, ...EVAL_SCENARIOS].map((s) => [s.id, s]))

/** Plain-language name for a scenario id; the id itself if unknown. */
export function scenarioName(id: string | null | undefined): string {
  if (!id) return '—'
  return BY_ID.get(id)?.name ?? id
}

export const DEMAND_LABEL: Record<Demand, string> = {
  light: 'Light',
  moderate: 'Moderate',
  heavy: 'Heavy',
  ramping: 'Ramping',
}
