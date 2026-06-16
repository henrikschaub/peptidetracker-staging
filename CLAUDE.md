# Peptide Tracker Staging — Claude Instructions

## This is the repo Claude works in
`peptidetracker` (prod) is **READ-ONLY** for Claude — see its CLAUDE.md.
All actual development (features, fixes, refactors) happens here on
`peptidetracker-staging`. Claude may freely branch, commit, push, open PRs,
and merge on this repo following the workflow below.

## Git workflow — ALWAYS follow this
1. Make changes on a feature branch
2. Before opening the PR, locally extract the `<script>` block from `index.html` and run `node --check` on it — catch syntax errors before they ever hit CI
3. Create a PR, then **check its CI status before merging** — call `pull_request_read` with `method: get_check_runs` (or `get_status`) and confirm `conclusion`/`state` is `success`. If it's still running, wait and re-check; if it failed, fix the issue and push again. **Never merge a PR with a failing or pending check.**
4. Once CI is green, merge it yourself — never stop and ask the user to merge, never push directly to main
5. After merge the `version-bump` GitHub Action auto-increments the minor version in `version.json` and `const VERSION` in `index.html` and commits with `[skip ci]`
6. **After merging, poll `https://henrikschaub.github.io/peptidetracker-staging/version.json` every 30 s until the new version appears, then tell the user "live as vX.XXX — test now"**

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
- Monitor live version: `https://henrikschaub.github.io/peptidetracker-staging/version.json`
