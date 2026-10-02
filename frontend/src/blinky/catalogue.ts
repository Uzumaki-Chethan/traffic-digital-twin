/** Real values for a live example line; nulls when nothing runs. */
export interface LiveFacts {
  running: boolean
  vehicles: number | null
  greens: number | null
  /** Plain label, e.g. "N–S straight + left". */
  phase: string | null
  held: number | null
  min: number | null
  max: number | null
}

export const EMPTY_FACTS: LiveFacts = { running: false, vehicles: null, greens: null, phase: null, held: null, min: null, max: null }

/**
 * The facts to speak from: nothing unless a run is up NOW. The last tick of
 * a finished run stays in the store until the next starts — never "right now".
 */
export function liveFactsFor(f: LiveFacts, running: boolean): LiveFacts {
  return running ? { ...f, running: true } : EMPTY_FACTS
}

export interface Explainer {
  title: string
  steps: string[]
  live?: (f: LiveFacts) => string | null
}

const METRIC = (name: string, what: string): Explainer => ({
  title: name,
  steps: [
    `${name}: ${what}`,
    'Both controllers are measured the same way: blue is Trinetra, orange is VAC.',
    'The badge says who is ahead and by how much. "Even" means within half a percent.',
  ],
})

/**
 * What Zen says when one of his orbs is dropped on a page or a component
 * (spec §7.3) — written for someone opening Trinetra for the first time.
 * Keys are `data-explain` ids; a test fails if the source uses an id that
 * is missing here.
 */
export const CATALOGUE: Record<string, Explainer> = {
  // ---- pages
  'page:/': {
    title: 'Overview',
    steps: [
      'This is the junction, live. Trinetra watches one crossroads in a traffic simulator and decides which way gets the green light.',
      'The big map is a "digital twin": a live copy of the junction, with every car where it really is.',
      'Around it you can see what the AI decided, why, and how each lane is doing.',
      'Press Start at the top to begin a simulation.',
    ],
  },
  'page:/analytics': {
    title: 'Analytics',
    steps: [
      'This page turns the run happening right now into charts: which lanes are under pressure, how waiting time changes, and how the AI spends its green time.',
      'It shows only the current run, and keeps what it recorded after the run ends.',
    ],
  },
  'page:/performance': {
    title: 'Performance',
    steps: [
      'Here Trinetra competes. Two copies of the same junction run side by side with exactly the same traffic.',
      'The left one is controlled by Trinetra’s AI; the right one by VAC (vehicle-actuated control), a common real-world method that keeps the green while cars keep arriving.',
      'Seven scores below show who is doing better.',
    ],
  },
  'page:/decisions': {
    title: 'Decisions',
    steps: [
      'Every second the AI makes a decision. This page is the logbook of all of them, saved in a database.',
      'Pick a run, scroll through its decisions, and open one to see exactly why the AI chose what it chose.',
      'Green rows are the moments the light actually changed.',
    ],
  },
  'page:/settings': {
    title: 'Simulation Settings',
    steps: [
      'Choose what kind of traffic to simulate: light, heavy, rush hour, an accident, rain, emergency vehicles and more.',
      'The "Choose for" menu picks whether you are choosing for the Overview demo or for the Performance contest.',
    ],
  },

  // ---- top bar and frame
  'scenario-pill': { title: 'Scenario', steps: ['The traffic situation this page will run, or is running.', 'Click it to choose a different one on Simulation Settings.'] },
  'run-start': { title: 'Start', steps: ['Starts a simulation of the chosen scenario. Live data starts flowing within a few seconds.', 'The screen button next to it starts one with SUMO’s own window too.'] },
  'run-pause': { title: 'Pause / Play', steps: ['Freezes the simulation where it is. Press Play to carry on; nothing is lost.'] },
  'run-stop': { title: 'Stop', steps: ['Ends the run. The traffic disappears and you can start another one.'] },
  'run-window': { title: 'Open the simulator window', steps: ['Opens the simulator’s own window (SUMO) and carries this exact run into it: same cars, same lights.'] },
  'run-speed': { title: 'Speed', steps: ['How fast simulated time runs. 1× is real time, 5× is five times faster, max is as fast as the computer can go.', 'Click to step through the speeds, or hover to slide.'] },
  clock: { title: 'Simulated clock', steps: ['How much simulated time has passed since the run began, and how fast it is actually running right now.'] },
  'link-pill': { title: 'Live link', steps: ['Whether this screen is receiving live data. "Live" means everything you see is current.'] },
  rail: { title: 'The menu', steps: ['Jump between the five pages here. Collapse makes it narrow to give the junction more room.'] },

  // ---- Overview
  twin: {
    title: 'Digital twin',
    steps: [
      'A live, true-to-scale map of the junction: every vehicle is drawn at its real size and position.',
      'Lanes glow green or red with their own signal, and each signal head shows its real light.',
      'Switch to 3D for a model you can spin around. The buttons zoom, frame the junction or go full screen.',
    ],
    live: (f) => (f.running && f.vehicles != null ? `${f.vehicles} vehicles on the map, ${f.greens ?? 0} lanes on green.` : null),
  },
  'twin-tools': { title: 'Map tools', steps: ['Show or hide the road names, frame the whole junction, or zoom right in to the stop lines (press it again to come back).'] },
  'active-phase': {
    title: 'Active phase',
    steps: [
      'A "phase" is a set of movements that get green together, for example North–South straight and left.',
      'This box shows which phase the AI chose, why (the mode, explained in plain words), and how long it has kept it, against its minimum and maximum green.',
      'The light in the simulator changes only after a 3-second amber, so "Engine decided" and "Light showing" can differ for a moment. That’s normal.',
    ],
    live: (f) => (f.running && f.phase ? `${f.phase} is green, held ${f.held ?? 0} s${f.min != null && f.max != null ? ` (it must run ${f.min}–${f.max} s)` : ''}.` : null),
  },
  lanes: { title: 'Lanes', steps: ['All twelve lanes (left, straight and right for each of the four roads), with their signal, how many vehicles are on them, and their average wait.', 'Hover a lane to find it on the map. Longer waits turn orange, then red.'] },
  prediction: {
    title: 'Prediction vs actual',
    steps: [
      'Trinetra’s AI looks 15 seconds ahead and guesses how many vehicles each lane will have.',
      'These charts and rows put each guess next to what actually happened, so you can see how good the predictions are.',
      'The yellow line is the guess; blue is reality.',
    ],
  },
  'why-phase': {
    title: 'Why this phase',
    steps: [
      'Every second the AI scores each phase by how much it is needed.',
      'The highlighted bar is the phase being served. Another phase only takes over if its score passes the red dashed line, the boundary. That stops the lights flickering back and forth.',
    ],
  },
  'recent-switches': { title: 'Recent switches', steps: ['The last few times the light changed: when, from what to what, how long the old phase had run, and the rule that triggered it.'] },
  'phase-history': { title: 'Phase history', steps: ['The last minute as two timelines, one for North–South and one for East–West. Green is go, amber is clearance, grey is waiting.'] },
  'kpi-vehicles': { title: 'Vehicles in network', steps: ['How many vehicles are in the whole network right now. The small line shows the last two minutes.'] },
  'kpi-wait': { title: 'Average wait', steps: ['The average time vehicles have been waiting. Lower is better. The arrow shows the change since 30 seconds ago.'] },
  'kpi-speed': { title: 'Average speed', steps: ['The average speed of all vehicles, in metres per second and km/h. Higher means traffic is flowing.'] },
  'kpi-queue': { title: 'Queued at red', steps: ['How many vehicles are stopped at red lights right now.'] },
  'kpi-switches': { title: 'Phase switches', steps: ['How many times the lights changed in the last minute.'] },
  dispatch: { title: 'Dispatch', steps: ['Send an emergency vehicle (ambulance, fire engine or police) into the junction from any road, and watch Trinetra clear the way.', 'Shown only in the Accident and Emergency scenarios.'] },
  incident: { title: 'Incident', steps: ['Stall a vehicle on a lane — an instant accident — and see how Trinetra copes with a blocked lane.'] },

  // ---- Analytics
  'an-run': { title: 'This run', steps: ['How long this run has been recorded, and whether it is still updating.'] },
  'an-summary': { title: 'This run so far', steps: ['The run in three numbers: the average wait across the whole junction, how many seconds of data that is based on, and how many vehicles are on the roads now.'] },
  'an-heatmap': { title: 'Lane pressure over time', steps: ['Each row is a lane; each column is a few seconds of time.', 'The darker the cell, the more pressure that lane was under: more cars, longer waits.'] },
  'an-ledger': { title: 'Lane ledger', steps: ['Each lane’s signal and traffic right now, next to its average over the whole run.'] },
  'an-network': { title: 'Network over time', steps: ['Average waiting time and queue length for the whole junction across the run. Rising lines mean traffic is building up.'] },
  'an-congestion': { title: 'Congestion trend', steps: ['One score for how congested the junction is, over time.'] },
  'an-modes': { title: 'Decision modes', steps: ['How often the AI used each kind of decision: holding a minimum green, serving the busiest phase, releasing an empty phase early, and so on.'] },
  'an-phase-share': { title: 'Phase share', steps: ['How the green time was split between the four phases.'] },
  'an-greens': { title: 'Green duration spread', steps: ['How long each green lasted, as a histogram. Short greens mean quick switching; long ones mean heavy demand.'] },
  'an-scatter': { title: 'Speed against waiting time', steps: ['One dot per second: how fast traffic moved against how long it waited. Usually, the more waiting, the slower.'] },
  'an-peaks': { title: 'Peak periods', steps: ['The busiest stretches of this run, found automatically.'] },
  'an-source': { title: 'Where this data comes from', steps: ['All of this is the live stream of the current run. It isn’t stored history.'] },

  // ---- Performance
  'pf-ai': { title: 'Trinetra', steps: ['The junction run by Trinetra’s AI.'] },
  'pf-vac': { title: 'VAC', steps: ['The same junction, with the same traffic, run by VAC (vehicle-actuated control). It’s the fair comparison.'] },
  'pf-summary': { title: 'Scoreboard', steps: ['On how many of the seven measures Trinetra is ahead or level, so far or final.'] },
  'pf-metric-avg_waiting_time_seconds': METRIC('Average waiting time', 'how long vehicles wait on average. Lower is better.'),
  'pf-metric-avg_travel_time_seconds': METRIC('Average travel time', 'how long a trip through the junction takes on average. Lower is better.'),
  'pf-metric-max_travel_time_seconds': METRIC('Worst travel time', 'the slowest single trip so far. Lower is better.'),
  'pf-metric-avg_queue_length_vehicles': METRIC('Average queue', 'how many vehicles queue on average. Lower is better.'),
  'pf-metric-max_queue_length_vehicles': METRIC('Longest queue', 'the longest queue seen. Lower is better.'),
  'pf-metric-avg_speed_mps': METRIC('Average speed', 'how fast traffic moves on average. Higher is better.'),
  'pf-metric-throughput_vehicles': METRIC('Vehicles served', 'how many vehicles have finished their trip. It ends up equal for both, by construction.'),

  // ---- Decisions
  'dc-run': { title: 'Run picker', steps: ['Choose which recorded run to look at. The newest is at the top, with its scenario and length.'] },
  'dc-filters': { title: 'Filters', steps: ['Show all decisions, only the moments the light changed, or only one kind of decision.'] },
  'dc-list': { title: 'Every decision', steps: ['One row per second: the time, the phase, how long it had been held, the rule and the reason.', 'Green rows are the moments the light changed. Click a row to open it.'] },
  'dc-detail': { title: 'Decision', steps: ['Everything about one decision: what the AI chose, the rule it followed, its reason in full, what the light was showing, and the score of every phase at that moment.'] },

  // ---- Settings
  'st-for': { title: 'Choose for', steps: ['Pick whether you are choosing the scenario for the Overview demo or for the Performance contest.'] },
  'st-cards': { title: 'Scenarios', steps: ['Each card is a kind of traffic. The little moving picture shows what it is like, and the tag says how heavy it is.', 'Click one to choose it; the coloured ring marks your pick.'] },
}

export function explainerFor(id: string): Explainer | null {
  return CATALOGUE[id] ?? null
}
