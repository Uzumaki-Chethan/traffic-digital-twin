# Blinky — Trinetra's mascot and drag-to-explain guide

*Design spec · 2026-10-01 · branch `design/glass-night`*

## 1. Purpose

The owner's long-standing wish: a cute, adorable little bot that lives on the Trinetra
console, keeps it lively, and is fun to interact with. It walks, hops, flies and teleports
across the site, acts on its own, reacts when tapped, and gets up to harmless mischief.

It also **replaces tooltips with a guide you play with**. You drag Blinky's antenna onto
any page link or any component, and Blinky comes forward and explains it in plain
language for someone who has never used Trinetra.

**Success looks like this:**

1. In a demo, people smile at Blinky and want to poke it.
2. A first-time user can learn what every page and panel means using only the antenna.
3. Blinky never gets in the way. It never covers a number someone needs, never blocks a
   click, never changes data and never touches the simulation, and the owner can put it
   to sleep in one click.

### What the owner decided (Q&A, 2026-10-01)

- **Character:** a tiny signal-bot — a traffic light come to life, with its mood shown in
  its lamps.
- **Liveliness:** lively, but it reads the room. It does a trick every 20–40 s, settles
  down during a run, dozes when you're idle, and has a "Shh" to sleep.
- **Sound:** synthesized chirps, off by default. One click turns them on, and the choice
  is remembered.
- **Name:** Blinky.
- **Rendering:** no limits on performance. The demo is on a high-end laptop with a GPU,
  so Blinky is a real 3D toy.
- **Addition (owner's idea):** the antenna guide (§7) replaces tooltips.

## 2. Non-negotiables

- **Read-only.** Blinky reads the live store (`useSim`, `useRunStore`, page context) and
  never writes to anything that reaches the backend. It sends no control requests, ever.
- **Never in the way.** Pranks never cover data, never sit on a control, and never take
  pointer events away from the page. Blinky's own hit area is its body; everything else
  is `pointer-events: none`. Every prank undoes itself (§6).
- **UI rules hold** (`docs/UI_CHANGE_RULES.md` §2). No invented numbers: live examples use
  real fields only. No prediction confidence, ever. No internal jargon: Blinky says "North
  – South straight + left", never `NS_straight_left`.
- **Off switch.** "Shh" sends Blinky to sleep in its dock until woken. Under
  `prefers-reduced-motion`, Blinky stays docked and only blinks. The antenna guide still
  works, with Blinky explaining from the dock.
- **Fail safe.** Blinky sits inside its own `ErrorBoundary`. If WebGL is unavailable or
  fails, it falls back to a 2D SVG Blinky, so the guide still works. If even that fails,
  Blinky is simply absent and the console is untouched.

## 3. The character

- **Body:** a rounded, slightly squashy signal housing in charcoal with a soft chrome rim,
  about 44 px tall at rest (scales to about 140 px when presenting).
- **Face:** the three lamps.
  - The top lamp holds two eyes (white, glossy, pupils that track).
  - The middle lamp is the mouth (a smile, an "o", a pout, a grin).
  - The bottom lamp is a belly glow.
- **Mood:** set by the lamp colour, which carries the meaning, with a soft bloom.
  - green: happy or content;
  - amber: curious or plotting;
  - red: sulking, startled or sleepy.
  - "Disco" cycles all three.
- **Limbs:** two tiny noodle arms (two-segment), stubby feet, and a springy antenna with a
  glowing ball tip. The ball is the drag handle in §7.
- **Props** (pop in and out with a little scale-bounce): a propeller cap (the top visor
  folds up into blades), a siren hat (blue/red), an umbrella, a STOP/GO lollipop sign, a
  tiny fan, a sticky note, sunglasses for disco.
- **Feel:**
  - squash and stretch on every take-off and landing (volume preserved);
  - blinks every 2–6 s;
  - eyes follow the pointer within about 300 px;
  - idle micro-motion (breathing scale, antenna sway).

## 4. Rendering

- **three.js, its own small transparent canvas** (about 220 × 220 CSS px, DPR ≤ 2) that
  travels with Blinky, rather than a full-screen overlay. That means one extra WebGL
  context, sized to the character.
- **Materials:**
  - `MeshPhysicalMaterial` (clearcoat) for the body;
  - emissive lamps;
  - `UnrealBloomPass` on the small composer for the lamp glow;
  - a `RoomEnvironment` env map for reflections.
- **Ground shadow:** a blurred HTML ellipse on the surface under Blinky, so it reads as
  standing on the card.
- **Animation:** procedural, from the behaviour state each frame — limb angles, squash
  scale, eye targets, emissive colours, prop visibility. No baked clips.
- **Speech bubbles, the explainer card, the drag cable, the target highlight and the dock**
  are HTML/SVG layers. The cable is an SVG path with spring physics.
- **2D fallback:** an SVG Blinky with the same parts and the same API, used when WebGL
  fails (§2).

## 5. World, movement and the brain

### 5.1 World map (`blinky/world.ts`)

- **Platforms:** the top edges of `.glass-card` elements, the top bar, the rail and the
  footer, read from their bounding rects. A ResizeObserver plus a scroll listener keeps
  them current. A platform is `{ x1, x2, y, el, kind }`.
- **Exclusion zones:** nothing is ever placed over the twin's map area, chart plot
  areas, KPI values, the lane table, run controls or inputs. Blinky may stand on top
  edges and beside these, never over them.
- **Perch slots** per page, from data attributes (§7.2), for example the Digital twin top
  edge during a run.

### 5.2 Movement (`blinky/locomotion.ts`)

| Mode | Path | Feel |
|---|---|---|
| Walk | along a platform, about 60 px/s | 4-frame waddle, peeks over the end before turning |
| Hop | parabolic arc to another platform | crouch, stretch, airborne, squash on landing |
| Fly | cubic Bézier, gentle bob | propeller cap spins; tilts into the turn |
| Teleport | shrink to a green dot, vanish, reappear | red → amber → green ring burst (a signal cycle) |
| Fall | gravity to the nearest platform below | flails, bounces once |
| Drag | follows the pointer with spring lag | dangles, kicks its feet |

All movement is time-based, so it is frame-rate independent.

### 5.3 The brain (`blinky/brain.ts`)

The brain is a pure, deterministic state machine (it takes a seeded RNG), so it can be
unit-tested. Each update it receives a **WorldSnapshot**:

- the platforms;
- the pointer position and speed;
- idle seconds;
- the route;
- run state (running / paused / ended, speed);
- the latest tick (decision switched, active phase, mode, emergency lanes);
- the scenario;
- the queue level;
- the dock state.

It returns the **next Intent**: move, say, emote, prank, perch or sleep.

**Top-level states:**
- `docked`;
- `roaming`;
- `perched` (watching a run);
- `sleeping`;
- `presenting` (§7);
- `reacting` (a tap or a live event);
- `pranking`;
- `held` (being dragged).

**Schedule:**
- **Roaming:** a weighted pick every 20–40 s from walk, hop, fly, teleport, idle trick
  (wave, stretch, look around, juggle the lamps) and prank.
- **While a run is going:** prefer `perched` on the twin card. Pranks are rarer (every
  60–120 s).
- **Idle 60 s (no pointer):** yawn, find a platform, then `sleeping` ("Zzz", red dim
  lamps). Wake when the pointer comes within 250 px.

### 5.4 Reading the room (all from real fields)

| Event | Source | Blinky |
|---|---|---|
| Page change | router | teleports in near the page title, a small wave |
| Run starts | `run.running` turns true | "Here we go!", flies to the twin perch |
| Phase switch | `latestTick.decision.switched` | lamps flash the new green, a tiny cheer |
| Emergency vehicle | `emergency_lanes` not empty | siren hat (blue/red), salutes |
| Accident scenario | page scenario `accident*` | worried face; points at the stalled lane |
| Rain scenario | `rain*` | umbrella up |
| Long queues | `metrics.stopped` high | fans itself ("phew") |
| Paused | `run.paused` | freezes mid-pose, then looks around confused |
| Max speed | `speed === null` and running | sunglasses and a disco dance ("wheee!") |
| Run ends | `run.running` turns false | waves, stretches, back to roaming |
| Pointer swipes fast at it | pointer speed | dodges |
| Hover on Blinky | pointer over body | blushes (amber cheeks), giggles |

## 6. Taps, play and mischief

**Taps** (on its body):
- **Single tap:** cycles a reaction — wave "Hi, I'm Blinky!", a traffic fact, a joke, or
  the live state read out ("North–South straight + left has the green — held 12 s").
  Each tap picks the next item from a shuffled deck, so it doesn't repeat soon.
- **Three taps within 1 s:** dizzy (spinning eyes, wobble), "too fast!"
- **Double-tap:** a backflip.
- **Drag its body:** you pick it up and drop it anywhere. It falls onto the platform below.

**Pranks.** Each prank declares its target, duration and undo, and the brain refuses a
prank whose target is in an exclusion zone or currently hovered by you.

1. **Peekaboo:** hides behind a card's edge and peeks out (3–5 s).
2. **Card tug:** grabs a card corner and the card wobbles (a 600 ms CSS rotate on that
   card only, auto-reset).
3. **Sticky note:** sticks "Blinky was here ✌" on a card's header edge, never over data.
   It peels off after 4 s.
4. **Traffic cop:** stands beside (never on) Start or Stop with a STOP sign, flips it to
   GO, bows.
5. **Lever:** hangs off the scenario pill and swings (the pill isn't moved or clicked).
6. **Scrollbar slide:** rides down the page's scrollbar track and pops off at the bottom.
7. **Weightlifter:** stands on a KPI tile's top edge and "lifts" the tile's icon (the
   number is untouched).
8. **Hide and seek:** teleports away, then peeks out from behind the rail's logo after a
   few seconds.

## 7. The antenna guide (drag-to-explain)

### 7.1 Interaction

1. **Grab the antenna ball** (`pointerdown` on it). Blinky braces, and a springy SVG cable
   runs from the antenna to the pointer.
2. **Sweep.** The element under the pointer that carries a `data-explain` id gets a soft
   red→amber→green outline and a name tag ("Active phase"). Nav links name their page.
3. **Drop:**
   - **On a nav link:** Blinky flies to the front-centre (scaled up to about 140 px)
     beside a glass **explainer card** for that page.
   - **On a component:** Blinky flies next to it (the side with the most room) and the
     card appears beside it, while the component keeps its outline.
   - **On nothing explainable:** the cable snaps back with a "boing", and Blinky shrugs.
4. **The explainer card:**
   - a title;
   - 2–5 short **steps**, each one or two plain sentences. Next/Back; dots show progress.
   - Blinky points at the part a step is about; steps can name a sub-part to highlight.
   - an optional **live example** line from the real data, when a run is up;
   - "Got it!" closes it.
5. **Closing:** Esc, a click outside, or "Got it!". Blinky hops back to what it was doing.
   The explainer never pauses or alters the simulation.
6. **Keyboard / accessibility:**
   - The dock has an "Explain…" button that starts a pointer-free mode: Tab cycles
     through the explainable targets, and Enter explains the focused one.
   - The card is a `role="dialog"` with focus trapped and returned on close.

### 7.2 Targets

Components declare themselves with `data-explain="<id>"` on their root element; `Panel`
takes an `explain` prop. Nav links get `data-explain="page:<route>"`. The catalogue below
lists every id. An id with no catalogue entry fails a unit test, so a new panel can't
ship unexplained.

### 7.3 The explanation catalogue (what Blinky says)

Written for someone opening Trinetra for the first time. `{…}` marks a live value, shown
only when a run is up; otherwise that line is left out.

**Pages**

- **page:/ — Overview.**
  - This is the junction, live. Trinetra watches one crossroads in a traffic simulator
    and decides which way gets the green light.
  - The big map is a "digital twin": a live copy of the real junction, with every car
    where it really is.
  - Around it you can see what the AI decided, why, and how each lane is doing.
  - Press Start at the top to begin a simulation.
- **page:/analytics — Analytics.**
  - This page turns the run that's happening now into charts: which lanes are under
    pressure, how waiting time changes, and how the AI spends its green time.
  - It only shows the current run, and it keeps what it recorded after the run ends.
- **page:/performance — Performance.**
  - Here Trinetra competes. Two copies of the same junction run side by side with
    exactly the same traffic.
  - The left one is controlled by Trinetra's AI; the right one by VAC
    (vehicle-actuated control), a common real-world method that holds green while cars
    keep arriving.
  - Seven scores below show who is doing better.
- **page:/decisions — Decisions.**
  - Every second the AI makes a decision. This page is the logbook of all of them, saved
    in a database.
  - Pick a run, scroll through its decisions, and open one to see exactly why the AI
    chose what it chose. Green rows are the moments the light actually changed.
- **page:/settings — Simulation Settings.**
  - Choose what kind of traffic to simulate: light, heavy, rush hour, an accident, rain,
    emergency vehicles, and more.
  - The "Choose for" menu picks whether you're choosing for the Overview demo or for the
    Performance contest.

**Top bar and frame**

- **scenario-pill:**
  - The traffic situation this page will run (or is running).
  - Click it to choose a different one on Simulation Settings.
- **run-start:**
  - Starts a simulation of the chosen scenario. Live data starts flowing within a few
    seconds.
  - The screen icon next to it starts one with SUMO's own window too.
- **run-pause:** Freezes the simulation where it is; press Play to carry on. Nothing is
  lost.
- **run-stop:** Ends the run. The traffic disappears and you can start another.
- **run-window:** Opens the simulator's own window (SUMO) and carries this exact run into
  it — same cars, same lights.
- **run-speed:**
  - How fast simulated time runs: 1× is real time, 5× is five times faster, max is as
    fast as the computer can go.
  - Click to step through, or hover to slide.
- **clock:** The simulated time since the run began, and how fast it's actually running
  right now.
- **link-pill:** Whether this screen is receiving live data. Live means everything you
  see is current.
- **rail:** The menu: jump between the five pages. Collapse makes it narrow to give the
  junction more room.

**Overview**

- **twin — Digital twin.**
  - A live, true-to-scale map of the junction: every vehicle is drawn at its real size
    and position.
  - Lanes glow green or red with their own signal, and each signal head shows its real
    light.
  - Switch to 3D for a model you can orbit. Use the tools to zoom, frame the junction or
    go full screen.
  - Live example: {vehicles} vehicles on the map right now; {greens} lanes have green.
- **twin-tools:** Show or hide the road names, frame the whole junction, or zoom right in
  to the stop lines (press again to come back).
- **active-phase — Active phase.**
  - A "phase" is a set of movements that get green together, for example North–South
    straight and left.
  - This box shows which phase the AI chose, why (the mode, explained in plain words),
    and how long it has held it, against its minimum and maximum green.
  - The light in the simulator changes only after a 3-second amber, so "Engine decided"
    and "Light showing" can differ for a moment. That's normal.
  - Live example: {phase} is green, held {held} s (min {min}, max {max}).
- **lanes — Lanes.**
  - All twelve lanes (left, straight and right for each of the four roads), with their
    signal, how many vehicles are on them, and how long they've waited on average.
  - Hover a lane to highlight it on the map. Longer waits turn orange, then red.
- **prediction — Prediction vs actual.**
  - Trinetra's AI looks 15 seconds ahead and guesses how many vehicles each lane will
    have.
  - These charts and rows put each guess next to what actually happened, so you can see
    how good the predictions are.
  - The yellow line is the guess; blue is reality.
- **why-phase — Why this phase.**
  - Every second the AI scores each phase by how much it's needed.
  - The highlighted bar is the phase being served. Another phase only takes over if its
    score passes the red dashed line (the boundary). That stops the lights flickering
    back and forth.
- **recent-switches:** The last few times the light changed: when, from what to what, how
  long the old phase had run, and the rule that triggered it.
- **phase-history:** The last minute as two timelines, one for North–South and one for
  East–West. Green is go, amber is clearance, grey is waiting.
- **kpi-vehicles:** How many vehicles are in the whole network right now. The small line
  shows the last two minutes.
- **kpi-wait:** The average time vehicles have been waiting. Lower is better; the arrow
  shows the change against 30 seconds ago.
- **kpi-speed:** The average speed of all vehicles, in metres per second and km/h. Higher
  means traffic is flowing.
- **kpi-queue:** How many vehicles are stopped at red lights right now.
- **kpi-switches:** How many times the lights changed in the last minute.
- **dispatch:** Send an emergency vehicle (ambulance, fire engine, police) into the
  junction from any road, to see Trinetra clear the way. Shown only in the Accident and
  Emergency scenarios.
- **incident:** Stall a vehicle on a lane — an instant accident — to see how Trinetra
  copes with a blocked lane.

**Analytics**

- **an-run:** How long this run has been recorded, and whether it's still updating.
- **an-heatmap — Lane pressure over time.** Each row is a lane; each column is a few
  seconds of time. The darker the cell, the more pressure that lane was under: more cars,
  longer waits.
- **an-ledger — Lane ledger.** Each lane's signal and traffic right now, next to its
  average over the whole run.
- **an-network — Network over time.** Average waiting time and queue length for the whole
  junction across the run. Rising lines mean traffic is building up.
- **an-congestion — Congestion trend.** One score for how congested the junction is, over
  time.
- **an-modes — Decision modes.** How often the AI used each kind of decision: holding a
  minimum green, serving the busiest phase, releasing an empty phase early, and so on.
- **an-phase-share — Phase share.** How the green time was split between the four
  phases.
- **an-greens — Green duration spread.** How long each green lasted, as a histogram.
  Short greens mean quick switching; long ones mean heavy demand.
- **an-scatter — Speed against waiting time.** One dot per second: how fast traffic moved
  against how long it waited. Normally, the more waiting, the slower.
- **an-peaks — Peak periods.** The busiest stretches of this run, found automatically.
- **an-source — Where this data comes from.** All of this is the live stream of the
  current run. It isn't stored history.

**Performance**

- **pf-ai:** The junction run by Trinetra's AI.
- **pf-vac:** The same junction, same traffic, run by VAC (vehicle-actuated control).
  It's the fair comparison.
- **pf-summary:** The scoreboard: on how many of the seven measures Trinetra is ahead or
  level.
- **pf-metric (each of the seven):**
  - One measure, both controllers.
  - The lines show it over time (blue Trinetra, orange VAC), and the badge says who's
    ahead and by how much. "Even" means within half a percent.
  - Per measure: average waiting time; average travel time; worst travel time; average
    queue; longest queue; average speed; vehicles served.

**Decisions**

- **dc-run:** Choose which recorded run to look at. The newest is at the top, with its
  scenario and length.
- **dc-filters:** Show all decisions, only the moments the light changed, or only one
  kind of decision.
- **dc-list — Every decision.** One row per second: the time, the phase, how long it had
  been held, the rule, and the reason. Green rows are the moments the light changed.
  Click one to open it.
- **dc-detail — Decision.** Everything about one decision: what the AI chose, the rule it
  followed, its reason in full, what the light was showing, and the score of every phase
  at that moment.

**Simulation Settings**

- **st-for — Choose for.** Pick whether you're choosing the scenario for the Overview demo
  or for the Performance contest.
- **st-cards:**
  - Each card is a kind of traffic. The little moving picture shows what it's like, and
    the tag says how heavy it is.
  - Click one to choose it; the coloured ring marks your pick.

## 8. Controls and persistence

- **The dock:** a small round Blinky badge at the bottom-left of the main frame. It has
  four buttons: **Shh / Wake**, **Sound on/off**, **Come here** and **Explain…**.
- **Saved preferences:** in `localStorage`, under `trinetra.blinky` (asleep, sound), each
  read inside try/catch.
- **Sound** (`blinky/sound.ts`): WebAudio-synthesized chirps (short sine/square glides) —
  a hi, a giggle, a boing, a yawn, a cheer and a ta-da. Off by default; it never plays
  before you have turned it on.

## 9. Architecture

```
src/blinky/
  BlinkyRoot.tsx     mounts everything, owns the loop, ErrorBoundary, reduced-motion gate
  brain.ts           pure state machine (WorldSnapshot + rng -> Intent), unit-tested
  world.ts           platforms / exclusion zones / targets from the DOM
  locomotion.ts      walk / hop / fly / teleport / fall / drag paths
  Blinky3D.tsx       three.js model + bloom + procedural animation (and the SVG fallback)
  BlinkySvg.tsx      2D fallback with the same props
  Bubble.tsx         speech bubbles
  Antenna.tsx        drag handle, spring cable, target highlight + name tag
  Explainer.tsx      the explainer card (steps, live example, dialog semantics)
  catalogue.ts       §7.3 as data: id -> { title, steps[], live?(snapshot) }
  pranks.ts          prank definitions with target selection + undo
  lines.ts           greetings, facts, jokes, reactions
  sound.ts           WebAudio chirps
  Dock.tsx           the corner controls
  useBlinkyWorld.ts  live snapshot from the stores (read-only)
```

It is mounted once in `layout/Shell.tsx`, outside the routes, inside its own
`ErrorBoundary`. Components gain `data-explain` ids (and `Panel` an `explain` prop). No
backend changes.

## 10. Testing

- **Unit (Vitest):**
  - brain transitions with a seeded RNG (a run starting moves it to perched; idle → sleep;
    pranks refused over exclusion zones);
  - catalogue coverage (every `data-explain` id in the source has an entry);
  - live-example formatting (no raw ids, no confidence);
  - prank undo restores the DOM.
- **Browser (Playwright):**
  - Blinky appears; tap reactions work;
  - dragging the antenna onto a nav link and onto "Active phase" opens the right
    explainer;
  - Shh puts it to sleep and is remembered across a reload;
  - reduced motion keeps it docked;
  - frame rate unchanged with a run going.
- **Docs:** PROJECT_ARCHITECTURE_REPORT.md Section 38, and the UI_CHANGE_RULES inventory
  additions.

## 11. Out of scope (for now)

Riding the cars on the map, voice or text-to-speech, and Blinky on a separately-briefed
home screen. These are good follow-ups once the core is loved.
