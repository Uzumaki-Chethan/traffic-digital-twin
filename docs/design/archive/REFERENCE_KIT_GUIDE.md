# Reference Kit — the 40 minutes that decides the UI

This one is for you, not for Claude Code. It is the step that was missing from all five
previous attempts, and it is worth more than any prompt rewrite.

**The goal:** 6–8 images in `docs/design/refs/`, each with one line saying what to take
and what to leave. Not twenty images. Not a mood board. Eight, annotated.

---

## Why this works

A model given "make it professional" outputs the average of every dashboard it has seen.
The average of all dashboards is the generic dashboard. That is not a Claude problem —
it is what any system does with an underdetermined instruction, and it is exactly what
happened five times.

A model given an image plus *"take the row rhythm and the density, leave the palette and
the icon style"* has a target instead of an average.

The reels and YouTube demos you have seen that look tier-one are almost always doing
this. The prompt is not the secret; the reference is.

---

## The eight slots

Fill these specific roles. An image that does not fill a role does not go in the folder.

| # | Filename | Role | Where to look |
|---|---|---|---|
| 1 | `domain-signal-plan.png` | A real traffic signal timing plan or ring-barrier diagram | Google Images / Scholar. This is the highest-value image in the kit — see search terms below |
| 2 | `domain-control-room.png` | A real traffic management centre operator screen | Vendor material: PTV Optima, Yunex Sitraffic, Kapsch, Aimsun Live |
| 3 | `density-console.png` | A dense, serious, non-decorative product UI | Mobbin, Refero, or a trading / observability / logistics console |
| 4 | `type-numbers.png` | Large numeric readings done well | A vehicle instrument cluster, an airport departure board, a pro audio meter |
| 5 | `layout-hierarchy.png` | A layout where one element clearly dominates and the rest support it | Godly, SiteInspire, Land-book |
| 6 | `chart-comparison.png` | A comparison chart you personally find easy to read | FT Visual Vocabulary, Datawrapper's blog, Observable Plot gallery |
| 7 | `avoid-01.png` | A generic dashboard you dislike | Dribbble "dashboard ui" — the first page of results is full of them |
| 8 | `avoid-02.png` | A second one, ideally a different flavour of generic | Same |

The two anti-references matter as much as the six positives. Telling the model what
*you* consider generic is far more precise than any adjective, because "generic" is a
judgment about your taste, and it cannot infer your taste from nothing.

---

## Search terms that actually produce good results

**For the domain images — do these first, they are the differentiator.** Almost no
student project draws from the field's own artifacts, and doing so is what will make
this look like real infrastructure software rather than a template with traffic colours.

```
traffic signal phase diagram
ring barrier diagram NEMA
signal timing sheet
time space diagram green wave
traffic management center operator screen
ATMS dashboard
SCADA HMI overview screen
adaptive traffic signal control interface
```

**For product density and real states:**

```
mobbin.com          — real shipped app screens, searchable by pattern.
                      Search "dashboard", "analytics", "monitoring".
refero.design       — real web-product screenshots organised by UI pattern.
saasui.design       — real in-app dashboard and analytics screens.
saasframe.io        — real in-app screens from known SaaS products.
pageflows.com       — video of real flows. The only good source for the TIMING of
                      transitions, which still images cannot show.
uisources.com       — pattern-level interaction breakdowns.
```

**For composition, type hierarchy and motion:**

```
godly.website       — curated, with animated thumbnails so you can judge motion
                      before clicking. Tighter curation than Awwwards.
siteinspire.com     — best filtering in the category; filter by style and type.
awwwards.com        — high production value; be selective, much of it is unusable
                      for dense data UI.
land-book.com       — landing pages; useful only for type scale and colour confidence.
lapa.ninja          — same.
dribbble.com        — palettes and card treatments only. Never copy a Dribbble
                      dashboard shot wholesale — they routinely ignore real data
                      density, empty states and error states.
behance.net         — full case studies that explain WHY, which is more useful than
                      the final image.
```

**For components and motion, at implementation level:**

```
ui.shadcn.com       — the primitive layer this build uses (Radix + Tailwind).
21st.dev            — community registry of shadcn-compatible components. Good for
                      finding one specific interaction; bad if used as a whole look.
motion.dev          — the animation library's own examples.
motion-primitives.com, reactbits.dev, smoothui.dev — individual interaction patterns.
tremor.so           — dashboard-specific components. Study its restraint even if you
                      do not install it.
```

**Design systems to mine for rules, not for looks:**

```
carbondesignsystem.com  — closest mainstream system to this brief's industrial register.
                          Mine its spacing rhythm and state definitions.
radix-ui.com/colors     — perceptually even, accessible colour scales.
atlassian.design        — table, empty-state and status-chip patterns.
```

A UI that looks like stock Carbon or stock shadcn is just a different template. Take the
rules, not the identity.

---

## How to annotate

Create `docs/design/refs/NOTES.md`. One entry per image, two lines each:

```
domain-signal-plan.png
  TAKE:  drawing conventions for the junction — hairline lane edges, stop bars,
         movement arrows painted on the carriageway, how phases are labelled.
  LEAVE: the paper texture, the title block, the dimension callouts.

density-console.png
  TAKE:  the row rhythm in the table and how numbers are right-aligned and set in mono.
  LEAVE: the colour palette entirely, the sidebar icon style.

avoid-01.png
  THIS IS THE FAILURE MODE: six identical rounded cards, same soft shadow on each,
  purple-to-blue gradient header, 14px metrics nobody can read from across a room.
  If anything in the build starts resembling this, stop.
```

**The "leave" line is what turns a reference into direction.** A reference with no
"leave" instruction gets copied wholesale, which produces a pastiche — and a pastiche of
a Dribbble shot is still generic, just someone else's generic.

If you cannot finish the sentence "from this I am taking ___" with something specific —
a spacing rhythm, a table row treatment, a way of showing state — that image is not
earning its place. Drop it.

---

## The screenshot loop — the second-biggest lever

A model that cannot see its own output is designing blind. Before Phase 2, have Claude
Code set up a script that boots the dev server against a recorded fixture, visits each
page, and saves PNGs at 1440×900 and 1024×768.

Then, at every review, ask it to look at its own screenshot and answer honestly against
the checklist in §13 of the brief. This single habit does more for output quality than
any amount of extra instruction, because "read your own CSS" and "look at the result"
are very different tasks.

---

## What to do when a direction still comes back wrong

Say which specific reference it failed to honour, not that you dislike it.

- Weak: *"this still looks generic, make it better"*
- Strong: *"compare your Overview screenshot with `layout-hierarchy.png`. In the
  reference, one element takes half the screen and everything else is subordinate. In
  yours, six panels are the same size. Fix the hierarchy first, then we'll talk about
  colour."*

The second version is actionable and it converges. The first restarts the average.

---

## The order to do this in

1. Spend 20 minutes on slots 1, 2 and 3. These are the domain images and they matter most.
2. Spend 10 minutes on slots 4, 5 and 6.
3. Spend 5 minutes finding two dashboards you actively dislike.
4. Spend 5 minutes writing `NOTES.md`.
5. Only then open Claude Code and paste Section A of the prompt.

Forty minutes here is worth more than a sixth rebuild.
