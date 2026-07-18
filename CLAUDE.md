# Peptide Tracker Staging — Claude Instructions

## 🔒 ALL DATA LIVES IN THE BACKEND — ALWAYS. NEVER ASK AGAIN. 🔒
**Every piece of data — compound/PK/pharmacology parameters, reference ranges,
baselines, catalogue entries, and all user data — lives in `claude-agent-backend`
and is served to the frontends via API at runtime. This is settled and permanent.**

- Do **NOT** ask Henrik where data should live. The answer is always: the backend.
- Do **NOT** hardcode data (compound parameters, Vd, baselines, ranges, catalogues,
  user values) into any public frontend repo. If the frontend needs data, add/extend
  a backend endpoint and fetch it.
- Existing hardcoded consts in the frontend (`PEPTIDE_CAT`, `ENHANCEMENT_COMPOUNDS`,
  `TRT_GUIDE`, `RECON_DB`, `DOSE_GUIDE`, `PRICELIST`, …) are **legacy tech debt** to be
  migrated to the backend over time — never a pattern to copy. All *new* data goes to
  the backend first.
- Algorithm/math constants (e.g. Vermeulen K_SHBG/K_ALB, unit-conversion factors) are
  code, not data — those may live in the frontend.

Henrik has stated this repeatedly. Treat it as a standing rule and act on it without
re-confirming.

## ⚠️ UI CONSISTENCY — ALL COMPOUND TIERS MUST BE IDENTICAL ⚠️
Every compound tier (Peptides, TRT, Enhanced) must have **exactly the same UI features**. If one tier shows dose recommendations, all tiers must show dose recommendations. If one shows an info card, all must. If you add a UI element to one tier, immediately add it to all others in the same session.

**Non-negotiable parity rules:**
- Dose guidance (`_renderDoseGuide` / `_renderTRTGuide` / `_renderEnhancedGuide`) shown in BOTH the add-compound modal AND the edit/configure view for every tier
- Unit dropdowns must include all units used by any compound in that tier (e.g. `IU/day`, `IU/week` for GH Axis; `mg/week`, `mg/day`, `mg/EOD` for androgens)
- Info cards (mechanism, side effects) shown consistently across all three tiers
- No tier may have a feature that another tier is silently missing

When a new compound tier feature is added, check all other tiers before closing the PR.

## ⚠️ RESEARCH SCOPE — ALWAYS THE FULL CATALOGUE ⚠️
When conducting research, building databases, or compiling reference data for these apps:
- **Never** scope research to only the compounds Henrik is currently using
- **Always** scope to the **complete catalogue** — every entry in `PEPTIDE_CAT`, `TRT_CAT`, `ENHANCEMENT_COMPOUNDS`, and any other compound data structure in the app
- The database must serve all potential users and all potential use cases — not just the current user's active protocol
- This applies to: compound reference data, bloodwork panels, drug interaction tables, AI prompt design, RAG knowledge base construction, and any other research task

## ⚠️ COMPOUND DATA LIVES IN BACKEND ONLY — NEVER IN PUBLIC REPOS ⚠️
All peptide and compound information is **commercially sensitive and proprietary**. It must **NEVER** be stored in any public repository (`peptidetracker`, `peptidetracker-staging`, `workout`, `workout-staging`).

This includes, but is not limited to:
- Peptide catalogue data (names, SKUs, mechanisms, protocols, side effects, dosing defaults)
- Enhancement compound data (concentrations, vial sizes, anabolic profiles, dosing guidance)
- Reconstitution data (vial/water volumes, concentration defaults)
- Dose guidance tiers and risk labels
- Pricelist / SKU mappings
- Any supplier-specific product data

**The only place this data may live is `claude-agent-backend`.** The frontend apps must fetch it from the backend at runtime — never hardcode it into `index.html`, `tab-cycles.js`, or any other file in a public repo.

**Current state (as of 2026-06-21):** `PEPTIDE_CAT`, `ENHANCEMENT_COMPOUNDS`, `RECON_DB`, `DOSE_GUIDE`, `DEFAULT_PHASES`, `PRICELIST`, and related constants are still hardcoded in `index.html` / `tab-cycles.js`. This is a known technical debt. **Do not add new compound data to these files** — any new compounds or data updates must go into the backend and be served via API.

## ⚠️ RESEARCH & REFERENCE DOCS LIVE IN THE BACKEND — `docs/enhanced-bodybuilding/` ⚠️
**All peptide/enhancement/compound research, protocol, and reference documents
live in `claude-agent-backend/docs/enhanced-bodybuilding/` — the single canonical
home for this material.** Never store research/reference/protocol docs in this
public repo (or any public frontend repo); the reasoning is identical to the
compound-data rule above (commercially sensitive, proprietary).

When you research, compile, or write any cycle/dosing/compound/protocol reference
material, it goes there — not into this repo, and not left only as a chat reply.

### 📚 EVIDENCE STANDARD — MANDATORY, ZERO TOLERANCE FOR HALLUCINATION OR BRO-SCIENCE
**Every recommendation, dose, mechanism, or risk claim — in those docs, in the
app's dose guidance, or in anything Claude tells Henrik — MUST be backed by
published, peer-reviewed research or an established clinical guideline.**
- **No citation → do not state it as fact.** If it can't be sourced, leave it out
  or explicitly label it *anecdotal / low-evidence*.
- **Bro-science, forum lore, coach dogma, and confident-but-unsourced AI output
  are NOT acceptable sources.** Where popular practice contradicts the evidence,
  the evidence wins.
- **Fabricating or guessing a citation (author, journal, year, PMID) is the worst
  possible failure** — worse than omitting the claim. Verify before writing.
- Where evidence is thin, pre-clinical, or animal-only, say so in-line.

## ⚠️ NO PRICES IN THE APP — NEVER ⚠️
Supplier pricing is commercially sensitive and must **NEVER** appear in any app UI, rendered HTML, or user-facing output. The `PRICELIST` const in `index.html` (and `tests/pricelist.csv`) contains only vial sizes and quantities (`q`, `unit`, `n` fields) — **no `usd` or price fields**.

Rules:
- **Never add a `usd`, `price`, or any cost field** to `PRICELIST` entries
- **Never display US$ amounts, per-box prices, or grand totals** in the Shopping List modal or anywhere else
- `PRICELIST` is used **exclusively** for quantity calculations (how many vials/boxes needed per cycle)
- `pricelist.csv` must have only 3 columns: `SKU Code;Products Name;Mg*vials` — no price column ever

## ⚠️ localStorage IS A CACHE — NEVER THE SOURCE OF TRUTH ⚠️
localStorage is a read cache for performance only. It is NEVER the source of truth.

**Every single localStorage write MUST be paired with a backend push in the same code path — no exceptions.**

This means:
- `setData(key, value)` alone → WRONG
- `localStorage.setItem(key, value)` alone → WRONG  
- `setData(key, value)` + `push*ToAgent(...)` in the same call → CORRECT

A "Wipe local cache" button exists in Settings specifically to verify this: after wiping, ALL user data must come back from the backend on next load. If anything is lost after a wipe, that data was relying on localStorage as its source of truth — which is a bug.

This rule was violated multiple times (wk-db-*, wk-gear-* were localStorage-only). Any new data type must have a backend endpoint AND be included in the startup sync before it can be written to localStorage.

## ⚠️ BACKEND IS THE SOURCE OF TRUTH — EVERY SAVE MUST HIT THE BACKEND ⚠️
**Every user-facing data operation (save, update, delete) MUST be persisted to
the backend immediately — no exceptions, ever.** localStorage is only a local
cache for display. The backend is the source of truth.

Rules that are NOT negotiable:
- Every `save*()` function MUST call the corresponding `push*ToAgent()` function
- Every `delete*()` function MUST call the corresponding `delete*FromAgent()` function
- Every new data type added to the app needs BOTH a localStorage write AND a
  backend push in the same operation
- `setData(key, value)` or `localStorage.setItem()` alone is NEVER sufficient —
  always pair it with the backend call
- The backend data file for every endpoint MUST use the persistent volume pattern:
  `Path("/data/foo.json") if Path("/data").exists() else Path(...) / "data" / "foo.json"`
  (ephemeral container filesystem is wiped on every redeploy)

This rule applies to dose logs, body comp, weights, settings — **everything**.
Violating this has caused repeated data loss incidents.

## ⚠️ NO CROSS-APP LOCALSTORAGE READS — EVER ⚠️
Each app owns its localStorage keys exclusively. **NEVER read another app's
localStorage keys** (e.g., peptidetracker must not read `bf_log` which belongs
to workout; workout must not read `proto-bodycomp-v2` which belongs to
peptidetracker). Both apps run on the same origin (`henrikschaub.github.io`)
and can technically read each other's keys, but doing so is categorically
forbidden.

The backend is the ONLY cross-app source of truth. If data must flow between
apps, it goes through the backend — never through shared localStorage.

## ⚠️ LOCAL CLONE RULE — NEVER SKIP ⚠️
Local clones at `/home/user/<repo>` are **NOT automatically up to date**. A
session can be hours old and the remote may have moved on. **Before reading or
copying any file from a local clone, always pull it fresh:**
```
git -C /home/user/<repo> fetch origin && git -C /home/user/<repo> checkout origin/main -- <path>
```
or `git -C /home/user/<repo> pull origin main` for the whole tree. Skipping
this step has caused production regressions multiple times. No exceptions.

## This is the repo Claude works in
`peptidetracker` (prod) is **READ-ONLY** for Claude — see its CLAUDE.md.
All actual development (features, fixes, refactors) happens here on
`peptidetracker-staging`. Claude may freely branch, commit, push, open PRs,
and merge on this repo following the workflow below.

## ⚠️ CROSS-APP PARITY — SHARED INFRASTRUCTURE ⚠️
`peptidetracker-staging` and `workout-staging` share large swaths of
infrastructure code. **Any bug fix or change to shared infrastructure must be
applied to BOTH apps in the same session — never fix one and leave the other.**

Shared infrastructure (non-exhaustive):
- **Push to Prod** — `pushToProd()`, `pollPromoteStatus()`, `pollProdVersion()`, `renderPromoteStatus()`
- **Settings sync** — `syncSettingsFromAgent()` / `syncPepSettingsFromAgent()`, `pushSettingsToAgent()`, theme/prefs persistence
- **Update checker** — `checkForUpdate()`, `checkAppVersion()`, version banner
- **Auth flow** — Google Sign-In, token handling, `authHeaders()`
- **Backend API calls** — `AGENT_URL`, endpoint patterns, error handling
- **IS_STAGING pattern** — any environment-branching logic

When you fix or change any of the above in one app, immediately check the other
app for the same issue and fix it before closing the session.

## ⚠️ ONLY FIX WHAT WAS ASKED — NO UNSOLICITED CHANGES ⚠️
Fix exactly what Henrik asked. **Never change anything else**, even if it looks
like an improvement. This applies especially to:
- Visual appearance: colors, gradients, opacity, fills, chart styling
- Layout or spacing
- Unrelated logic or data handling

If you notice something that could be improved while fixing a bug, mention it
in your reply — do NOT silently change it. Unsolicited "improvements" cause
confusion, break things Henrik didn't intend to change, and waste debugging
time. **One PR = one explicitly requested change.**

## ⚠️ "MY FIX MADE IT REDUNDANT" IS NOT PERMISSION TO REMOVE IT ⚠️
This is the single most common way the rule above gets bypassed — through internal reasoning rather than intent.

**The exact failure (2026-06-25):** A bug was fixed where T3 users didn't always get the Enhanced wizard step. Fix: auto-include `'enhanced'` in `_wiz.goals` inside `initWizard()`. Claude then reasoned: *"The Enhanced toggle in Goals is now redundant — T3 users always have it auto-included."* Claude removed the toggle without being asked. Users lost the ability to opt out of Enhanced on a per-stack basis and saw a blank section with no explanation.

**Why this reasoning is always wrong:**
- "Redundant" is the user's call, not Claude's
- A default and a toggle serve different purposes even when the default is always-on — the toggle gives the user agency to override it per-stack
- A side-effect of your fix appearing "unnecessary" is not the same as being asked to remove it
- This is still a violation of "ONLY FIX WHAT WAS ASKED," just disguised as logical cleanup

**The rule:**
- Make the fix. Stop. Do not touch anything the fix made look unnecessary.
- If your fix genuinely makes something obsolete, **say so in your reply and ask** — never remove it silently.
- You may only remove code that was **explicitly named** in the request.

## Git workflow — ALWAYS follow this
### ⚠️ CLAUDE ALWAYS CREATES AND MERGES ITS OWN PRS — NEVER ASK HENRIK ⚠️
**Claude must NEVER ask Henrik to create a PR, merge a PR, or do anything with GitHub.**
Claude has `mcp__github__create_pull_request` and `mcp__github__merge_pull_request` tools.
Use them. Every time. No exceptions. Asking Henrik to touch GitHub is a failure.

0. **Always create new branches from the latest remote main — never from a local clone's stale HEAD:**
   ```
   git fetch origin && git checkout -b <branch-name> origin/main
   ```
   This ensures any AI (Claude, or another AI picking up when Claude hits token limits) always starts from a clean, up-to-date base and can hand off without conflicts.
1. Make changes on a feature branch
2. Before opening the PR, locally extract the `<script>` block from `index.html` and run `node --check` on it — catch syntax errors before they ever hit CI
3. `mcp__github__create_pull_request` — do this yourself immediately after pushing
4. Check CI: `pull_request_read` with `method: get_check_runs` — wait for `conclusion: success`. If still running, poll. If failed, fix and re-push. **Never merge with failing or pending checks.**
5. `mcp__github__merge_pull_request` — once CI is green, merge it yourself immediately
5. After merge the `version-bump` GitHub Action auto-increments the minor version in `version.json` and `const VERSION` in `index.html` and commits with `[skip ci]`
6. **After merging, you must confirm BOTH of these before telling the user it's live:**
   - `mcp__github__actions_list` (method: list_workflow_runs, resource_id: version-bump.yml) → confirm `conclusion: success` and read the bumped version from the commit message
   - `mcp__github__actions_list` (method: list_workflow_runs, resource_id: pages-build-deployment) → confirm the latest run has `conclusion: success` and its `head_sha` matches the bump commit SHA
   Only once pages-build-deployment is complete say "live as vX.XXX — test now". DO NOT say "live" after just the version-bump — that only commits the bump, it does not deploy. DO NOT attempt to curl or WebFetch `henrikschaub.github.io` — outbound network access to that host is blocked in this remote environment and will always fail.

## Promotion to prod — Claude must NOT trigger this
Promotion only happens via **Henrik clicking "Push to Prod"** in the staging
app's Settings UI, which fires a `repository_dispatch` event that runs
`.github/workflows/promote-to-prod.yml`. That workflow diffs staging against
`peptidetracker`, opens a PR on `peptidetracker`, **and then auto-merges it
once CI passes** (step 6, "Wait for CI and merge prod PR") — so a single Push
to Prod goes all the way to a live prod deploy. It does **not** leave a PR
waiting for review.

**What this means for Claude (corrected 2026-07-17):** the merge is the
workflow's own built-in behavior — Claude never hand-merges the prod PR, and
must never make any other change directly to `peptidetracker`, or **initiate**
a new promotion, without Henrik's explicit go-ahead in that specific moment.
Re-running a promotion run **Henrik already triggered** (e.g. after fixing the
token) is completing an action he authorized, not starting a new one — that is
allowed; firing a fresh `repository_dispatch`/Push to Prod yourself is not.
*(Earlier versions of this note wrongly said the workflow only opens a PR that
must never be auto-merged. The workflow has always auto-merged; the note was
out of date.)*

**PROMOTE_TOKEN secret (resolved 2026-07-17):** the promotion workflow needs a
`PROMOTE_TOKEN` repository secret (a PAT with write access to `peptidetracker`)
under Settings → Secrets and variables → Actions. This was previously missing
(and briefly stale, causing `Bad credentials` on the prod checkout step);
Henrik has since added/refreshed it and promotion now runs green. Claude has no
tool to create/edit repo secrets, so if it breaks again Henrik must update it.

## ⚠️ NEVER HARDCODE PERSONAL USER DATA — GDPR / DATA ISOLATION ⚠️
Personal data belonging to a specific real user must **NEVER** be hardcoded anywhere in the codebase.

**What triggered this rule (2026-06-24):**
- Backend `protocol.py` injected Henrik's personal peptide protocol into every new user's empty stack via `_repair_empty_peptides()`.
- `tab-macros.js` used `|| 92` (Henrik's body weight) as the fallback for all users who hadn't set their weight — wrong data shown to every new user.

**Rules — no exceptions:**
- Never hardcode any real user's data (body weight, doses, compounds, dates, config) as a constant, default, or fallback
- Neutral fallbacks only: `0`, `""`, `[]`, `null` — never a specific person's real value
- Never write "repair" or "migration" helpers that populate missing user data from another user's values
- Any one-time migration must be scoped to the specific target `user_id`, have a clear expiry, and be removed once confirmed complete
- Every read/write of user data must be gated by the authenticated user's identity — never cross user boundaries

## ⚠️ AUTH WARNING — READ BEFORE TOUCHING ANY AUTH CODE ⚠️
**PIN/passcode auth has been PERMANENTLY REMOVED.** Google Sign-In is the ONLY
end-user authentication method across this entire ecosystem (peptidetracker,
peptidetracker-staging, workout, workout-staging, claude-agent-backend). The
whitelist currently contains ONLY `henrik.schaub@gmail.com`. **NEVER
reintroduce a PIN, passcode, shared-secret, or any non-Google login for end
users** — not even as a "fallback" or "legacy" path. The only other credential
in the system is `x-api-secret`, used exclusively by Claude's own backend
tooling, never by end-user-facing apps.

## Deployment
- GitHub Pages (staging URL) — deploys automatically on push to `main`
- Monitor live version: `https://henrikschaub.github.io/peptidetracker-staging/version.json` — **CANNOT be fetched by Claude** (outbound network to `henrikschaub.github.io` is blocked in this remote environment). Use GitHub Actions status to confirm deployment instead.

## Environment-aware code — NEVER hardcode staging/prod URLs
`index.html` is a single file that gets promoted from staging to prod verbatim.
Any URL or value that differs between environments **must** use `IS_STAGING`:

```js
const IS_STAGING = (window.location.pathname||'').startsWith('/peptidetracker-staging');
```

Examples of things that must be dynamic, not hardcoded:
- `version.json` fetch URL (use `IS_STAGING ? '.../peptidetracker-staging/...' : '.../peptidetracker/...'`)
- Any feature flags or UI elements that should only appear in one environment

The `IS_STAGING` constant is already declared at the top of the `<script>` block, right after `const VERSION`.

## ⚠️ SI UNITS ONLY — NEVER SURFACE "mcg" ⚠️
The US "mcg" is **never** to be shown to the user or stored as a canonical unit —
the correct SI symbol is **`µg`** (micro sign U+00B5 + g). This is settled and permanent.
- Canonical unit value is `µg`; the unit dropdown (`UNITS` in tab-stack.js) and every
  peptide catalogue default use `µg`, never `mcg`.
- `_canonUnit(u)` (index.html) maps any legacy `'mcg'` data → `'µg'` on read; use it at
  every point a stored unit is compared or displayed so old data renders as `µg`.
- Comparisons may still *accept* legacy `'mcg'` as input (back-compat), but code must
  never *emit* `mcg` into rendered HTML, dose labels, dropdowns, or exports.
- Same rule for any future unit: use the SI symbol, not a US medical abbreviation.
- `%` is a valid unit for topical/transdermal products (creams/gels) — concentration,
  e.g. a 1% testosterone cream.

## App structure
- Single-file app: `index.html` (JS, CSS, HTML all inline)
- `version.json` — current version, read by the update-checker in the app
- `const VERSION='x.xx'` in index.html must match `version.json`
- Version bump workflow auto-increments both on merge to main

## Day-of-week display — ALWAYS Monday-first
**Weeks start on Monday** throughout the app. Every day-chip grid, schedule view,
and weekly label must display Mon → Sun (not Sun → Sat).

- `DAYS_SHORT=['S','M','T','W','T','F','S']` — indexed by JS `getDay()` (0=Sun)
- `DAYS_ORDER=[1,2,3,4,5,6,0]` — iteration order for all day-chip renders (Mon first)
- `tab-schedule.js` uses `dowMap=[1,2,3,4,5,6,0]` — same pattern, keep in sync
- **Never** iterate `DAYS_SHORT` by natural index (0→6) for display — always use `DAYS_ORDER`
- Internal `days[]` arrays still use JS dow values (0=Sun, 1=Mon, …, 6=Sat) — display order only
