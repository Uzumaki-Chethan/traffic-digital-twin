# Trinetra — Dashboard UI Design Brief

**For:** the agent redesigning the Trinetra web dashboard (Claude Code)
**Project:** AI-Driven Intelligent Adaptive Traffic Digital Twin & Optimization System ("Trinetra")
**Repo:** https://github.com/Uzumaki-Chethan/traffic-digital-twin
**Status of this document:** this is the design contract. Where it specifies a value, use that value. Where it leaves something open, it says so explicitly and tells you to ask.

---

## 0. How to use this document

Read it end to end before writing a single line of code. Then follow the process in §14 — plan first, self-critique against §12, build second.

Three rules govern everything below:

1. **Do not invent data.** Every number, label and state in this UI must come from a real field in §2. If a panel you want needs data that does not exist, either drop the panel or ask. Never render placeholder or demo values that could be mistaken for real ones during an evaluation.
2. **Do not touch the backend contract.** The dashboard is a read-only viewer plus one narrowly-scoped control layer that already exists. No new endpoints, no logic moved into the frontend.
3. **Do not settle for a competent default.** A competent default is exactly the failure this redesign exists to fix. §12 lists the specific defaults that are banned.

---

## 1. What this product is, and what the UI has to prove

Trinetra runs a real closed loop: SUMO simulates a junction, the AI reads it, predicts 15 seconds ahead, decides a signal phase, executes it over TraCI, and independently benchmarks itself against Vehicle Actuated Control — a genuinely adaptive baseline, not a fixed-timer strawman.

The dashboard is the only place a human ever sees any of that. It is the evidence layer for a final-year major project, shown to faculty evaluators in a viva. It has exactly four jobs, in priority order:

| # | The question the viewer is asking | Where the UI answers it |
|---|---|---|
| 1 | What is this junction doing **right now**? | Overview — the junction plate and signal state |
| 2 | **Why** did the AI decide that, in numbers? | Decisions — phase scores, mode, reason text |
| 3 | Did the decision **actually reach SUMO**? | Desired vs Actual, on every page |
| 4 | Is the AI **measurably better** than VAC? | Performance — signed, honest deltas |

Job 3 deserves emphasis. The project's whole architectural claim is the Desired-vs-Actual distinction: the Decision Engine writes intent, the Signal Controller writes reality only after TraCI confirms it. Most student dashboards cannot show this because they have nothing to show. Trinetra can. **Make it visible on screen at all times, not buried on one tab.** If an evaluator asks "prove the AI actually changed something," the answer should already be on the screen they are looking at.

### Audience and viewing conditions — these are hard constraints

- Viewed on a **projector or a shared screen in a bright classroom**, from 3–5 metres, by people who have never seen the system before and will look at it for perhaps 90 seconds per page.
- Consequences, all mandatory:
  - Target **1920×1080** as the design viewport. Degrade gracefully to 1366×768 (common projector native res) — nothing critical may be below the fold at that height on the Overview page.
  - Minimum body text **13px**; minimum any-text **11px**; primary metric values **32px+**.
  - Minimum contrast **4.5:1** for text, **3:1** for meaningful graphics (bars, lane fills, lamps). Projectors crush contrast — design with headroom, not to the minimum.
  - No information carried by hue alone. Every colour-coded state also has a shape, glyph, label or position.
- The judge may ask you to leave it running for ten minutes. It must not leak memory, drift, or jitter.

---

## 2. The data contract — verified against the actual source

This section was read directly out of `backend/app.py`, `backend/services/dashboard_server.py`, `backend/services/control_routes.py`, `backend/performance/evaluator.py`, `backend/performance/metrics_collector.py` and `backend/decision_engine/decision_engine.py` on the `main` branch. **Treat it as the authority over any older doc, but re-verify field names against the running server before you ship** — `GET /api/latest` while `python app.py` runs is the fastest check.

### 2.1 Live snapshot — `WS /ws` (pushed every 0.5 s) and `GET /api/latest`

```jsonc
{
  "sim_time": 644.05,                      // float, simulated seconds
  "signal": {
    "phase": "NS_straight_left",           // green phase name, or the phase being cleared if yellow
    "is_yellow": true,                     // TraCI-CONFIRMED actual state
    "green": false,
    "countdown": 3.4                       // seconds until next switch, float
  },
  "metrics": {
    "vehicles": 42,                        // int, network-wide
    "avg_speed": 7.17,                     // m/s
    "avg_wait": 3.17,                      // seconds
    "queue": 14,                           // int (== stopped)
    "stopped": 14                          // int
  },
  "lanes": [                               // ALWAYS 12 entries, fixed order (see 2.3)
    { "lane_id": "N_in_0", "vehicles": 3, "avg_wait": 1.2, "signal": "G" }
  ],
  "decision": {                            // DESIRED state — what the engine decided
    "active_phase": "NS_straight_left",
    "mode": "priority",                    // one of 6, see 2.4
    "switched": false,
    "reason": "Holding NS_straight_left: ...",   // full sentence(s), human-readable
    "duration": 12.0,                      // green duration seconds
    "phase_scores": { "NS_straight_left": 0.62, "NS_right": 0.31,
                      "EW_straight_left": 0.55, "EW_right": 0.12 }
  },
  "emergency_lanes": ["E_in_1"],           // sorted array, usually empty
  "prediction": null,                      // OR the matured-prediction object below
  "comparison": null,                      // OR the comparison object below
  "phase_history": [                       // rolling ~60 entries, oldest first
    { "time": 641.0, "phase": "NS_right", "is_yellow": false }
  ]
}
```

`prediction`, when present — this is a **matured** prediction, i.e. one whose 15 s horizon has elapsed and has been paired with what actually happened:

```jsonc
"prediction": {
  "target_time": 629.0,
  "avg_confidence": 0.78,
  "rows": [ { "lane": "N_in_0", "pred_veh": 4, "act_veh": 3,
              "pred_wait": 2.1, "act_wait": 1.8, "confidence": 0.81 } ]
}
```

`comparison`, when present — only populated during an evaluator run pushing to this dashboard:

```jsonc
"comparison": {
  "baseline_controller": "vac",            // "vac" | "fixed_timer"
  "rows": [ { "key": "avg_waiting_time_seconds", "label": "Avg Waiting Time (s)",
              "ai": 2.94, "baseline": 8.69, "improvement": 66.2 } ]
}
```

**Before the first simulation tick,** `GET /api/latest` returns `{"status": "waiting_for_simulation"}` and the WebSocket sends nothing. Design for this. It is the first thing an evaluator will see.

### 2.2 Other endpoints (all already implemented — do not add to them)

| Method + path | Returns | Notes |
|---|---|---|
| `GET /api/logs/decisions?limit=200` | `[{id,time,phase,duration,mode,reason}]` | newest first, limit capped at 1000 |
| `GET /api/logs/performance?limit=200` | network-wide history rows | for time-series charts |
| `GET /api/logs/predictions?limit=200` | predicted vs actual + confidence | for model-quality charts |
| `GET /api/analytics/wait-times` | mean wait, `group_by` network/lane | params: `group_by`, `start_time`, `end_time` |
| `GET /api/analytics/congestion-trend` | time-bucketed congestion score | params: `bucket_seconds`, `group_by` |
| `GET /api/analytics/peak-periods` | top-N congestion windows | params: `top_n`, `window_seconds` |
| `GET /api/results` | saved comparison CSVs from `results/` | past runs |
| `GET /api/model-info` | training metadata JSON | test MAE, row counts, scenarios |
| `POST /api/control/start-evaluator` | `{scenario_name, baseline, gui}` | 409 if a run is already active |
| `POST /api/control/stop-evaluator` | — | graceful stop |
| `GET /api/control/status` | `{running, scenario_name, baseline, gui, ...}` | self-heals when the child exits |
| `POST /api/internal/publish` | — | **machine-to-machine only. The frontend must never call this.** |

Control endpoints exist **only** when the dashboard was started by `app.py`. A standalone `python -m performance.evaluator --dashboard` does not mount them, and `GET /api/control/status` will 404. Handle that: hide or disable the launcher rather than showing a broken control.

### 2.3 The junction: 4 phases, 12 lanes

Phases (`PHASE_NAMES`, in order):

```
NS_straight_left    NS_right    EW_straight_left    EW_right
```

Lanes (`ALL_APPROACH_LANES`, fixed order — the `lanes` array always arrives in exactly this order):

```
N_in_0  N_in_1  N_in_2    S_in_0  S_in_1  S_in_2
E_in_0  E_in_1  E_in_2    W_in_0  W_in_1  W_in_2
```

Phase-to-lane mapping, from `_PHASE_EXCLUSIVE_LANES`:

| Phase | Exclusively serves |
|---|---|
| `NS_straight_left` | `N_in_1`, `S_in_1` |
| `NS_right` | `N_in_2`, `S_in_2` |
| `EW_straight_left` | `E_in_1`, `W_in_1` |
| `EW_right` | `E_in_2`, `W_in_2` |

The `_in_0` lanes (`N_in_0`, `S_in_0`, `E_in_0`, `W_in_0`) are the left-turn lanes and are served by **both** main phases — this is left-hand-drive Indian traffic, so the left turn is the permissive movement, not the right.

> **Verify before drawing.** The junction plate (§7.1) depends on this geometry being right. Read `sumo/network/intersection.con.xml`, `.edg.xml` and `.nod.xml` and confirm lane index → movement (left / straight / right) and approach direction before committing to the drawing. If what you find contradicts the table above, **stop and report it** rather than drawing something plausible. A wrong junction diagram is worse than no junction diagram: an evaluator who knows the network will spot it instantly.

Per-lane `signal` values are raw SUMO signal characters — expect `G`, `g`, `y`, `r` (and possibly `s`, `u`, `O`). Map them explicitly; do not assume only three cases. Treat lowercase `g` (permissive green) as green but distinguishable if you can do it without clutter.

### 2.4 Decision modes — all six, each needs its own visual identity

From `Decision.decision_mode`:

| Mode | What it means, in plain words | Frequency |
|---|---|---|
| `priority` | Normal operation: scored preference won, past the hysteresis margin | most ticks |
| `min_green_hold` | Holding because the minimum green time has not elapsed yet | common |
| `gap_out` | Current phase's lanes emptied, releasing early | common under light traffic |
| `light_traffic_patience` | Congestion below threshold, so scored preemption is suppressed | rare (threshold ships at 0.0 = inactive) |
| `starvation_override` | A phase hit the hard unserved-time limit and was forced through | occasional |
| `emergency` | Emergency vehicle detected; override or service-window hold | rare, high drama |

`emergency` and `starvation_override` are the two that must **grab** the eye. `min_green_hold` and `priority` are routine and must stay quiet — if routine states shout, the exceptional ones cannot.

### 2.5 The seven benchmark metrics

`COMPARISON_METRICS`, in this exact order, with the direction that counts as better:

| Key | Label | Better |
|---|---|---|
| `avg_waiting_time_seconds` | Avg Waiting Time (s) | lower |
| `avg_travel_time_seconds` | Avg Travel Time (s) | lower |
| `max_travel_time_seconds` | Worst Travel Time (s) | lower |
| `avg_queue_length_vehicles` | Avg Queue Length (veh) | lower |
| `max_queue_length_vehicles` | Max Queue Length (veh) | lower |
| `avg_speed_mps` | Avg Speed (m/s) | higher |
| `throughput_vehicles` | Throughput (veh completed) | higher |

`improvement` is already **signed** — positive is better, negative is a regression, direction is already accounted for. Do not re-derive it. The evaluator also reports `switch_counts: {ai, baseline}`.

**Design the regression case first.** This project reports regressions honestly, and that honesty is a selling point in a viva. A minus sign must be as legible and as unashamed as a plus. Never colour a regression as a failure state (no red alarm styling); it is data.

---

## 3. The design thesis

> **Trinetra is instrumentation for a piece of public infrastructure. It is not a SaaS product, an analytics suite, or a startup dashboard.**

Everything follows from that sentence. Three sources of visual vocabulary, in order of weight:

**1. The traffic engineer's own artefacts (primary).** Signal plans, phase diagrams, ring-barrier charts, lane schedules, stop bars, painted road arrows. This is the richest and least-used source available to this project, and it is what will make the UI look like real infrastructure software rather than a template with traffic-coloured accents. Draw the junction the way a signal plan draws it: top-down, to scale, hairline lane edges, stop bars, movement arrows painted on the carriageway.

**2. High-performance HMI discipline (the restraint).** The control-room convention — grey, low-saturation base; colour reserved almost entirely for abnormal conditions; no decorative chrome. Under this discipline, a screen where nothing is wrong looks calm and almost colourless, and the one thing that *is* wrong is unmissable. This is the opposite of the "every card has its own accent colour" habit. It also gives you a defensible answer in the viva when someone asks why the UI looks the way it does: it follows established HMI practice for operational displays.

**3. The name (the organising idea).** Trinetra, त्रिनेत्र — the third eye, perception beyond ordinary sight. The system genuinely has three ways of seeing the same junction, and they map cleanly onto the architecture:

```
   what IS          what WILL BE           what SHOULD BE
   Current state →  15 s prediction    →   Decision + confirmation
   (TrafficAdapter) (MLPredictor)          (DecisionEngine → SignalController)
```

Use this triad as a real structural device — the three views should be visually distinguishable and consistently coded everywhere they appear (see the solid/dashed/outlined rule in §5.6) — not as a decorative tagline. Do not write the words "third eye" on the screen.

### Spend the boldness in exactly one place

**The junction plate is the hero.** It is the one element allowed to be large, detailed, and beautiful. Everything else — panels, tables, charts, controls — is quiet, hairline-ruled and disciplined. If you find yourself making a second element compete with the plate, cut it back.

---

## 4. Reference gathering — what to ask Chethan for, and what to extract

References are the single highest-leverage input, and they only work if you extract *specific properties* rather than vibes. If Chethan has not attached screenshots, ask for them before designing — naming exactly what you need, using the list below.

### 4.1 The reference kit (aim for 5–7 images, not 20)

| Slot | What to look for | What to extract from it — nothing else |
|---|---|---|
| A. Real traffic control room / ATMS | Search: *traffic management center operator screen*, *ATMS dashboard*, *SCADA HMI overview*, plus vendor material from PTV Optima, Yunex/Siemens Sitraffic, Kapsch, Aimsun Live | Information density, how the map dominates, how alarms are shown, how little colour is used |
| B. A signal timing plan / phase diagram | Search: *traffic signal phase diagram*, *ring barrier diagram*, *NEMA phase diagram*, *signal timing sheet* | Drawing conventions for the junction plate and the phase strip: line weights, arrows, stop bars, labelling |
| C. A dense, non-decorative product UI | Mobbin, or a trading / observability / logistics console | Table density, row rhythm, how numbers are set, how filters and status chips work |
| D. Two aesthetic references | Dribbble / Behance / Awwwards / Godly / Land-book / SiteInspire / Lapa Ninja / Refero / Collect UI | **Layout composition and type hierarchy only.** Ignore their colours — they will pull you toward the generic |
| E. A data-visualisation reference | FT Visual Vocabulary (chart-type chooser), Datawrapper's colour writing, Observable Plot examples | Which chart type is correct for each comparison, and how to label axes honestly |

### 4.2 Design systems worth mining for structure (not for looks)

- **IBM Carbon** — the closest mainstream system to this brief's density and industrial register.
- **Radix Colors** — accessible, perceptually even colour scales, if the palette in §5 needs extension.
- **Atlassian / Adobe Spectrum** — table, empty-state and status-chip patterns.

Mine these for *rules* (spacing rhythm, state definitions, disabled/loading semantics). Do not adopt their identity — a UI that looks like stock Carbon is just a different template.

### 4.3 Assets to self-host (offline demo is mandatory)

- **Fonts:** IBM Plex Sans + IBM Plex Mono (see §5.2). Vendor the woff2 files into the repo — Fontsource ships them as npm packages, which is the least painful route. **No Google Fonts link tag, no CDN.**
- **Icons:** Lucide or Phosphor, imported as components or inlined SVG, tree-shaken. **No emoji anywhere in the UI.** Emoji is the single fastest way to make a serious system look like a toy.

### 4.4 How to use a reference once you have it

For each image, write one line before designing: *"From this I am taking X."* If you cannot finish that sentence with something specific (a spacing rhythm, a table row treatment, a way of showing state), the reference is not earning its place. Never reproduce a reference wholesale — reinterpret it into this brief's palette, type and subject.

---

## 5. Design system

These are values, not suggestions. Put them in one tokens file and reference them everywhere; no hard-coded hex or px in components.

### 5.1 Colour

Grounded in road materials: cool concrete and asphalt, road-marking white, and signal chroma used only where it means something.

```css
:root {
  /* Surfaces — cool concrete, not warm paper */
  --surface-page:      #EEF1F3;
  --surface-plate:     #FFFFFF;   /* panels */
  --surface-inset:     #E4E8EB;   /* wells, table headers, chart backgrounds */
  --surface-hover:     #DCE2E6;

  /* Rules — hairlines carry the structure, shadows almost never do */
  --rule-soft:         #E4E8EB;
  --rule:              #D2D9DE;
  --rule-strong:       #B2BCC3;

  /* Ink — cool, asphalt-shadowed, never pure black */
  --ink-strong:        #0F1A1E;
  --ink:               #33424B;
  --ink-mute:          #63737E;
  --ink-faint:         #93A0A9;
  --ink-on-dark:       #F2F5F6;

  /* Road materials — for the junction plate only */
  --asphalt:           #4A555C;
  --asphalt-deep:      #3B454B;
  --marking-white:     #F2F5F6;
  --marking-yellow:    #E8B93B;

  /* Signal — text/graphic weight vs lit-lamp weight */
  --signal-green:      #159957;
  --signal-amber:      #D98A0B;
  --signal-red:        #C0392B;
  --lamp-green:        #22C55E;
  --lamp-amber:        #F0A81E;
  --lamp-red:          #E24B37;
  --lamp-housing:      #212A2F;
  --lamp-unlit:        #3C474D;

  /* Series — comparison charts. Deliberately NOT signal colours. */
  --series-ai:         #125E8A;   /* beacon blue: the AI */
  --series-baseline:   #7A8790;   /* graphite: the baseline, always dashed */

  /* Deltas — muted, never alarm-styled; always paired with a sign + arrow */
  --delta-better:      #0F7B4F;
  --delta-worse:       #9C3A2C;

  /* Emergency — the one true alert. Always paired with a 45° hatch band. */
  --alert:             #B3261E;
  --alert-wash:        #FBEBE9;

  /* Focus */
  --focus-ring:        #125E8A;
}
```

**Colour rules, enforced:**

1. **Signal colours appear only in signal contexts** — lamp housings, lane fills on the plate, per-lane signal chips. Never as a generic "good/bad" accent anywhere else. This is why deltas get their own desaturated pair.
2. **The AI is `--series-ai`. The baseline is `--series-baseline`, and its line is always dashed.** Consistent across every chart and legend, forever.
3. **A screen where nothing is wrong should be nearly colourless** apart from the junction plate and the live signal. If a healthy screen looks like a paint chart, the emergency state has nowhere to go.
4. **No gradients as decoration.** A gradient is permitted only where it encodes a continuous value (e.g. a density ramp on the plate) and is accompanied by a legend.
5. **No colour-only encoding.** Green lamp also has a position (top/middle/bottom of the housing) and a label; a delta also has a sign and an arrow; a series also has a stroke style.

**Dark variant:** build the tokens so a `[data-theme="night"]` override is possible later, but **ship light as the default and the demo theme.** A bright classroom projector destroys dark UIs, and light + restrained colour reads as infrastructure software rather than a gaming overlay. Do not spend time on the dark theme unless asked.

### 5.2 Typography

**IBM Plex Sans** for everything readable. **IBM Plex Mono** for numerals, lane IDs, phase names, timings and code-like strings — nowhere else.

Why these and not the obvious choices: Plex was drawn for technical and industrial systems, it has a slightly engineered, non-neutral character that suits instrumentation, its mono is a genuine sibling rather than an afterthought, and it is OFL-licensed and self-hostable. Inter, Poppins, Montserrat and raw `system-ui` are the defaults every generated dashboard reaches for; they are banned as the primary voice here.

Optional third face, only for lane and approach labels painted on the junction plate: **Barlow Semi Condensed**, which echoes highway signage. Use it *only* there, or skip it — two families is a complete system.

```css
--font-ui:    "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif;
--font-num:   "IBM Plex Mono", ui-monospace, SFMono-Regular, monospace;

/* Scale — 11 / 12 / 13 / 15 / 18 / 22 / 28 / 36 / 48 */
--t-micro:  11px;  /* dense table meta, axis ticks */
--t-small:  12px;
--t-body:   13px;  /* default UI text */
--t-lead:   15px;  /* panel titles, reason text */
--t-h3:     18px;
--t-h2:     22px;
--t-metric: 36px;  /* KPI values */
--t-hero:   48px;  /* countdown only */
```

Rules:

- **All numeric values use `font-variant-numeric: tabular-nums`** and `--font-num`. Non-negotiable: values refresh twice a second and proportional digits will visibly jitter.
- Large numerals get `letter-spacing: -0.015em` and `line-height: 1`. Body text gets `line-height: 1.45`. Prose (reason text) caps at **72 characters** per line.
- **Labels are sentence case.** No tracked-out ALL-CAPS eyebrow labels — that is the single commonest generated-UI tell, and it is not needed: hierarchy comes from size, weight and ink level. (Genuine identifiers that are uppercase in the data, like `NS_straight_left`, stay as they are; that is content, not styling.)
- Weights: 400 body, 500 emphasis and table headers, 600 metrics and titles. Nothing heavier — 700+ on a light UI reads as shouty.
- No text below 11px. Ever.

### 5.3 Space, structure and shape

```css
--s-1: 4px;  --s-2: 8px;   --s-3: 12px;  --s-4: 16px;
--s-5: 20px; --s-6: 24px;  --s-8: 32px;  --s-10: 40px; --s-12: 56px;

--r-chip:  2px;
--r-panel: 4px;
--r-modal: 8px;

--panel-pad: var(--s-5);
--gutter:    var(--s-4);
```

- Everything sits on a **4px baseline grid**. No arbitrary values.
- **Radii stay small.** 2–4px reads as engineered; 12–16px reads as consumer SaaS. Pills only for status chips, which genuinely are pills.
- **Structure comes from 1px hairlines and surface layering, not shadows.** The only permitted shadow is on true overlays: `0 8px 24px -8px rgba(15,26,30,.18)`.
- **Panels are not all the same size.** A grid of identical cards is the look this redesign is replacing. Let the junction plate be several times the area of anything near it.

### 5.4 Motion

```css
--dur-tick:  120ms;   /* state flips, chips */
--dur-fast:  180ms;   /* hovers, expands */
--dur-value: 300ms;   /* numeric tweens, bar widths — hard ceiling */
--dur-phase: 900ms;   /* the phase-transition choreography, once per switch */
--ease-out:  cubic-bezier(.16, 1, .3, 1);
--ease-mid:  cubic-bezier(.65, 0, .35, 1);
/* countdown and other clocks: linear only */
```

**The one orchestrated moment.** Spend all motion budget on the **phase transition**, because it is the moment the system's whole claim becomes visible. When `signal.phase` or `signal.is_yellow` changes:

1. `0ms` — the outgoing movement's lamp dims and its lane fills on the plate desaturate (`--dur-tick`).
2. `120ms` — the amber lamp lights; the affected stop bars on the plate take an amber edge; a slow 1.6 s breathing pulse runs on the amber lamp only (nothing else pulses, anywhere, ever).
3. On the confirmed green — the new movement's lamp blooms in over `--dur-fast`, its lane fills saturate, and the stop bar releases: a single short sweep of the painted arrow in the direction of travel. Once. It does not loop.
4. The phase ribbon (§7.4) appends the completed segment with a `--dur-value` width ease.

That is the entire non-user-triggered motion vocabulary. Everything else:

- Numeric values **tween** between packets over `--dur-value` instead of snapping. Bar widths and lane fills ease over the same duration.
- **Extrapolate the countdown between packets.** Data arrives at 2 Hz but `signal.countdown` decreases continuously. Interpolate against a monotonic client clock (`performance.now()`) and re-sync on each packet, so the countdown reads smoothly at 60 fps instead of stepping twice a second. Do the same for the sim clock. This one detail does more for perceived quality than any visual effect.
- **Banned:** section entrance fade-and-slide-ups, card hover lifts, staggered list reveals, animated gradients, glow pulses on anything but the amber lamp, spinners that outlive 300 ms, anything looping in the periphery of a live display. Peripheral motion on an operations screen is a defect, not a flourish.
- Respect `prefers-reduced-motion: reduce` — drop all tweens and the pulse; state changes become instant. Never gate information behind an animation.

### 5.5 Layout shell

```
┌─────────────────────────────────────────────────────────────────────────┐
│ STATUS BAR  56px · full width · always visible                          │
│ Trinetra mark · sim clock · scenario · link state · emergency slot       │
├────────────┬────────────────────────────────────────────────────────────┤
│ NAV RAIL   │ PAGE                                                       │
│ 216px      │ max-width 1680, centred, 24px padding, 12-col / 16px gutter │
│ collapses  │                                                            │
│ to 64px    │                                                            │
│ under      │                                                            │
│ 1280px     │                                                            │
└────────────┴────────────────────────────────────────────────────────────┘
```

The status bar is persistent, spans full width above the rail, and always carries: simulated clock, active scenario (if known), WebSocket link state with staleness age, and a reserved emergency slot that is empty in normal operation and takes over the bar's right half when `emergency_lanes` is non-empty.

Nav: Overview · Digital Twin · Performance · Decisions. Four items — no icons-only rail, labels stay visible above 1280px. The active item is marked with a 2px left edge in `--ink-strong` and a weight change, not a filled pill.

### 5.6 The three-view coding rule

Applied consistently, everywhere, on every page and chart:

| View | Meaning | Encoding |
|---|---|---|
| **Actual** | TraCI-confirmed reality | **Solid** fill / solid stroke, full ink |
| **Predicted** | ML output, 15 s horizon | **Dashed** stroke, 60% ink, never filled |
| **Desired** | What the engine decided | **Outlined** — 1px stroke, no fill, plus a tick marker |

Learn it once, read it everywhere. This is the structural device that makes the Desired-vs-Actual claim legible without a paragraph of explanation next to it.

---

## 6. Copy and voice

Words are design content. Keep them plain and operational.

- Name things by what a viewer understands. "Waiting time", not `avg_waiting_time_seconds`. Keep the raw key available in a tooltip or detail row for the technical audience.
- Sentence case for everything: labels, buttons, titles.
- Buttons say what happens: **Start evaluation**, **Stop evaluation**. The action keeps its name through the whole flow — the button that says "Start evaluation" produces a status that says "Evaluation running".
- Empty states give direction, never mood: *"No simulation running. Start `python app.py` to begin."* not *"Nothing here yet 🌴"*.
- Errors state what happened and what to do: *"Lost connection to the simulation. Showing the last update from 14 s ago."*
- Never write marketing copy into the UI. No "AI-powered", no "Powered by machine learning", no taglines. The system's credibility comes from its numbers.
- Units are always attached and always consistent: seconds as `s`, speed as `m/s`, counts as `veh`.

---

## 7. Signature components

These are the pieces that make this UI specific to Trinetra. Build them as real, reusable components.

### 7.1 The junction plate — the hero

A top-down SVG of the junction drawn in signal-plan convention, not a cartoon.

- Four approaches, three lanes each, drawn to consistent scale with hairline lane edges, dashed lane dividers, solid stop bars, and movement arrows painted on the carriageway (left / straight / right). Left-hand traffic — vehicles keep left, so **approach lanes are on the left side of each arm as seen travelling inbound**. Get this right; it is a detail an Indian evaluator will notice immediately.
- Lane IDs set beside each lane in small type, in the same identifiers the system uses (`N_in_0`).
- **Live queue rendering:** vehicles stack back from the stop bar as discrete ticks, one per vehicle, capped with a "+n" when the lane exceeds the drawable length. Discrete ticks beat a smooth bar because a viewer can count them and check them against the number in the table — which is exactly the credibility this needs.
- **Lane fill colour = current signal state** for that lane. **Bar length = queue.** One channel per variable; never encode two things in colour.
- A signal head (§7.2) sits at the stop bar of each approach.
- Emergency lanes get a 45° hatch overlay in `--alert` plus a marker glyph — hatch, not just colour.
- Hovering a lane cross-highlights its row in the lane table and vice versa. This is the one interaction worth investing in.
- It must stay legible at roughly 640×560 CSS px and scale cleanly; use a `viewBox` and no fixed pixel text sizes inside it.

### 7.2 Signal head

Three lamps in a dark housing, drawn with the same convention as a real signal head. Lit lamp uses the `--lamp-*` value with a tight inner highlight; unlit lamps are `--lamp-unlit` — **visible, not invisible**, because a real head shows all three lenses. Position within the housing is the redundant encoding for colour-blind readers. Optionally, a fine ring around the active lamp depleting with the countdown.

### 7.3 Phase strip (ring-barrier style)

The four phases as four cells in a horizontal band, always in `PHASE_NAMES` order so the eye learns fixed positions.

- The active phase cell is filled; the others are outlined.
- Within the active cell, a depleting bar shows `signal.countdown` against `decision.duration`.
- Min-green and max-green marks appear as tick lines inside the cell — this is what makes the constraint visible, and it is straight out of the signal-timing vernacular.
- The cell shows amber banding while `is_yellow` is true.

### 7.4 Phase history ribbon

`phase_history` (~60 entries) rendered as a horizontal band across the full content width: one segment per entry, coloured by phase, with amber slivers for clearance intervals, oldest at the left. A single tick axis in simulated seconds. This is a time–space diagram in miniature and it makes the rhythm of the controller instantly readable — including, honestly, when it switches more often than it should.

### 7.5 Score ledger — the explainability centrepiece

`decision.phase_scores` as four horizontal bars, ranked, with:

- The current phase marked distinctly (not just highest — the current phase is often *not* the highest, which is the point).
- **The hysteresis margin drawn as a vertical threshold line** offset from the current phase's score, so a viewer can see, geometrically, why a challenger did or did not win.
- `decision.mode` as a chip beside it, and `decision.reason` as full prose below.

Nobody else's project shows the decision boundary itself. This panel is the single strongest thing you can put in front of an evaluator who asks "how do you know it's not a black box".

### 7.6 Desired vs Actual pair

Two small plates side by side, permanently visible in the Overview and Decisions pages:

```
   DESIRED                    ACTUAL
   NS_straight_left     ───   NS_straight_left
   12.0 s · priority          green · 3.4 s to switch
                              ✓ confirmed by TraCI
```

A tie line joins them when they agree. When they differ — during yellow clearance, which is normal and expected — the line shows the transition rather than an error. **Never style a mismatch as a fault**; explain it in one short line ("clearing to next phase"). Chethan should be able to point at this and say "that's the closed loop" without further explanation.

### 7.7 Metric pair (comparison)

For each of the seven metrics, plot AI and baseline **on one shared axis** as a paired-dot ("dumbbell") row: two dots joined by a connector, AI in `--series-ai`, baseline in `--series-baseline`, with the signed delta set in tabular numerals at the right. Improvement then reads as a *distance*, which two separate bar charts never achieve. Label the baseline explicitly by name — "Vehicle Actuated Control" or "Fixed-timer" from `baseline_controller` — because *which* baseline it beat is the academically load-bearing fact.

### 7.8 Lane table

Twelve rows, fixed order, one per lane: lane ID (mono) · movement glyph · signal chip · queue bar with predicted tick · vehicles · avg wait · trend. Zebra striping is unnecessary at this row count; a 1px rule and consistent 32px row height is cleaner. Row hover cross-links to the plate.

### 7.9 Confidence

`prediction.avg_confidence` and per-row confidence. Use a single restrained meter, not a gauge with a needle. State the horizon in words next to it: "15 s ahead". If `prediction` is `null`, say **"Prediction unavailable — no trained model loaded"**, not `0%`. A confidence of zero and an absence of prediction are different facts and must never look the same.

### 7.10 Scenario control

Real buttons against `/api/control/*`, replacing any copy-paste command boxes:

- Scenario picker (validated names), baseline picker (`fixed_timer` / `vac`), GUI toggle, **Start evaluation** / **Stop evaluation**.
- Poll `GET /api/control/status`; reflect `running` honestly, including the case where the child exits on its own.
- A 409 means a run is already active — say that, do not show a generic failure.
- If the control endpoints 404 (dashboard started by the evaluator rather than `app.py`), hide the launcher and explain why in one line.

---

## 8. Page layouts

Each page has a **different** structure. Four pages that are the same card grid with different contents is the generic failure mode.

### 8.1 Overview — asymmetric, plate-dominant

```
┌─────────────────────────────────────────────┬─────────────────────────┐
│                                             │  SIGNAL HEAD + countdown│
│            JUNCTION PLATE                   │  (hero numeral)         │
│            (hero, ~62% width)               ├─────────────────────────┤
│                                             │  PHASE STRIP            │
│                                             ├─────────────────────────┤
│                                             │  DESIRED ─── ACTUAL     │
├───────────┬───────────┬───────────┬─────────┴─────────────────────────┤
│ Vehicles  │ Avg speed │ Avg wait  │ Queue        (4 metric tiles)     │
├───────────┴───────────┴───────────┴───────────────────────────────────┤
│ PHASE HISTORY RIBBON — last ~60 s                                     │
└───────────────────────────────────────────────────────────────────────┘
```

Deliberately **not** a symmetrical grid. The plate dominates; the right column is a narrow instrument stack; the tiles are a low band, not big cards. At 1366×768 everything above the ribbon must fit without scrolling.

### 8.2 Digital Twin — the lane ledger

Lane table as the spine (12 rows), a smaller synchronised junction plate beside it, and below: predicted-vs-actual per lane using the solid/dashed rule from §5.6, plus the confidence meter and `GET /api/model-info` context (test MAE, training rows, scenarios) presented as a small provenance block. Model provenance in the UI is a quiet credibility signal that costs nothing.

### 8.3 Performance — evidence, not decoration

Comparison header first: scenario, baseline name, seed, run state. Then the seven metric-pair rows (§7.7) as the centrepiece. Then time-series for waiting time and queue length (AI solid, baseline dashed, shared axis, no dual y-axes ever). Then switch counts. Then the scenario launcher.

If `comparison` is `null`, this page shows the launcher and an explanation — not empty chart frames.

### 8.4 Decisions — the audit trail

A stream of decisions (`/api/logs/decisions`, newest first) as a dense list: sim time · phase · duration · mode chip · truncated reason. Selecting a row opens a detail pane with the score ledger, the desired/actual pair, and the full reason text. Filter chips by mode. Virtualise the list; it grows at 1 Hz for the whole run.

---

## 9. Every state, designed

Not optional. Half of what makes a UI feel professional is that it never shows a broken-looking screen.

| State | Trigger | What the UI does |
|---|---|---|
| Waiting for simulation | `{"status":"waiting_for_simulation"}` or no WS yet | A calm pre-run screen: the junction plate drawn in its unpowered state (signal heads dark), plus one line of instruction. Not a spinner. |
| Connecting | WS opening | Inline status in the bar. No full-screen block. |
| Link lost | WS closed / no packet > 3 s | Status bar switches to "Link lost — last update 14 s ago"; page content dims slightly but **stays visible with real last-known values**; auto-reconnect with backoff. Never blank the screen. |
| No trained model | `prediction` stays `null` | Prediction panels say prediction is unavailable and why. All other panels operate normally. |
| No comparison running | `comparison: null` | Performance page shows the launcher and past results from `/api/results`. |
| No control endpoints | `/api/control/status` 404s | Launcher hidden, one-line explanation. |
| Empty database | log endpoints return `[]` | "No decisions recorded yet" — history charts show an empty axis with the message, not a broken chart. |
| Emergency active | `emergency_lanes` non-empty | Status bar right half becomes the alert band; affected lanes hatch on the plate; the decisions stream marks the mode. Clears cleanly when the array empties. |

---

## 10. Accessibility and robustness floor

- Visible keyboard focus on every interactive element (2px `--focus-ring`, 2px offset). Full keyboard navigation of nav, filters and the decisions list.
- Live-updating regions must not steal focus or announce on every tick. Use `aria-live="polite"` sparingly — only for emergency onset and connection loss.
- The junction plate needs a text alternative: an off-screen summary of current phase and per-lane queues, refreshed at a slower cadence.
- Colour-blind safe: signal state carries lamp position + label; deltas carry sign + arrow; series carry stroke style.
- Responsive down to a laptop screen; below 1024px the plate stacks above the instrument column. Mobile is not a target — do not spend effort there, but do not let it crash.
- No memory growth over a 30-minute run: cap history buffers, clean up listeners and animation frames, and never accumulate DOM nodes per packet.
- Render budget: a full snapshot update must cost well under 16 ms. Do not re-render 12 lane rows and a full SVG from scratch twice a second — update only what changed.

---

## 11. Implementation constraints

- **Stack:** the dashboard server serves `frontend/dist/index.html` and mounts `frontend/dist/assets`, and `frontend/vite.config.ts` proxies `/api` and `/ws` during `npm run dev`. So this is a **React + Vite** frontend. Confirm what is actually in `frontend/` locally before starting.
- **Heads-up:** the `frontend/` directory in the GitHub repo contains only `.gitkeep` — the frontend source is not committed. Establish with Chethan whether the existing React app exists locally (redesign in place) or whether this is a fresh build (start clean), and whether the result should be committed this time. Do not guess.
- **Offline is mandatory.** No CDN links, no runtime font fetches, no external image URLs. The demo may run with no internet. Everything vendored and bundled.
- **Charts:** prefer hand-rolled SVG/Canvas or a small dependency-free approach, consistent with the project's existing "dependency-free canvas charting" stance. If a library is genuinely warranted, propose it and its bundle cost before adding it.
- **Do not modify** `backend/services/dashboard_server.py`, `control_routes.py`, `live_state.py`, or anything upstream of them. If the UI needs data that does not exist, raise it — do not add an endpoint unilaterally.
- Keep the design tokens in one file. Keep components small and single-purpose, matching the project's existing architectural discipline.
- One WebSocket connection for the whole app, shared through context; HTTP endpoints polled only where they belong, at sensible intervals (control status ~2 s; logs on demand and on page focus, not on a tight loop).

---

## 12. Banned by name — the generic-tell checklist

Run this list before you declare anything finished. Each item is a specific thing that makes generated UI recognisable as generated.

**Palette and surface**
- Warm cream background (~`#F4F1EA`) with a high-contrast serif display and a terracotta/clay accent (~`#D97757`).
- Near-black background with a single acid-green or vermilion accent.
- Purple/indigo/violet as a primary accent.
- Gradient washes as decoration; animated or glowing gradient borders; glassmorphism blur.
- Tinted near-black (`#0B0B0B`, `#111`) standing in for black.

**Structure**
- Content chopped into identical rounded cards, all with the same radius and the same soft grey shadow.
- A 3- or 4-column grid of equal-weight cards as the answer to every page.
- `border-radius: 16px` plus `box-shadow: 0 10px 30px rgba(0,0,0,.1)` on everything.
- Numbered `01 / 02 / 03` markers on content that is not actually a sequence.

**Type and chrome**
- Tracked-out ALL-CAPS eyebrow labels above headings.
- Meta strings joined with middle dots (`A · B · C`).
- `WORD — fragment` labels built with a spaced em dash.
- A monospace face used for small *labels* (mono is for values and identifiers only).
- `→` appended to button and link text.
- Inter / Poppins / Montserrat / bare `system-ui` as the primary voice.
- Emoji used as icons or status indicators.

**Motion**
- Fade-and-slide-up entrances on every section; staggered reveals; hover lift on every card.
- Anything looping in the periphery.

**Content**
- Fabricated demo numbers, lorem ipsum, or fake sparklines.
- Marketing copy: "AI-powered", "Next-gen", "Real-time insights".
- Vanity metrics with no source in §2.
- A metric shown with an up-arrow and a green percentage that isn't actually a comparison against anything.

If a choice appears on this list, it was a default rather than a decision. Replace it and say what you replaced it with and why.

---

## 13. Sanity check: is this good, or just clean?

Before shipping, answer these honestly. "Clean" is the floor, not the goal.

1. If you stripped the labels, would anyone know this was a **traffic** system rather than a generic analytics dashboard? (If not, the vernacular from §3 hasn't landed.)
2. Is there **one** element someone would describe from memory afterwards?
3. Can a stranger tell in five seconds which phase is green and how long is left?
4. Can a stranger tell in fifteen seconds *why* the AI chose that phase?
5. Is the Desired-vs-Actual claim visible without clicking anything?
6. Does a screen where nothing is wrong look calm — and does an emergency look unmistakably different?
7. Does every number on screen trace back to a field in §2?
8. Would this survive a projector in a bright room?
9. Is the regression case as legible and as dignified as the improvement case?
10. Did anything from §12 sneak in?

---

## 14. Process — plan, critique, then build

Work in two passes. Do not open a component file during pass one.

**Pass 1 — the plan (deliver as text, then stop).**
- The palette as 5–6 named values with the reasoning for each.
- The typefaces and their exact roles.
- ASCII wireframes for all four pages.
- The one "memorable element" and how you will spend the boldness on it.
- The motion budget in one paragraph.

**Then critique your own plan before building.** Ask: if I ran this same brief without §12, would I have arrived here anyway? Anywhere the answer is yes, that part is a default rather than a decision — revise it and state what changed and why. Only then write code.

**Pass 2 — build in this order**, showing work after each step:
1. Tokens + primitives (panel, chip, table, metric value, delta) — no pages yet.
2. App shell: status bar, nav rail, WebSocket client with reconnect + staleness, all the states from §9.
3. **The junction plate.** Get it right before anything else; everything borrows from it. Screenshot it and critique it against §13 before continuing.
4. Overview page.
5. Decisions page (score ledger — the second-most-important thing in the build).
6. Digital Twin page.
7. Performance page + scenario control.
8. States, keyboard, reduced motion, performance pass, 30-minute soak.

Take screenshots and critique your own output as you go. A picture will tell you more than reading your own CSS.

---

## 15. Definition of done

- [ ] Every page renders correctly against a live `python app.py`, and against a stopped one.
- [ ] All nine states in §9 are implemented and visually verified.
- [ ] Every §12 item is absent.
- [ ] Every §13 question answers well.
- [ ] Junction geometry verified against the SUMO network files, not assumed.
- [ ] All twelve lanes, four phases, six decision modes and seven metrics are handled by name.
- [ ] No CDN or network dependency at runtime; works with the machine offline.
- [ ] Countdown and sim clock interpolate smoothly between 2 Hz packets.
- [ ] No layout shift on data update; tabular numerals throughout.
- [ ] Legible at 1366×768; nothing critical below the fold on Overview.
- [ ] Keyboard focus visible everywhere; `prefers-reduced-motion` respected.
- [ ] 30-minute run with no memory growth and no console errors.
- [ ] No backend file modified.
- [ ] A short `frontend/DESIGN.md` records the final tokens and the reasoning, so the report and viva can cite it.

---

## 16. Open questions — ask, do not assume

Put these to Chethan before or during pass one:

1. Does a React frontend already exist locally (redesign in place), or is this a fresh build? The repo shows an empty `frontend/`.
2. Should the rebuilt frontend be committed to the repo this time?
3. Are there brand assets for Trinetra — the existing eye + traffic-light logo, any fixed colours, any Kannada/Devanagari wordmark to accommodate?
4. Which single scenario will be run during the demo? It should get a first-class path.
5. Will the ESP32 LED rig be part of the demo? If so, does the UI need to show its connection state — and is there an endpoint for that, or does that need discussing?
6. Should the report's screenshots come from a specific scenario/time so the figures are reproducible?
7. Is the light theme confirmed as the demo theme?

Where an answer does not arrive, state the assumption you are making, in the response, before you build on it.

---

## 17. Addendum — what `CLAUDE.md` now records, and the gate that follows from it

Added after reading the repo's own `CLAUDE.md`. This resolves several of §16's open
questions and changes how the build must be sequenced.

### 17.1 The frontend was emptied deliberately, and five directions were rejected

`frontend/` contains only `.gitkeep`. It was wiped on 2026-09-08, on purpose, after five
built-and-rejected directions:

1. a vanilla-JS dashboard
2. a first React rebuild
3. a neon-glow HUD concept
4. a restrained Stripe / Linear / Vercel-inspired version
5. a literal "drafting sheet" design system

This answers §16 Q1 (**fresh build, not a redesign in place**) and it carries a warning
for §3 of this brief: the drafting-sheet direction has already failed once. The vocabulary
in §3.1 — signal plans, phase diagrams, stop bars, painted arrows — must be applied as
**drawing conventions inside the junction plate**, where they are functional, not as a
whole-product paper-and-blueprint metaphor. That distinction is the difference between
domain-literate and costume.

The restrained Stripe/Linear direction also failed. Read that as: **quiet is not the
same as calm.** §3.2's high-performance HMI discipline is about reserving colour for
abnormal conditions, not about draining the interface of presence. The presence lives in
the junction plate and in the scale of the primary readings (§3, "spend the boldness in
exactly one place"). A screen can be low-saturation and still be commanding.

### 17.2 The shared cause of all five failures

Every attempt began from a text instruction with no visual reference. With no reference,
the output converges on the statistical average of every dashboard in training — and the
average of all dashboards is the generic dashboard.

**Consequence for this build: §4 is no longer optional.** The reference kit must exist in
`docs/design/refs/`, with per-image take/leave annotations in `NOTES.md`, before any
design work starts. A reference with no "leave" instruction gets copied wholesale, which
produces a pastiche rather than a direction.

### 17.3 Phase gate — do not build past one screen without approval

Insert this between passes 1 and 2 of §14, and treat it as blocking:

> **Gate:** deliver the token file, a type and colour specimen, the junction plate, and
> the Overview page *statically*, wired to a recorded fixture, with screenshots at
> 1440×900 and 1024×768 and a written self-critique against §13. Then stop and wait for
> approval before building the remaining three pages.

A sixth rejection should cost one screen, not an entire frontend. Building the other
pages "while waiting for approval" defeats the gate entirely.

### 17.4 Replay fixtures — build these before any UI

Design quality is a function of how many iterations are affordable. If every visual tweak
requires a SUMO run, the build gets three iterations instead of thirty, and it shows.

Before Phase 2:

1. A recorder that subscribes to `/ws` during a real run and appends every snapshot, with
   its arrival time, to `frontend/fixtures/<name>.jsonl`.
2. A replay source in the frontend behind the same interface as the live client,
   selectable via `?replay=<name>`, with pause, scrub and single-step.
3. Four recorded fixtures: `normal_traffic`, `heavy`, `emergency_response`, and one
   evaluator run with `--baseline vac` so the Performance page has real comparison data —
   ideally including an honest regression, since §8.3 requires the regression case to be
   rendered with the same dignity as an improvement.

Every screenshot, iteration and review runs off fixtures. Live SUMO is for final
verification only.

### 17.5 Screenshot self-critique loop

A model that cannot see its own output is designing blind. Add a script that boots the dev
server against a fixture, visits each route, and writes PNGs at both target resolutions to
`docs/design/shots/<date>/`. Review against §13 by looking at the images, not by reading
the CSS.

### 17.6 Answers to the remaining §16 questions

| § 16 | Answer |
|---|---|
| Q1 — existing frontend? | No. Fresh build. `frontend/` deliberately emptied 2026-09-08. |
| Q2 — commit it? | Yes. Commit the source this time so the design is reviewable and the history exists for the report. |
| Q3 — brand assets? | The project is branded **Trinetra** (त्रिनेत्र) and has an existing eye + traffic-light logo. Use the supplied file; do not invent a mark if it is not supplied. |
| Q4 — demo scenario? | To be fixed before fixtures are recorded. `rush_hour` and `emergency_response` are the two most demonstrative. |
| Q5 — ESP32? | No endpoint exists for its connection state today. If the LED rig is part of demo day, that is a backend conversation, not a frontend guess. |
| Q6 — reproducible figures? | Yes. Take every report figure from a named fixture replay at a fixed timestamp. |
| Q7 — light theme? | **Confirmed.** Light is the default and the demo theme. Build tokens so `[data-theme="night"]` is possible later; do not spend time on it now. |

### 17.7 Backend contract, confirmed from `CLAUDE.md`

- `dashboard_server.py` serves `frontend/dist`, falling back to a plain placeholder if no
  build exists. The legacy `frontend/dashboard.html` fallback was removed 2026-09-06.
- Expected scripts: `npm run dev` (proxies `/api` and `/ws`), `npm run build`
  (`tsc -b && vite build` → `frontend/dist`), `npm run lint` (oxlint).
- `dashboard_server.py` is strictly read-only. `services/control_routes.py` is the only
  place a web request may affect what is running, and it is mounted only by `app.py`.
  Nothing in the frontend may call anything else that mutates state.
- Decision modes to handle by name include `gap_out` and `light_traffic_patience`
  alongside the normal / starvation / emergency set — read the exact strings from
  `decision_engine.py` rather than from any document.
