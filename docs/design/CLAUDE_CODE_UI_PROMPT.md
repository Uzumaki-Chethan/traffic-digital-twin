# Claude Code — Trinetra frontend rebuild prompt

**How to use this file**

1. Copy `TRINETRA_UI_DESIGN_BRIEF.md` into the repo at `docs/design/TRINETRA_UI_DESIGN_BRIEF.md`.
2. Copy this file to `docs/design/CLAUDE_CODE_UI_PROMPT.md`.
3. Put your reference screenshots in `docs/design/refs/` first — see `REFERENCE_KIT_GUIDE.md`.
   **Do not start without them.** That omission is what produced the last five rejections.
4. Open Claude Code in the repo root and paste **Section A** below as your first message.
5. Paste each later section only when the previous gate has been approved.

Everything below the line is written to be pasted verbatim.

---

## SECTION A — the kickoff message (paste this first)

```
Read these three files in full before responding:

  1. CLAUDE.md
  2. docs/design/TRINETRA_UI_DESIGN_BRIEF.md
  3. docs/design/refs/NOTES.md, plus every image in docs/design/refs/

Then read the backend contract sources listed in §2 of the brief.

CONTEXT YOU NEED THAT ISN'T OBVIOUS FROM THE CODE

The frontend directory is empty on purpose. Five design directions have already been
built and rejected: a vanilla-JS dashboard, a first React rebuild, a neon-glow HUD, a
restrained Stripe/Linear/Vercel-style version, and a literal drafting-sheet design
system. I emptied frontend/ rather than iterate on a direction I didn't want.

Those five failures share one cause: every attempt started from a text instruction and
no visual reference, so the output converged on the statistical average of all
dashboards — which is exactly the generic look I'm rejecting. The reference images in
docs/design/refs/ exist to fix that. Treat them as the primary input, above your own
instincts about what a dashboard should look like.

The design brief is a contract, not a suggestion. Where it specifies a value, use that
value. Where it bans something by name (§12), that thing is an automatic failure.

WORKING AGREEMENT

- We work in gates. You do not start a phase until I approve the previous one.
- You never invent a data field. Every value on screen traces to a real backend field.
- You never modify a backend file without asking first.
- If you catch yourself producing something that would look the same for a fintech
  dashboard, a fitness app, or a logistics tool, stop and say so instead of shipping it.

PHASE 0 — do this now, and nothing else

Produce two things and then stop:

  A) docs/design/DATA_CONTRACT.md — read the real source (services/live_state.py,
     app.py's snapshot builder and _signal_view, services/dashboard_server.py,
     services/control_routes.py, models/*.py, decision_engine.py's Decision dataclass
     and mode strings, performance/evaluator.py's result dict,
     analytics/congestion_analytics.py, config.py) and record, for every field the
     frontend can consume: exact name, type, unit, update cadence, nullability, and
     which of the three views it belongs to (Actual / Predicted / Desired, per §5.6 of
     the brief). List the twelve lane IDs, the four phase indices and names, and every
     decision_mode string, verbatim from the code.

  B) docs/design/REFERENCE_READOUT.md — for each image in docs/design/refs/, one short
     entry: what specific property you are taking from it (a spacing rhythm, a table row
     treatment, a way of showing state, a type hierarchy), and what you are explicitly
     leaving behind. Then a closing paragraph: the three or four properties that recur
     across the references, which together are the design DNA I'm asking for.

Then answer these, using CLAUDE.md and the brief — do not guess:
  - anything in the data contract that the brief's §8 page layouts assume but the
    backend does not actually emit
  - anything in the references that conflicts with the brief

Write no UI code in this phase. No package.json, no scaffolding, nothing.
```

---

## SECTION B — after Phase 0 is approved

```
PHASE 1 — replay fixtures. Still no UI design work.

Iterating on visual design while booting SUMO for every change is slow and shallow, and
it is part of why previous attempts never got past "competent." Build the offline loop
first.

  1. A recorder: a small script that connects to ws://127.0.0.1:8000/ws during a real
     run and appends every snapshot, with its wall-clock arrival time, to
     frontend/fixtures/<name>.jsonl. Put it wherever it fits the repo's conventions;
     it is a dev tool, not part of the shipped bundle.

  2. Tell me the exact commands to record these four fixtures, and I will run them:
       - normal_traffic  (the calm baseline)
       - heavy           (loaded, queues visible)
       - emergency_response (exercises the emergency override path)
       - one evaluator run with --baseline vac (so the Performance page has real
         comparison data, including at least one honest regression if one occurs)

  3. A replay source in the frontend that streams a fixture at real speed behind the
     same interface as the live WebSocket client, selectable with ?replay=<name>, with
     pause, scrub and single-step. Same code path, different source.

From here on, every screenshot, every visual iteration and every review runs off
fixtures. Live SUMO is only for final verification.

Also set up a screenshot loop: a script that boots the dev server against a fixture,
navigates to each page, and captures 1440x900 and 1024x768 PNGs into
docs/design/shots/<date>/. You will use these to critique your own work — reading your
own CSS tells you much less than looking at the result.
```

---

## SECTION C — the gate that matters

```
PHASE 2 — design system and ONE screen. This is the gate. Do not build past it.

Deliver, in this order, in one response:

  1. THE PLAN, as text, before any code:
     - the palette as 5-6 named tokens with a one-line reason for each
     - the typefaces and their exact roles
     - ASCII wireframes for all four pages
     - the single memorable element and how you are spending the boldness on it
     - the motion budget in one paragraph

  2. YOUR OWN CRITIQUE OF THAT PLAN, before building it. For each major choice ask: if
     I had been given this brief without its banned-defaults list, would I have arrived
     here anyway? Anywhere the answer is yes, that part is a default rather than a
     decision — revise it and tell me what you changed and why.

  3. Then, and only then, build:
     - the token file
     - a type and colour specimen page
     - the junction plate component (the hero — per the brief, get this right before
       anything else exists)
     - the Overview page, static, wired to a fixture, no interactivity beyond what the
       plate needs

  4. Screenshots at 1440x900 and at 1024x768, and your own honest read of them against
     the ten questions in §13 of the brief.

Then STOP and wait. If I reject the direction here, it costs one screen instead of an
entire frontend. That is the whole point of this gate — do not build the other three
pages "while waiting."

One thing I will judge harshly: whether the junction plate looks like a piece of traffic
engineering or like a generic diagram. Draw it the way a signal plan draws it. Left-hand
traffic — vehicles keep left. Verify the geometry, lane IDs and phase-to-lane mapping
against sumo/network/intersection.tll.xml and feature_schema.py; do not infer them from
the brief or from what looks reasonable.
```

---

## SECTION D — after the direction is approved

```
PHASE 3 onward — build the rest, in the order in §14 of the brief, showing work after
each step:

  3. App shell: status bar, nav, WebSocket client with reconnect + staleness, and every
     state in §9 of the brief. A component that only implements the happy path is not
     done.
  4. Overview, fully live.
  5. Decisions page, including the score ledger — the second most important thing in
     the build, because it is the explainability claim.
  6. Digital Twin page.
  7. Performance page + scenario control wired to the real control endpoints.
  8. Demo mode: full-screen, larger type, keyboard-driven, verified at 1024x768. This
     is the screen the viva panel actually sees, so it gets real attention, not a
     leftover pass.
  9. States, keyboard, reduced motion, performance, and a 30-minute soak.

After each page, screenshot it, critique it against §13, and tell me what you would
change if you had more time. If the answer is "nothing," look harder.

When the build is complete:
  - write frontend/DESIGN.md recording the final tokens and the reasoning, so the report
    and the viva can cite it
  - update CLAUDE.md's "Frontend" section and the frontend bullet under "Known
    deviations" to describe what now exists
  - run the full Definition of Done checklist in §15 of the brief and paste the result
    with each box honestly ticked or explained
```

---

## SECTION E — answers to the brief's open questions (§16)

Give these to Claude Code with Section A so it does not have to ask. They come from
`CLAUDE.md` and from the project record.

| Question | Answer |
|---|---|
| Does a React frontend already exist locally? | **No. This is a fresh build.** `frontend/` was deliberately emptied on 2026-09-08 after five rejected directions; only `.gitkeep` remains. |
| Should the rebuild be committed? | **Yes.** Commit the source this time, so the design is reviewable and the history exists for the report. |
| Brand assets? | The project is branded **Trinetra** (त्रिनेत्र) and has an existing eye + traffic-light logo. Supply the file; if the logo is not supplied, use a plain wordmark and do not invent a mark. |
| Which scenario for the demo? | Decide before Phase 1 so it gets a first-class path and a recorded fixture. `rush_hour` and `emergency_response` are the two most demonstrative. |
| ESP32 in the demo? | If the LED rig is part of demo day, its connection state needs a place in the status bar — and there is no endpoint for it today, so that is a backend conversation, not a frontend guess. |
| Reproducible report screenshots? | Yes — take every report figure from a named fixture replay at a fixed timestamp, so the same figure can be regenerated. |
| Light theme confirmed? | **Yes.** Light is the default and the demo theme. A bright classroom projector destroys dark UIs, and light with restrained colour reads as infrastructure software. Build the tokens so a `[data-theme="night"]` override is possible later, but do not spend time on it. |

---

## SECTION F — things worth saying out loud during the build

Short corrections that are more effective than a long re-brief. Use them verbatim when
something drifts.

- *"That's the average dashboard again. Go back to the references and tell me which one
  you're actually drawing from."*
- *"You spent the boldness in three places. Pick one and quiet the other two."*
- *"Screenshot it at 1024×768 and tell me honestly whether I could read that from the
  back of a classroom."*
- *"Which field in DATA_CONTRACT.md is that number coming from?"*
- *"That's colour used as decoration. What does that colour mean, and does it mean only
  that?"*
- *"Strip the labels off this screenshot. Would anyone know it's a traffic system?"*
- *"You animated something that isn't in the motion budget. Remove it or justify it."*

---

## SECTION G — why this prompt is shaped this way

Worth understanding, so you can adapt it rather than follow it mechanically.

**References beat adjectives.** "Make it professional" has no target. An image plus
"take the row rhythm, leave the palette" has a precise one. This is the single biggest
change from the previous five attempts.

**Gates beat length.** A very long prompt still produces one huge output you either
accept or reject wholesale. Gates let you kill a bad direction after one screen. Phase 2
exists solely for that.

**Self-critique before code, not after.** Asking a model to critique a plan it has
already implemented mostly produces defence of the implementation. Asking before
produces revision.

**Fixtures make iteration cheap.** Design quality is a function of how many iterations
you can afford. If every visual tweak needs a SUMO run, you get three iterations instead
of thirty, and it shows.

**Screenshots close the loop.** A model that cannot see its own output is designing
blind. The screenshot script is not a nice-to-have.
