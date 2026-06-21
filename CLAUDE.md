# Peptide Tracker Staging — Claude Instructions

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

## Git workflow — ALWAYS follow this
1. Make changes on a feature branch
2. Before opening the PR, locally extract the `<script>` block from `index.html` and run `node --check` on it — catch syntax errors before they ever hit CI
3. Create a PR, then **check its CI status before merging** — call `pull_request_read` with `method: get_check_runs` (or `get_status`) and confirm `conclusion`/`state` is `success`. If it's still running, wait and re-check; if it failed, fix the issue and push again. **Never merge a PR with a failing or pending check.**
4. Once CI is green, merge it yourself — never stop and ask the user to merge, never push directly to main
5. After merge the `version-bump` GitHub Action auto-increments the minor version in `version.json` and `const VERSION` in `index.html` and commits with `[skip ci]`
6. **After merging, you must confirm BOTH of these before telling the user it's live:**
   - `mcp__github__actions_list` (method: list_workflow_runs, resource_id: version-bump.yml) → confirm `conclusion: success` and read the bumped version from the commit message
   - `mcp__github__actions_list` (method: list_workflow_runs, resource_id: pages-build-deployment) → confirm the latest run has `conclusion: success` and its `head_sha` matches the bump commit SHA
   Only once pages-build-deployment is complete say "live as vX.XXX — test now". DO NOT say "live" after just the version-bump — that only commits the bump, it does not deploy. DO NOT attempt to curl or WebFetch `henrikschaub.github.io` — outbound network access to that host is blocked in this remote environment and will always fail.

## Promotion to prod — Claude must NOT do this directly
Promotion only happens via **Henrik clicking "Push to Prod"** in the staging
app's Settings UI, which fires a `repository_dispatch` event that runs
`.github/workflows/promote-to-prod.yml`. That workflow diffs staging against
`peptidetracker` and opens a PR there. Claude must **never** merge that PR, or
make any other change directly to `peptidetracker`, without Henrik's explicit
go-ahead in that specific moment.

**Known issue (2026-06-16):** the `PROMOTE_TOKEN` repository secret is missing
on this repo, so the promotion workflow fails immediately (`Input required and
not supplied: token` on the prod checkout step) before it can open a PR.
Henrik needs to add a `PROMOTE_TOKEN` secret (PAT with write access to
`peptidetracker`) under Settings → Secrets and variables → Actions. Claude has
no tool to create/edit repo secrets and cannot fix this itself.

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
