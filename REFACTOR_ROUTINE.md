# Refactor Routine — v0.1

_Personal / canonical. Run by a scheduled Claude Routine (fresh cloud session per firing) across John's repos._
_Sibling of `CODER_PROFILE.md`, which applies in full. Edit this file to change the routine for every repo at once — the Routine's own prompt only points here._

---

## The one rule

**A refactor PR must not change what the app does.** Same inputs, same outputs, same UI, same API responses, same database writes, same AI prompts. If you cannot show a change is behavior-preserving, it does not go in the PR. Skipping a candidate is always an acceptable outcome; shipping a behavior change is not.

There is little automated test coverage in these repos, so "behavior unchanged" is established by the rules below plus the repo's own checks — not proven. Say that plainly in every PR.

---

## Repos

| Repo | Checks that must pass before and after | Never touch |
|---|---|---|
| `jonncy18-maker/AI-Capital-Planning` | `npm run build` (with `NEON_AUTH_BASE_URL=https://ci.invalid/auth NEON_AUTH_COOKIE_SECRET=ci-placeholder-cookie-secret-not-used-at-runtime`), `scripts/lint-ratchet.sh origin/main` (if the script isn't on `main` yet: ESLint error count of the changed files must not rise vs `main`) | `src/lib/tax/`, `src/lib/cashflow/`, `src/lib/scenarios/`, `src/lib/payperiods/`, `src/lib/wealth/`, `src/lib/creditcards/` (money math, untested) |
| `jonncy18-maker/Personal-Dashboard` | `npm test`, `npm run build` | `lib/mileage.js`, `lib/pto.js`, `lib/health.js` logic (only dead-code removal there) |
| `jonncy18-maker/NextGen-Immersion` | `npm run build` | `lib/auth/`, `lib/api/_auth.js` |
| `jonncy18-maker/NextGen-Scholars` | `npm run build` | money / grade / GPA calculations |
| `jonncy18-maker/Agentic-Loop` | `npm test` | `CODER_PROFILE.md`, `AGENTIC_LOOP.md`, this file |

To add a repo: add a row. Repos without a row are never touched.

**Never touch in any repo:** database schema and migrations (`db/`, `neon/`, `*.sql`), SQL query text, auth/session code, API route request/response shapes, AI prompt text and tool definitions (`mcp-tools`, `*.prompts.js`, system prompts), env var names, `package.json` dependencies, lockfiles, CI workflows, `CLAUDE.md`/`ROADMAP.md`/`ARCHITECTURE.md`, and anything user-visible (copy, styling, layout).

---

## What counts as a refactor here

Allowed, in order of preference:

1. **Dead code removal** — unused files, exports, functions, imports, variables, commented-out code. Evidence required: `grep -rn` for the identifier across the repo (including `app/`, `pages/`, `scripts/`, MCP tool registries, and dynamic string references) returns nothing but the definition, and the build passes after removal. Run `npx -y knip --reporter compact` to find candidates; knip reports false positives for entry points it doesn't know (MCP servers, scripts, route files), so every candidate needs the grep check.
2. **Mechanical lint fixes** — unused vars/imports, `no-useless-*`, `prefer-const`. NOT `react-hooks/*` fixes: those change render behavior.
3. **De-duplication** — two or more byte-for-byte (or trivially) identical pure helpers collapsed into one existing location. Not "similar" code — identical code.
4. **Local clarity** — renaming a local variable, flattening a nested conditional, or replacing a hand-rolled loop with an equivalent built-in, where equivalence is obvious on reading, including for null/undefined/empty inputs.

Not allowed: changing function signatures that are exported and used elsewhere, reordering side effects, touching async/await or error-handling flow, changing default values, "while I'm here" fixes of bugs you notice. A bug you notice goes in the PR body under **Noticed, not changed** — never into the diff.

---

## Modes

The firing message says which mode. Default is **daily**.

### Daily mode

Scope is limited to code changed recently, so old debt isn't re-litigated every day.

1. For each repo in the table: `git log origin/main --since="24 hours ago" --name-only --pretty=format: | sort -u` gives the candidate files. Drop files that no longer exist and anything in a never-touch area.
2. No candidate files → skip the repo. No PR, no comment.
3. If the repo already has an **open** PR whose branch starts with `claude/refactor-`, skip the repo (don't pile up unreviewed refactor PRs) and mention it in the final report.
4. Otherwise look for allowed refactors **only inside the candidate files**. Nothing worth doing → skip. Do not manufacture a PR.

### Baseline mode

One-time whole-repo pass. Same rules, scope is the whole repo, minus never-touch areas. Prefer dead-code removal first. Same open-PR skip rule.

---

## Per-repo procedure

1. Attach the repo with `add_repo` (access `push`), clone it, `npm ci`.
2. Run the repo's checks on untouched `origin/main` and save the output. If they fail on `main`, stop for this repo — report it, open nothing. A refactor can't be verified against a red baseline.
3. Create branch `claude/refactor-YYYY-MM-DD` from `origin/main`.
4. Make the changes. Limits per PR: **at most ~250 changed lines and 10 files**. Over that, keep the safest subset.
5. Re-run the same checks. All must pass. A failure you can't fix in 3 attempts → drop that change, not the check.
6. Re-read the full diff adversarially: for each hunk, could any input now produce a different result? If yes or unsure, revert the hunk.
7. Commit, push, open a **draft** PR against `main`. Never merge, never mark ready for review, never enable auto-merge.

### PR body

```
## What changed
One line per change: what, and why it's behavior-preserving (e.g. "removed `fooBar` — zero references: <grep output>").

## Verification
Checks run on main and on this branch, with the tail of each output pasted (not summarized).
Unverified: runtime behavior in the browser. No test suite covers <areas>; behavior-preservation rests on the evidence above.

## Noticed, not changed
Bugs or risky code seen along the way, if any.

Mode: daily | baseline
```

---

## Final report

End the session with a short table: repo → PR link / skipped (reason) / blocked (reason). That message is what John sees in the notification.
