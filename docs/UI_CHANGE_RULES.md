# UI change rules and the content inventory

**Status:** binding from 2026-09-17 (tag `prototype-1`); the inventory below was brought
current and re-tagged `prototype-2` on 2026-09-21 and `prototype-3` on 2026-10-02 (§5). Written for whoever works on the
interface next — the owner, a teammate on a `design/<name>` branch, or Claude Code driving
either — and read by Claude at the start of any UI task (`CLAUDE.md` points here).

## 1. The one rule

**Change how it looks, never how much it says.**

Everything visual is open: colours, type, spacing, panel order, which page a
panel lives on, whether something is a table or a chart, motion, icons,
layout at every width. The content inventory in §3 is the invariant — every
item in it must still be on screen, readable, and correct after the change.

Concretely:

- **Allowed without asking:** recolour, restyle, move a panel (within a page
  or to another page), merge two panels into one, split one into two, change a
  table into a chart or a chart into a table, rename a label to a clearer one,
  add new information from a real backend field (§2 data rules), add a page.
- **Allowed with the owner's explicit instruction, in writing, naming the
  item:** removing an item from the inventory, or removing a page. "Simplify
  the Overview" is not an instruction to drop Recent switches; "drop Recent
  switches from Overview" is.
- **Never:** losing an item as a side effect. A panel that got dropped because
  the new layout had no room for it, a column that vanished when a table
  became a chart, a footer line that did not survive a bar redesign — these
  are defects, not design decisions, and the change is not done until the
  item is back.

A relocated item still counts as present. A merged item counts as present if
each fact it carried is still shown. An item shown only on hover, in a
tooltip, or behind a click does **not** count as present unless it was that
way before the change.

## 2. Data rules that still bind (carried forward from the original design brief, retired
2026-09-20 — this file is now the only one)

- No invented numbers: every value comes from a field the backend sends
  (`frontend/src/data/types.ts`, `api.ts`). If a panel needs data that does
  not exist, drop the panel idea or ask for the field — never a placeholder
  that could be mistaken for real.
- **Never show prediction confidence anywhere.** (Owner's standing rule.)
- No internal jargon on screen: lanes are "North · Left", phases are
  "N–S straight + left", modes are "Minimum green", never `N_in_0`,
  `NS_straight_left`, `min_green_hold`. Explain it or cut it. (The one known
  exception still on screen is the raw phase id in the Active-phase panel's
  headline and in the engine's reason sentences — a candidate to clean up,
  not a licence to add more.)
- Nothing's correctness may depend on an animation finishing (a purely
  functional rule, not a style one — kept).
- A page shows only its own run: Overview/Analytics the demo, Performance the
  evaluation, Decisions whichever run is picked.

**Lifted 2026-09-21, on the owner's explicit instruction:** the aesthetic ban that used to
sit here ("no neon, glow pulses, glassmorphism, looping motion in the periphery") is gone.
It was the owner's own repeatedly-stated taste, not an artifact of the retired design brief
(§ above) — real design work is coming that wants motion and effects freely, including a
planned "highly animated" home screen, and a written rule banning exactly that would just
be fought around. Nothing replaces it; there is no new aesthetic constraint here. If a
future direction turns out wrong, that gets said directly, the way it always has.

## 3. The content inventory

Everything the interface shows as of `prototype-1`. Tick each line after a UI
change on the page you touched (and any page you moved something to or from).

### Shell — every page

- **Top bar:** product title ("Adaptive signal control") and the one-line
  subtitle; the **Scenario chip** (sliders icon) naming the page's scenario —
  running or chosen — and opening Settings for that page; **Start** (with the
  SUMO-window variant on demo pages) / **Pause–Play** / **Stop** / **Open
  window** (demo, headless only) / **speed** (0.25× … max, click cycles, hover
  slides); the **simulated clock** with measured × real-time rate, or
  "Simulation paused" / "Run ended" / "No simulation running" / "Waiting for
  simulation"; the **link pill** (Live / Paused / Idle / Connecting / Link lost
  with seconds / No data for N s); the **loud mode chip** (Starvation override,
  Emergency) when active. (The emergency band naming the approach was removed
  on 2026-09-18 on the owner's explicit instruction; the plate's lane hatching
  and the light bars carry that information.)
- **Nav rail:** Overview, Analytics, Performance, Decisions, Simulation
  Settings; the active item marked; collapse control. (The rail's "Simulation
  link: ONLINE" card was removed on 2026-09-30 on the owner's explicit
  instruction — the top bar's link pill and the footer's stream state carry the
  same fact.)
- **Footer:** the page's name and one-line description on the left; on the
  right the data source (SUMO · TraCI · console/host) and stream state.

### Overview

- **Digital Twin panel:** the junction in **plan view** (true scale, Ctrl +
  scroll / pinch zoom, drag, zoom readout, ± buttons, frame-the-junction
  button, fullscreen) or **3D** (orbit, Ctrl + scroll zoom, right-drag pan, a
  compass that turns with the camera), with: all 12 inbound lanes filled by
  signal state, the junction box, kerbs, lane dividers, painted turn arrows,
  stop bars, signal heads with lamps, the compass, the four approach names,
  every vehicle at its real size/type/position/heading, emergency vehicles
  with their blinking light bars (both views), the green **release** sweep on
  a confirmed green, emergency-lane hatching, **falling rain (both views)
  while the Rain scenario is running**; panel meta: green/red lane counts and
  vehicle count. (Per-lane names shown on the plate itself when zoomed in
  were removed on 2026-09-20 on the owner's explicit instruction — the four
  approach names and the Lanes panel's own rows still carry that
  information.)
- **Dispatch bar** (under the plate; also above the Performance windows): send
  an emergency vehicle — vehicle type, approach, turn, Send — with the count
  dispatched this run. Shown only while the page's run is live **and** its
  scenario is Accident or Emergency vehicles — on any other scenario neither
  this nor Incident renders at all (owner's instruction, 2026-09-20:
  `data/scenarios.ts`'s `showsIncidentControls`). Whichever of Dispatch/
  Incident matches the page's own running scenario (Accident → Incident,
  Emergency → Dispatch) renders first.
- **Incident bar** (beside Dispatch, same placement, same Accident/Emergency
  gating): stall a truck, bus or car on any lane for a fixed duration — an ad
  hoc accident, on demand — with the count stalled this run. The
  stalled vehicle carries a hazard marker (the road-sign triangle) in both
  views from the moment it enters, and smoke once it has actually stopped.
- **Active phase panel:** phase (name and plain label), decision mode chip
  with its one-sentence explanation, the engine's **reason** text, **green
  held** seconds (or amber remaining) against the min/max window with the
  min-green tick, and the **desired vs actual** pair (engine decided / light
  showing / match verdict, amber explained as clearance).
- **Lanes panel:** all 12 lanes — name, signal chip, vehicles, average wait;
  total vehicles on approaches; hover cross-highlight with the plate.
- **Prediction vs actual panel:** per approach and lane, predicted → actual
  vehicles with the signed difference bar; horizon, run MAE, pair count; the
  one-line reading guide. (The only place the ML layer appears.)
- **Why this phase panel:** the four phase scores as bars, the served phase
  marked, the **decision boundary** (served score + margin) drawn, the margin
  value, the boundary value, the mode chip.
- **Recent switches panel:** the last five phase changes — time, from → to,
  seconds the ended phase had run, the rule (when known).
- **Phase history band:** the last 60 s as two rings (N–S, E–W) with green /
  amber / hold segments and durations, time axis.
- **Metrics strip:** vehicles in network, average wait, average speed (m/s and
  km/h), queued at red, phase switches in the last ~60 s.

### Analytics (live stream only — never the database)

- Lane pressure heatmap (12 lanes × time), lane ledger (per-lane totals),
  network waiting time and queue length over simulated time, congestion by
  time bucket, decision-mode share, phase share, green-duration histogram,
  speed-vs-wait scatter, peak windows; the start prompt when nothing is
  running (with Start buttons on the console), and "keeps what it recorded"
  after a run ends.

### Performance

- Two **controller windows** (Trinetra / Vehicle-actuated control), each a
  plan-view junction with its own zoom/pan and a **Match** button, header meta
  with phase, vehicles and wait; idle/starting/other-run-active notes; falling
  rain in both windows while the evaluation's scenario is Rain; a Dispatch bar
  and an Incident bar above the windows (only while the scenario is Accident
  or Emergency vehicles), entering both sides at once.
- The **summary line** ("Trinetra ahead or even on k of 7 metrics", so far /
  final, tick count).
- **Seven metric blocks** (average waiting time, average travel time, worst
  travel time, average queue, longest queue, average speed, vehicles served):
  both current values with units, the two-line time series, the verdict badge
  (Trinetra +N % / Even / VAC +N %), the "so far / final" footer, throughput's
  "equal by construction" note; the empty blocks with axes before a run.

### Decisions (the only database reader)

- **Run picker** (newest first: date/time, scenario, length); decisions count,
  switch count, simulated length; the **live** pill while following.
- **Filter chips:** All, Switches (toggle), one chip per rule with its count.
- **The list:** every decision — time, phase (from → to on a switch), held
  seconds, rule chip, reason (one line); windowed, keyboard ↑/↓; "n of m"
  when filtered.
- **The detail:** time and held seconds, from → to, mode chip with its
  sentence, the full reason, engine decided / light showing / match, and the
  score ledger as it stood on that tick (or "not recorded" for older rows).

### Simulation Settings

- **Choose for** dropdown (Overview · demo / Performance · Trinetra vs VAC)
  with the one-line explanation of what that page runs; "Selected: …";
  "Stop the current run to change" while locked.
- **All 13 scenario cards:** name, one-line blurb, demand chip (Light /
  Moderate / Heavy / Ramping), the selected mark, and the page marks
  (Overview / Performance) showing which page(s) use each.

### Added by the glass redesign (2026-09-30, Section 37) — now part of the inventory

- Shell: the owner's logo (eye) and TRINETRA wordmark as separate pieces, the
  "Smarter Signals / Safer Cities" tagline, the traffic-light cursor.
- Overview: sparkline + 30 s trend on each KPI tile; ring chips, held bar and gauge on
  Active phase; movement arrows and coloured waits on Lanes; the four per-approach
  predicted-vs-actual charts; the twin's "Live simulation" badge and its labels / frame /
  focus tools; buildings, trees and sidewalks on both map views.
- Settings: a moving preview on every scenario card.

### Removed on the owner's instruction (2026-10-02)

- The mascot (Blinky → Zen → Sparky, Sections 38–41) and everything that came with it —
  the antenna/orb drag-to-explain guide, the explainer card, the dock, the joyride, and
  the `data-explain` tags on every panel. The owner wrote: "remove all the files regarding
  the robo, everything we are not implementing it". Section 42.

### Home page (2026-10-02, Sections 44–48) — part of the inventory

The home page is at `/`, full-screen, outside the console frame. Overview moved to
`/overview`, and the rail has a Home item first. The page holds:
- the live 3D city background in morning light (Section 48):
  - the sky, sun and cloud, and long shadows;
  - street trees and parks;
  - traffic that queues at red and goes on green, with the junction's signals at the
    centre;
  - a camera that follows the scroll;
- navigation:
  - the top bar's section links (How it works, Results, Scenarios, The console,
    Physical model; hidden below 1180 px);
  - the chapter navigator on the right edge (ten chapters; hidden below 900 px);
- the eye logo, wordmark, tagline and one-line explanation, plus the four fact chips
  under it (13/13 scenarios won, 15s look-ahead, 1 decision every second, best wait cut);
- "Open the console" (in the hero, the top bar and the finale) and "See how it works";
- the live-run badge in the top bar;
- the problem statement with its scroll-played junction:
  - "On a clock", then "With Trinetra";
  - the waiting-cars counter;
- the three pillars (Sees / Predicts / Decides), each with its little picture (sweep,
  forecast line, scored phases);
- the six-step "how it works" pipeline, with its icons and the closing "And again." card;
- the results:
  - the four counters (13/13, 7/7 won or tied, best wait cut, 47% better forecasts);
  - the per-scenario bars with their metric tabs and the honest footnote;
  - each row opens to all seven measures for that scenario;
- the six "built for the unexpected" cards;
- all 13 scenarios in four groups:
  - each with its live preview;
  - its own result (less waiting %, measures out of 7);
  - a link to Simulation Settings;
- the five-page console tour with real screenshots (inline under each page on phones);
- the physical-model section:
  - the animated four-lens head with its four lens labels;
  - the Console → USB → ESP32 → lamps chain;
- the "Built with" marquee and the finale;
- the footer (logo and tagline, links to all five console pages, back to top).
- the "Get, set, go" signal screen shown while the console opens from the home page (Section 49).

Console footer (Section 50): the physical model's link status, "● Physical model connected (COMx)" or "not connected", shown whenever a link is running.

Every number comes from `home/content.ts`, which is transcribed from README.md's results;
its tests fail if a headline is typed in rather than computed.

## 4. How to check a change

1. `cd frontend && npm run lint && npx vitest run && npm run build`.
2. Run the console (`cd backend && python server.py`), start a demo, walk
   every page you touched **and** every page you moved something to or from,
   with §3 open. Then stop the run and check the idle states.
3. If anything in §3 is missing, it is not done.
4. Record the change in `PROJECT_ARCHITECTURE_REPORT.md` (a new subsection of
   the current SECTION) and, if a rule here changed, in this file with the
   date and who decided it.

## 5. The revert point

`git tag prototype-3` is the current working prototype and revert point, current as of
2026-10-02. Since `prototype-2`, these landed on `main` (merged from `design/glass-night`):
- the "glass over the night city" redesign (Section 37);
- Simulation Settings cards on the page (no outer box);
- the max-speed simulation fix (Section 39);
- the physical rig's live link (Section 43);
- and the mascot was added and then removed again (Sections 38–42).

To see it: `git checkout prototype-3`. To take `main` back to it: `git revert <bad commits>`
(keeps history) or, with the owner's say-so, `git reset --hard prototype-3 && git push
--force-with-lease`.

`git tag prototype-2` (2026-09-21) and `git tag prototype-1` (commit `d9afd01`, 2026-09-17)
are the earlier prototypes — still there to check out, no longer the ones to revert to.
