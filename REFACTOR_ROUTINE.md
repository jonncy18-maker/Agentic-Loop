# Refactor Routine — v0.2

_Personal / canonical. Run by a scheduled Claude Routine (fresh cloud session per firing) across John's repos._
_Sibling of `CODER_PROFILE.md`, which applies in full. Edit this file to change the routine for every repo at once — the Routine's own prompt only points here._

---

## The one rule

Refactor PRs **auto-merge when CI passes — no human reads the diff.** That is why the allowed scope below is deliberately narrow: only changes whose safety a machine can establish (zero references + green build). Anything that would need a human's judgment is out of scope, not "careful".


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

Only these three, nothing else:

1. **Dead code removal** — unused functions, exports, imports, variables, whole files nothing imports, and commented-out code blocks. Evidence required for every deletion: `grep -rn` for the identifier (or file's import path) across the whole repo returns nothing but the definition — check `app/`, `pages/`, `scripts/`, `lib/`, `src/`, MCP tool registries, and dynamic/string references (`import(`, `require(`, template strings, object-key lookups). Any non-definition hit → keep it. `npx -y knip --reporter compact` can suggest candidates but is never evidence on its own.
   - **Never delete** framework entry points even if nothing imports them: anything under `app/` or `pages/` named `page`, `layout`, `route`, `loading`, `error`, `not-found`, `template`, `middleware`, plus `public/`, `scripts/`, `*.config.*`, service workers, and anything referenced from `package.json`, `vercel.json` or `next.config.*`.
2. **Mechanical lint fixes** — only `no-unused-vars`/unused imports and `prefer-const`. Nothing else, and never `react-hooks/*` (those change render behavior).
3. **Formatting** — run the repo's own Prettier config (only if the repo has one) on the day's candidate files, as its own commit. Formatting-only diffs don't count toward the line limit.

Not allowed (even if it looks safe): merging duplicate code, renaming, restructuring conditionals or loops, removing `console.*` calls, changing defaults, signatures, async/error flow, or any "while I'm here" fix. A bug you notice goes in the PR body under **Noticed, not changed** — never into the diff.

---

## Modes

The firing message says which mode. Default is **daily**.

### Daily mode

Scope is limited to code changed recently, so old debt isn't re-litigated every day.

1. For each repo in the table: `git log origin/main --since="24 hours ago" --name-only --pretty=format: | sort -u` gives the candidate files. Drop files that no longer exist and anything in a never-touch area.
2. No candidate files → skip the repo. No PR, no comment.
3. If the repo already has an **open** PR whose branch starts with `claude/refactor-` (an earlier one whose CI failed or is still pending), skip the repo and mention it in the final report.
4. Otherwise look for allowed refactors **only inside the candidate files**. Nothing worth doing → skip. Do not manufacture a PR.

### Baseline mode

One-time whole-repo pass. Same rules, scope is the whole repo, minus never-touch areas. Prefer dead-code removal first. Same open-PR skip rule.

---

## Per-repo procedure

1. The repos are pre-cloned under `/home/user` by the Routine. `cd` in and `npm ci`.
2. Run the repo's checks on untouched `origin/main` and save the output. If they fail on `main`, stop for this repo — report it, open nothing. A refactor can't be verified against a red baseline.
3. Create branch `claude/refactor-YYYY-MM-DD` from `origin/main`.
4. Make the changes. Limits per PR: **at most ~250 changed lines and 10 files**. Over that, keep the safest subset.
5. Re-run the same checks. All must pass. A failure you can't fix in 3 attempts → drop that change, not the check.
6. Re-read the full diff adversarially: for each hunk, could any input now produce a different result? If yes or unsure, revert the hunk.
7. Commit, push, open a PR against `main` (**not** draft) titled `Refactor: <summary>`, then enable auto-merge with the squash method so GitHub merges it once required CI passes. Never merge it directly and never bypass CI. If auto-merge can't be enabled (repo setting off, no required check), leave the PR open and report it as "needs manual merge".

### PR body

```
## What changed
One line per change: what, and why it's behavior-preserving (e.g. "removed `fooBar` — zero references: <grep output>").

## Verification
Checks run on main and on this branch, with the tail of each output pasted (not summarized).
Unverified: runtime behavior in the browser. No test suite covers <areas>; behavior-preservation rests on the evidence above.

## Noticed, not changed
Bugs or risky code seen along the way, if any.

Mode: daily | baseline · Auto-merge: enabled | needs manual merge
```

---

## Final report

End the session with a short table: repo → PR link / skipped (reason) / blocked (reason). That message is what John sees in the notification.
