# T-Calc — Advanced Testosterone Cycle Calculator
## Requirements & Design Notes

---

## Problem Statement

Given a target testosterone level profile over a cycle, find an injection schedule
(which compound, when, what dose per injection) that tracks the target while
respecting practical constraints. The inverse of the Blood Levels PK simulator —
instead of simulating a known schedule, it finds the schedule that produces a target curve.

---

## Inputs

### 1. Personal baseline (calibration)
Three modes depending on what the user has available:

**A. Full bloodwork known (best accuracy)**
User enters from their blood test:
- Total Testosterone (nmol/L or ng/dL)
- SHBG (nmol/L)
- Free Testosterone (pmol/L or pg/mL) — or calculator derives it via Vermeulen formula

The Vermeulen formula computes free T from total T + SHBG + albumin (assumed 4.3 g/dL).
This gives a personalized conversion factor: mg/week injected → pmol/L free T.

Important: SHBG decreases as exogenous T rises. The linear conversion is an approximation.
Follow-up SHBG measurement on TRT is needed to refine the model at higher doses.

**B. First-time / no prior dose (no calibration needed)**
User has never been on TRT or has no bloodwork.
- If SHBG is known: use Vermeulen to estimate current free T
- If no bloodwork at all: use population median SHBG (~35 nmol/L) with a visible
  uncertainty band on the predicted curve (±30% range)
- Show a "get bloodwork first" recommendation with a panel template (see below)

**C. Already on TRT, have recent bloodwork**
User enters: current weekly dose + most recent free/total T measurement.
Calculator derives the slope: mg/week → pmol/L free T at that dose level.

### 2. Target profile
- **Floor**: minimum acceptable free T (e.g. 800 pmol/L)
- **Target**: desired stable level (e.g. 1000 pmol/L)
- **Ceiling**: maximum acceptable (avoid spike above this, e.g. 1300 pmol/L)
- **Ramp speed**: "reach target by week X" (e.g. week 6, week 12)
- **Cycle duration**: 8 weeks to 24 months; permanent TRT uses a 6-month planning window

### 3. End strategy (gates what the final phase looks like)
- **Permanent TRT**: no end date, no PCT. Schedule reaches steady state and continues.
- **Blast and cruise**: enhanced cycle ends, TRT baseline continues. Calculator plans taper back to cruise.
- **Cruise and PCT**: full stop. Calculator adds PCT phase after testosterone washout gap.
  PCT washout gap = 5 half-lives of longest-acting compound (auto-computed).

### 4. Available compounds
Which esters the user has access to. Each has a known half-life used by the PK engine.
Multiple compounds can be used simultaneously (blended).

### 5. Practical constraints
- Max dose per injection (e.g. 250mg — larger volumes are uncomfortable)
- Min dose per injection (e.g. 50mg — below this is hard to measure accurately)
- Max injection frequency (daily / EOD / 2x week / weekly / every 3 weeks / every 12 weeks)
- Total mg budget per compound (how many vials available)

---

## HCG — Recommended by Default

HCG preserves testicular function and intratesticular testosterone during exogenous T.
**Always recommend HCG in all TRT and Enhanced cycles by default.**
- Show a brief explanation (testicular atrophy, fertility, mood/libido)
- Default state: HCG recommended (shown, not hidden)
- User can opt out with a toggle + acknowledgement: "I understand the implications"
- If included: HCG appears in the PK view as its own compound line
  (typical cadence: 500–1000 IU, 2–3x/week)

---

## PCT Phase (when end strategy requires it)

- Offered only for "Cruise and PCT" or "Blast and cruise" end strategies
- Configurable: Nolvadex, Clomid, HCG bridge — user picks compounds and duration
- Washout gap auto-computed from half-life of longest-acting compound
- PK chart extends through PCT phase showing predicted T decline

---

## Generation Strategies (named presets)

Rather than a black-box optimizer, offer named strategies:

**Smooth ramp** — fast ester (Enanthate/Cypionate) at gradually increasing doses
over weeks 1–4, reaching target without front-loading. No spike.

**Depot blend** — fast ester for early coverage + slow ester (Nebido/undecanoate)
to build long-acting depot. Fast ester tapers as depot establishes (~weeks 8–12).

**Classic front-load** — standard double-dose loading protocol. Shown as a
comparison baseline to illustrate why it causes the spike.

**Constant accumulation** — fixed small dose, fixed short interval. Shows the
rising plateau effect. Best for visualising why dose-splitting reduces peak:trough ratio.

**Custom** — user manually places injections on a timeline, edits doses per injection.
Calculator simulates in real-time and scores the result.

---

## Outputs

1. **Injection schedule**: list of (Day N, Compound, Dose mg) for the full cycle
2. **Predicted plasma curve**: PK simulation overlaid on target band (floor/ceiling)
3. **Key stats**: time to reach target range, % of cycle in range, peak, lowest trough,
   total mg per compound
4. **Deviation score**: single number measuring how well schedule tracks target
   (used to compare strategies)
5. **PCT timing** (if applicable): washout gap, PCT start day

---

## Integration Points

**Entry point A — inside Add/Edit Cycle wizard**
After user picks TRT or Enhanced compounds, an "Advanced: optimise injection schedule"
option opens the T-calc flow inline. Result populates the schedule fields directly.

**Entry point B — Blood Levels tab**
"Plan a new cycle" button. Same T-calc flow. Ends with "Import as new stack"
or "Merge into existing stack."

The exported format is the standard stack data structure — T-calc output is just a
stack with a more carefully computed schedule. No new data model needed.

---

## Reference Example — Henrik, Feb 2026

- Free T baseline: 223 pmol/L (just at lower reference limit 220–800)
- Total T: 16.2 nmol/L
- SHBG: 45 nmol/L → free T fraction ≈ 1.38% (high SHBG binding most T)
- Target: 1000 pmol/L free T (stable)
- End strategy: Permanent TRT
- Implication: at current SHBG, would need total T ~72 nmol/L to achieve 1000 pmol/L free T.
  However, exogenous T suppresses SHBG, so free T fraction will rise — follow-up bloodwork
  needed to recalibrate. This is why the Vermeulen model is an approximation, not a
  guarantee, and re-measurement is essential.

---

## TODO — Future Development

### Bloodwork panel templates (priority: high)
Users need to know what to order. The app should provide downloadable/printable
blood test panel templates for different use cases:

- **Pre-TRT baseline panel**: Total T, Free T (calculated), SHBG, LH, FSH, Estradiol,
  PSA, CBC (Hb, Hct, RBC), Liver (ALAT/AST), Kidney (Creatinine, eGFR), Lipids
  (total, HDL, LDL, TG), Ferritin, HbA1c

- **On-TRT monitoring panel** (every 3–6 months): Total T, Free T, SHBG, Estradiol (E2),
  CBC (especially Hematocrit — watch for >52%), Liver, Lipids, Ferritin, PSA

- **Enhanced cycle panel**: Add to TRT panel: Prolactin (if using 19-nors),
  DHT (if using DHT-derivatives), IGF-1 (if using GH), Thyroid (TSH, fT3, fT4 if T3)

- **Female TRT panel**: Total T, Free T, SHBG, Estradiol, Progesterone, FSH, LH,
  CBC, Liver, Lipids. Note: virilisation monitoring (voice, clitoral size) is clinical,
  not bloodwork.

Each template should include:
- Which markers to order and why
- What to watch for (red flag values)
- Suggested timing relative to injection (trough = 24h before next injection
  gives the most consistent reading)
- Notes on lab variation (different labs, different assays — always compare to
  personal baseline not just lab reference)

Implementation: render as a modal with a "copy to clipboard" or "print" button.
Could also pre-fill the T-calc calibration form if the user enters values from their
panel directly into the app.

### Bloodwork log in app
Allow users to log blood test results over time (Total T, Free T, SHBG, E2, Hct
at minimum). Plot these on a timeline alongside the cycle/compound schedule.
Enables correlation: "my E2 was high at week 6 — what was my injection schedule then?"

### SHBG suppression model
Add a dose-dependent SHBG suppression curve to the Vermeulen calculation.
At steady-state TRT doses, SHBG drops ~20–40%. A simple linear suppression
factor (e.g. -0.3 nmol/L SHBG per nmol/L increase in total T) would improve
free T prediction accuracy without requiring re-measurement.
